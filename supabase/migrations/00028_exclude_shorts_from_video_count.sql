-- ============================================================================
-- Migration 00028: Exclude shorts from video count in groups
-- ============================================================================
-- Shorts should not be counted in the total video count displayed in groups.
-- This migration updates the get_groups_with_channels function to filter out
-- videos where is_short = true when counting videos.
-- ============================================================================

-- Must drop first because return type is changing
DROP FUNCTION IF EXISTS get_groups_with_channels(uuid);

CREATE OR REPLACE FUNCTION get_groups_with_channels(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  color text,
  icon text,
  sort_order integer,
  created_at timestamptz,
  channel_ids uuid[],
  channel_count bigint,
  video_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cg.id,
    cg.name,
    cg.color,
    cg.icon,
    cg.sort_order,
    cg.created_at,
    COALESCE(array_agg(gc.channel_id) FILTER (WHERE gc.channel_id IS NOT NULL), '{}') AS channel_ids,
    COUNT(gc.channel_id) FILTER (WHERE gc.channel_id IS NOT NULL) AS channel_count,
    COALESCE(
      (
        SELECT COUNT(*)
        FROM public.videos v
        WHERE v.user_id = p_user_id
          AND v.channel_id = ANY(
            ARRAY(
              SELECT gc2.channel_id
              FROM public.group_channels gc2
              WHERE gc2.group_id = cg.id
            )
          )
          AND v.hidden_at IS NULL
          AND COALESCE(v.is_short, false) = false  -- Exclude shorts from count
      ),
      0
    ) AS video_count
  FROM public.channel_groups cg
  LEFT JOIN public.group_channels gc ON cg.id = gc.group_id
  WHERE cg.user_id = p_user_id
  GROUP BY cg.id
  ORDER BY cg.sort_order, cg.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
