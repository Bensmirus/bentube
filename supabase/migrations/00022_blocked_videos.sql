-- ============================================================================
-- Migration 00022: Blocked Videos Table
-- Lightweight table to track videos users have deleted, preventing re-import
-- ============================================================================

-- Create blocked_videos table
-- Only stores youtube_id + user_id = ~31 bytes per row (vs ~580 bytes in videos table)
CREATE TABLE IF NOT EXISTS public.blocked_videos (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  youtube_id text NOT NULL,
  blocked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, youtube_id)
);

-- Index for efficient lookups during sync
CREATE INDEX IF NOT EXISTS idx_blocked_videos_user_youtube
  ON public.blocked_videos(user_id, youtube_id);

-- RLS policies
ALTER TABLE public.blocked_videos ENABLE ROW LEVEL SECURITY;

-- Users can only see their own blocked videos
CREATE POLICY "Users can view own blocked videos"
  ON public.blocked_videos FOR SELECT
  USING (auth.uid() = user_id);

-- Users can block videos
CREATE POLICY "Users can block videos"
  ON public.blocked_videos FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can unblock videos (restore)
CREATE POLICY "Users can unblock videos"
  ON public.blocked_videos FOR DELETE
  USING (auth.uid() = user_id);

-- Comment for documentation
COMMENT ON TABLE public.blocked_videos IS 'Lightweight blocklist of videos users have deleted. Sync checks this to prevent re-importing deleted videos.';
