-- ============================================================================
-- Video User Isolation
-- Each user has their own copy of videos for complete data independence
-- ============================================================================

-- Step 1: Add user_id column to videos table
alter table public.videos
  add column if not exists user_id uuid references public.users(id) on delete cascade;

-- Step 2: Create index for user-scoped queries
create index if not exists idx_videos_user_id on public.videos(user_id);
create index if not exists idx_videos_user_channel on public.videos(user_id, channel_id);
create index if not exists idx_videos_user_published on public.videos(user_id, published_at desc);

-- Step 3: Drop the old unique constraint on youtube_id (video can exist per user now)
alter table public.videos drop constraint if exists videos_youtube_id_key;

-- Step 4: Add new unique constraint per user
alter table public.videos
  add constraint videos_user_youtube_id_key unique (user_id, youtube_id);

-- Step 5: Update the hidden_at index to be user-aware
drop index if exists idx_videos_hidden_at;
create index idx_videos_user_hidden_at
  on public.videos(user_id, hidden_at)
  where hidden_at is not null;

-- Step 6: Update feed index for user-scoped queries
drop index if exists idx_videos_feed;
create index idx_videos_user_feed
  on public.videos(user_id, channel_id, published_at desc, is_short)
  where hidden_at is null;

-- ============================================================================
-- Update get_feed function to filter by user_id on videos
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
    -- Videos must belong to this user
    v.user_id = p_user_id
    -- Ensure user owns the group
    and cg.user_id = p_user_id
    -- Filter out soft-deleted videos
    and v.hidden_at is null
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
-- Update count_feed function
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
    -- Videos must belong to this user
    v.user_id = p_user_id
    and cg.user_id = p_user_id
    -- Filter out soft-deleted videos
    and v.hidden_at is null
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
-- Update soft-delete triggers to be user-aware
-- ============================================================================

-- Function to hide videos when channel removed from all of a USER's groups
create or replace function hide_orphaned_channel_videos(p_channel_id uuid, p_user_id uuid)
returns integer
language plpgsql
security definer
as $$
declare
  v_count integer;
begin
  -- Check if channel is still in any of THIS USER's groups
  if exists (
    select 1 from public.group_channels gc
    join public.channel_groups cg on gc.group_id = cg.id
    where gc.channel_id = p_channel_id
      and cg.user_id = p_user_id
  ) then
    -- Channel still in a group for this user, don't hide videos
    return 0;
  end if;

  -- Hide all of THIS USER's videos from this channel
  update public.videos
  set hidden_at = now()
  where channel_id = p_channel_id
    and user_id = p_user_id
    and hidden_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Function to unhide videos when channel is re-added to a user's group
create or replace function unhide_channel_videos(p_channel_id uuid, p_user_id uuid)
returns integer
language plpgsql
security definer
as $$
declare
  v_count integer;
begin
  update public.videos
  set hidden_at = null
  where channel_id = p_channel_id
    and user_id = p_user_id
    and hidden_at is not null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Update trigger to pass user_id
create or replace function trigger_check_orphaned_channel()
returns trigger
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
begin
  -- Get the user_id from the group being deleted from
  select cg.user_id into v_user_id
  from public.channel_groups cg
  where cg.id = old.group_id;

  -- Check if channel is orphaned for this specific user
  if v_user_id is not null then
    perform hide_orphaned_channel_videos(old.channel_id, v_user_id);
  end if;

  return old;
end;
$$;

-- Update trigger to pass user_id on insert
create or replace function trigger_unhide_channel_videos()
returns trigger
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
begin
  -- Get the user_id from the group being added to
  select cg.user_id into v_user_id
  from public.channel_groups cg
  where cg.id = new.group_id;

  -- Unhide videos for this specific user
  if v_user_id is not null then
    perform unhide_channel_videos(new.channel_id, v_user_id);
  end if;

  return new;
end;
$$;

-- ============================================================================
-- Update cleanup function
-- ============================================================================
create or replace function cleanup_hidden_videos(p_hours integer default 24)
returns integer
language plpgsql
security definer
as $$
declare
  v_count integer;
begin
  -- Delete videos hidden for more than p_hours (now user-scoped naturally)
  delete from public.videos
  where hidden_at is not null
    and hidden_at < now() - (p_hours || ' hours')::interval;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ============================================================================
-- Add RLS policy for videos table
-- ============================================================================
alter table public.videos enable row level security;

-- Users can only see their own videos
create policy "Users can view own videos"
  on public.videos for select
  using (user_id = (select id from public.users where auth_user_id = auth.uid()));

-- Users can only insert their own videos
create policy "Users can insert own videos"
  on public.videos for insert
  with check (user_id = (select id from public.users where auth_user_id = auth.uid()));

-- Users can only update their own videos
create policy "Users can update own videos"
  on public.videos for update
  using (user_id = (select id from public.users where auth_user_id = auth.uid()));

-- Users can only delete their own videos
create policy "Users can delete own videos"
  on public.videos for delete
  using (user_id = (select id from public.users where auth_user_id = auth.uid()));

-- ============================================================================
-- Update comment
-- ============================================================================
comment on table public.videos is 'YouTube video metadata (user-specific, each user has their own copy)';
comment on column public.videos.user_id is 'Owner of this video record - enables complete user data isolation';
