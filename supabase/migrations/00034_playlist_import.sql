-- ============================================================================
-- Playlist Import Feature
-- Allows importing videos from YouTube playlists without subscribing to channels
-- Videos imported from playlists are NOT affected by regular sync operations
-- ============================================================================

-- ============================================================================
-- user_playlists table
-- Tracks imported playlists per user
-- ============================================================================
create table if not exists public.user_playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  youtube_playlist_id text not null,
  title text not null,
  thumbnail text,
  description text,
  channel_id uuid references public.channels(id) on delete set null,  -- Who owns the playlist
  video_count integer default 0,
  imported_at timestamptz default now(),
  last_refreshed_at timestamptz default now(),

  unique (user_id, youtube_playlist_id)
);

-- Indexes for efficient queries
create index if not exists idx_user_playlists_user on public.user_playlists(user_id);
create index if not exists idx_user_playlists_youtube_id on public.user_playlists(youtube_playlist_id);

comment on table public.user_playlists is 'Tracks YouTube playlists imported by each user (not synced, one-time import)';

-- ============================================================================
-- group_playlists junction table
-- Links playlists to groups (similar to group_channels)
-- ============================================================================
create table if not exists public.group_playlists (
  group_id uuid not null references public.channel_groups(id) on delete cascade,
  playlist_id uuid not null references public.user_playlists(id) on delete cascade,

  primary key (group_id, playlist_id)
);

-- Indexes for efficient queries
create index if not exists idx_group_playlists_group on public.group_playlists(group_id);
create index if not exists idx_group_playlists_playlist on public.group_playlists(playlist_id);

comment on table public.group_playlists is 'Junction table linking playlists to groups';

-- ============================================================================
-- Add source_playlist_id to videos table
-- Videos imported from playlists will have this set
-- CASCADE delete: when playlist is deleted, its videos are deleted too
-- ============================================================================
alter table public.videos
add column if not exists source_playlist_id uuid references public.user_playlists(id) on delete cascade;

-- Index for efficient filtering of playlist videos
create index if not exists idx_videos_source_playlist on public.videos(source_playlist_id)
where source_playlist_id is not null;

comment on column public.videos.source_playlist_id is 'Reference to the imported playlist this video came from (null for channel-synced videos)';

-- ============================================================================
-- Row Level Security Policies for user_playlists
-- ============================================================================
alter table public.user_playlists enable row level security;

-- Drop existing policies if they exist
drop policy if exists "Users can view own playlists" on public.user_playlists;
drop policy if exists "Users can insert own playlists" on public.user_playlists;
drop policy if exists "Users can update own playlists" on public.user_playlists;
drop policy if exists "Users can delete own playlists" on public.user_playlists;

-- Users can view their own playlists
create policy "Users can view own playlists"
  on public.user_playlists for select
  using (user_id = get_user_id());

-- Users can insert their own playlists
create policy "Users can insert own playlists"
  on public.user_playlists for insert
  with check (user_id = get_user_id());

-- Users can update their own playlists
create policy "Users can update own playlists"
  on public.user_playlists for update
  using (user_id = get_user_id());

-- Users can delete their own playlists
create policy "Users can delete own playlists"
  on public.user_playlists for delete
  using (user_id = get_user_id());

-- ============================================================================
-- Row Level Security Policies for group_playlists
-- Users can only manage playlist-group links for their own groups
-- ============================================================================
alter table public.group_playlists enable row level security;

-- Drop existing policies if they exist
drop policy if exists "Users can view own group playlists" on public.group_playlists;
drop policy if exists "Users can insert own group playlists" on public.group_playlists;
drop policy if exists "Users can delete own group playlists" on public.group_playlists;

-- Users can view group-playlist links for their own groups
create policy "Users can view own group playlists"
  on public.group_playlists for select
  using (
    exists (
      select 1 from public.channel_groups cg
      where cg.id = group_id and cg.user_id = get_user_id()
    )
  );

-- Users can insert group-playlist links for their own groups
create policy "Users can insert own group playlists"
  on public.group_playlists for insert
  with check (
    exists (
      select 1 from public.channel_groups cg
      where cg.id = group_id and cg.user_id = get_user_id()
    )
  );

-- Users can delete group-playlist links for their own groups
create policy "Users can delete own group playlists"
  on public.group_playlists for delete
  using (
    exists (
      select 1 from public.channel_groups cg
      where cg.id = group_id and cg.user_id = get_user_id()
    )
  );

-- ============================================================================
-- Update get_groups_with_channels to also include playlist counts
-- Must DROP first because return type is changing (adding playlist_ids and playlist_count)
-- ============================================================================
DROP FUNCTION IF EXISTS get_groups_with_channels(uuid);

create or replace function get_groups_with_channels(p_user_id uuid)
returns table (
  id uuid,
  name text,
  color text,
  icon text,
  sort_order integer,
  created_at timestamptz,
  channel_ids uuid[],
  channel_count bigint,
  playlist_ids uuid[],
  playlist_count bigint
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
    coalesce(array_agg(distinct gc.channel_id) filter (where gc.channel_id is not null), '{}') as channel_ids,
    count(distinct gc.channel_id) filter (where gc.channel_id is not null) as channel_count,
    coalesce(array_agg(distinct gp.playlist_id) filter (where gp.playlist_id is not null), '{}') as playlist_ids,
    count(distinct gp.playlist_id) filter (where gp.playlist_id is not null) as playlist_count
  from public.channel_groups cg
  left join public.group_channels gc on cg.id = gc.group_id
  left join public.group_playlists gp on cg.id = gp.group_id
  where cg.user_id = p_user_id
  group by cg.id
  order by cg.sort_order, cg.created_at;
end;
$$ language plpgsql security definer;

-- ============================================================================
-- Function to get videos for a group including playlist videos
-- ============================================================================
create or replace function get_group_videos_with_playlists(
  p_user_id uuid,
  p_group_id uuid,
  p_limit integer default 50,
  p_offset integer default 0,
  p_include_watched boolean default true,
  p_include_hidden boolean default false
)
returns table (
  id uuid,
  youtube_id text,
  title text,
  thumbnail text,
  duration text,
  duration_seconds integer,
  published_at timestamptz,
  channel_id uuid,
  channel_title text,
  channel_thumbnail text,
  is_short boolean,
  source_playlist_id uuid,
  watch_status jsonb
) as $$
begin
  return query
  with group_channel_ids as (
    select gc.channel_id
    from public.group_channels gc
    where gc.group_id = p_group_id
  ),
  group_playlist_ids as (
    select gp.playlist_id
    from public.group_playlists gp
    where gp.group_id = p_group_id
  ),
  filtered_videos as (
    select v.*
    from public.videos v
    left join public.watch_status ws on ws.video_id = v.id and ws.user_id = p_user_id
    where v.user_id = p_user_id
      and v.is_short = false
      and (
        -- Videos from channels in the group
        v.channel_id in (select channel_id from group_channel_ids)
        -- OR videos from playlists in the group
        or v.source_playlist_id in (select playlist_id from group_playlist_ids)
      )
      and (p_include_watched or coalesce(ws.watched, false) = false)
      and (p_include_hidden or coalesce(ws.hidden, false) = false)
  )
  select
    fv.id,
    fv.youtube_id,
    fv.title,
    fv.thumbnail,
    fv.duration,
    fv.duration_seconds,
    fv.published_at,
    fv.channel_id,
    c.title as channel_title,
    c.thumbnail as channel_thumbnail,
    fv.is_short,
    fv.source_playlist_id,
    jsonb_build_object(
      'watched', coalesce(ws.watched, false),
      'hidden', coalesce(ws.hidden, false),
      'watch_later', coalesce(ws.watch_later, false),
      'watch_progress', coalesce(ws.watch_progress, 0)
    ) as watch_status
  from filtered_videos fv
  join public.channels c on c.id = fv.channel_id
  left join public.watch_status ws on ws.video_id = fv.id and ws.user_id = p_user_id
  order by fv.published_at desc
  limit p_limit
  offset p_offset;
end;
$$ language plpgsql security definer;

comment on function get_group_videos_with_playlists is 'Gets videos for a group, including videos from both channels and imported playlists';

-- ============================================================================
-- Update get_feed function to include playlist videos
-- Videos can appear in feed from two sources:
-- 1. Channels that are in the user's groups
-- 2. Playlists that are in the user's groups (via source_playlist_id)
-- ============================================================================

-- Drop existing function first (required when changing parameters)
DROP FUNCTION IF EXISTS get_feed(uuid,uuid,uuid[],text,boolean,boolean,integer,integer,timestamptz,timestamptz,uuid[],boolean,boolean,integer,integer);

CREATE OR REPLACE FUNCTION get_feed(
  p_user_id uuid,
  p_group_id uuid DEFAULT NULL,
  p_tag_ids uuid[] DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_shorts_only boolean DEFAULT false,
  p_include_shorts boolean DEFAULT false,
  p_min_duration integer DEFAULT NULL,
  p_max_duration integer DEFAULT NULL,
  p_min_date timestamptz DEFAULT NULL,
  p_max_date timestamptz DEFAULT NULL,
  p_channel_ids uuid[] DEFAULT NULL,
  p_in_progress_only boolean DEFAULT false,
  p_watch_later_only boolean DEFAULT false,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
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
  watch_progress_seconds integer,
  has_tags boolean,
  source_playlist_id uuid
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sub.id,
    sub.youtube_id,
    sub.channel_id,
    sub.title,
    sub.thumbnail,
    sub.duration,
    sub.duration_seconds,
    sub.is_short,
    sub.description,
    sub.published_at,
    sub.channel_title,
    sub.channel_thumbnail,
    sub.watched,
    sub.hidden,
    sub.watch_later,
    sub.watch_progress,
    sub.watch_progress_seconds,
    sub.has_tags,
    sub.source_playlist_id
  FROM (
    SELECT DISTINCT ON (v.id)
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
      c.title AS channel_title,
      c.thumbnail AS channel_thumbnail,
      COALESCE(ws.watched, false) AS watched,
      COALESCE(ws.hidden, false) AS hidden,
      COALESCE(ws.watch_later, false) AS watch_later,
      COALESCE(ws.watch_progress, 0::real) AS watch_progress,
      COALESCE(ws.watch_progress_seconds, 0) AS watch_progress_seconds,
      ws.last_position_at AS sort_position_at,
      ws.updated_at AS watch_later_at,
      v.source_playlist_id,
      -- Check if video has any tags
      EXISTS(
        SELECT 1 FROM public.video_tags vt_check
        WHERE vt_check.video_id = v.id AND vt_check.user_id = p_user_id
      ) AS has_tags
    FROM public.videos v
    JOIN public.channels c ON v.channel_id = c.id
    LEFT JOIN public.watch_status ws ON v.id = ws.video_id AND ws.user_id = p_user_id
    WHERE
      -- Videos must belong to this user (CRITICAL: user isolation)
      v.user_id = p_user_id
      -- Filter out soft-deleted videos
      AND v.hidden_at IS NULL
      -- Video must be from either:
      -- 1. A channel that's in a group the user owns (original behavior)
      -- 2. A playlist that's in a group the user owns (new playlist import feature)
      AND (
        -- Channel-based videos: channel is in a group
        EXISTS (
          SELECT 1
          FROM public.group_channels gc
          JOIN public.channel_groups cg ON gc.group_id = cg.id
          WHERE gc.channel_id = c.id
            AND cg.user_id = p_user_id
            AND (p_group_id IS NULL OR gc.group_id = p_group_id)
        )
        OR
        -- Playlist-based videos: playlist is in a group
        (
          v.source_playlist_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.group_playlists gp
            JOIN public.channel_groups cg ON gp.group_id = cg.id
            WHERE gp.playlist_id = v.source_playlist_id
              AND cg.user_id = p_user_id
              AND (p_group_id IS NULL OR gp.group_id = p_group_id)
          )
        )
      )
      -- Channel filter (filter by specific channels)
      AND (p_channel_ids IS NULL OR v.channel_id = ANY(p_channel_ids))
      -- Hide hidden videos (unless searching)
      AND (p_search IS NOT NULL OR COALESCE(ws.hidden, false) = false)
      -- In progress filter: show videos with progress > 0 that aren't marked watched
      AND (
        NOT p_in_progress_only
        OR (COALESCE(ws.watch_progress, 0) > 0 AND COALESCE(ws.watched, false) = false)
      )
      -- Watch later filter: show only videos marked as watch later
      AND (
        NOT p_watch_later_only
        OR COALESCE(ws.watch_later, false) = true
      )
      -- Shorts filter
      AND (
        (p_shorts_only AND v.is_short = true)
        OR (NOT p_shorts_only AND p_include_shorts)
        OR (NOT p_shorts_only AND NOT p_include_shorts AND COALESCE(v.is_short, false) = false)
      )
      -- Duration filter
      AND (p_min_duration IS NULL OR v.duration_seconds >= p_min_duration)
      AND (p_max_duration IS NULL OR v.duration_seconds <= p_max_duration)
      -- Date filter
      AND (p_min_date IS NULL OR v.published_at >= p_min_date)
      AND (p_max_date IS NULL OR v.published_at <= p_max_date)
      -- Search filter
      AND (p_search IS NULL OR (
        lower(v.title) LIKE '%' || lower(p_search) || '%'
        OR lower(c.title) LIKE '%' || lower(p_search) || '%'
      ))
      -- Tag filter (AND logic: video must have ALL selected tags)
      AND (
        p_tag_ids IS NULL
        OR (
          -- Count how many of the selected tags this video has
          (
            SELECT COUNT(DISTINCT vt.tag_id)
            FROM public.video_tags vt
            WHERE vt.video_id = v.id
              AND vt.user_id = p_user_id
              AND vt.tag_id = ANY(p_tag_ids)
          ) = array_length(p_tag_ids, 1)
        )
      )
    ORDER BY v.id
  ) sub
  ORDER BY
    -- When filtering by watch later, sort by most recently added to watch later
    CASE WHEN p_watch_later_only THEN sub.watch_later_at END DESC NULLS LAST,
    -- When filtering by in_progress, sort by most recently watched
    CASE WHEN p_in_progress_only THEN sub.sort_position_at END DESC NULLS LAST,
    -- Default: sort by publish date
    sub.published_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
