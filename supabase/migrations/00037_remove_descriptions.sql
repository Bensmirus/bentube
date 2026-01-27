-- ============================================================================
-- Migration 00037: Remove Unused Description Fields
--
-- Removes description columns from videos, playlists, and staging tables
-- These fields consume 10-25% of database space but are barely used in UI
--
-- Storage savings: ~50-70% reduction in video table size
-- ============================================================================

-- ============================================================================
-- 1. Remove description from videos table
-- ============================================================================

ALTER TABLE public.videos
DROP COLUMN IF EXISTS description;

COMMENT ON TABLE public.videos IS 'YouTube video metadata (user-specific, each user has their own copy). Descriptions removed to reduce storage.';

-- ============================================================================
-- 2. Remove description from user_playlists table
-- ============================================================================

ALTER TABLE public.user_playlists
DROP COLUMN IF EXISTS description;

-- ============================================================================
-- 3. Remove description from sync_staging_videos table
-- ============================================================================

ALTER TABLE public.sync_staging_videos
DROP COLUMN IF EXISTS description;

-- ============================================================================
-- 4. Update stage_video function (remove description parameter)
-- ============================================================================

-- Drop old function with description parameter
DROP FUNCTION IF EXISTS stage_video(uuid, uuid, uuid, text, text, text, text, integer, boolean, text, timestamptz);

-- Create new function without description parameter
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
    published_at
  ) VALUES (
    p_sync_id, p_user_id, p_channel_id, p_youtube_id, p_title,
    p_thumbnail, p_duration, p_duration_seconds, p_is_short,
    p_published_at
  )
  ON CONFLICT (sync_id, youtube_id) DO UPDATE SET
    title = EXCLUDED.title,
    thumbnail = EXCLUDED.thumbnail,
    duration = EXCLUDED.duration,
    duration_seconds = EXCLUDED.duration_seconds,
    is_short = EXCLUDED.is_short,
    published_at = EXCLUDED.published_at
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION stage_video IS 'Stage a video for sync commit (no description stored to save space)';

-- ============================================================================
-- 5. Update commit_sync function (remove description from INSERT)
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

  -- Move staged videos to main table (without description)
  WITH inserted AS (
    INSERT INTO public.videos (
      user_id, channel_id, youtube_id, title, thumbnail,
      duration, duration_seconds, is_short, published_at,
      source_playlist_id
    )
    SELECT
      user_id, channel_id, youtube_id, title, thumbnail,
      duration, duration_seconds, is_short, published_at,
      source_playlist_id
    FROM public.sync_staging_videos
    WHERE sync_id = p_sync_id
    ON CONFLICT (user_id, youtube_id) DO UPDATE SET
      title = EXCLUDED.title,
      thumbnail = EXCLUDED.thumbnail,
      duration = EXCLUDED.duration,
      duration_seconds = EXCLUDED.duration_seconds,
      is_short = EXCLUDED.is_short,
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

COMMENT ON FUNCTION commit_sync IS 'Commit staged videos to main table (descriptions not stored to save space)';

-- ============================================================================
-- 6. Update get_feed function (remove description from SELECT)
-- ============================================================================

-- Drop all possible signatures of get_feed
DROP FUNCTION IF EXISTS get_feed(uuid,uuid,uuid[],text,boolean,boolean,integer,integer,timestamptz,timestamptz,uuid[],boolean,boolean,integer,integer);
DROP FUNCTION IF EXISTS get_feed(uuid,uuid,uuid[],text,boolean,boolean,integer,integer,timestamptz,timestamptz,integer,integer);
DROP FUNCTION IF EXISTS get_feed(uuid,uuid,uuid[],text,boolean,boolean,integer,integer,timestamptz,timestamptz,uuid[],integer,integer);

-- Create new function
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
      EXISTS(
        SELECT 1 FROM public.video_tags vt_check
        WHERE vt_check.video_id = v.id AND vt_check.user_id = p_user_id
      ) AS has_tags
    FROM public.videos v
    JOIN public.channels c ON v.channel_id = c.id
    LEFT JOIN public.watch_status ws ON v.id = ws.video_id AND ws.user_id = p_user_id
    WHERE
      v.user_id = p_user_id
      AND v.hidden_at IS NULL
      AND (
        EXISTS (
          SELECT 1
          FROM public.group_channels gc
          JOIN public.channel_groups cg ON gc.group_id = cg.id
          WHERE gc.channel_id = c.id
            AND cg.user_id = p_user_id
            AND (p_group_id IS NULL OR gc.group_id = p_group_id)
        )
        OR
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
      AND (p_channel_ids IS NULL OR v.channel_id = ANY(p_channel_ids))
      AND (p_search IS NOT NULL OR COALESCE(ws.hidden, false) = false)
      AND (
        NOT p_in_progress_only
        OR (COALESCE(ws.watch_progress, 0) > 0 AND COALESCE(ws.watched, false) = false)
      )
      AND (
        NOT p_watch_later_only
        OR COALESCE(ws.watch_later, false) = true
      )
      AND (
        (p_shorts_only AND v.is_short = true)
        OR (NOT p_shorts_only AND p_include_shorts)
        OR (NOT p_shorts_only AND NOT p_include_shorts AND COALESCE(v.is_short, false) = false)
      )
      AND (p_min_duration IS NULL OR v.duration_seconds >= p_min_duration)
      AND (p_max_duration IS NULL OR v.duration_seconds <= p_max_duration)
      AND (p_min_date IS NULL OR v.published_at >= p_min_date)
      AND (p_max_date IS NULL OR v.published_at <= p_max_date)
      AND (p_search IS NULL OR (
        lower(v.title) LIKE '%' || lower(p_search) || '%'
        OR lower(c.title) LIKE '%' || lower(p_search) || '%'
      ))
      AND (
        p_tag_ids IS NULL
        OR (
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
    CASE WHEN p_watch_later_only THEN sub.watch_later_at END DESC NULLS LAST,
    CASE WHEN p_in_progress_only THEN sub.sort_position_at END DESC NULLS LAST,
    sub.published_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_feed IS 'Get video feed for user (descriptions removed to reduce query size)';
