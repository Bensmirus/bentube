# Phase 4: Core Features Implementation Plan

## Overview

This plan implements the remaining core features from the PRD in small, incremental steps. Each step is a deployable unit that adds value without breaking existing functionality.

---

## Step 1: Favorites (Heart Icon)

**Goal**: Add ability to favorite videos, separate from Watch Later.

**Database**:
- Add `favorite` boolean column to `watch_status` table

**Backend**:
- Update `/api/feed/[id]/status` to handle `favorite` field
- Add favorites filter to `get_feed` function

**Frontend**:
- Add heart icon to VideoCard thumbnail hover actions
- Add "Favorites" filter button next to "In Progress" button
- Heart fills when favorited, outline when not

**Files to modify**:
- `supabase/migrations/00019_favorites.sql` (new)
- `src/app/api/feed/[id]/status/route.ts`
- `src/components/VideoCard.tsx`
- `src/components/feed/FeedContent.tsx` (add filter button)

---

## Step 2: Shorts Section

**Goal**: Display Shorts in a dedicated section, not mixed with regular videos.

**Backend**:
- Feed API already has `shorts_only` parameter - verify it works

**Frontend**:
- Add "Shorts" tab/toggle in feed header
- When active, show only videos where `is_short = true`
- Different card layout for Shorts (vertical aspect ratio)

**Files to modify**:
- `src/components/feed/FeedContent.tsx` (add Shorts toggle)
- `src/components/VideoCard.tsx` (Shorts variant layout)

---

## Step 3: Grid/List View Toggle

**Goal**: Let users switch between grid and list view for the feed.

**Database**:
- Add `view_mode` to user preferences (already in schema as `preferences jsonb`)

**Frontend**:
- Add toggle button in feed header (grid icon / list icon)
- Grid view: current layout (cards in grid)
- List view: horizontal cards with progress shown as "45%" text
- Persist preference to database

**Files to modify**:
- `src/components/feed/FeedContent.tsx` (toggle + layout switch)
- `src/components/VideoCard.tsx` (add `variant="list"` prop)
- `src/app/api/user/preferences/route.ts` (new - save preferences)

---

## Step 4: Channel Page View

**Goal**: Click channel name to see all videos from that channel.

**Backend**:
- Add `/api/feed?channel_id=xxx` filter parameter

**Frontend**:
- Make channel name clickable in VideoCard
- New route: `/channel/[id]` showing all videos from that channel
- Header shows channel thumbnail, name, video count
- Same filters available (search, duration, etc.)

**Files to create**:
- `src/app/(dashboard)/channel/[id]/page.tsx` (new)
- `src/components/channel/ChannelHeader.tsx` (new)

**Files to modify**:
- `src/components/VideoCard.tsx` (make channel name a link)
- `src/app/api/feed/route.ts` (add channel_id filter)

---

## Step 5: Watch History Page

**Goal**: Show all videos user has watched, sorted by when they were watched.

**Database**:
- Add `watched_at` timestamp to `watch_status` table (set when watched=true)

**Backend**:
- New `/api/history` endpoint returning watched videos sorted by watched_at

**Frontend**:
- New route: `/history`
- Add "History" link in settings or bottom nav
- Infinite scroll list of watched videos
- Shows when each video was watched

**Files to create**:
- `supabase/migrations/00020_watch_history.sql` (new)
- `src/app/(dashboard)/history/page.tsx` (new)
- `src/app/api/history/route.ts` (new)

**Files to modify**:
- `src/app/api/feed/[id]/status/route.ts` (set watched_at when marking watched)
- `src/components/BottomNav.tsx` or Settings (add History link)

---

## Step 6: Tags System

**Goal**: Create and apply tags to videos within groups.

**Database**:
- Tables already exist: `tags`, `video_tags`

**Backend**:
- `/api/tags` - CRUD for tags
- `/api/videos/[id]/tags` - add/remove tags from video
- Update feed API to filter by tag

**Frontend**:
- Tag management in group settings
- Tag chips on VideoCard (small, below title)
- Tag filter dropdown in feed
- Add/remove tags via video modal or hover menu

**Files to create**:
- `src/app/api/tags/route.ts` (new)
- `src/app/api/videos/[id]/tags/route.ts` (new)
- `src/components/TagChip.tsx` (new)
- `src/components/TagPicker.tsx` (new)

**Files to modify**:
- `src/components/VideoCard.tsx` (show tag chips)
- `src/components/feed/FeedContent.tsx` (tag filter)
- `src/components/groups/GroupCard.tsx` (manage tags link)

---

## Step 7: Video Notes

**Goal**: Add personal notes to any video.

**Database**:
- Table already exists: `video_notes`

**Backend**:
- `/api/videos/[id]/notes` - get/update notes

**Frontend**:
- Notes icon on VideoCard hover (notebook icon)
- Click opens notes modal/drawer
- Auto-save as user types (debounced)
- Notes included in search

**Files to create**:
- `src/app/api/videos/[id]/notes/route.ts` (new)
- `src/components/VideoNotesModal.tsx` (new)

**Files to modify**:
- `src/components/VideoCard.tsx` (notes icon on hover)
- `src/app/api/feed/route.ts` (include notes in search)

---

## Step 8: Pin Videos

**Goal**: Pin videos to top of their group feed.

**Database**:
- Add `pinned` boolean and `pinned_at` timestamp to `watch_status`

**Backend**:
- Update feed query to order pinned videos first
- Add pin/unpin to status endpoint

**Frontend**:
- Pin icon on VideoCard hover
- Pinned videos show pin badge and appear at top
- Only applies within group view (not All Videos)

**Files to create**:
- `supabase/migrations/00021_pinned_videos.sql` (new)

**Files to modify**:
- `src/app/api/feed/[id]/status/route.ts` (handle pinned)
- `src/app/api/feed/route.ts` (order by pinned first)
- `src/components/VideoCard.tsx` (pin icon + badge)

---

## Implementation Order

| Step | Feature | Complexity | Dependencies |
|------|---------|------------|--------------|
| 1 | Favorites | Low | None |
| 2 | Shorts Section | Low | None |
| 3 | Grid/List Toggle | Medium | None |
| 4 | Channel Page | Medium | None |
| 5 | Watch History | Medium | None |
| 6 | Tags | High | None |
| 7 | Video Notes | Medium | None |
| 8 | Pin Videos | Low | None |

**Recommended order**: 1 → 2 → 3 → 4 → 5 → 7 → 8 → 6

Start with quick wins (Favorites, Shorts, Grid/List) to show progress, then tackle the more complex features (Tags).

---

## Testing Checklist Template

For each step:
- [ ] Database migration applies cleanly
- [ ] API returns expected data
- [ ] UI renders correctly
- [ ] Feature works on mobile
- [ ] Feature works on desktop
- [ ] Build passes
- [ ] No console errors

---

## Notes

- Each step should be merged and deployed before starting the next
- Keep PRs small and focused on one feature
- Update CLAUDE.md if any new patterns are established
- Run `npm run build` before each commit
