# Ben.Tube - Product Requirements Document

## Vision Statement

Ben.Tube is a personal YouTube content manager for research, learning, and content curation. It provides a cleaner, more organized way to manage YouTube subscriptions without the distractions of YouTube's algorithm-driven interface.

**This is NOT:**
- A social platform (no sharing, no public profiles)
- A YouTube replacement (doesn't sync back to YouTube)
- A recommendation engine (no algorithms, no suggestions)

**This IS:**
- A personal video library
- A research and learning tool
- A content organization system
- A "watch later" manager that actually works

---

## Core Principles

### 1. Complete User Isolation
Every user's data is completely independent. Nothing leaks between users.
- Each user has their own videos, even for the same YouTube channel
- Hiding a video only hides it for you
- Channel health is tracked per-user
- Alerts only show your own issues

### 2. Completely Private
No social features whatsoever.
- No public profiles
- No sharing collections
- No following other users
- No leaderboards or stats comparisons

### 3. One-Way Sync Only
Import from YouTube, never send anything back.
- Watch history stays in Ben.Tube only
- No marking videos as watched on YouTube
- No affecting YouTube's recommendations
- YouTube doesn't know you're using Ben.Tube

### 4. Manual Control
The user decides everything. No automation that changes your data.
- No auto-cleanup of old videos
- No smart suggestions for what to watch
- No automatic hiding or archiving
- You mark things watched, you hide things, you organize
- Exception: Auto-mark as watched when video finishes

### 5. Works Everywhere
Desktop and mobile are equally important.
- Responsive design that works on all screen sizes
- Same features on all devices
- Real-time sync across devices

### 6. Seamless Cross-Device Experience
- Real-time bidirectional sync between all devices
- Nothing stored in cookies or browser cache - everything in database
- User can manage active sessions on other devices
- One Ben.Tube account connects to one YouTube account (1:1)

---

## Account Management

### Account Deletion
- When a user deletes their account, all their data is permanently erased immediately
- No recovery period - deletion is final

### Session Management
- Users can see and manage active sessions on other devices
- Sessions are tracked server-side, not in browser storage

---

## User Personas

### Primary: The Researcher/Learner
- Uses YouTube for education (tutorials, lectures, documentation)
- Wants to organize content by topic/project
- Needs to track what they've watched and take notes
- Frustrated by YouTube mixing education with entertainment

### Secondary: The Content Curator
- Follows many channels across different interests
- Wants clean topic-based organization
- Doesn't want algorithms suggesting unrelated content
- Values a distraction-free viewing experience

---

## Features

### Core Features (Must Have)

#### 1. Channel Subscriptions
- Import subscriptions from YouTube account
- **Manually add channels by URL** (channels you're not subscribed to on YouTube)
- Subscribe to channels independently (each user manages their own)
- Unsubscribe removes videos immediately (no grace period)
- Channel view: click channel name to see all its videos

#### 1.5 Playlist Import
- Import videos from any YouTube playlist URL
- **One-time import** - videos are NOT synced; they're frozen at import time
- Videos keep their original channel metadata (uploader name, thumbnail)
- Playlists can be assigned to groups (like channels)
- Playlists appear in GroupDropdown with video count badge
- Re-importing the same playlist adds only new videos (no duplicates)
- Deleting an imported playlist removes all its videos (CASCADE delete)

**Import Flow:**
1. User pastes YouTube playlist URL
2. Preview shows playlist title, thumbnail, video count
3. User selects which group(s) to add playlist to
4. Videos are imported with `source_playlist_id` set
5. Playlist metadata stored in `user_playlists` table

**Display Behavior:**
- Playlist videos appear in feed alongside channel videos
- Videos from playlists show in group feeds if playlist is in that group
- Group video count includes both channel AND playlist videos
- No visual distinction between playlist and channel videos in feed

**Use Cases:**
- Topic collections from other users
- Curated "best of" playlists
- Conference/event video collections
- Courses and lecture series
- Watch later playlists from YouTube
- Educational playlists (Khan Academy, etc.)

#### 2. Topic Groups
- Organize channels into topic-based folders
- Custom names, colors, and icons for groups
- One channel can be in multiple groups
- Reorder groups by drag-and-drop
- **Flat structure only** (no nested sub-groups)
- Confirm dialog before deleting a group

#### 3. Video Feed
- **"All Videos" view always visible** as default starting point
- User-choosable sort order (newest first, oldest unwatched, etc.)
- Toggle between **grid view and list view**
- Filter by group
- Search everything (titles, descriptions, notes, tags)
- Filter by date range
- Filter by duration (preset ranges: Under 5min, 5-20min, 20-60min, Over 1hr)
- **Filter by unwatched only**
- Long titles truncated with "..." (full title on hover)
- **Infinite scroll** for pagination (no "Load More" button)
- Empty states show empty feed (no special messaging)

##### List View Progress Display
- In list view, progress is shown as text (e.g., "45%") rather than a visual bar

#### 4. Watch Status
- Mark videos as watched (user setting: stay in feed or hide)
- Mark videos as **"Watch Later"** (ordered queue you can reorder + filter)
- Mark videos as **"Favorite"** (heart icon, separate from Watch Later)
- **Pin videos** to top of their group
- Hide videos you don't want to see
- All status is personal (doesn't affect other users)
- **Full searchable watch history**

##### Watch Later Queue
- No limit on number of videos
- New videos added to **bottom** of queue
- When video is marked as watched, it is **automatically removed** from Watch Later
- User can reorder queue manually

#### 5. Watch Progress
- Track exact position in videos (second-precise)
- Resume where you left off - always restart from saved position (even at 95%)
- Sync progress across devices in real-time
- **Auto-mark as watched** when video reaches 90%
- Progress tracking starts immediately when playback begins
- Sync to database every 5 seconds while watching
- If watching same video on two devices, the more advanced position wins
- No progress tracking for Shorts (too short to matter)

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

#### 6. Embedded Player
- Watch videos directly in Ben.Tube
- **Full-featured player**: speed control (1x, 1.5x, 2x), skip intro button
- **Chapters visible in progress bar** (like YouTube)
- **Picture-in-picture mode** (floating mini player while browsing)
- **Next video suggestion** from same group when video ends
- No need to go to YouTube

#### 7. Shorts Handling

**Import Behavior:**
- Shorts are completely skipped during sync (not imported to database)
- Detection uses multiple signals:
  - Vertical aspect ratio (height > width)
  - Duration ≤ 60 seconds AND vertical
  - Title contains #Shorts tag
- Live streams are never classified as shorts (even if duration is 0)

**Display Behavior:**
- No shorts section (shorts are not imported at all)
- Group video counts only include regular videos
- No UI toggles or settings for shorts

**Sync Progress:**
- No mention of shorts in progress messages
- Video count shows only regular videos imported
- Final message: "Synced N channels, M videos"

**Why skip shorts:**
- Ben.Tube is focused on long-form content for research and learning
- Shorts clutter the video library with content not suitable for note-taking
- Saves database space and API quota
- Simpler user experience without content type mixing

#### 8. Thumbnail Hover Actions
- Watch Later button
- Play button
- Delete (X) button to remove video from database
- Reset progress (↻) button - only shown on videos with progress

---

## Import & Sync System

### Video Import Limit (Global Setting)

Users can set how many videos to import per channel. This setting applies globally to:
- First-time subscription import
- Manual channel adds
- Ongoing sync (for newly added channels)

| Setting | Description |
|---------|-------------|
| **Videos per channel** | Number of most recent videos to import (default: 100, no maximum) |

**Behavior:**
- Setting is configured in Settings and during first-time import
- "All videos" option imports every video the channel has (warning shown for channels with 1000+ videos)
- Incremental syncs only fetch new videos published since last sync (not affected by this limit)
- Changing this setting does NOT re-import old videos - only affects future imports

### First-Time Import Flow

1. **Automatic trigger** - Import starts automatically after first login
2. **Video limit prompt** - User chooses how many videos per channel to import (e.g., "Last 100 videos", "Last 500 videos", "All videos")
3. **Skip option** - User can skip automatic import and start with zero channels (add manually later)
4. **Progress feedback** - Progress bar with count: "Importing 45/200 channels..."
5. **Failure handling** - If import fails partway through, rollback everything and start fresh on retry. Error message: "Import failed"

### Manual Channel Add

When user pastes a YouTube channel URL:

1. **Preview step** - Show channel thumbnail and title for confirmation before adding
2. **Group selection** - User chooses which group(s) to add the channel to during the add flow
3. **Uses global video limit** - Imports videos according to the global "videos per channel" setting
4. **Large channel warning** - For channels with many videos (5000+), warn about API usage but allow import
5. **Invalid URL** - Show error: "No Channel Found, Check URL"
6. **Duplicate channel** - Don't add duplicate; inform user channel already exists
7. **Channel with no videos** - Show warning but allow adding (empty channel)

### Ongoing Video Sync

#### Automatic Sync (Cron Jobs)
- High-activity channels: Every 2 hours
- Medium-activity channels: Every 6 hours
- Low-activity channels: Daily
- Dead channel retry: Daily with exponential backoff

#### Manual Sync
- **"Sync now" button** located in Groups tab on each group
- Syncs only channels in that specific group
- Fetches new videos published since last sync
- **No cooldown** - user can trigger sync repeatedly
- **Real-time progress** - Shows channel progress (X/Y channels) with activity messages
- **Micro-progress updates** - "Fetching page 1...", "Processing 50 videos..." every 2-5 seconds
- **Stale detection** - Warning shown if no update in 30 seconds
- **Persistent progress** - Syncs in database, visible across all tabs/sessions
- **Background sync** - Safe to navigate away, close browser, switch tabs - progress continues

#### Sync Behavior
- New videos just appear in feed (no notification toast)
- Sync runs in background without blocking UI
- Progress visible in Groups tab with real-time activity indicators
- Users can see estimated completion and safely leave the page

#### Sync Progress Display
- **Channel tracking**: "X/Y channels" with percentage
- **Video count**: Cumulative videos imported (not X/Y since total unknown upfront)
- **Activity message**: Current operation like "Fetching page 3..." or "Processing 100 videos..."
- **Time indicator**: "Updated Xs ago" to show sync is active
- **Stale warning**: "No update in 30s - sync may be stuck" if progress freezes
- **Safe navigation**: Message confirms sync continues in background

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| Private/unlisted video | Keep if still accessible via URL |
| Channel URL changes | If same channel (only name changed), update name in database, keep videos, notify user |
| Age-restricted videos | Show them |
| Video deleted on YouTube | Remove from Ben.Tube (along with any progress data) |
| User re-subscribes to channel | Start fresh (old progress data not restored) |

---

### Secondary Features (Should Have)

#### 9. Tags
- Create custom tags within groups
- Tag individual videos
- Filter feed by tags
- Personal to each user

#### 10. Video Notes
- Add notes to any video
- Personal to each user
- Searchable (included in global search)

#### 11. Channel Health Monitoring
- Track which channels are failing to sync
- Automatic retry with backoff
- Alerts when channels become "dead"
- Per-user health tracking
- **Auto-update channel name** if it changes on YouTube

#### 12. Sync Alerts
- Notifications when sync issues occur
- Per-user (only see your own alerts)
- Acknowledge/dismiss alerts

#### 13. API Quota Tracking
- See how much YouTube API quota you've used
- Warning when approaching limit
- Per-user tracking

#### 14. Push Notifications (Optional)
- Browser/mobile notifications for new videos
- User can enable/disable

#### 15. Channel Display in Groups
- Channel thumbnail
- Last upload date (on YouTube, not import date)
- Video count

### User Settings

#### Global Settings
| Setting | Options |
|---------|---------|
| Theme | Follow system (dark/light) |
| Default feed sort | User chooses |
| Watched video behavior | Stay in feed / Hide from feed |
| View mode | Grid / List |
| Videos per channel | 100 (default), 500, 1000, or All videos |

### Content Filtering

| Content Type | Behavior |
|--------------|----------|
| Regular videos | Show in main feed |
| Shorts | Separate section |
| Livestreams | **Exclude entirely** |
| Premieres | **Hide until live** |
| Deleted videos | **Remove from Ben.Tube** |
| Duplicate uploads | Show both, user deletes manually |

---

## Technical Requirements

### Data Model

**Shared across all users:**
- Basic channel info (YouTube ID, title, thumbnail, playlist ID)

**Per-user (completely isolated):**
- Videos (each user has their own copy)
- Channel health tracking
- Groups and group-channel relationships
- Imported playlists and group-playlist relationships
- Watch status (watched, hidden, watch later, favorite, pinned)
- Watch progress
- Tags and video-tag assignments
- Video notes
- Sync alerts
- API quota usage
- User settings/preferences

### Deletion Behavior

When a user removes a channel from all their groups:
- Videos are deleted **immediately**
- No 24-hour grace period
- Only affects that user's data

### Security

- Row-Level Security (RLS) on all tables
- Users can only access their own data
- Service role for background sync jobs
- No cross-user data access possible

### Performance

- Lazy loading for video feeds
- Efficient database indexes
- Real-time updates via Supabase subscriptions
- Cron jobs for background sync (not blocking UI)

---

## Non-Goals

Things we explicitly will NOT build:

1. **Social features** - No sharing, profiles, or following
2. **Recommendations** - No "you might like" suggestions
3. **Two-way sync** - Never write back to YouTube
4. **Analytics/stats** - No tracking of viewing habits, no channel statistics
5. **Bulk actions** - Mark videos one by one (intentional)
6. **Offline mode** - Always requires internet
7. **Video downloads** - Just links/embeds YouTube
8. **Nested groups** - Flat folder structure only
9. **Channel muting** - Either subscribed or not
10. **Keyboard shortcuts** - Mouse/touch only
11. **Onboarding/tutorial** - App should be self-explanatory
12. **Duplicate detection** - Too API-expensive, user deletes manually

---

## Success Metrics

Since this is a personal tool without analytics, success is measured by:

1. **Reliability** - Syncs work consistently without errors
2. **Performance** - Feed loads quickly, no lag
3. **Data integrity** - Watch progress never lost, cross-device sync works
4. **User satisfaction** - Does it replace the need to go to YouTube?

---

## Roadmap

### Phase 1: Foundation (Current)
- Basic subscription import
- Groups and organization
- Watch status tracking
- Video feed with filters

### Phase 2: User Isolation (In Progress)
- Per-user videos
- Per-user channel health
- Per-user alerts
- Immediate deletion on unsubscribe
- See: `docs/PRD-DATABASE-FIXES.md`

### Phase 3: Enhanced Experience
- Shorts in separate section
- Full-featured embedded player (speed, chapters, PiP)
- Watch Later queue with ordering
- Favorites (heart)
- Pin videos to group
- Tags and notes
- Push notifications
- Channel page view
- ✅ Playlist import (one-time import from YouTube playlists)

### Phase 4: Polish
- Grid/list view toggle
- Import depth setting
- Manual channel add by URL
- Watch history
- Next video suggestions
- Improved mobile experience

---

## Appendix: Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Videos per-user vs shared | Per-user | Complete isolation, simpler deletion logic |
| Soft delete vs immediate | Immediate | User preference, cleaner data |
| Shorts handling | Separate section | Keep focus on longer content |
| Channel health | Per-user | One user's dead channel shouldn't affect others |
| Alerts | Per-user | Only see your own problems |
| Social features | None | Privacy focus, not a social app |
| YouTube sync-back | Never | Stay independent from YouTube |
| Auto-cleanup | Never | User controls everything |
| Analytics | None | Privacy, simplicity |
| Offline mode | Not needed | Always have internet when using |
| Feed sort | User chooses | Different users have different preferences |
| Watched behavior | User setting | Some want videos hidden, some want them marked |
| Watch Later | Ordered queue + filter | Best of both worlds |
| Group limits | No limit (for now) | Start unlimited, add limits if needed |
| Add channels | Import + manual URL | Flexibility to add non-subscribed channels |
| Deleted videos | Remove from Ben.Tube | Keep data clean |
| Embedded player | Full-featured | Speed, chapters, skip intro, PiP |
| View mode | User chooses grid/list | Different preferences |
| Import depth | Global setting (3 options) | All videos / 3 years / 1 year |
| Theme | Follow system | Respect device preferences |
| All Videos view | Always visible, default | Central hub for all content |
| Notifications | Optional push | User can enable if desired |
| Unwatched filter | Yes | Core use case for catching up |
| Nested groups | No, flat only | Keep it simple |
| Undo delete | Confirm dialog | Prevent accidents without complexity |
| Remember state | Always start at All | Consistent experience |
| Long titles | Truncate | Cleaner look, full on hover |
| Pin videos | Yes, to group | Keep important videos visible |
| Search scope | Everything | Titles, descriptions, notes, tags |
| Channel rename | Auto-update | Keep data current |
| Playlist import | One-time, no sync | Playlists are static collections, no need to track changes |
| Playlist videos | source_playlist_id on videos | Track origin, enable CASCADE delete |
| Playlist in feed | Mixed with channel videos | Unified viewing experience |
| Playlist deletion | CASCADE delete videos | Clean removal, no orphans |
| Thumbnail hover | Actions (play, watch later, delete) | Quick actions without opening |
| Recent/history | Full watch history | Complete record of watched videos |
| Next video | From same group | Contextually relevant |
| Bulk mark watched | No | Intentional friction, manual control |
| Premieres | Hide until live | Only show watchable content |
| Livestreams | Exclude entirely | Focus on recorded content |
| Chapters | Show in player | Better navigation |
| Favorites | Heart + Watch Later | Separate concepts, both useful |
| After video ends | Auto-mark watched | Sensible automation |
| Mini player | Picture-in-picture | Browse while watching |
| Duration filter | Preset ranges | Quick and easy |
| Channel page | Yes | See all videos from one channel |
| Onboarding | None | Self-explanatory design |
| Duplicates | Show both, manual delete | API cost too high for detection |
| Account deletion | Immediate permanent erase | User expects clean deletion |
| YouTube accounts | 1:1 with Ben.Tube account | Simplicity |
| Session management | Yes, server-side | Cross-device experience |
| Data storage | Database only, no cookies/cache | Seamless sync |
| Feed pagination | Infinite scroll | Smoother experience |
| Empty states | Show empty feed | Keep it simple |
| Watch Later limit | No limit | Flexibility |
| Watch Later add position | Bottom of queue | Natural ordering |
| Watch Later auto-remove | Yes, when marked watched | Keep queue clean |
| Channel limit | No limit | Flexibility |
| Channel discovery | None (manual URL only) | Manual curation focus |
| Channel sort in group | By most recent video | See active channels first |
| Progress bar location | Below thumbnail | Cleaner look than overlay |
| Progress bar width | Same as thumbnail | Visual alignment |
| Progress percentage | Show next to bar | Clear indicator |
| Progress sync frequency | Every 5 seconds | Balance of accuracy vs resources |
| Progress conflict (multi-device) | More advanced position wins | User expects furthest progress |
| Shorts progress tracking | No | Too short to matter |
| Completed threshold | 90% | Most content watched |
| In Progress section | Dedicated button in top bar | Quick access |
| Reset progress | Via thumbnail hover icon | Quick action |
| Resume behavior | Auto-resume immediately | No friction |
| Background tab | Keep tracking | Expected behavior |
| Import trigger | Automatic on first login | Smooth onboarding |
| Import feedback | Progress bar with count | User knows status |
| Import limit | Video count (global setting) | Simpler than date picker, applies everywhere |
| Import failure | Rollback and retry fresh | Clean state |
| Skip import | Allowed | User choice |
| Manual add preview | Show channel thumbnail/title | Confirm before adding |
| Manual add group | Choose during add flow | Immediate organization |
| Manual add limit | Uses global setting | Consistency across all imports |
| Large channel warning | Warn but allow | User decides |
| Sync now button | In Settings tab | Available but not prominent |
| Sync cooldown | None | User control |
| Sync progress | Loading bar | User knows status |
| Sync background | Continue if user navigates away | Don't lose progress |
| New video notification | None (just appear) | No interruption |
| Private/unlisted videos | Keep if accessible | Don't lose content |
| Channel URL change | Update name, keep videos, notify | Preserve data |
| Age-restricted videos | Show them | No filtering |
| Re-subscribe to channel | Fresh start | Clean slate |
