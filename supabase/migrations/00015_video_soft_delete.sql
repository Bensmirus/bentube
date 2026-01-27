-- ============================================================================
-- Video Soft Delete Support
-- When a channel is removed from all groups, its videos are hidden for 24h
-- then permanently deleted by a cleanup job
-- ============================================================================

-- Add hidden_at column to videos table
alter table public.videos
  add column if not exists hidden_at timestamptz default null;

-- Index for efficient cleanup queries
create index if not exists idx_videos_hidden_at
  on public.videos(hidden_at)
  where hidden_at is not null;

comment on column public.videos.hidden_at is 'When set, video is hidden from feeds. After 24h, eligible for deletion.';

-- ============================================================================
-- Function to hide videos when channel removed from all groups
-- ============================================================================

create or replace function hide_orphaned_channel_videos(p_channel_id uuid)
returns integer
language plpgsql
security definer
as $$
declare
  v_count integer;
begin
  -- Check if channel is still in any group
  if exists (
    select 1 from public.group_channels
    where channel_id = p_channel_id
  ) then
    -- Channel still in a group, don't hide videos
    return 0;
  end if;

  -- Hide all videos from this channel
  update public.videos
  set hidden_at = now()
  where channel_id = p_channel_id
    and hidden_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ============================================================================
-- Function to unhide videos when channel is re-added to a group
-- ============================================================================

create or replace function unhide_channel_videos(p_channel_id uuid)
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
    and hidden_at is not null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ============================================================================
-- Cleanup function for old hidden videos (call via cron job)
-- ============================================================================

create or replace function cleanup_hidden_videos(p_hours integer default 24)
returns integer
language plpgsql
security definer
as $$
declare
  v_count integer;
begin
  -- Delete videos hidden for more than p_hours
  delete from public.videos
  where hidden_at is not null
    and hidden_at < now() - (p_hours || ' hours')::interval;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ============================================================================
-- Trigger to hide videos when channel removed from last group
-- ============================================================================

create or replace function trigger_check_orphaned_channel()
returns trigger
language plpgsql
security definer
as $$
begin
  -- After a channel is removed from a group, check if it's orphaned
  perform hide_orphaned_channel_videos(old.channel_id);
  return old;
end;
$$;

-- Create trigger on group_channels delete
drop trigger if exists check_orphaned_channel_on_delete on public.group_channels;
create trigger check_orphaned_channel_on_delete
  after delete on public.group_channels
  for each row
  execute function trigger_check_orphaned_channel();

-- ============================================================================
-- Trigger to unhide videos when channel added to a group
-- ============================================================================

create or replace function trigger_unhide_channel_videos()
returns trigger
language plpgsql
security definer
as $$
begin
  -- When channel is added to a group, unhide its videos
  perform unhide_channel_videos(new.channel_id);
  return new;
end;
$$;

-- Create trigger on group_channels insert
drop trigger if exists unhide_channel_videos_on_insert on public.group_channels;
create trigger unhide_channel_videos_on_insert
  after insert on public.group_channels
  for each row
  execute function trigger_unhide_channel_videos();

-- ============================================================================
-- Update video queries to exclude hidden videos
-- This is informational - actual filtering happens in application queries
-- ============================================================================

comment on table public.videos is 'YouTube videos. Filter by hidden_at IS NULL to exclude soft-deleted videos.';
