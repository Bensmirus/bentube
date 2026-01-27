-- ============================================================================
-- Video Import Limit Setting
-- Global setting for how many videos to import per channel
-- ============================================================================

-- Add video_import_limit column to users table
-- NULL means "all videos" (no limit)
-- Default is 100 videos per channel
alter table public.users
  add column if not exists video_import_limit integer default 100;

-- Add comment explaining the column
comment on column public.users.video_import_limit is
  'Maximum videos to import per channel. NULL = unlimited (all videos). Default = 100.';

-- Create index for potential filtering (optional, but good for queries)
create index if not exists idx_users_video_import_limit
  on public.users(video_import_limit)
  where video_import_limit is not null;
