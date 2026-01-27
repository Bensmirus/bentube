# PRD: Database Quality Fixes

## Overview

This document outlines the required database changes to achieve **complete user isolation** in Ben.Tube. Based on the audit and user requirements, each user should have their own independent experience with no data leakage between users.

---

## User Requirements Summary

| Feature | Requirement |
|---------|-------------|
| Videos | Per-user (each user has their own copy) |
| Users | Multiple users supported |
| Unsubscribe behavior | Immediate deletion (no grace period) |
| Alerts | Per-user (only see your own) |
| Channels | Independent subscriptions per user |
| Hidden videos | Personal (doesn't affect others) |
| Channel health | Per-user tracking |
| Dead channels | Per-user decision |
| API quota | Per-user tracking |
| Tags & notes | Personal to each user |

---

## Current Issues Found

### Critical Issues

1. **Migration 00017 partially implements user isolation but conflicts with earlier migrations**
   - Migration 00002 sets RLS to "any authenticated user can view all videos"
   - Migration 00017 changes this to "users can only view own videos"
   - Needs cleanup to remove conflicting policies

2. **Duplicate `sync_locks` table definitions**
   - Created in 00010 with `id uuid primary key` (no default)
   - Created again in 00011 with `id uuid primary key default gen_random_uuid()`
   - Different constraints cause confusion

3. **Missing migration 00016**
   - Gap in numbering suggests a migration was deleted or never created

4. **Channels table still shared but should have per-user health tracking**
   - `health_status`, `consecutive_failures`, etc. are on the shared channels table
   - Should be moved to a user-channel relationship table

5. **Sync alerts are system-wide, not per-user**
   - No `user_id` column on `sync_alerts` table
   - All users see all alerts

6. **Soft-delete (24-hour grace period) conflicts with "immediate deletion" requirement**
   - Migration 00015 adds `hidden_at` for 24-hour grace period
   - User wants immediate deletion instead

### Data Model Issues

7. **`watch_status` table may have orphaned records**
   - References `videos(id)` which will change with per-user videos

8. **`video_tags` and `video_notes` reference shared video IDs**
   - Need to update foreign keys for per-user videos

9. **`user_subscriptions` table exists but relationship is unclear**
   - Created in 00008 but seems redundant with `group_channels`

10. **`get_channels_for_refresh` function returns wrong `user_id`**
    - Returns the user who owns a group, but channels should sync for all users who subscribed

---

## Proposed Fixes

### Phase 1: Clean Foundation

#### 1.1 Create missing migration 00016 (placeholder/skip marker)
```sql
-- 00016_placeholder.sql
-- This migration number was intentionally skipped
-- Nothing to do here
```

#### 1.2 Fix duplicate sync_locks definitions
- Remove the duplicate table creation
- Standardize on one schema with `id uuid primary key default gen_random_uuid()`

### Phase 2: Complete User Isolation for Channels

#### 2.1 Create `user_channels` junction table for per-user channel relationships
This replaces the need for per-user columns on the shared `channels` table.

```sql
CREATE TABLE public.user_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,

  -- Per-user health tracking (moved from channels table)
  health_status text DEFAULT 'healthy' CHECK (health_status IN ('healthy', 'warning', 'unhealthy', 'dead')),
  consecutive_failures integer DEFAULT 0,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_failure_reason text,
  last_error_type text CHECK (last_error_type IN ('transient', 'quota', 'auth', 'not_found', 'permanent', 'unknown')),
  last_playlist_refresh timestamptz,

  -- Timestamps
  created_at timestamptz DEFAULT now(),

  UNIQUE (user_id, channel_id)
);
```

#### 2.2 Update channel health functions to use `user_channels`
- `update_channel_health(p_user_id, p_channel_id, ...)`
- `get_dead_channels_for_retry(p_user_id, ...)`
- `get_channels_needing_playlist_refresh(p_user_id, ...)`

### Phase 3: Fix Sync Alerts to be Per-User

#### 3.1 Add `user_id` to `sync_alerts` table
```sql
ALTER TABLE public.sync_alerts
  ADD COLUMN user_id uuid REFERENCES public.users(id) ON DELETE CASCADE;

-- Update RLS policies
DROP POLICY "Authenticated users can view alerts" ON public.sync_alerts;
CREATE POLICY "Users can view own alerts"
  ON public.sync_alerts FOR SELECT
  USING (user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid()));
```

### Phase 4: Remove Soft-Delete Grace Period

#### 4.1 Change soft-delete to immediate delete
- Modify `hide_orphaned_channel_videos` to DELETE instead of UPDATE hidden_at
- Remove the `cleanup_hidden_videos` function (no longer needed)
- Remove the `hidden_at` column from videos (or keep for a different purpose)

```sql
-- New behavior: immediate deletion
CREATE OR REPLACE FUNCTION delete_orphaned_channel_videos(p_channel_id uuid, p_user_id uuid)
RETURNS integer AS $$
DECLARE
  v_count integer;
BEGIN
  -- Check if channel is still in any of this user's groups
  IF EXISTS (
    SELECT 1 FROM public.group_channels gc
    JOIN public.channel_groups cg ON gc.group_id = cg.id
    WHERE gc.channel_id = p_channel_id AND cg.user_id = p_user_id
  ) THEN
    RETURN 0;
  END IF;

  -- Immediately delete this user's videos from the channel
  DELETE FROM public.videos
  WHERE channel_id = p_channel_id AND user_id = p_user_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Phase 5: Clean Up RLS Policies

#### 5.1 Remove conflicting video RLS policies
- Drop old "Authenticated users can view videos" policy
- Ensure only per-user policies exist

#### 5.2 Audit all RLS policies for consistency
Tables needing review:
- `videos` - per-user only
- `channels` - still shared (read), but health is per-user via `user_channels`
- `sync_alerts` - per-user only
- `sync_progress` - per-user only
- `sync_history` - per-user only

### Phase 6: Fix Foreign Key Relationships

#### 6.1 Update `watch_status` for per-user videos
- The `video_id` foreign key should still work since videos now have per-user IDs
- May need data migration for existing records

#### 6.2 Update `video_tags` and `video_notes`
- Same consideration as watch_status
- Foreign keys should work with new per-user video IDs

### Phase 7: Update Sync Functions

#### 7.1 Update `get_channels_for_refresh` to be per-user aware
```sql
-- Return channels that need refresh for a specific user
CREATE OR REPLACE FUNCTION get_channels_for_refresh(
  p_user_id uuid,
  p_activity_level text,
  p_stale_hours integer,
  p_limit integer DEFAULT 100
)
-- Use user_channels for health status instead of channels table
```

#### 7.2 Update video sync to create per-user video records
- When syncing a channel, create video records for the specific user
- Don't share video records between users

---

## Migration Order

| Order | Migration | Description |
|-------|-----------|-------------|
| 1 | 00018_create_user_channels.sql | Per-user channel relationships and health |
| 2 | 00019_sync_alerts_per_user.sql | Add user_id to alerts, update RLS |
| 3 | 00020_immediate_delete_videos.sql | Remove grace period, immediate deletion |
| 4 | 00021_cleanup_rls_policies.sql | Remove conflicting RLS policies |
| 5 | 00022_update_sync_functions.sql | Update all sync functions for per-user |
| 6 | 00023_migrate_existing_data.sql | Move existing data to new structure |

---

## Data Migration Considerations

### Existing Data
- If there's existing data in the database, need migration scripts
- Health data from `channels` table needs to move to `user_channels`
- Existing videos need `user_id` assigned (if not already done by 00017)

### Breaking Changes
- API endpoints that query channels will need updates
- Sync cron jobs will need to iterate per-user
- Frontend may need updates for new data structure

---

## Testing Checklist

- [ ] User A's videos are not visible to User B
- [ ] User A's channel health doesn't affect User B
- [ ] User A's alerts are not visible to User B
- [ ] Removing a channel immediately deletes videos (no 24h wait)
- [ ] Two users can subscribe to the same YouTube channel independently
- [ ] Hiding a video only hides it for that user
- [ ] Tags and notes are private to each user
- [ ] API quota is tracked per user
- [ ] Sync progress shows only for the current user

---

## Questions for Implementation

1. **Existing data**: Is there existing production data that needs migration, or is this a fresh start?
2. **Downtime**: Can there be downtime during migration, or must it be zero-downtime?
3. **Rollback**: Do we need rollback scripts for each migration?

---

## Additional Schema Changes (from PRD refinement)

### Watch Progress Enhancement

```sql
-- Update watch_status table to support detailed progress tracking
ALTER TABLE watch_status
  ADD COLUMN IF NOT EXISTS progress_seconds integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS progress_percent integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_watched_at timestamptz,
  ADD COLUMN IF NOT EXISTS favorite boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS watch_later boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS watch_later_order integer,
  ADD COLUMN IF NOT EXISTS pinned boolean DEFAULT false;

-- Index for "In Progress" queries (sorted by last watched)
CREATE INDEX IF NOT EXISTS idx_watch_status_in_progress
  ON watch_status(user_id, last_watched_at DESC)
  WHERE progress_percent > 0 AND progress_percent < 90;

-- Index for Watch Later queue
CREATE INDEX IF NOT EXISTS idx_watch_status_watch_later
  ON watch_status(user_id, watch_later_order)
  WHERE watch_later = true;
```

### Session Management

```sql
CREATE TABLE IF NOT EXISTS user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_info jsonb,
  ip_address inet,
  last_active_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- RLS: users can only see their own sessions
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sessions"
  ON user_sessions FOR SELECT
  USING (user_id = (SELECT id FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY "Users can delete own sessions"
  ON user_sessions FOR DELETE
  USING (user_id = (SELECT id FROM users WHERE auth_user_id = auth.uid()));
```

### Watch Later Auto-Remove Trigger

```sql
-- Automatically remove from Watch Later when marked as watched
CREATE OR REPLACE FUNCTION auto_remove_watch_later()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.watched = true AND OLD.watched = false THEN
    NEW.watch_later := false;
    NEW.watch_later_order := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER watch_later_auto_remove
  BEFORE UPDATE ON watch_status
  FOR EACH ROW
  EXECUTE FUNCTION auto_remove_watch_later();
```

### Progress Sync Function

```sql
-- Update progress with conflict resolution (more advanced position wins)
CREATE OR REPLACE FUNCTION update_watch_progress(
  p_user_id uuid,
  p_video_id uuid,
  p_seconds integer,
  p_percent integer,
  p_duration integer
)
RETURNS void AS $$
BEGIN
  INSERT INTO watch_status (user_id, video_id, progress_seconds, progress_percent, last_watched_at, watched)
  VALUES (
    p_user_id,
    p_video_id,
    p_seconds,
    p_percent,
    now(),
    p_percent >= 90  -- Auto-mark watched at 90%
  )
  ON CONFLICT (user_id, video_id) DO UPDATE SET
    progress_seconds = GREATEST(watch_status.progress_seconds, EXCLUDED.progress_seconds),
    progress_percent = GREATEST(watch_status.progress_percent, EXCLUDED.progress_percent),
    last_watched_at = now(),
    watched = CASE
      WHEN GREATEST(watch_status.progress_percent, EXCLUDED.progress_percent) >= 90 THEN true
      ELSE watch_status.watched
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Updated Migration Order

| Order | Migration | Description |
|-------|-----------|-------------|
| 1 | 00018_create_user_channels.sql | Per-user channel relationships and health |
| 2 | 00019_sync_alerts_per_user.sql | Add user_id to alerts, update RLS |
| 3 | 00020_immediate_delete_videos.sql | Remove grace period, immediate deletion |
| 4 | 00021_cleanup_rls_policies.sql | Remove conflicting RLS policies |
| 5 | 00022_update_sync_functions.sql | Update all sync functions for per-user |
| 6 | 00023_migrate_existing_data.sql | Move existing data to new structure |
| 7 | 00024_watch_progress_enhancement.sql | Progress tracking columns and functions |
| 8 | 00025_session_management.sql | User sessions table |
| 9 | 00026_watch_later_trigger.sql | Auto-remove from Watch Later |
