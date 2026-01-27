-- ============================================================================
-- Migration 00023_complete_fix: Complete database improvements
-- This migration is idempotent - safe to run multiple times
-- ============================================================================

-- ============================================================================
-- 1. First, handle the blocked_videos -> video_trash rename
-- Check if table exists under either name and rename if needed
-- ============================================================================

DO $$
BEGIN
  -- If blocked_videos exists but video_trash doesn't, rename it
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'blocked_videos')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'video_trash')
  THEN
    ALTER TABLE public.blocked_videos RENAME TO video_trash;
    RAISE NOTICE 'Renamed blocked_videos to video_trash';
  END IF;

  -- If neither exists, create video_trash from scratch
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'video_trash')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'blocked_videos')
  THEN
    CREATE TABLE public.video_trash (
      user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      youtube_id text NOT NULL,
      deleted_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, youtube_id)
    );
    RAISE NOTICE 'Created video_trash table from scratch';
  END IF;
END $$;

-- ============================================================================
-- 2. Add columns to video_trash (if they don't exist)
-- ============================================================================

ALTER TABLE public.video_trash
  ADD COLUMN IF NOT EXISTS video_title text,
  ADD COLUMN IF NOT EXISTS video_thumbnail text,
  ADD COLUMN IF NOT EXISTS channel_title text,
  ADD COLUMN IF NOT EXISTS permanently_blocked boolean NOT NULL DEFAULT false;

-- Handle deleted_at column (might be named blocked_at from old schema)
DO $$
BEGIN
  -- If blocked_at exists but deleted_at doesn't, rename it
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'video_trash' AND column_name = 'blocked_at')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'video_trash' AND column_name = 'deleted_at')
  THEN
    ALTER TABLE public.video_trash RENAME COLUMN blocked_at TO deleted_at;
    RAISE NOTICE 'Renamed blocked_at to deleted_at';
  END IF;

  -- If neither exists, add deleted_at
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'video_trash' AND column_name = 'deleted_at')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'video_trash' AND column_name = 'blocked_at')
  THEN
    ALTER TABLE public.video_trash ADD COLUMN deleted_at timestamptz NOT NULL DEFAULT now();
    RAISE NOTICE 'Added deleted_at column';
  END IF;
END $$;

-- Add channel_id column with FK (needs special handling)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'video_trash' AND column_name = 'channel_id')
  THEN
    ALTER TABLE public.video_trash ADD COLUMN channel_id uuid REFERENCES public.channels(id) ON DELETE SET NULL;
    RAISE NOTICE 'Added channel_id column';
  END IF;
END $$;

-- ============================================================================
-- 3. Update indexes for video_trash
-- ============================================================================

DROP INDEX IF EXISTS idx_blocked_videos_user_youtube;
CREATE INDEX IF NOT EXISTS idx_video_trash_user_youtube ON public.video_trash(user_id, youtube_id);
CREATE INDEX IF NOT EXISTS idx_video_trash_user_deleted ON public.video_trash(user_id, deleted_at DESC);

-- ============================================================================
-- 4. RLS policies for video_trash
-- ============================================================================

ALTER TABLE public.video_trash ENABLE ROW LEVEL SECURITY;

-- Drop any old policies (from either table name)
DROP POLICY IF EXISTS "Users can view own blocked videos" ON public.video_trash;
DROP POLICY IF EXISTS "Users can block videos" ON public.video_trash;
DROP POLICY IF EXISTS "Users can unblock videos" ON public.video_trash;
DROP POLICY IF EXISTS "Users can view own trash" ON public.video_trash;
DROP POLICY IF EXISTS "Users can trash videos" ON public.video_trash;
DROP POLICY IF EXISTS "Users can restore or update trash" ON public.video_trash;
DROP POLICY IF EXISTS "Users can permanently delete from trash" ON public.video_trash;

CREATE POLICY "Users can view own trash"
  ON public.video_trash FOR SELECT
  USING (user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid()));

CREATE POLICY "Users can trash videos"
  ON public.video_trash FOR INSERT
  WITH CHECK (user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid()));

CREATE POLICY "Users can restore or update trash"
  ON public.video_trash FOR UPDATE
  USING (user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid()));

CREATE POLICY "Users can permanently delete from trash"
  ON public.video_trash FOR DELETE
  USING (user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid()));

COMMENT ON TABLE public.video_trash IS 'Trash for deleted videos. Videos here will not be re-imported during sync. Users can restore from trash or permanently block.';

-- ============================================================================
-- 5. Trash helper functions
-- ============================================================================

CREATE OR REPLACE FUNCTION trash_video(
  p_user_id uuid,
  p_video_id uuid,
  p_permanent boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_video RECORD;
BEGIN
  SELECT v.youtube_id, v.title, v.thumbnail, v.channel_id, c.title as channel_title
  INTO v_video
  FROM public.videos v
  LEFT JOIN public.channels c ON c.id = v.channel_id
  WHERE v.id = p_video_id AND v.user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.video_trash (
    user_id, youtube_id, video_title, video_thumbnail,
    channel_id, channel_title, permanently_blocked
  ) VALUES (
    p_user_id, v_video.youtube_id, v_video.title, v_video.thumbnail,
    v_video.channel_id, v_video.channel_title, p_permanent
  )
  ON CONFLICT (user_id, youtube_id) DO UPDATE
  SET deleted_at = now(),
      permanently_blocked = p_permanent,
      video_title = EXCLUDED.video_title,
      video_thumbnail = EXCLUDED.video_thumbnail;

  DELETE FROM public.videos WHERE id = p_video_id AND user_id = p_user_id;
  DELETE FROM public.watch_status WHERE video_id = p_video_id AND user_id = p_user_id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION restore_video_from_trash(
  p_user_id uuid,
  p_youtube_id text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_trash RECORD;
  v_new_video_id uuid;
BEGIN
  SELECT * INTO v_trash
  FROM public.video_trash
  WHERE user_id = p_user_id AND youtube_id = p_youtube_id;

  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_trash.permanently_blocked THEN RETURN NULL; END IF;

  INSERT INTO public.videos (user_id, youtube_id, channel_id, title, thumbnail, published_at)
  VALUES (p_user_id, v_trash.youtube_id, v_trash.channel_id, v_trash.video_title, v_trash.video_thumbnail, now())
  ON CONFLICT (user_id, youtube_id) DO NOTHING
  RETURNING id INTO v_new_video_id;

  DELETE FROM public.video_trash WHERE user_id = p_user_id AND youtube_id = p_youtube_id;

  RETURN v_new_video_id;
END;
$$;

CREATE OR REPLACE FUNCTION permanently_block_video(
  p_user_id uuid,
  p_youtube_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.video_trash SET permanently_blocked = true
  WHERE user_id = p_user_id AND youtube_id = p_youtube_id;
  RETURN FOUND;
END;
$$;

-- ============================================================================
-- 6. sync_alerts user isolation
-- ============================================================================

ALTER TABLE public.sync_alerts
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_sync_alerts_user ON public.sync_alerts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_alerts_user_unacknowledged ON public.sync_alerts(user_id, created_at DESC) WHERE acknowledged = false;

DROP POLICY IF EXISTS "Service role can manage alerts" ON public.sync_alerts;
DROP POLICY IF EXISTS "Authenticated users can view alerts" ON public.sync_alerts;
DROP POLICY IF EXISTS "Users can view own alerts" ON public.sync_alerts;
DROP POLICY IF EXISTS "Users can acknowledge own alerts" ON public.sync_alerts;
DROP POLICY IF EXISTS "Service role full access to alerts" ON public.sync_alerts;

CREATE POLICY "Users can view own alerts"
  ON public.sync_alerts FOR SELECT
  USING (user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid()));

CREATE POLICY "Users can acknowledge own alerts"
  ON public.sync_alerts FOR UPDATE
  USING (user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid()));

CREATE POLICY "Service role full access to alerts"
  ON public.sync_alerts FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Updated alert functions with user_id
CREATE OR REPLACE FUNCTION create_sync_alert(
  p_user_id uuid,
  p_alert_type text,
  p_severity text,
  p_title text,
  p_message text,
  p_data jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_alert_id uuid;
BEGIN
  INSERT INTO public.sync_alerts (user_id, alert_type, severity, title, message, data)
  VALUES (p_user_id, p_alert_type, p_severity, p_title, p_message, p_data)
  RETURNING id INTO v_alert_id;
  RETURN v_alert_id;
END;
$$;

CREATE OR REPLACE FUNCTION get_unacknowledged_alerts(p_user_id uuid, p_limit integer DEFAULT 50)
RETURNS TABLE (id uuid, alert_type text, severity text, title text, message text, data jsonb, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT a.id, a.alert_type, a.severity, a.title, a.message, a.data, a.created_at
  FROM public.sync_alerts a
  WHERE a.user_id = p_user_id AND a.acknowledged = false
  ORDER BY CASE a.severity WHEN 'critical' THEN 1 WHEN 'error' THEN 2 WHEN 'warning' THEN 3 WHEN 'info' THEN 4 END, a.created_at DESC
  LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION acknowledge_alerts(p_user_id uuid, p_alert_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.sync_alerts SET acknowledged = true, acknowledged_at = now()
  WHERE id = ANY(p_alert_ids) AND user_id = p_user_id AND acknowledged = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION acknowledge_all_alerts(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.sync_alerts SET acknowledged = true, acknowledged_at = now()
  WHERE user_id = p_user_id AND acknowledged = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION get_alert_counts(p_user_id uuid)
RETURNS TABLE (total_unacknowledged integer, critical_count integer, error_count integer, warning_count integer, info_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE severity = 'critical')::integer,
    count(*) FILTER (WHERE severity = 'error')::integer,
    count(*) FILTER (WHERE severity = 'warning')::integer,
    count(*) FILTER (WHERE severity = 'info')::integer
  FROM public.sync_alerts WHERE user_id = p_user_id AND acknowledged = false;
END;
$$;

CREATE OR REPLACE FUNCTION cleanup_old_alerts(p_user_id uuid, p_days integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_count integer;
BEGIN
  DELETE FROM public.sync_alerts
  WHERE user_id = p_user_id AND acknowledged = true AND created_at < now() - (p_days || ' days')::interval;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ============================================================================
-- 7. Duplicate Video Detection - video_channels table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.video_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  youtube_id text NOT NULL,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, youtube_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_video_channels_user_youtube ON public.video_channels(user_id, youtube_id);
CREATE INDEX IF NOT EXISTS idx_video_channels_user_channel ON public.video_channels(user_id, channel_id);

ALTER TABLE public.video_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own video channels" ON public.video_channels;
DROP POLICY IF EXISTS "Service role can manage video channels" ON public.video_channels;

CREATE POLICY "Users can view own video channels"
  ON public.video_channels FOR SELECT
  USING (user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid()));

CREATE POLICY "Service role can manage video channels"
  ON public.video_channels FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.video_channels IS 'Maps videos to multiple channels (for duplicates/re-uploads).';

CREATE OR REPLACE FUNCTION get_video_channels(p_user_id uuid, p_youtube_id text)
RETURNS TABLE (channel_id uuid, channel_title text, channel_thumbnail text, discovered_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.title, c.thumbnail, vc.discovered_at
  FROM public.video_channels vc
  JOIN public.channels c ON c.id = vc.channel_id
  WHERE vc.user_id = p_user_id AND vc.youtube_id = p_youtube_id
  ORDER BY vc.discovered_at ASC;
END;
$$;

-- ============================================================================
-- 8. Uniform Sync Schedule
-- ============================================================================

UPDATE public.channels SET activity_level = 'medium' WHERE activity_level IS DISTINCT FROM 'medium';

CREATE OR REPLACE FUNCTION enforce_uniform_activity_level()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.activity_level := 'medium';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_uniform_activity ON public.channels;
CREATE TRIGGER enforce_uniform_activity
  BEFORE INSERT OR UPDATE ON public.channels
  FOR EACH ROW
  EXECUTE FUNCTION enforce_uniform_activity_level();

-- ============================================================================
-- 9. Auto-Remove Dead Channels
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_remove_dead_channels(p_user_id uuid)
RETURNS TABLE (channel_id uuid, channel_title text, groups_removed_from integer)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH dead_channels AS (
    SELECT DISTINCT c.id, c.title
    FROM public.channels c
    INNER JOIN public.group_channels gc ON gc.channel_id = c.id
    INNER JOIN public.channel_groups cg ON cg.id = gc.group_id
    WHERE cg.user_id = p_user_id AND c.health_status = 'dead'
  ),
  removed AS (
    DELETE FROM public.group_channels gc
    USING public.channel_groups cg
    WHERE gc.group_id = cg.id AND cg.user_id = p_user_id
      AND gc.channel_id IN (SELECT id FROM dead_channels)
    RETURNING gc.channel_id
  )
  SELECT dc.id, dc.title, (SELECT count(*)::integer FROM removed r WHERE r.channel_id = dc.id)
  FROM dead_channels dc;
END;
$$;

-- ============================================================================
-- 10. Updated get_channels_for_refresh for uniform schedule
-- ============================================================================

CREATE OR REPLACE FUNCTION get_channels_for_refresh(p_stale_hours integer DEFAULT 6, p_limit integer DEFAULT 100)
RETURNS TABLE (id uuid, youtube_id text, uploads_playlist_id text, last_fetched_at timestamptz, user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_cutoff timestamptz;
BEGIN
  v_cutoff := now() - (p_stale_hours || ' hours')::interval;
  RETURN QUERY
  SELECT DISTINCT c.id, c.youtube_id, c.uploads_playlist_id, c.last_fetched_at, cg.user_id
  FROM public.channels c
  INNER JOIN public.group_channels gc ON gc.channel_id = c.id
  INNER JOIN public.channel_groups cg ON cg.id = gc.group_id
  WHERE c.health_status != 'dead' AND c.uploads_playlist_id IS NOT NULL
    AND (c.last_fetched_at IS NULL OR c.last_fetched_at < v_cutoff)
  ORDER BY c.last_fetched_at ASC NULLS FIRST
  LIMIT p_limit;
END;
$$;

-- Backwards compatible overload
CREATE OR REPLACE FUNCTION get_channels_for_refresh(p_activity_level text, p_stale_hours integer, p_limit integer DEFAULT 100)
RETURNS TABLE (id uuid, youtube_id text, uploads_playlist_id text, last_fetched_at timestamptz, user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY SELECT * FROM get_channels_for_refresh(p_stale_hours, p_limit);
END;
$$;
