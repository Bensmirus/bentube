-- ============================================================================
-- Migration 00030: Fix commit_sync to handle large video batches
-- ============================================================================
-- Problem: commit_sync tries to insert ALL videos at once, causing crashes
-- when syncing thousands of videos across many channels.
--
-- Solution: Process videos in batches of 500 to prevent memory issues.
-- ============================================================================

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
  v_batch_size integer := 500;
  v_batch_count integer;
  v_current_batch integer;
  v_inserted_count integer;
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

  -- Process videos in batches to prevent memory issues
  -- First, count how many batches we need
  SELECT CEIL(COUNT(*)::numeric / v_batch_size) INTO v_batch_count
  FROM public.sync_staging_videos
  WHERE sync_id = p_sync_id;

  -- Process each batch
  FOR v_current_batch IN 0..(v_batch_count - 1) LOOP
    -- Insert this batch of videos
    WITH batch_videos AS (
      SELECT * FROM public.sync_staging_videos
      WHERE sync_id = p_sync_id
      ORDER BY created_at
      LIMIT v_batch_size
      OFFSET v_current_batch * v_batch_size
    ),
    inserted AS (
      INSERT INTO public.videos (
        user_id, channel_id, youtube_id, title, thumbnail,
        duration, duration_seconds, is_short, description, published_at
      )
      SELECT
        user_id, channel_id, youtube_id, title, thumbnail,
        duration, duration_seconds, is_short, description, published_at
      FROM batch_videos
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
    SELECT count(*) INTO v_inserted_count FROM inserted;

    v_videos_committed := v_videos_committed + COALESCE(v_inserted_count, 0);
  END LOOP;

  -- Process video-channel associations (these are typically smaller, can do all at once)
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

COMMENT ON FUNCTION commit_sync IS 'Commits staged videos to main table in batches of 500 to prevent memory issues during large syncs';
