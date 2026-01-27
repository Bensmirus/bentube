-- ============================================================================
-- Migration 00024: Sync Rollback System
--
-- Implements all-or-nothing sync behavior:
-- - If sync crashes or fails, all changes are rolled back
-- - Uses staging tables to collect changes before committing
-- ============================================================================

-- ============================================================================
-- 1. Staging Table for Videos During Sync
-- Videos are inserted here first, then bulk-moved to main table on success
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sync_staging_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_id uuid NOT NULL,  -- Links to sync_progress.id
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  youtube_id text NOT NULL,
  title text NOT NULL,
  thumbnail text,
  duration text,
  duration_seconds integer,
  is_short boolean DEFAULT false,
  description text,
  published_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(sync_id, youtube_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_staging_videos_sync
  ON public.sync_staging_videos(sync_id);

CREATE INDEX IF NOT EXISTS idx_sync_staging_videos_user
  ON public.sync_staging_videos(user_id);

-- No RLS needed - only service role accesses this
ALTER TABLE public.sync_staging_videos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only for staging" ON public.sync_staging_videos;
CREATE POLICY "Service role only for staging"
  ON public.sync_staging_videos FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.sync_staging_videos IS 'Temporary staging for videos during sync. Committed to videos table on sync success, deleted on failure.';

-- ============================================================================
-- 2. Staging Table for Video-Channel Associations (for duplicates)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sync_staging_video_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  youtube_id text NOT NULL,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  discovered_at timestamptz DEFAULT now(),
  UNIQUE(sync_id, youtube_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_staging_vc_sync
  ON public.sync_staging_video_channels(sync_id);

ALTER TABLE public.sync_staging_video_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only for staging vc" ON public.sync_staging_video_channels;
CREATE POLICY "Service role only for staging vc"
  ON public.sync_staging_video_channels FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 3. Update sync_progress to track sync state for rollback
-- ============================================================================

ALTER TABLE public.sync_progress
  ADD COLUMN IF NOT EXISTS sync_state text DEFAULT 'in_progress'
    CHECK (sync_state IN ('in_progress', 'committing', 'committed', 'rolling_back', 'rolled_back', 'failed'));

CREATE INDEX IF NOT EXISTS idx_sync_progress_state
  ON public.sync_progress(user_id, sync_state);

-- ============================================================================
-- 4. Functions for Staged Sync Operations
-- ============================================================================

-- Stage a video for later commit
CREATE OR REPLACE FUNCTION stage_video(
  p_sync_id uuid,
  p_user_id uuid,
  p_channel_id uuid,
  p_youtube_id text,
  p_title text,
  p_thumbnail text,
  p_duration text,
  p_duration_seconds integer,
  p_is_short boolean,
  p_description text,
  p_published_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.sync_staging_videos (
    sync_id, user_id, channel_id, youtube_id, title,
    thumbnail, duration, duration_seconds, is_short,
    description, published_at
  ) VALUES (
    p_sync_id, p_user_id, p_channel_id, p_youtube_id, p_title,
    p_thumbnail, p_duration, p_duration_seconds, p_is_short,
    p_description, p_published_at
  )
  ON CONFLICT (sync_id, youtube_id) DO UPDATE SET
    title = EXCLUDED.title,
    thumbnail = EXCLUDED.thumbnail,
    duration = EXCLUDED.duration,
    duration_seconds = EXCLUDED.duration_seconds,
    is_short = EXCLUDED.is_short,
    description = EXCLUDED.description,
    published_at = EXCLUDED.published_at
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Stage a video-channel association (for duplicate tracking)
CREATE OR REPLACE FUNCTION stage_video_channel(
  p_sync_id uuid,
  p_user_id uuid,
  p_youtube_id text,
  p_channel_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.sync_staging_video_channels (
    sync_id, user_id, youtube_id, channel_id
  ) VALUES (
    p_sync_id, p_user_id, p_youtube_id, p_channel_id
  )
  ON CONFLICT (sync_id, youtube_id, channel_id) DO NOTHING;
END;
$$;

-- Commit all staged changes from a sync (the "all" of all-or-nothing)
CREATE OR REPLACE FUNCTION commit_sync(p_sync_id uuid)
RETURNS TABLE (
  videos_committed integer,
  duplicates_linked integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_videos_committed integer := 0;
  v_duplicates_linked integer := 0;
  v_user_id uuid;
BEGIN
  -- Get user_id from sync_progress
  SELECT user_id INTO v_user_id
  FROM public.sync_progress
  WHERE id = p_sync_id;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sync not found: %', p_sync_id;
  END IF;

  -- Mark sync as committing
  UPDATE public.sync_progress
  SET sync_state = 'committing', updated_at = now()
  WHERE id = p_sync_id;

  -- Check for blocked/trashed videos and remove them from staging
  DELETE FROM public.sync_staging_videos sv
  USING public.video_trash vt
  WHERE sv.sync_id = p_sync_id
    AND sv.user_id = vt.user_id
    AND sv.youtube_id = vt.youtube_id;

  -- Move staged videos to main table
  WITH inserted AS (
    INSERT INTO public.videos (
      user_id, channel_id, youtube_id, title, thumbnail,
      duration, duration_seconds, is_short, description, published_at
    )
    SELECT
      user_id, channel_id, youtube_id, title, thumbnail,
      duration, duration_seconds, is_short, description, published_at
    FROM public.sync_staging_videos
    WHERE sync_id = p_sync_id
    ON CONFLICT (user_id, youtube_id) DO UPDATE SET
      title = EXCLUDED.title,
      thumbnail = EXCLUDED.thumbnail,
      duration = EXCLUDED.duration,
      duration_seconds = EXCLUDED.duration_seconds,
      is_short = EXCLUDED.is_short,
      description = EXCLUDED.description,
      published_at = EXCLUDED.published_at
    RETURNING 1
  )
  SELECT count(*) INTO v_videos_committed FROM inserted;

  -- Move staged video-channel associations
  WITH inserted_vc AS (
    INSERT INTO public.video_channels (user_id, youtube_id, channel_id, discovered_at)
    SELECT user_id, youtube_id, channel_id, discovered_at
    FROM public.sync_staging_video_channels
    WHERE sync_id = p_sync_id
    ON CONFLICT (user_id, youtube_id, channel_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_duplicates_linked FROM inserted_vc;

  -- Clean up staging tables
  DELETE FROM public.sync_staging_videos WHERE sync_id = p_sync_id;
  DELETE FROM public.sync_staging_video_channels WHERE sync_id = p_sync_id;

  -- Mark sync as committed
  UPDATE public.sync_progress
  SET sync_state = 'committed', updated_at = now()
  WHERE id = p_sync_id;

  RETURN QUERY SELECT v_videos_committed, v_duplicates_linked;
END;
$$;

-- Rollback all staged changes from a failed sync
CREATE OR REPLACE FUNCTION rollback_sync(p_sync_id uuid)
RETURNS TABLE (
  videos_discarded integer,
  associations_discarded integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_videos_discarded integer;
  v_associations_discarded integer;
BEGIN
  -- Mark sync as rolling back
  UPDATE public.sync_progress
  SET sync_state = 'rolling_back', updated_at = now()
  WHERE id = p_sync_id;

  -- Delete all staged videos
  DELETE FROM public.sync_staging_videos WHERE sync_id = p_sync_id;
  GET DIAGNOSTICS v_videos_discarded = ROW_COUNT;

  -- Delete all staged associations
  DELETE FROM public.sync_staging_video_channels WHERE sync_id = p_sync_id;
  GET DIAGNOSTICS v_associations_discarded = ROW_COUNT;

  -- Mark sync as rolled back
  UPDATE public.sync_progress
  SET sync_state = 'rolled_back', updated_at = now()
  WHERE id = p_sync_id;

  RETURN QUERY SELECT v_videos_discarded, v_associations_discarded;
END;
$$;

-- Clean up any abandoned staging data (from crashed syncs)
CREATE OR REPLACE FUNCTION cleanup_abandoned_syncs(p_hours integer DEFAULT 2)
RETURNS TABLE (
  syncs_cleaned integer,
  videos_discarded integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_syncs_cleaned integer := 0;
  v_videos_discarded integer := 0;
  v_cutoff timestamptz;
BEGIN
  v_cutoff := now() - (p_hours || ' hours')::interval;

  -- Find abandoned syncs (in_progress but not updated recently)
  WITH abandoned AS (
    SELECT id FROM public.sync_progress
    WHERE sync_state = 'in_progress'
      AND updated_at < v_cutoff
  ),
  deleted_videos AS (
    DELETE FROM public.sync_staging_videos
    WHERE sync_id IN (SELECT id FROM abandoned)
    RETURNING 1
  ),
  deleted_vc AS (
    DELETE FROM public.sync_staging_video_channels
    WHERE sync_id IN (SELECT id FROM abandoned)
    RETURNING 1
  ),
  updated_progress AS (
    UPDATE public.sync_progress
    SET sync_state = 'failed', updated_at = now()
    WHERE id IN (SELECT id FROM abandoned)
    RETURNING 1
  )
  SELECT
    (SELECT count(*) FROM updated_progress),
    (SELECT count(*) FROM deleted_videos)
  INTO v_syncs_cleaned, v_videos_discarded;

  RETURN QUERY SELECT v_syncs_cleaned, v_videos_discarded;
END;
$$;

-- ============================================================================
-- 5. Quota handling: Stop and wait, resume when reset
-- Quota resets at midnight Pacific time
-- ============================================================================

-- Add column to track if sync was paused due to quota
ALTER TABLE public.sync_progress
  ADD COLUMN IF NOT EXISTS paused_for_quota boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS resume_after timestamptz;

-- Function to pause sync for quota
CREATE OR REPLACE FUNCTION pause_sync_for_quota(p_sync_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_resume_time timestamptz;
BEGIN
  -- Calculate next midnight Pacific (when quota resets)
  -- Midnight Pacific = 8:00 UTC (or 7:00 UTC during DST)
  v_resume_time := date_trunc('day', now() AT TIME ZONE 'America/Los_Angeles' + interval '1 day')
                   AT TIME ZONE 'America/Los_Angeles';

  UPDATE public.sync_progress
  SET
    paused_for_quota = true,
    resume_after = v_resume_time,
    updated_at = now()
  WHERE id = p_sync_id;

  RETURN v_resume_time;
END;
$$;

-- Function to get syncs that can be resumed (quota reset)
CREATE OR REPLACE FUNCTION get_resumable_syncs()
RETURNS TABLE (
  sync_id uuid,
  user_id uuid,
  progress jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sp.id,
    sp.user_id,
    sp.progress
  FROM public.sync_progress sp
  WHERE sp.paused_for_quota = true
    AND sp.resume_after IS NOT NULL
    AND sp.resume_after <= now()
    AND sp.sync_state = 'in_progress';
END;
$$;
