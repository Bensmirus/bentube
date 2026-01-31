'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { getInternalUserId } from '@/lib/supabase/get-user'
import BottomNav from '../BottomNav'
import GroupCard from './GroupCard'
import EditGroupModal from './EditGroupModal'
import AddChannelModal from '../AddChannelModal'
import AddPlaylistModal from '../AddPlaylistModal'
import ConfirmDialog from '../ConfirmDialog'

type Group = {
  id: string
  name: string
  icon: string
  color: string
  channel_count: number
  video_count: number
}

type SyncProgressData = {
  phase: string
  current: number
  total: number
  currentItem?: string
  message?: string
  updatedAt?: string
  stats: {
    videosAdded: number
    channelsProcessed: number
  }
}

type ETAData = {
  estimatedSecondsRemaining: number
}

// Video limit options
// 0 = "New only" (only videos since last sync, nothing for never-synced channels)
// null = "All" (unlimited)
// positive numbers = fetch up to that many videos
const VIDEO_LIMIT_OPTIONS = [
  { value: 0, label: 'New', description: 'Only new videos since last sync' },
  { value: 50, label: '50' },
  { value: 100, label: '100' },
  { value: 250, label: '250' },
  { value: 500, label: '500' },
  { value: 1000, label: '1K' },
  { value: null, label: 'All' },
]

export default function GroupsContent() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [loading, setLoading] = useState(true)
  const [groups, setGroups] = useState<Group[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editingGroup, setEditingGroup] = useState<Group | null>(null)
  const [showAddChannelModal, setShowAddChannelModal] = useState(false)
  const [showAddPlaylistModal, setShowAddPlaylistModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletingGroup, setDeletingGroup] = useState<Group | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [showDeleteVideosConfirm, setShowDeleteVideosConfirm] = useState(false)
  const [deletingVideosGroup, setDeletingVideosGroup] = useState<Group | null>(null)
  const [deleteVideosLoading, setDeleteVideosLoading] = useState(false)
  const [syncProgress, setSyncProgress] = useState<SyncProgressData | null>(null)
  const [syncActive, setSyncActive] = useState(false)
  const [syncEta, setSyncEta] = useState<ETAData | null>(null)
  const progressPollRef = useRef<NodeJS.Timeout | null>(null)
  const isVisibleRef = useRef(true)
  const [videoLimit, setVideoLimit] = useState<number | null>(100)
  const [savingLimit, setSavingLimit] = useState(false)
  const [importingChannels, setImportingChannels] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()

    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      // Get internal user ID for real-time subscriptions
      const { userId: uid } = await getInternalUserId(supabase)
      if (uid) {
        setUserId(uid)
      }
      fetchGroups()
      fetchVideoLimit()
    }

    checkAuth()
  }, [router])

  const fetchVideoLimit = async () => {
    try {
      const res = await fetch('/api/user/video-limit')
      if (res.ok) {
        const data = await res.json()
        setVideoLimit(data.limit)
      }
    } catch (error) {
      console.error('Failed to fetch video limit:', error)
    }
  }

  const handleVideoLimitChange = async (limit: number | null) => {
    console.log('Video limit change clicked:', limit)
    setSavingLimit(true)
    try {
      const res = await fetch('/api/user/video-limit', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit }),
      })
      if (res.ok) {
        setVideoLimit(limit)
        console.log('Video limit updated successfully to:', limit)
      } else {
        console.error('Failed to update video limit, status:', res.status)
      }
    } catch (error) {
      console.error('Failed to update video limit:', error)
    } finally {
      setSavingLimit(false)
    }
  }

  const handleImportChannels = async () => {
    setImportingChannels(true)
    try {
      const res = await fetch('/api/sync/subscriptions', {
        method: 'POST',
      })
      if (res.ok) {
        await fetchGroups()
      } else {
        const data = await res.json()
        console.error('Import failed:', data.error)
      }
    } catch (error) {
      console.error('Import error:', error)
    } finally {
      setImportingChannels(false)
    }
  }

  // Track document visibility to pause polling when tab is hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      isVisibleRef.current = document.visibilityState === 'visible'
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  // Poll for sync progress
  const pollSyncProgress = useCallback(async () => {
    if (!isVisibleRef.current) return

    try {
      const res = await fetch('/api/sync/progress')
      if (res.ok) {
        const data = await res.json()
        setSyncActive(data.isActive)
        setSyncProgress(data.progress)
        setSyncEta(data.eta)

        // If sync just completed, refresh groups to update counts
        if (!data.isActive && syncActive) {
          fetchGroups()
        }
      }
    } catch {
      // Ignore polling errors
    }
  }, [syncActive])

  // Start/stop polling based on sync activity
  useEffect(() => {
    const startPolling = () => {
      if (progressPollRef.current) return
      progressPollRef.current = setInterval(pollSyncProgress, 5000)
    }

    const stopPolling = () => {
      if (progressPollRef.current) {
        clearInterval(progressPollRef.current)
        progressPollRef.current = null
      }
    }

    // Initial check
    pollSyncProgress()

    // Poll every 5 seconds
    startPolling()

    return () => stopPolling()
  }, [pollSyncProgress])

  // Real-time subscription for video and group changes (cross-device sync)
  useEffect(() => {
    if (!userId) return

    const supabase = createClient()

    // Subscribe to video and channel_groups changes for this user
    const channel = supabase
      .channel(`groups-realtime:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'videos',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          // Refresh groups when videos change (updates counts)
          fetchGroups()
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'channel_groups',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          // Refresh groups when channel assignments change
          fetchGroups()
        }
      )
      .subscribe()

    // Cleanup subscription on unmount
    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const fetchGroups = async () => {
    try {
      const res = await fetch('/api/groups')
      const data = await res.json()
      if (data.groups) {
        setGroups(data.groups)
      }
    } catch (error) {
      console.error('Failed to fetch groups:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateGroup = () => {
    setEditingGroup(null)
    setShowModal(true)
  }

  const handleEditGroup = (group: Group) => {
    setEditingGroup(group)
    setShowModal(true)
  }

  const handleSyncGroup = async (groupId: string) => {
    // Sync videos for this specific group only
    const res = await fetch('/api/sync/videos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId }),
    })

    if (!res.ok) {
      const data = await res.json()
      console.error('Sync failed:', data.error)
    } else {
      // Refresh groups to update counts after successful sync
      await fetchGroups()
    }
  }

  const handleChannelsSaved = (count: number) => {
    if (editingGroup) {
      setGroups(groups.map(g => g.id === editingGroup.id ? { ...g, channel_count: count } : g))
    }
  }

  const handleDeleteClick = (group: Group) => {
    setDeletingGroup(group)
    setShowDeleteConfirm(true)
  }

  const handleConfirmDelete = async () => {
    if (!deletingGroup) return

    setDeleteLoading(true)
    try {
      const res = await fetch(`/api/groups/${deletingGroup.id}`, { method: 'DELETE' })
      if (res.ok) {
        setGroups(groups.filter(g => g.id !== deletingGroup.id))
      }
    } catch (error) {
      console.error('Failed to delete group:', error)
    } finally {
      setDeleteLoading(false)
      setShowDeleteConfirm(false)
      setDeletingGroup(null)
    }
  }

  const handleDeleteVideosClick = (group: Group) => {
    setDeletingVideosGroup(group)
    setShowDeleteVideosConfirm(true)
  }

  const handleConfirmDeleteVideos = async () => {
    if (!deletingVideosGroup) return

    setDeleteVideosLoading(true)
    try {
      const res = await fetch(`/api/groups/${deletingVideosGroup.id}/videos`, { method: 'DELETE' })
      if (res.ok) {
        const data = await res.json()
        console.log(`Deleted ${data.deletedCount} videos from group ${deletingVideosGroup.name}`)
        // Refresh groups to update video counts
        await fetchGroups()
      } else {
        const data = await res.json()
        console.error('Failed to delete videos:', data.error)
      }
    } catch (error) {
      console.error('Failed to delete videos:', error)
    } finally {
      setDeleteVideosLoading(false)
      setShowDeleteVideosConfirm(false)
      setDeletingVideosGroup(null)
    }
  }

  const handleSaveGroup = async (data: { name: string; icon: string; color: string }) => {
    try {
      if (editingGroup) {
        const res = await fetch(`/api/groups/${editingGroup.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })
        if (res.ok) {
          // Refetch all groups to ensure UI is in sync with database
          await fetchGroups()
          // Invalidate React Query cache so Feed page updates immediately
          queryClient.invalidateQueries({ queryKey: ['groups'] })
        }
      } else {
        const res = await fetch('/api/groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })
        if (res.ok) {
          // Refetch all groups to ensure UI is in sync with database
          await fetchGroups()
          // Invalidate React Query cache so Feed page updates immediately
          queryClient.invalidateQueries({ queryKey: ['groups'] })
        }
      }
      setShowModal(false)
      setEditingGroup(null)
    } catch (error) {
      console.error('Failed to save group:', error)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background relative pb-16">
      <div className="grain-overlay pointer-events-none" />

      {/* Header */}
      <header className="border-b sticky top-0 z-[110] isolate bg-[#ffffff] dark:bg-[#262017]">
        <div className="flex h-14 items-center justify-between px-6">
          <h1 className="text-lg font-semibold">Groups</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCreateGroup}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-accent text-white hover:bg-accent/90 transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              <span>New Group</span>
            </button>
          </div>
        </div>
      </header>

      {/* Sync Progress Banner */}
      {syncActive && syncProgress && (() => {
        // Calculate time since last update
        const secondsSinceUpdate = syncProgress.updatedAt
          ? Math.floor((Date.now() - new Date(syncProgress.updatedAt).getTime()) / 1000)
          : 0
        const isStale = secondsSinceUpdate > 30

        return (
          <div className={`border-b ${isStale ? 'bg-yellow-500/10' : 'bg-accent/5'}`}>
            <div className="max-w-2xl mx-auto px-6 py-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className={`h-3 w-3 rounded-full border-2 shrink-0 ${isStale ? 'border-yellow-500 animate-pulse' : 'border-accent border-t-transparent animate-spin'}`} />
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">
                        {syncProgress.current}/{syncProgress.total} channels
                        {syncProgress.stats && syncProgress.stats.videosAdded > 0 && (
                          <span className="text-xs ml-2 text-muted-foreground font-normal">
                            • {syncProgress.stats.videosAdded} videos
                          </span>
                        )}
                      </span>
                      {syncProgress.message && (
                        <span className="text-xs text-muted-foreground">
                          {syncProgress.message}
                        </span>
                      )}
                      {isStale && (
                        <span className="text-xs text-yellow-600 dark:text-yellow-500 mt-0.5">
                          ⚠️ No update in {secondsSinceUpdate}s - sync may be stuck
                        </span>
                      )}
                    </div>
                  </div>
                  {syncEta && !isStale && (
                    <span className="text-xs text-accent font-medium">
                      {formatETA(syncEta.estimatedSecondsRemaining)}
                    </span>
                  )}
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent transition-all duration-300"
                    style={{ width: `${Math.min((syncProgress.current / syncProgress.total) * 100, 100)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Sync continues in background - safe to navigate away</span>
                  {syncProgress.updatedAt && !isStale && (
                    <span>Updated {secondsSinceUpdate}s ago</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Main Content with Sidebar */}
      <div className="flex max-w-7xl mx-auto relative">
        {/* Left Sidebar */}
        <aside className="w-64 border-r p-6 space-y-6 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto z-10">
          {/* Import Channels */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Import</h3>
            <button
              onClick={handleImportChannels}
              disabled={importingChannels}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border hover:bg-muted transition-colors disabled:opacity-50"
            >
              {importingChannels ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
                  Importing...
                </>
              ) : (
                <>
                  <LinkIcon className="w-4 h-4" />
                  Import Channels
                </>
              )}
            </button>
            <p className="text-xs text-muted-foreground">
              Import subscriptions from YouTube
            </p>
          </div>

          {/* Video Limit */}
          <div className="pt-4 border-t space-y-3">
            <h3 className="text-sm font-medium">Videos per Sync</h3>
            <p className="text-xs text-muted-foreground">
              Max videos to fetch when syncing a channel
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {VIDEO_LIMIT_OPTIONS.map((option) => (
                <button
                  key={option.value ?? 'all'}
                  onClick={() => handleVideoLimitChange(option.value)}
                  disabled={savingLimit}
                  className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    videoLimit === option.value
                      ? 'bg-accent text-white'
                      : 'bg-muted hover:bg-muted/80'
                  } disabled:opacity-50`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {videoLimit === 0 && (
              <div className="rounded-lg p-2 bg-blue-500/10 border border-blue-500/30">
                <p className="text-xs text-blue-800 dark:text-blue-200">
                  Only fetches videos published since last sync. New channels will import 0 videos.
                </p>
              </div>
            )}
            {videoLimit === null && (
              <div className="rounded-lg p-2 bg-yellow-500/10 border border-yellow-500/30">
                <p className="text-xs text-yellow-800 dark:text-yellow-200">
                  ⚠️ May use lots of quota
                </p>
              </div>
            )}
          </div>

          {/* Add Channel */}
          <div className="pt-4 border-t space-y-3">
            <h3 className="text-sm font-medium">Add Content</h3>
            <button
              onClick={() => setShowAddChannelModal(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border hover:bg-muted transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              Add Channel
            </button>
            <button
              onClick={() => setShowAddPlaylistModal(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border hover:bg-muted transition-colors"
            >
              <PlaylistIcon className="w-4 h-4" />
              Import Playlist
            </button>
            <p className="text-xs text-muted-foreground">
              Add channels or playlists by URL
            </p>
          </div>
        </aside>

        {/* Groups List */}
        <div className="flex-1 p-6">
          {groups.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-muted flex items-center justify-center">
                <FolderIcon className="w-8 h-8 text-muted-foreground" />
              </div>
              <h2 className="text-lg font-medium mb-2">No groups yet</h2>
              <p className="text-muted-foreground mb-6">
                Create groups to organize your YouTube subscriptions
              </p>
              <button
                onClick={handleCreateGroup}
                className="px-6 py-3 rounded-xl text-sm font-medium bg-accent text-white hover:bg-accent/90 transition-colors"
              >
                Create your first group
              </button>
            </div>
          ) : (
            <div className="space-y-3 max-w-2xl">
              {groups.map((group) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  onEdit={() => handleEditGroup(group)}
                  onDelete={() => handleDeleteClick(group)}
                  onDeleteVideos={() => handleDeleteVideosClick(group)}
                  onSync={() => handleSyncGroup(group.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit Group Modal */}
      {showModal && (
        <EditGroupModal
          group={editingGroup}
          onClose={() => {
            setShowModal(false)
            setEditingGroup(null)
          }}
          onSave={handleSaveGroup}
          onSaveChannels={handleChannelsSaved}
        />
      )}

      {/* Add Channel Modal */}
      <AddChannelModal
        isOpen={showAddChannelModal}
        onClose={() => setShowAddChannelModal(false)}
        onComplete={() => {
          setShowAddChannelModal(false)
          fetchGroups()
        }}
        groups={groups}
      />

      {/* Add Playlist Modal */}
      <AddPlaylistModal
        isOpen={showAddPlaylistModal}
        onClose={() => setShowAddPlaylistModal(false)}
        onComplete={() => {
          setShowAddPlaylistModal(false)
          fetchGroups()
        }}
        groups={groups}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false)
          setDeletingGroup(null)
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Group?"
        message={`Are you sure you want to delete "${deletingGroup?.name}"? Channels will be unlinked but not deleted.`}
        confirmText="Delete Group"
        confirmVariant="danger"
        loading={deleteLoading}
      />

      {/* Delete Videos Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteVideosConfirm}
        onClose={() => {
          setShowDeleteVideosConfirm(false)
          setDeletingVideosGroup(null)
        }}
        onConfirm={handleConfirmDeleteVideos}
        title="Delete All Videos?"
        message={`This will permanently delete all ${deletingVideosGroup?.video_count ?? 0} videos from "${deletingVideosGroup?.name}". The channels will remain, but you'll need to sync again to get the videos back.`}
        confirmText="Delete Videos"
        confirmVariant="danger"
        loading={deleteVideosLoading}
      />

      {/* Bottom Navigation */}
      <BottomNav
        activeTab="groups"
        onTabChange={(tab) => {
          if (tab === 'feed') router.push('/')
          if (tab === 'settings') router.push('/settings')
        }}
      />
    </div>
  )
}

// Helper function to format ETA in human-readable format
function formatETA(seconds: number): string {
  if (seconds < 60) return 'less than 1 min'
  const minutes = Math.ceil(seconds / 60)
  if (minutes < 60) return `${minutes} min left`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (remainingMinutes === 0) return `${hours}h left`
  return `${hours}h ${remainingMinutes}m left`
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  )
}

function LinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  )
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  )
}

function PlaylistIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h10m-10 4h6" />
    </svg>
  )
}
