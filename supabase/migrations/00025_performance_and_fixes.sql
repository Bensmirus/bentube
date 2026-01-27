-- ============================================================================
-- Migration 00025: Performance Improvements and Bug Fixes
--
-- Fixes identified in database audit:
-- 1. Add missing indexes for sync_progress cleanup queries
-- 2. Add composite index for group_channels join performance
-- 3. Add explicit RLS deny policies for channels table modifications
-- 4. Fix sync_alerts to allow system-wide alerts (null user_id)
-- ============================================================================

-- ============================================================================
-- 1. Missing Index for Abandoned Sync Cleanup
-- The cleanup_abandoned_syncs function queries by (sync_state, updated_at)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_sync_progress_state_updated
  ON public.sync_progress(sync_state, updated_at);

-- ============================================================================
-- 2. Composite Index for Group Channels
-- Improves performance of common joins through channel_groups
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_group_channels_group_channel
  ON public.group_channels(group_id, channel_id);

-- ============================================================================
-- 3. Explicit RLS Policies for Channels Table
-- Channels are managed by service role only - deny direct user modifications
-- ============================================================================

-- Drop any existing permissive policies that might allow modifications
DROP POLICY IF EXISTS "Users can insert channels" ON public.channels;
DROP POLICY IF EXISTS "Users can update channels" ON public.channels;
DROP POLICY IF EXISTS "Users can delete channels" ON public.channels;

-- Service role can manage channels (for sync operations)
DROP POLICY IF EXISTS "Service role manages channels" ON public.channels;
CREATE POLICY "Service role manages channels"
  ON public.channels FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 4. Allow System-Wide Alerts (null user_id)
-- Some alerts (like quota warnings) may apply to the system, not a specific user
-- Update RLS to handle this edge case
-- ============================================================================

-- Update the view policy to also show system alerts (where user_id is null)
DROP POLICY IF EXISTS "Users can view own alerts" ON public.sync_alerts;
CREATE POLICY "Users can view own alerts"
  ON public.sync_alerts FOR SELECT
  USING (
    user_id IS NULL  -- System-wide alerts visible to all
    OR user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
  );

-- ============================================================================
-- 5. Index for Watch Status Progress Queries
-- Improves performance of "in progress" video queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_watch_status_user_progress
  ON public.watch_status(user_id, watch_progress)
  WHERE watch_progress > 0 AND watch_progress < 100;

-- ============================================================================
-- 6. Add Index for Sync History Date Range Queries
-- Improves analytics queries that filter by date ranges
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_sync_history_completed
  ON public.sync_history(completed_at DESC NULLS LAST);

-- ============================================================================
-- 7. Ensure video_trash has proper primary key
-- Some earlier migrations may have left this inconsistent
-- ============================================================================

DO $$
BEGIN
  -- Check if primary key exists, if not create it
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'video_trash'
      AND constraint_type = 'PRIMARY KEY'
  ) THEN
    -- Add primary key if missing
    ALTER TABLE public.video_trash
      ADD PRIMARY KEY (user_id, youtube_id);
  END IF;
END $$;

-- ============================================================================
-- 8. Ensure RLS is enabled on all tables
-- Double-check critical tables have RLS enabled
-- ============================================================================

ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watch_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_trash ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_channels ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Done
-- ============================================================================
