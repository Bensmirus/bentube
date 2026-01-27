# Phase 2 Fixes - Audit Results

## Issues Found & Fixed

### 1. Reset Progress Error Handling (Critical)

**Problem:** When resetting video progress failed, the UI showed 0% but the server still had the old progress. No revert happened.

**File:** `src/components/FeedContent.tsx`

**Fix:** Now saves previous state before optimistic update and reverts if API fails:
```typescript
const handleResetProgress = useCallback(async (videoId: string) => {
  const video = videos.find(v => v.id === videoId)
  if (!video) return

  // Save previous state
  const previousProgress = video.watch_progress
  const previousProgressSeconds = video.watch_progress_seconds
  const previousWatched = video.watched

  // Optimistic update
  setVideos(prev => prev.map(v =>
    v.id === videoId ? { ...v, watch_progress: 0, watch_progress_seconds: 0, watched: false } : v
  ))

  try {
    const res = await fetch(`/api/feed/${videoId}/progress/reset`, { method: 'POST' })
    if (!res.ok) throw new Error('Failed to reset')
  } catch (error) {
    // Revert on error
    setVideos(prev => prev.map(v =>
      v.id === videoId ? { ...v, watch_progress: previousProgress, watch_progress_seconds: previousProgressSeconds, watched: previousWatched } : v
    ))
  }
}, [videos])
```

---

### 2. Reset Progress API - Missing Upsert (Critical)

**Problem:** The reset endpoint used `update` which silently fails if no `watch_status` row exists.

**File:** `src/app/api/feed/[id]/progress/reset/route.ts`

**Fix:** Changed to `upsert` with `onConflict`:
```typescript
const { error: upsertError } = await supabase
  .from('watch_status')
  .upsert({
    video_id: videoId,
    user_id: userId,
    watch_progress: 0,
    watch_progress_seconds: 0,
    watched: false,
    hidden: false,
    watch_later: false,
    last_position_at: new Date().toISOString(),
  }, {
    onConflict: 'video_id,user_id',
  })
```

---

### 3. In Progress Filter Logic (PRD Mismatch)

**Problem:** Filter used `progress > 0 AND progress < 0.9`, but PRD says show all videos with progress > 0%. Videos at 90%+ that weren't auto-marked as watched were in limbo.

**File:** `supabase/migrations/00018_in_progress_filter.sql`

**Fix:** Changed to use `watched` flag instead of 90% threshold:
```sql
-- Before (wrong)
WHERE watch_progress > 0 AND watch_progress < 0.9

-- After (correct)
WHERE watch_progress > 0 AND watched = false
```

Updated in both `get_feed` and `count_feed` functions, plus the index.

---

### 4. In Progress Button Disabled State (Missing Feature)

**Problem:** PRD says "Button is greyed out (still visible) when no videos are in progress" but button was always clickable.

**File:** `src/components/FeedContent.tsx`

**Fix:** Added count tracking and disabled state:
```typescript
const [inProgressCount, setInProgressCount] = useState<number | null>(null)

// Fetch count on mount and when videos change
useEffect(() => {
  // ... fetches count from API
  setInProgressCount(data.total || 0)
}, [user, selectedGroupId, videos])

// Button with disabled state
<button
  onClick={() => setShowInProgress(!showInProgress)}
  disabled={inProgressCount === 0 && !showInProgress}
  className={`... ${
    inProgressCount === 0
      ? 'bg-muted text-muted-foreground/50 cursor-not-allowed'
      : 'bg-muted text-muted-foreground hover:text-foreground'
  }`}
>
```

---

## Deployment Note

Run the updated migration in Supabase SQL Editor to apply the database changes:
- Drop and recreate the index with new filter condition
- Update `get_feed` function
- Update `count_feed` function
