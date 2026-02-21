-- ============================================================================
-- Migration 00043: Add Group Exclusion/Inclusion Filter
--
-- Adds ability to exclude or include specific groups from feed results
-- Used in "All" view to filter out entire categories
-- ============================================================================

-- Drop existing function (all parameter signatures)
DROP FUNCTION IF EXISTS get_feed(uuid,uuid,uuid[],text,boolean,boolean,integer,integer,timestamptz,timestamptz,uuid[],uuid[],boolean,boolean,integer,integer);

-- Create updated function with group filter parameters
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
  p_exclude_channel_ids uuid[] DEFAULT NULL,
  p_in_progress_only boolean DEFAULT false,
  p_watch_later_only boolean DEFAULT false,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_exclude_group_ids uuid[] DEFAULT NULL,
  p_include_group_ids uuid[] DEFAULT NULL
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
            AND (p_exclude_group_ids IS NULL OR gc.group_id != ALL(p_exclude_group_ids))
            AND (p_include_group_ids IS NULL OR gc.group_id = ANY(p_include_group_ids))
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
              AND (p_exclude_group_ids IS NULL OR gp.group_id != ALL(p_exclude_group_ids))
              AND (p_include_group_ids IS NULL OR gp.group_id = ANY(p_include_group_ids))
          )
        )
      )
      AND (p_channel_ids IS NULL OR v.channel_id = ANY(p_channel_ids))
      AND (p_exclude_channel_ids IS NULL OR v.channel_id != ALL(p_exclude_channel_ids))
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

COMMENT ON FUNCTION get_feed IS 'Get video feed for user with support for filtering by channels and groups';
