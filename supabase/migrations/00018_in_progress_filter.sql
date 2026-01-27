-- ============================================================================
-- Phase 2: In Progress Filter Support
-- ============================================================================

-- Add index for efficient "in progress" queries
-- Shows videos with progress > 0 that aren't marked as watched
CREATE INDEX IF NOT EXISTS idx_watch_status_in_progress
  ON watch_status(user_id, last_position_at DESC)
  WHERE watch_progress > 0 AND watched = false;

-- ============================================================================
-- UPDATE GET_FEED FUNCTION to support in_progress filter
-- ============================================================================
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
  p_in_progress_only boolean DEFAULT false,
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
  description text,
  published_at timestamptz,
  channel_title text,
  channel_thumbnail text,
  watched boolean,
  hidden boolean,
  watch_later boolean,
  watch_progress real,
  watch_progress_seconds integer
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    v.id,
    v.youtube_id,
    v.channel_id,
    v.title,
    v.thumbnail,
    v.duration,
    v.duration_seconds,
    v.is_short,
    v.description,
    v.published_at,
    c.title AS channel_title,
    c.thumbnail AS channel_thumbnail,
    COALESCE(ws.watched, false) AS watched,
    COALESCE(ws.hidden, false) AS hidden,
    COALESCE(ws.watch_later, false) AS watch_later,
    COALESCE(ws.watch_progress, 0::real) AS watch_progress,
    COALESCE(ws.watch_progress_seconds, 0) AS watch_progress_seconds
  FROM public.videos v
  JOIN public.channels c ON v.channel_id = c.id
  JOIN public.group_channels gc ON c.id = gc.channel_id
  JOIN public.channel_groups cg ON gc.group_id = cg.id
  LEFT JOIN public.watch_status ws ON v.id = ws.video_id AND ws.user_id = p_user_id
  LEFT JOIN public.video_tags vt ON v.id = vt.video_id AND vt.user_id = p_user_id
  WHERE
    -- Videos must belong to this user (CRITICAL: user isolation)
    v.user_id = p_user_id
    -- Ensure user owns the group
    AND cg.user_id = p_user_id
    -- Filter out soft-deleted videos
    AND v.hidden_at IS NULL
    -- Group filter
    AND (p_group_id IS NULL OR gc.group_id = p_group_id)
    -- Hide hidden videos (unless searching)
    AND (p_search IS NOT NULL OR COALESCE(ws.hidden, false) = false)
    -- In progress filter: show videos with progress > 0 that aren't marked watched
    AND (
      NOT p_in_progress_only
      OR (COALESCE(ws.watch_progress, 0) > 0 AND COALESCE(ws.watched, false) = false)
    )
    -- Shorts filter
    AND (
      (p_shorts_only AND v.is_short = true)
      OR (NOT p_shorts_only AND p_include_shorts)
      OR (NOT p_shorts_only AND NOT p_include_shorts AND COALESCE(v.is_short, false) = false)
    )
    -- Duration filter
    AND (p_min_duration IS NULL OR v.duration_seconds >= p_min_duration)
    AND (p_max_duration IS NULL OR v.duration_seconds <= p_max_duration)
    -- Date filter
    AND (p_min_date IS NULL OR v.published_at >= p_min_date)
    AND (p_max_date IS NULL OR v.published_at <= p_max_date)
    -- Search filter
    AND (p_search IS NULL OR (
      lower(v.title) LIKE '%' || lower(p_search) || '%'
      OR lower(c.title) LIKE '%' || lower(p_search) || '%'
    ))
    -- Tag filter
    AND (p_tag_ids IS NULL OR vt.tag_id = ANY(p_tag_ids))
  ORDER BY
    -- When filtering by in_progress, sort by most recently watched
    CASE WHEN p_in_progress_only THEN ws.last_position_at END DESC NULLS LAST,
    -- Default: sort by publish date
    v.published_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- UPDATE COUNT_FEED FUNCTION to support in_progress filter
-- ============================================================================
CREATE OR REPLACE FUNCTION count_feed(
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
  p_in_progress_only boolean DEFAULT false
)
RETURNS bigint AS $$
DECLARE
  total bigint;
BEGIN
  SELECT COUNT(DISTINCT v.id) INTO total
  FROM public.videos v
  JOIN public.channels c ON v.channel_id = c.id
  JOIN public.group_channels gc ON c.id = gc.channel_id
  JOIN public.channel_groups cg ON gc.group_id = cg.id
  LEFT JOIN public.watch_status ws ON v.id = ws.video_id AND ws.user_id = p_user_id
  LEFT JOIN public.video_tags vt ON v.id = vt.video_id AND vt.user_id = p_user_id
  WHERE
    -- Videos must belong to this user (CRITICAL: user isolation)
    v.user_id = p_user_id
    AND cg.user_id = p_user_id
    -- Filter out soft-deleted videos
    AND v.hidden_at IS NULL
    AND (p_group_id IS NULL OR gc.group_id = p_group_id)
    AND (p_search IS NOT NULL OR COALESCE(ws.hidden, false) = false)
    -- In progress filter: show videos with progress > 0 that aren't marked watched
    AND (
      NOT p_in_progress_only
      OR (COALESCE(ws.watch_progress, 0) > 0 AND COALESCE(ws.watched, false) = false)
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
    AND (p_tag_ids IS NULL OR vt.tag_id = ANY(p_tag_ids));

  RETURN total;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
