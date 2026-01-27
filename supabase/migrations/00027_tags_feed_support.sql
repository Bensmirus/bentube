-- Update get_feed function to:
-- 1. Support AND logic for tag filtering (video must have ALL selected tags)
-- 2. Add has_tags field to indicate if video has any tags

-- Drop existing function first (required when changing return type)
DROP FUNCTION IF EXISTS get_feed(uuid,uuid,uuid[],text,boolean,boolean,integer,integer,timestamptz,timestamptz,boolean,integer,integer);

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
  watch_progress_seconds integer,
  has_tags boolean
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
    sub.description,
    sub.published_at,
    sub.channel_title,
    sub.channel_thumbnail,
    sub.watched,
    sub.hidden,
    sub.watch_later,
    sub.watch_progress,
    sub.watch_progress_seconds,
    sub.has_tags
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
      v.description,
      v.published_at,
      c.title AS channel_title,
      c.thumbnail AS channel_thumbnail,
      COALESCE(ws.watched, false) AS watched,
      COALESCE(ws.hidden, false) AS hidden,
      COALESCE(ws.watch_later, false) AS watch_later,
      COALESCE(ws.watch_progress, 0::real) AS watch_progress,
      COALESCE(ws.watch_progress_seconds, 0) AS watch_progress_seconds,
      ws.last_position_at AS sort_position_at,
      -- Check if video has any tags
      EXISTS(
        SELECT 1 FROM public.video_tags vt_check
        WHERE vt_check.video_id = v.id AND vt_check.user_id = p_user_id
      ) AS has_tags
    FROM public.videos v
    JOIN public.channels c ON v.channel_id = c.id
    JOIN public.group_channels gc ON c.id = gc.channel_id
    JOIN public.channel_groups cg ON gc.group_id = cg.id
    LEFT JOIN public.watch_status ws ON v.id = ws.video_id AND ws.user_id = p_user_id
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
      -- Tag filter (AND logic: video must have ALL selected tags)
      AND (
        p_tag_ids IS NULL
        OR (
          -- Count how many of the selected tags this video has
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
    -- When filtering by in_progress, sort by most recently watched
    CASE WHEN p_in_progress_only THEN sub.sort_position_at END DESC NULLS LAST,
    -- Default: sort by publish date
    sub.published_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
