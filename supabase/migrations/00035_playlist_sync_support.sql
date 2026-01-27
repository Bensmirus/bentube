-- ============================================================================
-- Migration 00035: Playlist Sync Support
-- Adds source_playlist_id to staging table so playlist videos can be synced
-- ============================================================================

-- Add source_playlist_id to staging table
ALTER TABLE public.sync_staging_videos
ADD COLUMN IF NOT EXISTS source_playlist_id uuid REFERENCES public.user_playlists(id) ON DELETE CASCADE;

-- Update commit_sync function to copy source_playlist_id
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

  -- Move staged videos to main table (now includes source_playlist_id)
  WITH inserted AS (
    INSERT INTO public.videos (
      user_id, channel_id, youtube_id, title, thumbnail,
      duration, duration_seconds, is_short, description, published_at,
      source_playlist_id
    )
    SELECT
      user_id, channel_id, youtube_id, title, thumbnail,
      duration, duration_seconds, is_short, description, published_at,
      source_playlist_id
    FROM public.sync_staging_videos
    WHERE sync_id = p_sync_id
    ON CONFLICT (user_id, youtube_id) DO UPDATE SET
      title = EXCLUDED.title,
      thumbnail = EXCLUDED.thumbnail,
      duration = EXCLUDED.duration,
      duration_seconds = EXCLUDED.duration_seconds,
      is_short = EXCLUDED.is_short,
      description = EXCLUDED.description,
      published_at = EXCLUDED.published_at,
      source_playlist_id = COALESCE(EXCLUDED.source_playlist_id, public.videos.source_playlist_id)
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
