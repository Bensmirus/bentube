-- ============================================================================
-- Watch Progress Tracking Enhancement
-- Version: 1.0.0
-- Description: Add second-precise watch progress tracking with real-time sync
-- ============================================================================

-- Add watch_progress_seconds column for second-precise tracking
alter table public.watch_status
  add column if not exists watch_progress_seconds integer default 0;

-- Add last_position_at for sync conflict resolution
alter table public.watch_status
  add column if not exists last_position_at timestamptz default now();

-- Create index for efficient real-time queries
create index if not exists idx_watch_status_last_position
  on public.watch_status(user_id, last_position_at desc);

-- Enable real-time for watch_status table
-- Note: Run this in Supabase dashboard or via supabase CLI:
-- alter publication supabase_realtime add table watch_status;

comment on column public.watch_status.watch_progress_seconds is 'Watch position in seconds for precise tracking';
comment on column public.watch_status.last_position_at is 'Timestamp of last position update for cross-device sync';

-- Create function to update watch progress with conflict resolution
create or replace function public.update_watch_progress(
  p_user_id uuid,
  p_video_id uuid,
  p_progress_seconds integer,
  p_duration_seconds integer,
  p_client_timestamp timestamptz default now()
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_progress real;
  v_watched boolean;
  v_result jsonb;
  v_existing_timestamp timestamptz;
begin
  -- Calculate progress as percentage (0-1)
  v_progress := case
    when p_duration_seconds > 0 then
      least(1.0, greatest(0.0, p_progress_seconds::real / p_duration_seconds::real))
    else 0.0
  end;

  -- Consider watched if > 90% complete
  v_watched := v_progress >= 0.9;

  -- Check existing record for conflict resolution
  select last_position_at into v_existing_timestamp
  from public.watch_status
  where user_id = p_user_id and video_id = p_video_id;

  -- Only update if client timestamp is newer (handles cross-device sync)
  if v_existing_timestamp is null or p_client_timestamp >= v_existing_timestamp then
    insert into public.watch_status (
      user_id,
      video_id,
      watch_progress,
      watch_progress_seconds,
      watched,
      last_position_at,
      updated_at
    )
    values (
      p_user_id,
      p_video_id,
      v_progress,
      p_progress_seconds,
      v_watched,
      p_client_timestamp,
      now()
    )
    on conflict (user_id, video_id) do update set
      watch_progress = excluded.watch_progress,
      watch_progress_seconds = excluded.watch_progress_seconds,
      watched = case
        when excluded.watched then true
        else watch_status.watched
      end,
      last_position_at = excluded.last_position_at,
      updated_at = now()
    where watch_status.last_position_at is null
       or excluded.last_position_at >= watch_status.last_position_at;

    v_result := jsonb_build_object(
      'success', true,
      'progress', v_progress,
      'progress_seconds', p_progress_seconds,
      'watched', v_watched,
      'synced', true
    );
  else
    -- Return existing data if client timestamp is older
    select jsonb_build_object(
      'success', true,
      'progress', watch_progress,
      'progress_seconds', watch_progress_seconds,
      'watched', watched,
      'synced', false,
      'conflict', true
    ) into v_result
    from public.watch_status
    where user_id = p_user_id and video_id = p_video_id;
  end if;

  return v_result;
end;
$$;

-- Grant execute permission to authenticated users
grant execute on function public.update_watch_progress to authenticated;

-- Create batch update function for efficient multi-video updates
create or replace function public.batch_update_watch_progress(
  p_user_id uuid,
  p_updates jsonb -- Array of {video_id, progress_seconds, duration_seconds, timestamp}
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_update jsonb;
  v_results jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  for v_update in select * from jsonb_array_elements(p_updates)
  loop
    v_result := public.update_watch_progress(
      p_user_id,
      (v_update->>'video_id')::uuid,
      (v_update->>'progress_seconds')::integer,
      (v_update->>'duration_seconds')::integer,
      coalesce((v_update->>'timestamp')::timestamptz, now())
    );

    v_results := v_results || jsonb_build_object(
      'video_id', v_update->>'video_id',
      'result', v_result
    );
  end loop;

  return jsonb_build_object(
    'success', true,
    'results', v_results
  );
end;
$$;

-- Grant execute permission to authenticated users
grant execute on function public.batch_update_watch_progress to authenticated;

-- Create function to get watch progress for multiple videos
create or replace function public.get_watch_progress(
  p_user_id uuid,
  p_video_ids uuid[]
)
returns table (
  video_id uuid,
  watch_progress real,
  watch_progress_seconds integer,
  watched boolean,
  last_position_at timestamptz
)
language sql
security definer
stable
as $$
  select
    ws.video_id,
    ws.watch_progress,
    ws.watch_progress_seconds,
    ws.watched,
    ws.last_position_at
  from public.watch_status ws
  where ws.user_id = p_user_id
    and ws.video_id = any(p_video_ids);
$$;

-- Grant execute permission to authenticated users
grant execute on function public.get_watch_progress to authenticated;

-- ============================================================================
-- UPDATE GET_FEED FUNCTION TO INCLUDE WATCH_PROGRESS_SECONDS
-- ============================================================================
drop function if exists get_feed(uuid, uuid, uuid[], text, boolean, boolean, integer, integer, timestamptz, timestamptz, integer, integer);

create or replace function get_feed(
  p_user_id uuid,
  p_group_id uuid default null,
  p_tag_ids uuid[] default null,
  p_search text default null,
  p_shorts_only boolean default false,
  p_include_shorts boolean default false,
  p_min_duration integer default null,
  p_max_duration integer default null,
  p_min_date timestamptz default null,
  p_max_date timestamptz default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  youtube_id text,
  channel_id uuid,
  title text,
  thumbnail text,
  duration text,
  duration_seconds integer,
  is_short boolean,
  description text,
  published_at timestamptz,
  channel_title text,
  channel_thumbnail text,
  watched boolean,
  hidden boolean,
  watch_later boolean,
  watch_progress real,
  watch_progress_seconds integer
) as $$
begin
  return query
  select distinct
    v.id,
    v.youtube_id,
    v.channel_id,
    v.title,
    v.thumbnail,
    v.duration,
    v.duration_seconds,
    v.is_short,
    v.description,
    v.published_at,
    c.title as channel_title,
    c.thumbnail as channel_thumbnail,
    coalesce(ws.watched, false) as watched,
    coalesce(ws.hidden, false) as hidden,
    coalesce(ws.watch_later, false) as watch_later,
    coalesce(ws.watch_progress, 0::real) as watch_progress,
    coalesce(ws.watch_progress_seconds, 0) as watch_progress_seconds
  from public.videos v
  join public.channels c on v.channel_id = c.id
  join public.group_channels gc on c.id = gc.channel_id
  join public.channel_groups cg on gc.group_id = cg.id
  left join public.watch_status ws on v.id = ws.video_id and ws.user_id = p_user_id
  left join public.video_tags vt on v.id = vt.video_id and vt.user_id = p_user_id
  where
    -- Ensure user owns the group
    cg.user_id = p_user_id
    -- Group filter
    and (p_group_id is null or gc.group_id = p_group_id)
    -- Hide hidden videos (unless searching)
    and (p_search is not null or coalesce(ws.hidden, false) = false)
    -- Shorts filter
    and (
      (p_shorts_only and v.is_short = true)
      or (not p_shorts_only and p_include_shorts)
      or (not p_shorts_only and not p_include_shorts and coalesce(v.is_short, false) = false)
    )
    -- Duration filter
    and (p_min_duration is null or v.duration_seconds >= p_min_duration)
    and (p_max_duration is null or v.duration_seconds <= p_max_duration)
    -- Date filter
    and (p_min_date is null or v.published_at >= p_min_date)
    and (p_max_date is null or v.published_at <= p_max_date)
    -- Search filter
    and (p_search is null or (
      lower(v.title) like '%' || lower(p_search) || '%'
      or lower(c.title) like '%' || lower(p_search) || '%'
    ))
    -- Tag filter
    and (p_tag_ids is null or vt.tag_id = any(p_tag_ids))
  order by v.published_at desc
  limit p_limit
  offset p_offset;
end;
$$ language plpgsql security definer;
