-- ============================================================================
-- Database Functions and Triggers
-- ============================================================================

-- ============================================================================
-- AUTO-UPDATE TIMESTAMP TRIGGER
-- ============================================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_users_updated_at
  before update on public.users
  for each row execute function update_updated_at();

create trigger update_watch_status_updated_at
  before update on public.watch_status
  for each row execute function update_updated_at();

create trigger update_video_notes_updated_at
  before update on public.video_notes
  for each row execute function update_updated_at();

-- ============================================================================
-- GET USER ID FROM AUTH
-- ============================================================================
create or replace function get_user_id()
returns uuid as $$
  select id from public.users where auth_user_id = auth.uid();
$$ language sql security definer;

-- ============================================================================
-- GET FEED FUNCTION (optimized feed query)
-- ============================================================================
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
  watch_progress real
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
    coalesce(ws.watch_progress, 0::real) as watch_progress
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

-- ============================================================================
-- COUNT FEED FUNCTION (for pagination)
-- ============================================================================
create or replace function count_feed(
  p_user_id uuid,
  p_group_id uuid default null,
  p_tag_ids uuid[] default null,
  p_search text default null,
  p_shorts_only boolean default false,
  p_include_shorts boolean default false,
  p_min_duration integer default null,
  p_max_duration integer default null,
  p_min_date timestamptz default null,
  p_max_date timestamptz default null
)
returns bigint as $$
declare
  total bigint;
begin
  select count(distinct v.id) into total
  from public.videos v
  join public.channels c on v.channel_id = c.id
  join public.group_channels gc on c.id = gc.channel_id
  join public.channel_groups cg on gc.group_id = cg.id
  left join public.watch_status ws on v.id = ws.video_id and ws.user_id = p_user_id
  left join public.video_tags vt on v.id = vt.video_id and vt.user_id = p_user_id
  where
    cg.user_id = p_user_id
    and (p_group_id is null or gc.group_id = p_group_id)
    and (p_search is not null or coalesce(ws.hidden, false) = false)
    and (
      (p_shorts_only and v.is_short = true)
      or (not p_shorts_only and p_include_shorts)
      or (not p_shorts_only and not p_include_shorts and coalesce(v.is_short, false) = false)
    )
    and (p_min_duration is null or v.duration_seconds >= p_min_duration)
    and (p_max_duration is null or v.duration_seconds <= p_max_duration)
    and (p_min_date is null or v.published_at >= p_min_date)
    and (p_max_date is null or v.published_at <= p_max_date)
    and (p_search is null or (
      lower(v.title) like '%' || lower(p_search) || '%'
      or lower(c.title) like '%' || lower(p_search) || '%'
    ))
    and (p_tag_ids is null or vt.tag_id = any(p_tag_ids));

  return total;
end;
$$ language plpgsql security definer;

-- ============================================================================
-- GET GROUPS WITH CHANNEL COUNTS
-- ============================================================================
create or replace function get_groups_with_channels(p_user_id uuid)
returns table (
  id uuid,
  name text,
  color text,
  icon text,
  sort_order integer,
  created_at timestamptz,
  channel_ids uuid[],
  channel_count bigint
) as $$
begin
  return query
  select
    cg.id,
    cg.name,
    cg.color,
    cg.icon,
    cg.sort_order,
    cg.created_at,
    coalesce(array_agg(gc.channel_id) filter (where gc.channel_id is not null), '{}') as channel_ids,
    count(gc.channel_id) as channel_count
  from public.channel_groups cg
  left join public.group_channels gc on cg.id = gc.group_id
  where cg.user_id = p_user_id
  group by cg.id
  order by cg.sort_order, cg.created_at;
end;
$$ language plpgsql security definer;

-- ============================================================================
-- ENABLE REALTIME FOR KEY TABLES
-- ============================================================================
alter publication supabase_realtime add table public.watch_status;
alter publication supabase_realtime add table public.channel_groups;
alter publication supabase_realtime add table public.tags;
alter publication supabase_realtime add table public.video_tags;
