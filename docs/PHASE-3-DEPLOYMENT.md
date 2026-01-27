# Phase 3: Groups Management & Manual Channel Add - Deployment Instructions

## Overview

Phase 3 implements the complete groups management system and the manual channel add flow with URL preview, group selection, and date picker for import depth.

---

## Current State Analysis

### Already Implemented ✅

| Component | Location | Status |
|-----------|----------|--------|
| Groups page | `src/app/(dashboard)/groups/page.tsx` | ✅ Basic structure |
| GroupCard | `src/components/groups/GroupCard.tsx` | ✅ Exists |
| GroupModal | `src/components/groups/GroupModal.tsx` | ✅ Create/Edit groups |
| ChannelPickerModal | `src/components/groups/ChannelPickerModal.tsx` | ✅ Add existing channels to groups |
| Groups API | `src/app/api/groups/` | ✅ CRUD operations |
| CreateGroupModal | `src/components/CreateGroupModal.tsx` | ✅ Basic creation |

### Needs Implementation 🔧

1. **Manual channel add by URL** - Paste YouTube URL, preview, select groups, date picker
2. **Channel sorting within groups** - Sort by most recent video
3. **Confirm dialog before deleting a group**
4. **Remove channel from all groups = delete videos immediately**

---

## Implementation Tasks

### Task 1: Create Add Channel Modal

**File:** Create `src/components/AddChannelModal.tsx`

**User Flow:**
1. User clicks "Add Channel" button
2. Modal opens with URL input field
3. User pastes YouTube channel URL
4. System validates and fetches channel info
5. Preview shows: channel thumbnail, title, video count
6. User selects which group(s) to add channel to
7. User picks date range for video import
8. If 5000+ videos: show warning about API usage
9. User confirms → channel added + videos imported

**Component Structure:**

```tsx
'use client'

import { useState, useCallback } from 'react'

type AddChannelPhase = 'input' | 'loading' | 'preview' | 'importing' | 'complete' | 'error'

type ChannelPreview = {
  channelId: string
  title: string
  thumbnail: string
  subscriberCount: string
  videoCount: number
  description: string
}

interface AddChannelModalProps {
  isOpen: boolean
  onClose: () => void
  onComplete: () => void
  groups: Array<{ id: string; name: string; icon: string }>
}

export default function AddChannelModal({
  isOpen,
  onClose,
  onComplete,
  groups,
}: AddChannelModalProps) {
  const [phase, setPhase] = useState<AddChannelPhase>('input')
  const [url, setUrl] = useState('')
  const [channelPreview, setChannelPreview] = useState<ChannelPreview | null>(null)
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([])
  const [importDate, setImportDate] = useState<string>(() => {
    const date = new Date()
    date.setFullYear(date.getFullYear() - 1)
    return date.toISOString().split('T')[0]
  })
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState({ current: 0, total: 0, message: '' })

  // ... implementation
}
```

**PRD Requirements:**
- Show channel thumbnail and title for confirmation
- User chooses which group(s) during add flow
- Date picker specifically for this channel
- Warning for 5000+ videos (still allow import)
- Error: "No Channel Found, Check URL" for invalid URLs
- Error: "Channel already exists" for duplicates
- Warning for channels with 0 videos (allow adding)

---

### Task 2: Create Channel Lookup API

**File:** Create `src/app/api/channels/lookup/route.ts`

**Purpose:** Validate YouTube URL and fetch channel info for preview.

```typescript
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { getYouTubeClient } from '@/lib/youtube/client'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const admin = createAdminClient()

  const { userId, error: userError } = await getInternalUserId(supabase as never)
  if (userError || !userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { url } = await request.json()
  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 })
  }

  // Extract channel ID from various URL formats
  const channelId = extractChannelId(url)
  if (!channelId) {
    return NextResponse.json({ error: 'No Channel Found, Check URL' }, { status: 400 })
  }

  // Check if user already has this channel
  const { data: existingChannel } = await admin
    .from('channels')
    .select('id, youtube_id')
    .eq('youtube_id', channelId)
    .single()

  if (existingChannel) {
    // Check if user already subscribed
    const { data: userSub } = await admin
      .from('user_subscriptions')
      .select('id')
      .eq('user_id', userId)
      .eq('channel_id', existingChannel.id)
      .single()

    if (userSub) {
      return NextResponse.json({ error: 'Channel already exists' }, { status: 409 })
    }
  }

  // Fetch channel info from YouTube
  const { client: youtube, error: ytError } = await getYouTubeClient(userId)
  if (!youtube || ytError) {
    return NextResponse.json({ error: ytError || 'YouTube not connected' }, { status: 400 })
  }

  try {
    const response = await youtube.channels.list({
      part: ['snippet', 'statistics', 'contentDetails'],
      id: [channelId],
    })

    const channel = response.data.items?.[0]
    if (!channel) {
      return NextResponse.json({ error: 'No Channel Found, Check URL' }, { status: 404 })
    }

    const videoCount = parseInt(channel.statistics?.videoCount || '0', 10)

    return NextResponse.json({
      channelId: channel.id,
      title: channel.snippet?.title,
      thumbnail: channel.snippet?.thumbnails?.medium?.url,
      subscriberCount: formatSubscriberCount(channel.statistics?.subscriberCount),
      videoCount,
      description: channel.snippet?.description?.substring(0, 200),
      uploadsPlaylistId: channel.contentDetails?.relatedPlaylists?.uploads,
      hasWarning: videoCount > 5000,
      warningMessage: videoCount > 5000
        ? `This channel has ${videoCount.toLocaleString()} videos. Importing all videos will use significant API quota.`
        : null,
    })
  } catch (error) {
    console.error('[ChannelLookup] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch channel info' }, { status: 500 })
  }
}

// Helper: Extract channel ID from various URL formats
function extractChannelId(url: string): string | null {
  // Handle various YouTube URL formats:
  // - https://www.youtube.com/channel/UCxxxxxx
  // - https://www.youtube.com/@username
  // - https://www.youtube.com/c/customname
  // - https://www.youtube.com/user/username

  const patterns = [
    /youtube\.com\/channel\/([a-zA-Z0-9_-]+)/,
    /youtube\.com\/@([a-zA-Z0-9_-]+)/,
    /youtube\.com\/c\/([a-zA-Z0-9_-]+)/,
    /youtube\.com\/user\/([a-zA-Z0-9_-]+)/,
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) {
      // For @username, /c/, /user/ - need to resolve to channel ID
      if (pattern.source.includes('@') || pattern.source.includes('/c/') || pattern.source.includes('/user/')) {
        // Return the handle/username - API caller needs to resolve it
        return match[1]
      }
      return match[1]
    }
  }

  return null
}

function formatSubscriberCount(count?: string): string {
  if (!count) return 'Unknown'
  const num = parseInt(count, 10)
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M subscribers`
  if (num >= 1000) return `${(num / 1000).toFixed(0)}K subscribers`
  return `${num} subscribers`
}
```

---

### Task 3: Create Add Channel API

**File:** Create `src/app/api/channels/add/route.ts`

**Purpose:** Add a channel to user's library with selected groups and import videos.

```typescript
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { getYouTubeClient } from '@/lib/youtube/client'
import { fetchChannelVideos } from '@/lib/youtube/videos'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const admin = createAdminClient()

  const { userId, error: userError } = await getInternalUserId(supabase as never)
  if (userError || !userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const {
    channelId,
    title,
    thumbnail,
    uploadsPlaylistId,
    groupIds,      // Array of group IDs to add channel to
    importSince,   // Date string for import cutoff
  } = await request.json()

  if (!channelId || !groupIds || groupIds.length === 0) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  try {
    // 1. Upsert channel (creates if doesn't exist)
    const { data: channel, error: channelError } = await admin
      .from('channels')
      .upsert({
        youtube_id: channelId,
        title,
        thumbnail,
        uploads_playlist_id: uploadsPlaylistId,
        activity_level: 'medium',
        health_status: 'healthy',
        consecutive_failures: 0,
      }, { onConflict: 'youtube_id' })
      .select('id')
      .single()

    if (channelError || !channel) {
      throw new Error('Failed to create channel')
    }

    // 2. Create user subscription
    await admin
      .from('user_subscriptions')
      .upsert({
        user_id: userId,
        channel_id: channel.id,
      }, { onConflict: 'user_id,channel_id', ignoreDuplicates: true })

    // 3. Add channel to selected groups
    const groupChannels = groupIds.map((groupId: string) => ({
      group_id: groupId,
      channel_id: channel.id,
    }))

    await admin
      .from('group_channels')
      .upsert(groupChannels, { onConflict: 'group_id,channel_id', ignoreDuplicates: true })

    // 4. Import videos from the channel
    const { client: youtube, error: ytError } = await getYouTubeClient(userId)
    if (!youtube || ytError) {
      // Channel added but videos not imported - still success
      return NextResponse.json({
        success: true,
        channelId: channel.id,
        videosImported: 0,
        message: 'Channel added but could not import videos (YouTube not connected)',
      })
    }

    const importSinceDate = importSince ? new Date(importSince) : null
    const result = await fetchChannelVideos(
      youtube,
      uploadsPlaylistId,
      channelId,
      importSinceDate,
      100, // Fetch up to 100 videos for new channel
      userId,
      {
        checkQuotaMidSync: true,
        filterLiveStreams: true,
        filterScheduled: true,
      }
    )

    // 5. Save videos to database
    if (result.videos.length > 0) {
      const videosToUpsert = result.videos.map((v) => ({
        youtube_id: v.videoId,
        channel_id: channel.id,
        user_id: userId,
        title: v.title,
        thumbnail: v.thumbnail,
        duration: v.duration,
        duration_seconds: v.durationSeconds,
        is_short: v.isShort,
        description: v.description,
        published_at: v.publishedAt,
      }))

      await admin
        .from('videos')
        .upsert(videosToUpsert, { onConflict: 'user_id,youtube_id' })
    }

    // 6. Update last_fetched_at
    await admin
      .from('channels')
      .update({ last_fetched_at: new Date().toISOString() })
      .eq('id', channel.id)

    return NextResponse.json({
      success: true,
      channelId: channel.id,
      videosImported: result.videos.length,
      shortsFiltered: result.videos.filter(v => v.isShort).length,
    })
  } catch (error) {
    console.error('[AddChannel] Error:', error)
    return NextResponse.json({ error: 'Failed to add channel' }, { status: 500 })
  }
}
```

---

### Task 4: Add "Add Channel" Button to Groups Page

**File:** Update `src/components/groups/GroupsContent.tsx`

**Add button and modal:**

```tsx
import AddChannelModal from '@/components/AddChannelModal'

// Add state
const [showAddChannelModal, setShowAddChannelModal] = useState(false)

// Add button in the header/toolbar area
<button
  onClick={() => setShowAddChannelModal(true)}
  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white font-medium hover:bg-accent/90 transition-colors"
>
  <PlusIcon className="w-4 h-4" />
  Add Channel
</button>

// Add modal
<AddChannelModal
  isOpen={showAddChannelModal}
  onClose={() => setShowAddChannelModal(false)}
  onComplete={() => {
    setShowAddChannelModal(false)
    refreshGroups() // Refetch groups to update channel counts
  }}
  groups={groups}
/>
```

---

### Task 5: Add Delete Group Confirmation Dialog

**File:** Update `src/components/groups/GroupCard.tsx` or create `src/components/ConfirmDialog.tsx`

**PRD Requirement:** Confirm dialog before deleting a group

```tsx
// Reusable confirm dialog component
interface ConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmText?: string
  confirmVariant?: 'danger' | 'primary'
  loading?: boolean
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  confirmVariant = 'primary',
  loading = false,
}: ConfirmDialogProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border rounded-2xl p-6 max-w-md mx-4 shadow-xl">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl border font-medium hover:bg-muted transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 px-4 py-2.5 rounded-xl font-medium transition-colors disabled:opacity-50 ${
              confirmVariant === 'danger'
                ? 'bg-red-600 text-white hover:bg-red-500'
                : 'bg-accent text-white hover:bg-accent/90'
            }`}
          >
            {loading ? 'Deleting...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
```

**Update delete group flow:**

```tsx
const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
const [deletingGroup, setDeletingGroup] = useState<Group | null>(null)

const handleDeleteClick = (group: Group) => {
  setDeletingGroup(group)
  setShowDeleteConfirm(true)
}

const handleConfirmDelete = async () => {
  if (!deletingGroup) return
  // Existing delete logic...
  await fetch(`/api/groups/${deletingGroup.id}`, { method: 'DELETE' })
  setShowDeleteConfirm(false)
  setDeletingGroup(null)
  refreshGroups()
}

// Render dialog
<ConfirmDialog
  isOpen={showDeleteConfirm}
  onClose={() => setShowDeleteConfirm(false)}
  onConfirm={handleConfirmDelete}
  title="Delete Group?"
  message={`Are you sure you want to delete "${deletingGroup?.name}"? Channels will be unlinked but not deleted.`}
  confirmText="Delete Group"
  confirmVariant="danger"
/>
```

---

### Task 6: Sort Channels by Most Recent Video

**File:** Update groups API or frontend sorting

**PRD Requirement:** Channels within a group sorted by most recent video

**Option A: Database Level**

Update the API that fetches channels for a group to order by the most recent video:

```sql
-- In the API query
SELECT c.*,
  (SELECT MAX(v.published_at) FROM videos v WHERE v.channel_id = c.id AND v.user_id = $user_id) as latest_video_at
FROM channels c
JOIN group_channels gc ON c.id = gc.channel_id
WHERE gc.group_id = $group_id
ORDER BY latest_video_at DESC NULLS LAST
```

**Option B: Frontend Level**

Sort channels in the component:

```tsx
const sortedChannels = useMemo(() => {
  return [...channels].sort((a, b) => {
    const aDate = a.latestVideoAt ? new Date(a.latestVideoAt) : new Date(0)
    const bDate = b.latestVideoAt ? new Date(b.latestVideoAt) : new Date(0)
    return bDate.getTime() - aDate.getTime()
  })
}, [channels])
```

---

### Task 7: Handle Channel Removal = Delete Videos Immediately

**File:** Update `src/app/api/groups/[id]/channels/route.ts` (DELETE handler)

**PRD Requirement:** When removing a channel from ALL groups, videos are deleted IMMEDIATELY

```typescript
// In the DELETE handler for removing a channel from a group
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // ... auth checks ...

  const { channelId } = await request.json()

  // 1. Remove channel from this group
  await admin
    .from('group_channels')
    .delete()
    .eq('group_id', params.id)
    .eq('channel_id', channelId)

  // 2. Check if channel is still in ANY of user's groups
  const { data: remainingGroups } = await admin
    .from('group_channels')
    .select('group_id, channel_groups!inner(user_id)')
    .eq('channel_id', channelId)
    .eq('channel_groups.user_id', userId)

  // 3. If no longer in any groups, delete all videos for this channel
  if (!remainingGroups || remainingGroups.length === 0) {
    // Delete watch status first (foreign key constraint)
    await admin
      .from('watch_status')
      .delete()
      .eq('user_id', userId)
      .in('video_id',
        admin.from('videos')
          .select('id')
          .eq('channel_id', channelId)
          .eq('user_id', userId)
      )

    // Delete videos
    await admin
      .from('videos')
      .delete()
      .eq('channel_id', channelId)
      .eq('user_id', userId)

    // Remove user subscription
    await admin
      .from('user_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('channel_id', channelId)
  }

  return NextResponse.json({ success: true })
}
```

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `src/components/AddChannelModal.tsx` | CREATE | Manual channel add with URL, preview, groups, date picker |
| `src/app/api/channels/lookup/route.ts` | CREATE | Validate URL + fetch channel preview |
| `src/app/api/channels/add/route.ts` | CREATE | Add channel + import videos |
| `src/components/groups/GroupsContent.tsx` | MODIFY | Add "Add Channel" button |
| `src/components/ConfirmDialog.tsx` | CREATE | Reusable confirmation dialog |
| `src/components/groups/GroupCard.tsx` | MODIFY | Add delete confirmation |
| `src/app/api/groups/[id]/channels/route.ts` | MODIFY | Handle channel removal + video deletion |

---

## PRD Reference - Manual Channel Add

From `docs/PRD.md` lines 207-217:

```
### Manual Channel Add

When user pastes a YouTube channel URL:

1. **Preview step** - Show channel thumbnail and title for confirmation before adding
2. **Group selection** - User chooses which group(s) to add the channel to during the add flow
3. **Import depth prompt** - Ask user to pick a date range specifically for this channel (not tied to global setting)
4. **Large channel warning** - For channels with many videos (5000+), warn about API usage but allow import
5. **Invalid URL** - Show error: "No Channel Found, Check URL"
6. **Duplicate channel** - Don't add duplicate; inform user channel already exists
7. **Channel with no videos** - Show warning but allow adding (empty channel)
```

---

## Testing Checklist

### Add Channel Modal
- [ ] URL input field accepts various YouTube URL formats
- [ ] Invalid URL shows "No Channel Found, Check URL"
- [ ] Duplicate channel shows "Channel already exists"
- [ ] Valid URL shows channel preview (thumbnail, title, video count)
- [ ] Can select multiple groups to add channel to
- [ ] Date picker works for import depth
- [ ] Warning shown for channels with 5000+ videos
- [ ] Warning shown for channels with 0 videos
- [ ] Import progress shown during video fetch
- [ ] Success state shows videos imported count
- [ ] Groups update with new channel after completion

### Delete Group Confirmation
- [ ] Clicking delete shows confirmation dialog
- [ ] Cancel closes dialog without deleting
- [ ] Confirm deletes the group
- [ ] Dialog shows group name in message

### Channel Removal
- [ ] Removing channel from one group keeps it in other groups
- [ ] Removing channel from ALL groups deletes videos immediately
- [ ] Watch status deleted with videos
- [ ] User subscription removed when no groups left

### Channel Sorting
- [ ] Channels sorted by most recent video date
- [ ] Channels with no videos appear at the end

---

## URL Formats to Support

The channel lookup should handle these YouTube URL formats:

| Format | Example |
|--------|---------|
| Channel ID | `https://www.youtube.com/channel/UCxxxxxx` |
| Handle (@) | `https://www.youtube.com/@MrBeast` |
| Custom URL | `https://www.youtube.com/c/PewDiePie` |
| Legacy user | `https://www.youtube.com/user/pewdiepie` |

**Note:** For @handle, /c/, and /user/ formats, you may need to make an additional API call to resolve the actual channel ID.

---

## Deployment Steps

1. Create `AddChannelModal.tsx` component
2. Create `/api/channels/lookup` endpoint
3. Create `/api/channels/add` endpoint
4. Create `ConfirmDialog.tsx` component
5. Update `GroupsContent.tsx` with Add Channel button
6. Update `GroupCard.tsx` with delete confirmation
7. Update channel removal API to delete videos
8. Run `npm run build` to verify no errors
9. Test all checklist items
10. Deploy to Vercel
