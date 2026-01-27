# Ben.Tube System Architecture

## Overview

Ben.Tube is a multi-user YouTube content manager for research, learning, and content curation. Each user has completely isolated data - nothing is shared between users except basic channel metadata.

This document covers how the import system, database, and automated maintenance work.

---

## Database Schema

### Core Tables

| Table | Purpose | Scope | Key Columns |
|-------|---------|-------|-------------|
| `users` | User accounts | - | google_id, email, youtube tokens, preferences |
| `channels` | YouTube channel metadata | Shared | youtube_id, title, thumbnail, uploads_playlist_id |
| `videos` | Video records | Per-user | user_id, youtube_id, channel_id, title, duration, published_at, source_playlist_id |
| `channel_groups` | Topic folders | Per-user | user_id, name, color, icon |
| `group_channels` | Links groups↔channels | Per-user | group_id, channel_id |
| `user_playlists` | Imported YouTube playlists | Per-user | user_id, youtube_playlist_id, title, thumbnail, video_count |
| `group_playlists` | Links groups↔playlists | Per-user | group_id, playlist_id |
| `user_channels` | Channel health per user | Per-user | user_id, channel_id, health_status, consecutive_failures |
| `watch_status` | Watch state | Per-user | user_id, video_id, watched, hidden, progress_seconds, progress_percent, favorite, watch_later, watch_later_order, last_watched_at |
| `tags` | Video tags | Per-user | user_id, group_id, name, color |
| `video_tags` | Links videos↔tags | Per-user | video_id, tag_id, user_id |
| `video_notes` | Notes on videos | Per-user | user_id, video_id, content |
| `video_trash` | Deleted/blocked videos | Per-user | user_id, youtube_id, permanently_blocked |
| `video_channels` | Duplicate video tracking | Per-user | user_id, youtube_id, channel_id |
| `api_quota` | Daily API usage | Per-user | user_id, date, units_used |
| `sync_progress` | Real-time sync status | Per-user | user_id, progress (JSONB), sync_state |
| `sync_history` | Audit log of syncs | Per-user | user_id, sync_type, channels_processed, videos_added |
| `sync_locks` | Prevents concurrent syncs | Per-user | user_id, expires_at |
| `sync_alerts` | System alerts | Per-user | user_id, alert_type, severity, title, message |
| `sync_staging_videos` | Temporary staging during sync | Per-sync | sync_id, user_id, youtube_id |
| `sync_staging_video_channels` | Temporary duplicate tracking | Per-sync | sync_id, user_id, youtube_id, channel_id |
| `user_sessions` | Active sessions | Per-user | user_id, device_info, last_active_at, created_at |

### Data Isolation Model

```
SHARED (basic info only):
└── channels      ← Basic metadata (id, title, thumbnail, playlist_id)

PER-USER (completely isolated):
├── videos              ← Each user has their OWN copy of videos
│   └── source_playlist_id  ← NULL for channel videos, set for playlist imports
├── user_channels       ← Health tracking per user (healthy/dead status)
├── channel_groups      ← Your topic folders (Tech, Music, etc.)
├── group_channels      ← Which channels in which folders
├── user_playlists      ← Imported YouTube playlists (one-time import)
├── group_playlists     ← Which playlists in which folders
├── watch_status        ← Your watched/hidden/progress
├── tags                ← Your personal tags
├── video_tags          ← Your tag assignments
├── video_notes         ← Your notes on videos
├── video_trash         ← Your deleted/blocked videos
├── video_channels      ← Duplicate video tracking
├── sync_alerts         ← Your sync alerts only
├── sync_history        ← Your sync history
└── api_quota           ← Your daily usage
```

**Why per-user videos?** Complete data isolation. If User A hides a video, User B still sees it. If User A unsubscribes from a channel, only their videos are deleted.

---

## Import System

### Initial Import Flow (First Time Setup)

**Trigger:** Automatic on first login

**User Experience:**
1. User is prompted to choose import date range (date picker)
2. User can skip import and add channels manually later
3. Progress bar shows: "Importing 45/200 channels..."
4. On failure: rollback everything, show "Import failed", retry from scratch

**Endpoint:** `POST /api/sync/subscriptions`

```
1. Acquire distributed lock (prevents concurrent syncs)
2. Check API quota availability
3. Fetch subscriptions from YouTube API
   └── 50 subscriptions per request (1 quota unit each)
4. Fetch channel details (uploads_playlist_id)
   └── 50 channels per request (1 quota unit each)
5. Upsert channels (no duplicates via youtube_id)
6. Create default "Subscriptions" group if needed
7. Link channels to group + user_subscriptions
8. Record in sync_history
9. Release lock
```

**Quota Cost:** ~8-10 units for 200 subscriptions

### Manual Channel Add

**Endpoint:** `POST /api/channels/add`

```
1. Validate YouTube channel URL
2. If invalid: return "No Channel Found, Check URL"
3. If already subscribed: return "Channel already exists"
4. Fetch channel info (thumbnail, title)
5. Show preview to user for confirmation
6. User selects group(s) and import date range
7. If channel has 5000+ videos: warn about API usage
8. If channel has 0 videos: show warning but allow
9. Import videos within date range
10. Add channel to selected groups
```

### Playlist Import Flow

**Endpoint:** `POST /api/playlists/import`

Playlists are imported once and NOT synced. Videos from playlists are frozen at import time.

```
1. Validate YouTube playlist URL
2. Fetch playlist metadata (title, thumbnail, video count)
3. Show preview to user for confirmation
4. User selects group(s) to add playlist to
5. Create record in user_playlists table
6. Fetch all videos from playlist
7. For each video:
   a. Get/create channel record (basic metadata only)
   b. Insert video with source_playlist_id set
8. Link playlist to selected groups in group_playlists
```

**Key Behaviors:**
- Videos have `source_playlist_id` set (distinguishes from channel-synced videos)
- Playlist deletion CASCADE deletes all its videos
- Re-importing same playlist only adds new videos (upsert)
- Playlist videos appear in feed when playlist is in an active group
- No sync jobs touch playlist videos - they're static

### Video Sync Flow (Getting New Videos)

**Endpoint:** `POST /api/sync/videos`

```
1. Acquire lock
2. Initialize progress tracking in sync_progress table
3. Get user's channels (skips "dead" channels)
4. For each channel:
   a. Update progress: "Syncing {channel}..."
   b. Fetch videos from uploads playlist with onProgress callbacks
      └── Incremental: only videos newer than last_fetched_at
      └── Progress updates: "Fetching page X...", "Processing Y videos..."
   c. Filter out: live streams, premieres, scheduled videos
   d. Skip Shorts completely (multiple detection methods):
      - Vertical aspect ratio (height > width)
      - Duration ≤ 60s AND vertical
      - Title contains #Shorts
   e. Upsert videos (no duplicates, shorts never reach database)
   f. Update channel health status
   g. Update progress with videos added count
5. Mark progress as complete
6. Record stats in sync_history
7. Release lock
```

### Duplicate Prevention

| Data Type | Protection |
|-----------|------------|
| Channels | `UNIQUE(youtube_id)` + upsert with `onConflict` |
| Videos | `UNIQUE(user_id, youtube_id)` + upsert with `onConflict` |
| User-Channel links | `UNIQUE(user_id, channel_id)` + `ignoreDuplicates` |

### Video Deletion Behavior

When a user removes a channel from all their groups:
- Videos are deleted **immediately** (no grace period)
- Only that user's videos are affected
- Other users who subscribe to the same channel keep their videos

### Video Trash System

Deleted videos go to `video_trash` table instead of being permanently deleted:
- Videos in trash won't be re-imported during sync
- User can restore videos from trash
- User can permanently block videos (never re-import)
- Trash preserves video metadata (title, thumbnail, channel) for easy identification

---

## Channel Health System

Tracks channel reliability **per user** to avoid wasting API quota on broken channels.

**Important:** Health is tracked per-user in the `user_channels` table. If a channel fails for User A, it doesn't affect User B.

### Health Statuses

| Status | Failures | Behavior |
|--------|----------|----------|
| `healthy` | 0-1 | Normal sync |
| `warning` | 2-4 | Still synced, flagged |
| `unhealthy` | 5-9 | Still synced, flagged |
| `dead` | 10+ | Skipped from syncs FOR THAT USER |

### Automatic Recovery

Dead channels are retried with exponential backoff:

| Failure Count | Wait Time |
|---------------|-----------|
| 10 | 24 hours |
| 11 | 48 hours |
| 12 | 96 hours (4 days) |
| 13+ | 192 hours (8 days max) |

---

## Scheduled Jobs (Cron)

Configured in `vercel.json`:

| Job | Schedule | Purpose |
|-----|----------|---------|
| `refresh-medium` | Every 6 hours | Sync all channels (uniform schedule) |
| `retry-dead-channels` | Daily 5am UTC | Retry dead channels with backoff |
| `refresh-playlists` | Sundays 2am UTC | Proactively update playlist IDs |
| `cleanup` | Sundays 3am UTC | Remove orphaned data |

**Note:** The high/low activity jobs are deprecated. All channels now use the medium (6-hour) schedule.

### Manual Sync

**Location:** Groups tab → "Sync now" button on each group

- No cooldown (user can trigger repeatedly)
- Syncs only channels in that specific group
- Real-time progress display with micro-updates every 2-5 seconds
- Stale detection: warning if no update in 30 seconds
- Progress persisted to database (visible across all tabs/sessions)
- Safe to navigate away - sync continues in background
- New videos appear in feed silently (no notification)

### Sync Schedule

All channels use a **uniform sync schedule** (6-hour refresh interval). The activity level system is disabled to keep things simple.

| Sync Type | Frequency |
|-----------|-----------|
| All channels | Every 6 hours |
| Dead channel retry | Daily with exponential backoff |

---

## Watch Progress Tracking

### How It Works

1. Progress tracking starts immediately when video playback begins
2. Position syncs to database every 5 seconds while watching
3. Video is auto-marked as watched at 90% completion

### Multi-Device Conflict Resolution

If same video is watched on two devices simultaneously:
- The more advanced position wins
- Checked on each sync (every 5 seconds)

### Progress Data Model

```sql
-- In watch_status table
progress_seconds integer DEFAULT 0,     -- Exact playback position
progress_percent integer DEFAULT 0,     -- 0-100 percentage
last_watched_at timestamptz,            -- For "In Progress" sorting
```

### UI Display

- Progress bar appears **below thumbnail** (not overlay)
- Bar width matches thumbnail width
- Percentage shown to right of bar (e.g., "45%")
- Videos with 0% show no progress bar
- Videos at 90%+ stay at displayed percentage
- Hover shows "Resume at 12:34" tooltip

### In Progress Section

- Dedicated button in top bar (next to filter button)
- Icon: horizontal progress bar
- Shows videos with progress > 0%
- Sorted by most recently watched (last_watched_at)
- When viewing a group, filters to that group only
- Greyed out when no videos are in progress

### Reset Progress

- Circular arrow icon (↻) on thumbnail hover
- Only shown on videos with progress
- Resets progress to 0 and marks as unwatched

---

## Infinite Scroll

Progressive video loading as the user scrolls.

### Architecture

| Component | Location | Purpose |
|-----------|----------|---------|
| `useInfiniteScroll` | `src/hooks/useInfiniteScroll.ts` | Reusable IntersectionObserver hook |
| `useInfiniteFeed` | `src/hooks/useFeed.ts` | React Query infinite query |
| `GET /api/feed` | `src/app/api/feed/route.ts` | Paginated API endpoint |
| `get_feed` | `supabase/migrations/00021` | Database function |

### Flow

1. Initial load fetches 24 videos (`offset=0`)
2. IntersectionObserver watches sentinel element at grid bottom
3. Triggers fetch 400px before reaching bottom (`rootMargin`)
4. Stops when `videos.length < limit` or `offset >= total`

### Hook Usage

```typescript
const { sentinelRef } = useInfiniteScroll({
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  isLoading: feedLoading,
  enabled: videos.length > 0,
})

// Sentinel element in JSX
<div ref={sentinelRef} aria-hidden="true" />
```

### Cache Strategy

| Setting | Value |
|---------|-------|
| Query key | `['infiniteFeed', params]` |
| Stale time | 30 seconds |
| GC time | 5 minutes |
| Invalidation | Base key `['infiniteFeed']` |

### Performance

| Aspect | Value |
|--------|-------|
| Page size | 24 videos |
| Pre-load margin | 400px |
| Pagination | Offset-based |
| Database index | `idx_videos_user_published(user_id, published_at DESC)` |

---

## Session Management

### How It Works

- All sessions tracked server-side in `user_sessions` table
- No reliance on cookies or browser storage for core data
- Users can view and terminate sessions from Settings

### Data Model

```sql
CREATE TABLE user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  device_info jsonb,        -- browser, OS, device type
  last_active_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
```

---

## Account Deletion

When a user deletes their account:
1. All data is permanently erased immediately
2. No recovery period
3. Cascading deletes remove: videos, watch_status, groups, tags, notes, alerts, sessions, etc.

---

## Alerts System

Alerts are created automatically when issues occur during syncs. **Alerts are per-user** - you only see alerts about your own channels.

### Alert Types

| Type | When Created |
|------|--------------|
| `high_failure_rate` | >10% of your channels fail (warning), >20% (error), >50% (critical) |
| `channel_died` | One of your channels reaches 10 consecutive failures |
| `quota_warning` | Approaching your quota limit |
| `quota_exhausted` | Your daily quota used up |
| `sync_error` | General sync errors for your account |

### Discord Integration (Optional)

Set `DISCORD_WEBHOOK_URL` in environment to receive notifications:
- Sync summaries with failure rates
- Channel status changes
- Error details

### API Endpoints

```
GET  /api/alerts      → List YOUR unacknowledged alerts
POST /api/alerts      → Acknowledge YOUR alerts
     Body: { alertIds: [...] } or { all: true }
```

---

## API Quota Management

YouTube Data API v3 has a daily limit of 10,000 units.

### Quota Costs

| Operation | Cost |
|-----------|------|
| subscriptions.list (50 items) | 1 unit |
| channels.list (50 items) | 1 unit |
| playlistItems.list (50 items) | 1 unit |
| videos.list (50 items) | 1 unit |

### Protection Mechanisms

1. **Pre-flight check:** Estimates needed quota before sync
2. **Mid-sync monitoring:** Stops at 95% usage threshold
3. **Graceful degradation:** Returns partial results if quota exhausted
4. **Daily tracking:** Per-user usage stored in `api_quota` table

---

## Rate Limiting

### Token Bucket

- Rate: 10 requests/second
- Burst: 15 requests
- Applied to all YouTube API calls

### Retry Logic

- Max retries: 3
- Initial delay: 1000ms
- Max delay: 30000ms
- Backoff multiplier: 2x with jitter

---

## Distributed Locking

Prevents concurrent syncs that could cause issues.

### Lock Lifecycle

```
1. ACQUIRE: Insert into sync_locks (fails if exists)
2. EXTEND: Update expires_at every 5 minutes during long syncs
3. RELEASE: Delete lock in finally block
4. AUTO-CLEANUP: Expired locks deleted on next acquire attempt
```

### Lock Timeout

- Duration: 30 minutes
- Extended every 5 minutes during video sync

---

## All-or-Nothing Sync (Rollback System)

Video syncs use a staging pattern to ensure data integrity.

### How It Works

```
1. Videos go to sync_staging_videos table first
2. On success: COMMIT - move all staged videos to videos table
3. On failure: ROLLBACK - delete all staged videos
4. Abandoned syncs (>2 hours old) are auto-cleaned
```

### Benefits

- If sync fails partway, no partial data pollutes your feed
- User can cancel mid-sync - all changes rolled back
- Quota exhaustion pauses sync (resume when quota resets)
- Crashed syncs are automatically cleaned up

### Tables

| Table | Purpose |
|-------|---------|
| `sync_staging_videos` | Temporary holding area for videos during sync |
| `sync_staging_video_channels` | Temporary video-channel associations |

### States

A sync can be in these states:
- `in_progress` - Currently syncing
- `committing` - Moving staged data to main tables
- `committed` - Successfully completed
- `rolling_back` - Discarding staged data
- `rolled_back` - Rollback completed
- `failed` - Sync failed (abandoned or error)

---

## File Locations

### Database Migrations
```
supabase/migrations/
├── 00001_initial_schema.sql           # Core tables (users, channels, videos, groups)
├── 00002_rls_policies.sql             # Row-level security policies
├── 00003_functions.sql                # Database functions
├── 00004_seed_icons.sql               # Icon seed data
├── 00005_fix_user_insert_policy.sql   # Policy fix
├── 00006_watch_progress_seconds.sql   # Progress tracking
├── 00007_api_quota_tracking.sql       # Quota tracking
├── 00008_user_subscriptions.sql       # Subscription links
├── 00009_sync_improvements.sql        # Progress, history, health
├── 00010_sync_locks_and_edge_cases.sql # Distributed locks, backoff functions
├── 00011_fix_group_counts_and_stale_locks.sql # Bug fixes
├── 00012_repair_00009.sql             # Repair script
├── 00013_migration_audit.sql          # Schema verification
├── 00014_sync_alerts.sql              # Alerts system
├── 00015_video_soft_delete.sql        # Soft delete
├── 00017_videos_user_isolation.sql    # Per-user video records
├── 00018_in_progress_filter.sql       # In-progress video filtering
├── 00019_video_import_limit.sql       # Video import limit setting
├── 00020_sync_cancellation.sql        # Cancel sync support
├── 00021_fix_feed_and_group_video_count.sql # Feed and count fixes
├── 00022_blocked_videos.sql           # Blocked/hidden videos
├── 00023_database_fixes.sql           # User isolation fixes, video_trash, video_channels
├── 00024_sync_rollback_system.sql     # All-or-nothing sync with staging
├── 00025_performance_and_fixes.sql    # Performance indexes and RLS fixes
├── 00026_tags_system.sql              # Tags for videos
├── 00027_tags_feed_support.sql        # Tags in feed filtering
├── 00028_exclude_shorts_from_video_count.sql # Video count excludes shorts
├── 00029_add_video_limit_to_users.sql # Per-user video import limit
├── 00030_fix_commit_sync_batching.sql # Sync batching fixes
├── 00031_add_audio_icons.sql          # Audio/podcast icons
├── 00032_watch_later_filter.sql       # Watch later feed filter
├── 00033_channel_filter.sql           # Channel-specific filtering
├── 00034_playlist_import.sql          # Playlist import (user_playlists, group_playlists, source_playlist_id)
├── 00035_playlist_sync_support.sql    # Playlist sync in feed
└── 00036_restore_video_count.sql      # Restore video_count to get_groups_with_channels
```

**Note:** Migration 00016 was skipped (no file). Migrations must be applied in order.

### API Routes
```
src/app/api/
├── sync/
│   ├── subscriptions/route.ts    # Initial import
│   ├── videos/route.ts           # Video sync
│   ├── status/route.ts           # Check sync status
│   └── progress/route.ts         # Real-time progress
├── cron/
│   ├── refresh-high/route.ts     # High-activity sync
│   ├── refresh-medium/route.ts   # Medium-activity sync
│   ├── refresh-low/route.ts      # Low-activity sync
│   ├── retry-dead-channels/route.ts  # Dead channel recovery
│   ├── refresh-playlists/route.ts    # Playlist ID refresh
│   ├── update-activity-levels/route.ts
│   └── cleanup/route.ts
├── alerts/route.ts               # View/acknowledge alerts
├── channels/
│   ├── route.ts                  # List channels
│   └── health/route.ts           # Health status
└── quota/route.ts                # Check quota usage
```

### Core Libraries
```
src/lib/youtube/
├── client.ts          # YouTube API authentication
├── subscriptions.ts   # Fetch subscriptions
├── videos.ts          # Fetch videos
├── quota.ts           # Quota tracking
├── channel-health.ts  # Health monitoring
├── alerts.ts          # Alert creation + Discord
├── cron-handler.ts    # Unified cron logic
├── sync-progress.ts   # Lock management
└── utils.ts           # Rate limiting, retry logic
```

---

## Environment Variables

```bash
# Required
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
YOUTUBE_API_KEY=
NEXT_PUBLIC_APP_URL=
CRON_SECRET=

# Optional
SENTRY_DSN=
DISCORD_WEBHOOK_URL=
```

---

## Testing Locally

### Start Development Server
```bash
npm run dev
```

### Manually Trigger Cron Jobs
```bash
# Set your CRON_SECRET first
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  http://localhost:3000/api/cron/retry-dead-channels
```

### Check Alerts
```bash
curl http://localhost:3000/api/alerts
```

---

## Applying New Migrations

1. Go to Supabase Dashboard → SQL Editor
2. Paste the migration SQL
3. Click "Run"

**Important:** Migrations must be applied in order. If you get errors about missing columns or tables, you likely need to run earlier migrations first.

### Recent Migrations to Apply

If your database is missing recent features, apply these migrations in order:

1. `00026_tags_system.sql` - Tags for videos
2. `00027_tags_feed_support.sql` - Tags in feed filtering
3. `00028_exclude_shorts_from_video_count.sql` - Video count excludes shorts
4. `00029_add_video_limit_to_users.sql` - Per-user video import limit
5. `00030_fix_commit_sync_batching.sql` - Sync batching fixes
6. `00031_add_audio_icons.sql` - Audio/podcast icons
7. `00032_watch_later_filter.sql` - Watch later feed filter
8. `00033_channel_filter.sql` - Channel-specific filtering
9. `00034_playlist_import.sql` - **Playlist Import:** user_playlists, group_playlists tables, source_playlist_id on videos
10. `00035_playlist_sync_support.sql` - Playlist videos in feed
11. `00036_restore_video_count.sql` - **Fix:** Restore video_count to get_groups_with_channels
