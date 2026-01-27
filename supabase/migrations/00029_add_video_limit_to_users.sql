-- ============================================================================
-- Migration 00029: Add video_limit column to users table
-- ============================================================================
-- This column stores the user's preference for how many videos to fetch
-- when syncing a channel. NULL means fetch all videos.
-- ============================================================================

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS video_limit integer DEFAULT 100;

COMMENT ON COLUMN public.users.video_limit IS 'Max number of videos to fetch per channel during sync (NULL = all videos)';
