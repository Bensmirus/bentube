-- ============================================================================
-- BenTube Database Schema
-- Version: 1.0.0
-- ============================================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================================
-- USERS TABLE
-- ============================================================================
create table public.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  google_id text unique not null,
  email text not null,
  youtube_access_token text,
  youtube_refresh_token text,
  youtube_token_expires_at timestamptz,
  preferences jsonb default '{}',
  fetch_shorts boolean default true,
  api_key_hash text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index idx_users_auth_user_id on public.users(auth_user_id);
create unique index idx_users_google_id on public.users(google_id);
create unique index idx_users_api_key_hash on public.users(api_key_hash)
  where api_key_hash is not null;

comment on table public.users is 'User profiles with YouTube OAuth tokens';

-- ============================================================================
-- CHANNELS TABLE (shared across users)
-- ============================================================================
create table public.channels (
  id uuid primary key default gen_random_uuid(),
  youtube_id text unique not null,
  title text not null,
  thumbnail text,
  uploads_playlist_id text,
  activity_level text default 'medium' check (activity_level in ('high', 'medium', 'low')),
  last_fetched_at timestamptz,
  created_at timestamptz default now()
);

create index idx_channels_youtube_id on public.channels(youtube_id);
create index idx_channels_activity_level on public.channels(activity_level);
create index idx_channels_last_fetched on public.channels(last_fetched_at);

comment on table public.channels is 'YouTube channels (shared, not user-specific)';

-- ============================================================================
-- CHANNEL_GROUPS TABLE
-- ============================================================================
create table public.channel_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  color text default '#3B82F6',
  icon text default '📁',
  sort_order integer default 0,
  created_at timestamptz default now(),

  constraint valid_hex_color check (color ~ '^#[0-9A-Fa-f]{6}$')
);

create index idx_channel_groups_user_id on public.channel_groups(user_id);
create index idx_channel_groups_sort_order on public.channel_groups(user_id, sort_order);

comment on table public.channel_groups is 'User-defined channel groups for organization';

-- ============================================================================
-- GROUP_CHANNELS (junction table)
-- ============================================================================
create table public.group_channels (
  group_id uuid not null references public.channel_groups(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  added_at timestamptz default now(),
  primary key (group_id, channel_id)
);

create index idx_group_channels_channel on public.group_channels(channel_id);
create index idx_group_channels_group on public.group_channels(group_id);

comment on table public.group_channels is 'Junction table linking groups to channels';

-- ============================================================================
-- VIDEOS TABLE
-- ============================================================================
create table public.videos (
  id uuid primary key default gen_random_uuid(),
  youtube_id text unique not null,
  channel_id uuid not null references public.channels(id) on delete cascade,
  title text not null,
  thumbnail text,
  duration text,
  duration_seconds integer,
  is_short boolean default false,
  description text,
  published_at timestamptz,
  created_at timestamptz default now()
);

create index idx_videos_youtube_id on public.videos(youtube_id);
create index idx_videos_channel_id on public.videos(channel_id);
create index idx_videos_published_at on public.videos(published_at desc);
create index idx_videos_is_short on public.videos(is_short);
create index idx_videos_duration on public.videos(duration_seconds);

-- Composite index for feed queries
create index idx_videos_feed on public.videos(channel_id, published_at desc, is_short);

comment on table public.videos is 'YouTube video metadata (shared, not user-specific)';

-- ============================================================================
-- WATCH_STATUS TABLE (per-user video state)
-- ============================================================================
create table public.watch_status (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  watched boolean default false,
  hidden boolean default false,
  watch_later boolean default false,
  watch_progress real default 0 check (watch_progress >= 0 and watch_progress <= 1),
  updated_at timestamptz default now(),

  unique (user_id, video_id)
);

create index idx_watch_status_user on public.watch_status(user_id);
create index idx_watch_status_video on public.watch_status(video_id);
create index idx_watch_status_user_video on public.watch_status(user_id, video_id);

comment on table public.watch_status is 'Per-user watch status for videos';

-- ============================================================================
-- TAGS TABLE
-- ============================================================================
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  group_id uuid not null references public.channel_groups(id) on delete cascade,
  name text not null,
  color text default '#6366F1',
  sort_order integer default 0,
  created_at timestamptz default now(),

  unique (user_id, group_id, name)
);

create index idx_tags_user on public.tags(user_id);
create index idx_tags_group on public.tags(group_id);

comment on table public.tags is 'User-defined tags per channel group';

-- ============================================================================
-- VIDEO_TAGS (junction table)
-- ============================================================================
create table public.video_tags (
  tag_id uuid not null references public.tags(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz default now(),

  primary key (tag_id, video_id, user_id)
);

create index idx_video_tags_video on public.video_tags(video_id, user_id);
create index idx_video_tags_tag on public.video_tags(tag_id);

comment on table public.video_tags is 'Junction table linking videos to tags';

-- ============================================================================
-- VIDEO_NOTES TABLE
-- ============================================================================
create table public.video_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  content text not null default '',
  updated_at timestamptz default now(),

  unique (user_id, video_id)
);

create index idx_video_notes_user_video on public.video_notes(user_id, video_id);

comment on table public.video_notes is 'User notes attached to videos';

-- ============================================================================
-- ICONS TABLE (for icon picker, shared)
-- ============================================================================
create table public.icons (
  id serial primary key,
  emoji text not null,
  name text not null,
  category text not null,
  keywords text default '',
  sort_order integer default 0
);

create index idx_icons_category on public.icons(category);

comment on table public.icons is 'Emoji library for group icon picker';
