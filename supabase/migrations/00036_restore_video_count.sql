-- ============================================================================
-- Migration 00036: Restore video_count to get_groups_with_channels
-- ============================================================================
-- Migration 00034 accidentally removed video_count when adding playlist support.
-- This migration restores it while keeping the playlist fields.
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
  playlist_ids uuid[],
  playlist_count bigint,
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
    COALESCE(array_agg(DISTINCT gc.channel_id) FILTER (WHERE gc.channel_id IS NOT NULL), '{}') AS channel_ids,
    COUNT(DISTINCT gc.channel_id) FILTER (WHERE gc.channel_id IS NOT NULL) AS channel_count,
    COALESCE(array_agg(DISTINCT gp.playlist_id) FILTER (WHERE gp.playlist_id IS NOT NULL), '{}') AS playlist_ids,
    COUNT(DISTINCT gp.playlist_id) FILTER (WHERE gp.playlist_id IS NOT NULL) AS playlist_count,
    -- Count videos from both channels and playlists in this group (excluding shorts)
    COALESCE(
      (
        SELECT COUNT(*)
        FROM public.videos v
        WHERE v.user_id = p_user_id
          AND v.hidden_at IS NULL
          AND COALESCE(v.is_short, false) = false
          AND (
            -- Videos from channels in this group
            v.channel_id = ANY(
              ARRAY(
                SELECT gc2.channel_id
                FROM public.group_channels gc2
                WHERE gc2.group_id = cg.id
              )
            )
            OR
            -- Videos from playlists in this group
            v.source_playlist_id = ANY(
              ARRAY(
                SELECT gp2.playlist_id
                FROM public.group_playlists gp2
                WHERE gp2.group_id = cg.id
              )
            )
          )
      ),
      0
    ) AS video_count
  FROM public.channel_groups cg
  LEFT JOIN public.group_channels gc ON cg.id = gc.group_id
  LEFT JOIN public.group_playlists gp ON cg.id = gp.group_id
  WHERE cg.user_id = p_user_id
  GROUP BY cg.id
  ORDER BY cg.sort_order, cg.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
