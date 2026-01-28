'use client'

import { useRouter } from 'next/navigation'
import { useState, useCallback, useTransition, useMemo, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { getInternalUserId } from '@/lib/supabase/get-user'
import VideoCard, { type FeedVideo } from './VideoCard'
import VideoListItem from './VideoListItem'
import GroupSidebar from './GroupSidebar'
import BottomNav from './BottomNav'
import CreateGroupModal from './CreateGroupModal'
import FirstTimeImportModal from './FirstTimeImportModal'
import TagPopover from './tags/TagPopover'
import TagFilterPopover from './tags/TagFilterPopover'
import FilterPopover, { type FilterState, getFilterParams } from './FilterPopover'
import { WatchProgressProvider } from '@/hooks/useWatchProgress'
import { usePlaylist } from '@/hooks/usePlaylist'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import { useScrollRestoration } from '@/hooks/useScrollRestoration'
import {
  useInfiniteFeed,
  useGroups,
  useInProgressCount,
  useWatchLaterCount,
  useToggleWatchLater,
  useCreateGroup,
  useDeleteVideo,
  useDeleteMultipleVideos,
} from '@/hooks/useFeed'
import ConfirmDialog from './ConfirmDialog'

type Tab = 'feed' | 'groups' | 'settings'

type Tag = {
  id: string
  name: string
  group_id: string
}

type ViewMode = 'grid' | 'list'

export default function FeedContent() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { loadGroupPlaylist, loadShuffledPlaylist, isLoading: isPlaylistLoading } = usePlaylist()

  // User ID for watch progress tracking
  const [userId, setUserId] = useState<string | null>(null)

  // Local UI state
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [deferredSearchQuery, setDeferredSearchQuery] = useState('')
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [hasCheckedImport, setHasCheckedImport] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('feed')
  const [showInProgress, setShowInProgress] = useState(false)
  const [showWatchLater, setShowWatchLater] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [, startTransition] = useTransition()
  const [loadingTooLong, setLoadingTooLong] = useState(false)

  // Sidebar lock mode state
  const [sidebarLockMode, setSidebarLockMode] = useState<'auto' | 'open' | 'closed'>('auto')

  // Tag popover state
  const [tagPopoverVideoId, setTagPopoverVideoId] = useState<string | null>(null)
  const [tagPopoverPosition, setTagPopoverPosition] = useState<{ top: number; left: number } | null>(null)
  const [showTagFilterPopover, setShowTagFilterPopover] = useState(false)
  const [tagFilterPosition, setTagFilterPosition] = useState<{ top: number; left: number } | null>(null)
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set())
  const [availableTags, setAvailableTags] = useState<Tag[]>([])
  const [videoTags, setVideoTags] = useState<Map<string, Tag[]>>(new Map())

  // Selection mode state
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set())
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Filter popover state
  const [showFilterPopover, setShowFilterPopover] = useState(false)
  const [filterPosition, setFilterPosition] = useState<{ top: number; left: number } | null>(null)
  const [filters, setFilters] = useState<FilterState>({
    dateFilter: 'any',
    durationFilter: 'any',
    selectedChannelIds: new Set(),
    channelFilterMode: 'include',
  })
  const [groupChannels, setGroupChannels] = useState<{ id: string; title: string; thumbnail: string | null }[]>([])

  // Scroll restoration
  const { saveScrollPosition } = useScrollRestoration('feed-scroll')

  // Load sidebar lock mode from localStorage and listen for changes
  useEffect(() => {
    const saved = localStorage.getItem('sidebar-lock-mode') as 'auto' | 'open' | 'closed' | null
    if (saved && ['auto', 'open', 'closed'].includes(saved)) {
      setSidebarLockMode(saved)
    }

    const handleLockModeChange = (e: CustomEvent<'auto' | 'open' | 'closed'>) => {
      setSidebarLockMode(e.detail)
    }
    window.addEventListener('sidebar-lock-mode-change', handleLockModeChange as EventListener)
    return () => window.removeEventListener('sidebar-lock-mode-change', handleLockModeChange as EventListener)
  }, [])

  // Fetch user ID for watch progress tracking
  useEffect(() => {
    async function fetchUserId() {
      try {
        const supabase = createClient()
        const { userId: uid } = await getInternalUserId(supabase)
        if (uid) {
          setUserId(uid)
        }
      } catch (error) {
        console.error('Failed to get user ID:', error)
      }
    }
    fetchUserId()
  }, [])

  // Get filter params from filter state
  const filterParams = useMemo(() => getFilterParams(filters), [filters])

  // React Query hooks - always enabled since parent checks auth
  const { data: groupsData } = useGroups()
  const {
    data: feedData,
    isLoading: feedLoading,
    error: feedError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteFeed({
    groupId: selectedGroupId,
    search: deferredSearchQuery,
    showInProgress,
    showWatchLater,
    tagIds: selectedTagIds.size > 0 ? Array.from(selectedTagIds) : undefined,
    minDate: filterParams.minDate,
    maxDate: filterParams.maxDate,
    minDuration: filterParams.minDuration,
    maxDuration: filterParams.maxDuration,
    channelIds: filterParams.channelIds,
    excludeChannelIds: filterParams.excludeChannelIds,
    limit: 24, // Load 24 videos per batch (good for grid layouts)
  })
  const { data: inProgressCount } = useInProgressCount(selectedGroupId)
  const { data: watchLaterCount } = useWatchLaterCount(selectedGroupId)

  // Derived state
  const groups = useMemo(() => groupsData?.groups || [], [groupsData])
  const videos = useMemo(() => {
    if (!feedData?.pages) return []
    return feedData.pages.flatMap(page => page.videos)
  }, [feedData])

  // Show loading when initially loading
  const showLoadingSpinner = feedLoading

  // Track if loading is taking too long (show helpful message after 5 seconds)
  useEffect(() => {
    if (!showLoadingSpinner) {
      setLoadingTooLong(false)
      return
    }
    const timer = setTimeout(() => setLoadingTooLong(true), 5000)
    return () => clearTimeout(timer)
  }, [showLoadingSpinner])

  // Infinite scroll
  const { sentinelRef } = useInfiniteScroll({
    hasNextPage: hasNextPage ?? false,
    isFetchingNextPage,
    fetchNextPage,
    isLoading: showLoadingSpinner,
    enabled: videos.length > 0,
  })

  // Mutations
  const toggleWatchLaterMutation = useToggleWatchLater()
  const createGroupMutation = useCreateGroup()
  const deleteVideoMutation = useDeleteVideo()
  const deleteMultipleVideosMutation = useDeleteMultipleVideos()

  // Handle tab changes
  const handleTabChange = useCallback((tab: Tab) => {
    if (tab === 'settings') {
      router.push('/settings')
    } else if (tab === 'groups') {
      router.push('/groups')
    } else {
      setActiveTab(tab)
    }
  }, [router])

  // Handle search input with deferred update for snappy typing
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSearchQuery(value) // Immediate update for input field
    startTransition(() => {
      setDeferredSearchQuery(value) // Deferred update for fetching
    })
  }, [])

  const handleWatch = useCallback((youtubeId: string) => {
    const video = videos.find(v => v.youtube_id === youtubeId)
    if (video) {
      // Save scroll position before navigating
      saveScrollPosition()
      // Navigate to dedicated watch page
      router.push(`/watch/${video.id}`)
    } else {
      // Fallback to YouTube
      window.open(`https://www.youtube.com/watch?v=${youtubeId}`, '_blank')
    }
  }, [videos, router, saveScrollPosition])

  const handleToggleWatchLater = useCallback(async (videoId: string) => {
    const video = videos.find(v => v.id === videoId)
    if (!video) return

    const newWatchLater = !video.watch_later

    // Optimistic update for infinite query
    queryClient.setQueryData(['infiniteFeed', {
      groupId: selectedGroupId,
      search: deferredSearchQuery,
      showInProgress,
      showWatchLater,
      tagIds: selectedTagIds.size > 0 ? Array.from(selectedTagIds) : undefined,
      limit: 24,
    }], (old: { pages: { videos: FeedVideo[]; total: number; limit: number; offset: number }[]; pageParams: number[] } | undefined) => {
      if (!old) return old
      return {
        ...old,
        pages: old.pages.map(page => ({
          ...page,
          videos: page.videos.map(v =>
            v.id === videoId ? { ...v, watch_later: newWatchLater } : v
          ),
        })),
      }
    })

    try {
      await toggleWatchLaterMutation.mutateAsync({ videoId, watchLater: newWatchLater })
    } catch (error) {
      queryClient.invalidateQueries({ queryKey: ['infiniteFeed'] })
      queryClient.invalidateQueries({ queryKey: ['watchLaterCount'] })
      console.error('Failed to update watch later status:', error)
    }
  }, [videos, selectedGroupId, deferredSearchQuery, showInProgress, showWatchLater, selectedTagIds, queryClient, toggleWatchLaterMutation])

  const handleCreateGroup = useCallback(async (data: { name: string; icon: string; color: string }) => {
    await createGroupMutation.mutateAsync(data)
  }, [createGroupMutation])

  const handleDelete = useCallback(async (videoId: string) => {
    // Optimistic update - remove from feed immediately
    queryClient.setQueryData(['infiniteFeed', {
      groupId: selectedGroupId,
      search: deferredSearchQuery,
      showInProgress,
      showWatchLater,
      tagIds: selectedTagIds.size > 0 ? Array.from(selectedTagIds) : undefined,
      limit: 24,
    }], (old: { pages: { videos: FeedVideo[]; total: number; limit: number; offset: number }[]; pageParams: number[] } | undefined) => {
      if (!old) return old
      return {
        ...old,
        pages: old.pages.map(page => ({
          ...page,
          videos: page.videos.filter(v => v.id !== videoId),
          total: page.total - 1,
        })),
      }
    })

    try {
      await deleteVideoMutation.mutateAsync(videoId)
    } catch (error) {
      queryClient.invalidateQueries({ queryKey: ['infiniteFeed'] })
      console.error('Failed to delete video:', error)
    }
  }, [selectedGroupId, deferredSearchQuery, showInProgress, showWatchLater, selectedTagIds, queryClient, deleteVideoMutation])

  // Selection mode handlers
  const handleToggleSelectionMode = useCallback(() => {
    setIsSelectionMode(prev => {
      if (prev) {
        // Exiting selection mode - clear selections
        setSelectedVideoIds(new Set())
      }
      return !prev
    })
  }, [])

  const handleToggleVideoSelection = useCallback((videoId: string) => {
    setSelectedVideoIds(prev => {
      const next = new Set(prev)
      if (next.has(videoId)) {
        next.delete(videoId)
      } else {
        next.add(videoId)
      }
      return next
    })
  }, [])

  const handleSelectAll = useCallback(() => {
    setSelectedVideoIds(new Set(videos.map(v => v.id)))
  }, [videos])

  const handleClearSelection = useCallback(() => {
    setSelectedVideoIds(new Set())
  }, [])

  const handleBulkDelete = useCallback(async () => {
    if (selectedVideoIds.size === 0) return

    setIsDeleting(true)
    const videoIdsToDelete = Array.from(selectedVideoIds)

    // Optimistic update - remove from feed immediately
    queryClient.setQueryData(['infiniteFeed', {
      groupId: selectedGroupId,
      search: deferredSearchQuery,
      showInProgress,
      showWatchLater,
      tagIds: selectedTagIds.size > 0 ? Array.from(selectedTagIds) : undefined,
      limit: 24,
    }], (old: { pages: { videos: FeedVideo[]; total: number; limit: number; offset: number }[]; pageParams: number[] } | undefined) => {
      if (!old) return old
      return {
        ...old,
        pages: old.pages.map(page => ({
          ...page,
          videos: page.videos.filter(v => !selectedVideoIds.has(v.id)),
          total: page.total - videoIdsToDelete.length,
        })),
      }
    })

    try {
      await deleteMultipleVideosMutation.mutateAsync(videoIdsToDelete)
      // Exit selection mode on success
      setIsSelectionMode(false)
      setSelectedVideoIds(new Set())
    } catch (error) {
      queryClient.invalidateQueries({ queryKey: ['infiniteFeed'] })
      console.error('Failed to delete videos:', error)
    } finally {
      setIsDeleting(false)
      setShowDeleteConfirm(false)
    }
  }, [selectedVideoIds, selectedGroupId, deferredSearchQuery, showInProgress, showWatchLater, selectedTagIds, queryClient, deleteMultipleVideosMutation])

  // Handle group reorder via drag and drop
  const handleReorderGroups = useCallback(async (groupIds: string[]) => {
    // Optimistic update
    queryClient.setQueryData(['groups'], (old: { groups: typeof groups } | undefined) => {
      if (!old) return old
      const reordered = groupIds.map((id) => old.groups.find((g) => g.id === id)).filter(Boolean)
      return { groups: reordered }
    })

    try {
      const res = await fetch('/api/groups/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupIds }),
      })

      if (!res.ok) {
        throw new Error('Failed to reorder groups')
      }
    } catch (error) {
      console.error('Failed to reorder groups:', error)
      // Revert on failure
      queryClient.invalidateQueries({ queryKey: ['groups'] })
    }
  }, [queryClient])

  // Tag handlers
  const handleTag = useCallback((videoId: string, event: React.MouseEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    setTagPopoverVideoId(videoId)
    setTagPopoverPosition({
      top: rect.bottom + 8,
      left: rect.left,
    })
  }, [])

  const handleCloseTagPopover = useCallback(() => {
    setTagPopoverVideoId(null)
    setTagPopoverPosition(null)
  }, [])

  const handleUpdateVideoTags = useCallback((tags: Tag[]) => {
    if (!tagPopoverVideoId) return

    setVideoTags(prev => {
      const next = new Map(prev)
      next.set(tagPopoverVideoId, tags)
      return next
    })

    // Invalidate feed to refresh has_tags indicator
    queryClient.invalidateQueries({ queryKey: ['infiniteFeed'] })
  }, [tagPopoverVideoId, queryClient])

  const handleToggleTagFilter = useCallback((event: React.MouseEvent) => {
    if (showTagFilterPopover) {
      setShowTagFilterPopover(false)
    } else {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
      setTagFilterPosition({
        top: rect.bottom + 8,
        left: rect.left,
      })
      setShowTagFilterPopover(true)
    }
  }, [showTagFilterPopover])

  const handleToggleTagSelection = useCallback((tagId: string) => {
    setSelectedTagIds(prev => {
      const next = new Set(prev)
      if (next.has(tagId)) {
        next.delete(tagId)
      } else {
        next.add(tagId)
      }
      return next
    })
  }, [])

  const handleCloseTagFilter = useCallback(() => {
    setShowTagFilterPopover(false)
  }, [])

  // Filter popover handlers
  const handleToggleFilterPopover = useCallback((event: React.MouseEvent) => {
    if (showFilterPopover) {
      setShowFilterPopover(false)
    } else {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
      setFilterPosition({
        top: rect.bottom + 8,
        left: rect.left,
      })
      setShowFilterPopover(true)
    }
  }, [showFilterPopover])

  const handleFilterChange = useCallback((newFilters: FilterState) => {
    setFilters(newFilters)
  }, [])

  const handleCloseFilterPopover = useCallback(() => {
    setShowFilterPopover(false)
  }, [])

  // Check if any filters are active
  const hasActiveFilters = filters.dateFilter !== 'any' ||
    filters.durationFilter !== 'any' ||
    filters.selectedChannelIds.size > 0

  // Fetch available tags when group is selected
  useEffect(() => {
    if (!selectedGroupId) {
      setAvailableTags([])
      return
    }

    const fetchTags = async () => {
      try {
        const res = await fetch(`/api/groups/${selectedGroupId}/tags`)
        if (res.ok) {
          const { tags } = await res.json()
          setAvailableTags(tags || [])
        }
      } catch (error) {
        console.error('Failed to fetch tags:', error)
      }
    }

    fetchTags()
  }, [selectedGroupId])

  // Fetch tags for the current video in the popover
  useEffect(() => {
    if (!tagPopoverVideoId) return

    const fetchVideoTags = async () => {
      try {
        const res = await fetch(`/api/videos/${tagPopoverVideoId}/tags`)
        if (res.ok) {
          const { tags } = await res.json()
          setVideoTags(prev => {
            const next = new Map(prev)
            next.set(tagPopoverVideoId, tags || [])
            return next
          })
        }
      } catch (error) {
        console.error('Failed to fetch video tags:', error)
      }
    }

    fetchVideoTags()
  }, [tagPopoverVideoId])

  // Fetch channels for the current group (for filter popover)
  useEffect(() => {
    if (!selectedGroupId) {
      setGroupChannels([])
      return
    }

    const fetchChannels = async () => {
      try {
        const res = await fetch(`/api/groups/${selectedGroupId}/channels`)
        if (res.ok) {
          const { channels } = await res.json()
          setGroupChannels(channels || [])
        }
      } catch (error) {
        console.error('Failed to fetch group channels:', error)
      }
    }

    fetchChannels()
  }, [selectedGroupId])

  // Reset channel filter when group changes
  useEffect(() => {
    setFilters(prev => ({
      ...prev,
      selectedChannelIds: new Set(),
    }))
  }, [selectedGroupId])

  // Check if first-time user needs to import (runs in background, doesn't block UI)
  useEffect(() => {
    if (hasCheckedImport) return

    const checkImportStatus = async () => {
      try {
        const res = await fetch('/api/sync/subscriptions')
        if (res.ok) {
          const data = await res.json()
          if (!data.hasSubscriptions) {
            setShowImportModal(true)
          }
        }
      } catch {
        // Ignore - just show the feed
      } finally {
        setHasCheckedImport(true)
      }
    }

    checkImportStatus()
  }, [hasCheckedImport])

  // Get selected group name
  const selectedGroup = selectedGroupId
    ? groups.find(g => g.id === selectedGroupId)
    : null

  return (
    <WatchProgressProvider userId={userId || undefined}>
      <div className="min-h-screen bg-background relative">
        {/* Grain texture overlay */}
        <div className="grain-overlay" />

        {/* Create Group Modal */}
        <CreateGroupModal
          isOpen={showCreateGroupModal}
          onClose={() => setShowCreateGroupModal(false)}
          onSubmit={handleCreateGroup}
        />

        {/* First Time Import Modal */}
        <FirstTimeImportModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          onComplete={() => setShowImportModal(false)}
          onSkip={() => setShowImportModal(false)}
        />

        {/* Bulk Delete Confirm Dialog */}
        <ConfirmDialog
          isOpen={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={handleBulkDelete}
          title="Delete Videos"
          message={`Are you sure you want to delete ${selectedVideoIds.size} video${selectedVideoIds.size === 1 ? '' : 's'}? This cannot be undone.`}
          confirmText="Delete"
          confirmVariant="danger"
          loading={isDeleting}
        />

        {/* Tag Popover */}
        {tagPopoverVideoId && selectedGroupId && (
          <TagPopover
            videoId={tagPopoverVideoId}
            groupId={selectedGroupId}
            currentTags={videoTags.get(tagPopoverVideoId) || []}
            availableTags={availableTags}
            onClose={handleCloseTagPopover}
            onUpdateTags={handleUpdateVideoTags}
            position={tagPopoverPosition}
          />
        )}

        {/* Tag Filter Popover */}
        {showTagFilterPopover && selectedGroupId && (
          <TagFilterPopover
            availableTags={availableTags}
            selectedTagIds={selectedTagIds}
            onToggleTag={handleToggleTagSelection}
            onClose={handleCloseTagFilter}
            position={tagFilterPosition}
          />
        )}

        {/* Filter Popover */}
        {showFilterPopover && (
          <FilterPopover
            filters={filters}
            channels={groupChannels}
            onFilterChange={handleFilterChange}
            onClose={handleCloseFilterPopover}
            position={filterPosition}
          />
        )}

        {/* Foldable Sidebar */}
        <GroupSidebar
          groups={groups}
          selectedGroupId={selectedGroupId}
          onSelectGroup={setSelectedGroupId}
          onCreateGroup={() => setShowCreateGroupModal(true)}
          onReorderGroups={handleReorderGroups}
        />

        {/* Main content area - offset for sidebar */}
        <div className={`pb-16 min-h-screen flex flex-col transition-[margin] duration-200 ${
          sidebarLockMode === 'open' ? 'ml-[240px]' : 'ml-[72px]'
        }`}>
          {/* Clean Header */}
          <header className="sticky top-0 z-[105] border-b isolate bg-[#ffffff] dark:bg-[#262017]">
            <div className="flex h-14 items-center gap-4 px-6">
              {/* Current view title */}
              <div className="flex items-center gap-3">
                <span className="text-xl">{selectedGroup?.icon || '🎬'}</span>
                <h1 className="text-lg font-semibold">
                  {selectedGroup?.name || 'All'}
                </h1>
              </div>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Search */}
              <div className="w-80">
                <div className="relative">
                  <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={handleSearchChange}
                    className="w-full h-9 pl-9 pr-4 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                  />
                </div>
              </div>

            </div>
          </header>

          {/* Filter chips */}
          <div className="sticky top-14 z-[104] border-b px-6 py-2.5 flex items-center gap-2 isolate bg-[#ffffff] dark:bg-[#262017]">
            <button
              onClick={() => setShowWatchLater(!showWatchLater)}
              disabled={watchLaterCount === 0 && !showWatchLater}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${
                showWatchLater
                  ? 'bg-accent text-white'
                  : watchLaterCount === 0
                  ? 'bg-muted text-muted-foreground/50 cursor-not-allowed'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>⏰</span>
              <span>Watch Later</span>
            </button>
            {/* Quick Play button - only show when a group is selected */}
            {selectedGroup && (
              <button
                onClick={() => loadGroupPlaylist(selectedGroup.id, selectedGroup.name)}
                disabled={isPlaylistLoading}
                title="Play latest videos"
                className="flex items-center justify-center w-8 h-8 rounded-full bg-accent text-white hover:bg-accent/90 hover:scale-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                {isPlaylistLoading ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <PlayIcon className="w-4 h-4" />
                )}
              </button>
            )}
            {/* Shuffle Play button - plays random videos from current feed */}
            {videos.length > 0 && (
              <button
                onClick={() => loadShuffledPlaylist(videos)}
                disabled={isPlaylistLoading || videos.length === 0}
                title="Shuffle play"
                className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-muted-foreground hover:bg-accent hover:text-white hover:scale-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                <ShuffleIcon className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => setShowInProgress(!showInProgress)}
              disabled={inProgressCount === 0 && !showInProgress}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${
                showInProgress
                  ? 'bg-accent text-white'
                  : inProgressCount === 0
                  ? 'bg-muted text-muted-foreground/50 cursor-not-allowed'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              <InProgressIcon className="w-3.5 h-3.5" />
              <span>In Progress</span>
            </button>
            <button
              onClick={handleToggleFilterPopover}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${
                showFilterPopover || hasActiveFilters
                  ? 'bg-accent text-white'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              <FilterIcon className="w-3.5 h-3.5" />
              <span>Filter</span>
              {hasActiveFilters && (
                <span className="w-1.5 h-1.5 rounded-full bg-white" />
              )}
            </button>
            {/* Tag filter button - only show when viewing a specific group */}
            {selectedGroupId && (
              <button
                onClick={handleToggleTagFilter}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${
                  showTagFilterPopover || selectedTagIds.size > 0
                    ? 'bg-accent text-white'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                <TagIcon className="w-3.5 h-3.5" />
                <span>Tags</span>
                {selectedTagIds.size > 0 && (
                  <span className="ml-1 text-xs">({selectedTagIds.size})</span>
                )}
              </button>
            )}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Select button */}
            <button
              onClick={handleToggleSelectionMode}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${
                isSelectionMode
                  ? 'bg-accent text-white'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              <SelectIcon className="w-3.5 h-3.5" />
              <span>{isSelectionMode ? 'Cancel' : 'Select'}</span>
            </button>

            {/* View toggle */}
            <div className="flex bg-muted rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('grid')}
                className={`px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-card shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <GridIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                  viewMode === 'list'
                    ? 'bg-card shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <ListIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Video Grid */}
          <main className="flex-1 p-6">
            {feedError ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="text-4xl mb-4">⚠️</div>
                <h3 className="text-lg font-medium text-red-600">Failed to load videos</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {feedError instanceof Error ? feedError.message : 'Please try again'}
                </p>
                <button
                  onClick={() => queryClient.invalidateQueries({ queryKey: ['infiniteFeed'] })}
                  className="mt-4 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90"
                >
                  Retry
                </button>
              </div>
            ) : showLoadingSpinner ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
                {loadingTooLong && (
                  <div className="mt-4 text-center">
                    <p className="text-sm text-muted-foreground">Taking longer than expected...</p>
                    <button
                      onClick={() => queryClient.invalidateQueries({ queryKey: ['infiniteFeed'] })}
                      className="mt-2 text-sm text-accent hover:underline"
                    >
                      Retry
                    </button>
                  </div>
                )}
              </div>
            ) : videos.length > 0 ? (
              <>
                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                    {videos.map((video) => (
                      <VideoCard
                        key={video.id}
                        video={video}
                        onWatch={handleWatch}
                        onToggleWatchLater={handleToggleWatchLater}
                        onTag={selectedGroupId ? handleTag : undefined}
                        onDelete={handleDelete}
                        isSelectionMode={isSelectionMode}
                        isSelected={selectedVideoIds.has(video.id)}
                        onToggleSelection={handleToggleVideoSelection}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2 max-w-5xl">
                    {videos.map((video) => (
                      <VideoListItem
                        key={video.id}
                        video={video}
                        onWatch={handleWatch}
                        onToggleWatchLater={handleToggleWatchLater}
                        onTag={selectedGroupId ? handleTag : undefined}
                        onDelete={handleDelete}
                        isSelectionMode={isSelectionMode}
                        isSelected={selectedVideoIds.has(video.id)}
                        onToggleSelection={handleToggleVideoSelection}
                      />
                    ))}
                  </div>
                )}

                {/* Sentinel element for infinite scroll detection */}
                <div ref={sentinelRef} className="h-1" aria-hidden="true" />

                {/* Loading more indicator */}
                {isFetchingNextPage && (
                  <div className="flex items-center justify-center py-8">
                    <div className="h-6 w-6 animate-spin rounded-full border-3 border-accent border-t-transparent" />
                    <span className="ml-3 text-sm text-muted-foreground">Loading more videos...</span>
                  </div>
                )}

                {/* End of feed indicator */}
                {!hasNextPage && videos.length > 24 && (
                  <div className="flex items-center justify-center py-8">
                    <span className="text-sm text-muted-foreground">You&apos;ve reached the end</span>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="text-4xl mb-4">📭</div>
                <h3 className="text-lg font-medium">No videos found</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {searchQuery
                    ? 'Try a different search term'
                    : groups.length === 0
                    ? 'Create a group and add channels to see videos'
                    : 'Add channels to your groups to see videos here'}
                </p>
              </div>
            )}
          </main>
        </div>

        {/* Bulk Action Bar - appears when in selection mode */}
        {isSelectionMode && selectedVideoIds.size > 0 && (
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[200] bg-card border rounded-2xl shadow-lg px-4 py-3 flex items-center gap-4">
            <span className="text-sm font-medium">
              {selectedVideoIds.size} video{selectedVideoIds.size === 1 ? '' : 's'} selected
            </span>
            <button
              onClick={handleSelectAll}
              className="px-3 py-1.5 rounded-lg text-sm bg-muted hover:bg-muted/80 transition-colors"
            >
              Select All
            </button>
            <button
              onClick={handleClearSelection}
              className="px-3 py-1.5 rounded-lg text-sm bg-muted hover:bg-muted/80 transition-colors"
            >
              Clear
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-3 py-1.5 rounded-lg text-sm bg-red-600 text-white hover:bg-red-500 transition-colors"
            >
              Delete Selected
            </button>
          </div>
        )}

        {/* Bottom Navigation */}
        <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
      </div>
    </WatchProgressProvider>
  )
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  )
}

function GridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  )
}

function ListIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}

function FilterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
    </svg>
  )
}

function TagIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
    </svg>
  )
}

function ShuffleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
    </svg>
  )
}

function InProgressIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h12" />
    </svg>
  )
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function SelectIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

