# Phase 2: Video Feed Progress Tracking - Deployment Instructions

## Overview

Phase 2 implements the watch progress tracking system with visual progress bars below video thumbnails, the "In Progress" section, and real-time cross-device sync.

---

## Current State Analysis

### Already Implemented ✅

The following components/systems already exist and are functional:

| Component | Location | Status |
|-----------|----------|--------|
| `WatchProgressBar` | `src/components/WatchProgressBar.tsx` | ✅ Complete - but positioned INSIDE thumbnail |
| `useWatchProgress` hook | `src/hooks/useWatchProgress.tsx` | ✅ Complete - 5-second debounced sync |
| `VideoCard` | `src/components/VideoCard.tsx` | ✅ Exists - progress bar inside thumbnail overlay |
| `VideoPlayer` | `src/components/VideoPlayer.tsx` | ✅ Complete with progress tracking |
| Feed API | `src/app/api/feed/route.ts` | ✅ Returns watch_progress data |
| Progress API | `src/app/api/feed/progress/route.ts` | ✅ Handles progress saves |
| Real-time sync | Via Supabase Realtime | ✅ Configured in useWatchProgress |

### Needs Modification 🔧

Per PRD requirements, these changes are needed:

1. **Progress bar position** - Move from INSIDE thumbnail to BELOW thumbnail
2. **"In Progress" button** - Add to top bar, next to filter button
3. **Reset progress icon** - Add circular arrow (↻) on thumbnail hover
4. **Tooltip on hover** - Show "Resume at 12:34"

---

## Implementation Tasks

### Task 1: Update VideoCard - Move Progress Bar Below Thumbnail

**File:** `src/components/VideoCard.tsx`

**Current behavior:** Progress bar is inside the thumbnail as an absolute overlay at the bottom.

**Required behavior:** Progress bar should be BELOW the thumbnail with a small gap.

**Changes needed:**

```tsx
// BEFORE: Progress bar inside thumbnail div
<div className="relative aspect-video cursor-pointer">
  <img ... />
  <WatchProgressBar ... /> {/* Currently positioned absolute bottom-0 */}
</div>

// AFTER: Progress bar outside thumbnail div, below it
<div className="relative aspect-video cursor-pointer">
  <img ... />
  {/* Hover overlay, duration badge, etc. stay here */}
</div>
{/* Progress bar moved here, outside the thumbnail */}
{video.watch_progress > 0 && (
  <div className="mt-1"> {/* Small gap */}
    <NewProgressBar
      progress={video.watch_progress}
      progressSeconds={video.watch_progress_seconds}
      durationSeconds={video.duration_seconds}
    />
  </div>
)}
```

**PRD Requirements for Progress Bar:**
- Same width as thumbnail
- Small gap between thumbnail and bar
- Percentage shown to the RIGHT of the bar (e.g., "45%")
- Ben.Tube design aesthetic (not YouTube red - use accent color #c4956a)
- Videos with 0% progress: NO progress bar
- Videos at 90%+: keep showing percentage (don't hide or change color)
- On hover: show "Resume at 12:34" tooltip

---

### Task 2: Create New Progress Bar Component

**File:** Create `src/components/VideoProgressBar.tsx`

This is a NEW component specifically for the below-thumbnail progress bar. Keep the existing `WatchProgressBar.tsx` for backward compatibility.

```tsx
// Design spec:
// - Full width (same as thumbnail)
// - Height: 4-6px (thicker than YouTube)
// - Background: subtle track showing full length
// - Fill: Ben.Tube accent color (#c4956a or gradient)
// - Percentage text to the right: "45%"
// - Hover tooltip: "Resume at 12:34"
// - No bar shown if progress is 0%

type VideoProgressBarProps = {
  progress: number          // 0-1 (e.g., 0.45 for 45%)
  progressSeconds: number   // e.g., 324 seconds
  durationSeconds: number   // e.g., 720 seconds total
  className?: string
}
```

---

### Task 3: Add Reset Progress Button on Thumbnail Hover

**File:** `src/components/VideoCard.tsx`

**Location:** Inside the hover overlay, alongside existing buttons (Watch Later, Watched, Hide)

**Requirements:**
- Icon: Circular arrow (↻)
- Only shown on videos that have progress > 0
- Clicking resets progress to 0 and marks as unwatched
- Position: Add to existing hover action buttons

**Implementation:**

```tsx
// Add new icon component
function ResetIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  )
}

// Add to hover overlay (only if video has progress)
{video.watch_progress > 0 && (
  <button
    onClick={handleResetProgress}
    className="p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
    title="Restart from beginning"
  >
    <ResetIcon className="w-5 h-5 text-white" />
  </button>
)}
```

**Add handler:**

```tsx
const handleResetProgress = useCallback(async (e: React.MouseEvent) => {
  e.stopPropagation()
  // Call API to reset progress
  await fetch(`/api/feed/${video.id}/progress/reset`, { method: 'POST' })
  // Update local state or refetch
}, [video.id])
```

---

### Task 4: Create Reset Progress API Endpoint

**File:** Create `src/app/api/feed/[id]/progress/reset/route.ts`

```typescript
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { NextResponse } from 'next/server'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createServerSupabaseClient()
  const { userId, error } = await getInternalUserId(supabase as never)

  if (error || !userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Reset progress to 0 and mark as unwatched
  const { error: updateError } = await supabase
    .from('watch_status')
    .update({
      watch_progress: 0,
      watch_progress_seconds: 0,
      watched: false,
      last_position_at: new Date().toISOString(),
    })
    .eq('video_id', params.id)
    .eq('user_id', userId)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to reset progress' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
```

---

### Task 5: Add "In Progress" Button to Top Bar

**File:** `src/components/FeedContent.tsx`

**Location:** In the top bar, next to the filter/search area

**Requirements:**
- Icon: horizontal progress bar icon
- Text: "In Progress"
- Badge count: number of in-progress videos (optional, PRD says no badge)
- Greyed out when no videos are in progress
- When clicked: filters feed to show only videos with progress > 0%
- When viewing a group: shows only in-progress videos from that group

**Implementation:**

```tsx
// Add state
const [showInProgress, setShowInProgress] = useState(false)
const [inProgressCount, setInProgressCount] = useState(0)

// Add icon component
function InProgressIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h12" />
    </svg>
  )
}

// Add button to top bar (next to search/filter)
<button
  onClick={() => setShowInProgress(!showInProgress)}
  disabled={inProgressCount === 0}
  className={`
    flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors
    ${showInProgress
      ? 'bg-accent text-white border-accent'
      : inProgressCount === 0
        ? 'opacity-50 cursor-not-allowed'
        : 'hover:bg-muted'
    }
  `}
>
  <InProgressIcon className="w-4 h-4" />
  <span className="text-sm">In Progress</span>
</button>
```

**Update feed fetch to include in_progress filter:**

```tsx
const fetchFeed = async () => {
  const params = new URLSearchParams()
  if (selectedGroupId) params.set('group_id', selectedGroupId)
  if (deferredSearchQuery) params.set('search', deferredSearchQuery)
  if (showInProgress) params.set('in_progress', 'true') // NEW
  params.set('limit', '50')
  // ...
}
```

---

### Task 6: Update Feed API to Support in_progress Filter

**File:** `src/app/api/feed/route.ts`

**Add parameter handling:**

```typescript
const inProgressOnly = searchParams.get('in_progress') === 'true'

// Add to RPC call or query
if (inProgressOnly) {
  // Filter where watch_progress > 0 AND watch_progress < 0.9
  // Sort by last_position_at DESC (most recently watched first)
}
```

---

### Task 7: Update Database Function (if needed)

**File:** Create migration `supabase/migrations/00024_in_progress_filter.sql`

```sql
-- Add index for efficient "in progress" queries
CREATE INDEX IF NOT EXISTS idx_watch_status_in_progress
  ON watch_status(user_id, last_position_at DESC)
  WHERE watch_progress > 0 AND watch_progress < 0.9;

-- Update get_feed function to support in_progress filter
-- (Check current implementation in get_feed RPC)
```

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `src/components/VideoCard.tsx` | MODIFY | Move progress bar below thumbnail, add reset button |
| `src/components/VideoProgressBar.tsx` | CREATE | New progress bar component per PRD specs |
| `src/components/FeedContent.tsx` | MODIFY | Add "In Progress" button to top bar |
| `src/app/api/feed/[id]/progress/reset/route.ts` | CREATE | Reset progress API endpoint |
| `src/app/api/feed/route.ts` | MODIFY | Add in_progress filter support |
| `supabase/migrations/00024_in_progress_filter.sql` | CREATE | Index for in-progress queries |

---

## PRD Reference - Progress Bar Display

From `docs/PRD.md` lines 153-175:

```
##### Progress Bar Display
- Progress bar appears **below the thumbnail** (not on it)
- Bar is same width as thumbnail
- Small gap between thumbnail and progress bar
- Percentage shown to the right of the bar (e.g., "45%")
- Bar matches Ben.Tube design aesthetic (not YouTube red)
- Videos with 0% progress show no progress bar
- Videos at 90%+ stay at displayed percentage (we don't show "watched" differently)
- On hover: show "Resume at 12:34" tooltip

##### In Progress Section
- Dedicated "In Progress" button in top bar (next to filter button)
- Icon: horizontal progress bar icon
- Shows only videos with progress > 0%
- Sorted by most recently watched
- When viewing a group, shows only in-progress videos from that group
- Button is greyed out (still visible) when no videos are in progress

##### Thumbnail Hover - Reset Progress
- Circular arrow icon (↻) appears on thumbnail hover for videos with progress
- Only shown on videos that have progress
- Clicking resets progress to 0 and marks as unwatched
```

---

## Testing Checklist

### Progress Bar Below Thumbnail
- [ ] Progress bar appears BELOW thumbnail (not inside)
- [ ] Bar has same width as thumbnail
- [ ] Small visible gap between thumbnail and bar
- [ ] Percentage shows to the right (e.g., "45%")
- [ ] Uses Ben.Tube accent color (#c4956a)
- [ ] No progress bar when progress is 0%
- [ ] Bar still shows at 90%+ (doesn't disappear or change)
- [ ] Hover shows "Resume at 12:34" tooltip

### In Progress Button
- [ ] Button appears in top bar next to filters
- [ ] Button is greyed out when no videos are in progress
- [ ] Clicking filters to show only in-progress videos
- [ ] Works correctly when a group is selected
- [ ] Sorted by most recently watched

### Reset Progress
- [ ] Reset icon (↻) appears on hover for videos with progress
- [ ] Icon NOT shown for videos with 0% progress
- [ ] Clicking resets to 0% and marks as unwatched
- [ ] UI updates immediately after reset

### Real-time Sync
- [ ] Progress syncs every 5 seconds while watching
- [ ] Progress syncs across devices in real-time
- [ ] More advanced position wins in conflicts

---

## Deployment Steps

1. Create new migration file for in-progress index
2. Run migration in Supabase Dashboard
3. Create `VideoProgressBar.tsx` component
4. Update `VideoCard.tsx` - move progress bar, add reset button
5. Create reset progress API endpoint
6. Update `FeedContent.tsx` - add In Progress button
7. Update feed API to support in_progress filter
8. Run `npm run build` to verify no errors
9. Test all checklist items
10. Deploy to Vercel

---

## Notes

- Keep existing `WatchProgressBar.tsx` for backward compatibility with `VideoPlayer`
- The accent color is `#c4956a` (defined in Tailwind config as `accent`)
- Progress is stored as 0-1 float, display as percentage (multiply by 100)
- 90% threshold for "watched" is already implemented in `useWatchProgress`
