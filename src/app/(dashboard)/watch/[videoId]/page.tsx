'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { EmbeddedVideoPlayer } from '@/components/EmbeddedVideoPlayer'
import { WatchProgressProvider } from '@/hooks/useWatchProgress'
import { usePlaylist } from '@/hooks/usePlaylist'
import PlaylistControls from '@/components/PlaylistControls'
import AutoAdvanceOverlay from '@/components/AutoAdvanceOverlay'
import QueuePanel from '@/components/QueuePanel'
import BottomNav from '@/components/BottomNav'

type VideoData = {
  id: string
  youtube_id: string
  title: string
  thumbnail: string | null
  duration_seconds: number | null
  is_short: boolean
  published_at: string | null
  channel_id: string
  channel_title: string
  channel_thumbnail: string | null
  watch_progress: number
  watch_progress_seconds: number
  watch_later: boolean
}

type VideoGroup = {
  id: string
  name: string
  icon: string
}

type VideoTag = {
  id: string
  name: string
  group_id: string
}

export default function WatchPage() {
  const params = useParams()
  const router = useRouter()
  const videoId = params.videoId as string

  const [video, setVideo] = useState<VideoData | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [currentTime, setCurrentTime] = useState(0)
  const [showAutoAdvance, setShowAutoAdvance] = useState(false)
  const [showQueuePanel, setShowQueuePanel] = useState(false)
  const [showTagDialog, setShowTagDialog] = useState(false)
  const [videoGroups, setVideoGroups] = useState<VideoGroup[]>([])
  const [videoTags, setVideoTags] = useState<VideoTag[]>([])
  const [selectedTagGroup, setSelectedTagGroup] = useState<string | null>(null)
  const [tagInput, setTagInput] = useState('')

  const { playlist, hasNext, hasPrevious, next, previous, clear: clearPlaylist } = usePlaylist()

  // Landscape mode detection for immersive video experience
  const [isLandscape, setIsLandscape] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    const checkOrientation = () => {
      setIsLandscape(window.matchMedia('(orientation: landscape)').matches && window.innerWidth < 1024)
    }

    checkMobile()
    checkOrientation()

    window.addEventListener('resize', checkMobile)
    window.addEventListener('resize', checkOrientation)
    window.addEventListener('orientationchange', checkOrientation)

    return () => {
      window.removeEventListener('resize', checkMobile)
      window.removeEventListener('resize', checkOrientation)
      window.removeEventListener('orientationchange', checkOrientation)
    }
  }, [])

  // Playback rate with localStorage persistence
  const [playbackRate, setPlaybackRate] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('playbackRate')
      if (saved) {
        const rate = parseFloat(saved)
        if (rate >= 0.25 && rate <= 2) return rate
      }
    }
    return 1
  })
  const playerRef = useRef<{
    seekTo: (seconds: number) => void
    setPlaybackRate: (rate: number) => void
    getPlaybackRate: () => number
    togglePlay?: () => void
    isPlaying?: () => boolean
  } | null>(null)

  // Persist playback rate to localStorage
  useEffect(() => {
    localStorage.setItem('playbackRate', playbackRate.toString())
  }, [playbackRate])

  // Keyboard shortcuts for playlist navigation
  useEffect(() => {
    if (!playlist.isActive) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      switch (e.key.toLowerCase()) {
        case 'n':
          if (hasNext) next()
          break
        case 'p':
          if (hasPrevious) previous()
          break
        case 'q':
          setShowQueuePanel(prev => !prev)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [playlist.isActive, hasNext, hasPrevious, next, previous])

  // Keyboard shortcut for play/pause (spacebar)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      if (e.code === 'Space') {
        e.preventDefault() // Prevent page scroll
        playerRef.current?.togglePlay?.()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    async function fetchVideo() {
      try {
        const supabase = createClient()

        // Get user's internal ID
        const { userId: uid, error: userError } = await getInternalUserId(supabase)

        if (userError || !uid) {
          if (userError === 'Unauthorized') {
            router.push('/login')
            return
          }
          setError('Failed to get user data')
          setLoading(false)
          return
        }

        setUserId(uid)

        // Fetch video with watch status
        const { data: videoData, error: videoError } = await supabase
          .from('videos')
          .select(`
            id,
            youtube_id,
            title,
            thumbnail,
            duration_seconds,
            is_short,
            published_at,
            channel_id,
            channels (
              title,
              thumbnail
            )
          `)
          .eq('id', videoId)
          .eq('user_id', uid)
          .single()

        if (videoError || !videoData) {
          setError('Video not found')
          setLoading(false)
          return
        }

        // Get watch status
        const { data: watchStatus } = await supabase
          .from('watch_status')
          .select('watch_progress, watch_progress_seconds, watch_later')
          .eq('video_id', videoId)
          .eq('user_id', uid)
          .single()

        // Type the channel data
        const channelData = videoData.channels as { title: string; thumbnail: string | null } | null

        setVideo({
          id: videoData.id,
          youtube_id: videoData.youtube_id,
          title: videoData.title,
          thumbnail: videoData.thumbnail,
          duration_seconds: videoData.duration_seconds,
          is_short: videoData.is_short,
          published_at: videoData.published_at,
          channel_id: videoData.channel_id,
          channel_title: channelData?.title || 'Unknown',
          channel_thumbnail: channelData?.thumbnail || null,
          watch_progress: watchStatus?.watch_progress || 0,
          watch_progress_seconds: watchStatus?.watch_progress_seconds || 0,
          watch_later: watchStatus?.watch_later || false,
        })
        setLoading(false)
      } catch (err) {
        console.error('Error fetching video:', err)
        setError('Failed to load video')
        setLoading(false)
      }
    }

    fetchVideo()
  }, [videoId, router])

  // Fetch groups for the video's channel and existing tags
  useEffect(() => {
    if (!video || !userId) return

    const currentVideo = video
    const currentUserId = userId

    async function fetchGroupsAndTags() {
      try {
        const supabase = createClient()

        // Fetch groups this channel belongs to
        const { data: channelGroups } = await supabase
          .from('channel_groups')
          .select('channel_group_id, channel_groups:channel_group_id(id, name, icon)')
          .eq('channel_id', currentVideo.channel_id)
          .eq('user_id', currentUserId)

        if (channelGroups) {
          const groups = channelGroups
            .map((cg: { channel_groups: VideoGroup | VideoGroup[] | null }) => {
              const g = cg.channel_groups
              if (Array.isArray(g)) return g[0]
              return g
            })
            .filter(Boolean) as VideoGroup[]
          setVideoGroups(groups)
          if (groups.length > 0 && !selectedTagGroup) {
            setSelectedTagGroup(groups[0].id)
          }
        }

        // Fetch existing tags for this video
        const { data: tagData } = await supabase
          .from('video_tags')
          .select('tag_id, tags(id, name, group_id)')
          .eq('video_id', currentVideo.id)
          .eq('user_id', currentUserId)

        if (tagData) {
          const tags = tagData
            .map((vt: { tags: VideoTag | VideoTag[] | null }) => {
              const t = vt.tags
              if (Array.isArray(t)) return t[0]
              return t
            })
            .filter(Boolean) as VideoTag[]
          setVideoTags(tags)
        }
      } catch (err) {
        console.error('Error fetching groups/tags:', err)
      }
    }

    fetchGroupsAndTags()
  }, [video, userId, selectedTagGroup])

  const handleBack = useCallback(() => {
    if (playlist.isActive) {
      clearPlaylist()
      router.push('/feed')
    } else {
      router.back()
    }
  }, [router, playlist.isActive, clearPlaylist])

  const formatTimestamp = useCallback((seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`
  }, [])

  const insertTimestamp = useCallback(() => {
    const timestamp = formatTimestamp(currentTime)
    const cursorPos = (document.querySelector('textarea') as HTMLTextAreaElement)?.selectionStart || notes.length
    const newNotes = notes.slice(0, cursorPos) + `[${timestamp}] ` + notes.slice(cursorPos)
    setNotes(newNotes)
  }, [currentTime, notes, formatTimestamp])

  const handleTimestampClick = useCallback((timestamp: string) => {
    // Parse timestamp like "1:23" or "1:23:45"
    const parts = timestamp.split(':').map(Number)
    let seconds = 0

    if (parts.length === 2) {
      seconds = parts[0] * 60 + parts[1]
    } else if (parts.length === 3) {
      seconds = parts[0] * 3600 + parts[1] * 60 + parts[2]
    }

    playerRef.current?.seekTo(seconds)
  }, [])

  // Sync playback rate with YouTube player whenever it changes
  useEffect(() => {
    if (playerRef.current?.setPlaybackRate) {
      playerRef.current.setPlaybackRate(playbackRate)
    }
  }, [playbackRate])

  const changePlaybackSpeed = useCallback((delta: number) => {
    setPlaybackRate(currentRate => {
      const newRate = currentRate + delta
      // Round to avoid floating point issues and clamp to valid range
      return Math.round(Math.max(0.25, Math.min(2, newRate)) * 100) / 100
    })
  }, [])

  const resetPlaybackSpeed = useCallback(() => {
    setPlaybackRate(1)
  }, [])

  const handleToggleWatchLater = useCallback(async () => {
    if (!video) return
    const newWatchLater = !video.watch_later

    // Optimistic update
    setVideo(prev => prev ? { ...prev, watch_later: newWatchLater } : null)

    try {
      const res = await fetch(`/api/feed/${video.id}/watch-later`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watch_later: newWatchLater }),
      })
      if (!res.ok) {
        // Revert on error
        setVideo(prev => prev ? { ...prev, watch_later: !newWatchLater } : null)
      }
    } catch {
      // Revert on error
      setVideo(prev => prev ? { ...prev, watch_later: !newWatchLater } : null)
    }
  }, [video])

  const handleDelete = useCallback(async () => {
    if (!video) return
    if (!confirm('Delete this video? It will be moved to trash and won\'t appear again during sync.')) {
      return
    }

    try {
      const res = await fetch(`/api/feed/${video.id}/delete`, {
        method: 'DELETE',
      })
      if (res.ok) {
        router.back()
      }
    } catch (error) {
      console.error('Failed to delete video:', error)
    }
  }, [video, router])

  const handleAddTag = useCallback(async () => {
    if (!video || !selectedTagGroup || !tagInput.trim()) return

    const newTagNames = tagInput.split(',').map(t => t.trim()).filter(Boolean)
    if (newTagNames.length === 0) return

    // Combine existing tags for this group with new ones
    const existingTagsForGroup = videoTags.filter(t => t.group_id === selectedTagGroup)
    const allTagNames = [...existingTagsForGroup.map(t => t.name), ...newTagNames]

    try {
      const res = await fetch(`/api/videos/${video.id}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId: selectedTagGroup,
          tagNames: allTagNames,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        // Update local state with tags from other groups + new tags
        const otherGroupTags = videoTags.filter(t => t.group_id !== selectedTagGroup)
        setVideoTags([...otherGroupTags, ...(data.tags || [])])
        setTagInput('')
      }
    } catch (error) {
      console.error('Failed to add tag:', error)
    }
  }, [video, selectedTagGroup, tagInput, videoTags])

  const handleRemoveTag = useCallback(async (tagToRemove: VideoTag) => {
    if (!video) return

    // Get remaining tags for the same group
    const remainingTagsForGroup = videoTags
      .filter(t => t.group_id === tagToRemove.group_id && t.id !== tagToRemove.id)
      .map(t => t.name)

    try {
      const res = await fetch(`/api/videos/${video.id}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId: tagToRemove.group_id,
          tagNames: remainingTagsForGroup,
        }),
      })

      if (res.ok) {
        setVideoTags(prev => prev.filter(t => t.id !== tagToRemove.id))
      }
    } catch (error) {
      console.error('Failed to remove tag:', error)
    }
  }, [video, videoTags])

  const renderNotesWithClickableTimestamps = useCallback((text: string) => {
    // Split text by timestamp pattern [HH:MM:SS] or [MM:SS]
    const parts = text.split(/(\[\d{1,2}:\d{2}(?::\d{2})?\])/g)

    return parts.map((part, index) => {
      const timestampMatch = part.match(/\[(\d{1,2}:\d{2}(?::\d{2})?)\]/)
      if (timestampMatch) {
        return (
          <button
            key={index}
            onClick={() => handleTimestampClick(timestampMatch[1])}
            className="text-accent hover:text-accent/80 hover:underline font-medium cursor-pointer"
          >
            {part}
          </button>
        )
      }
      return <span key={index}>{part}</span>
    })
  }, [handleTimestampClick])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Loading video...</p>
        </div>
      </div>
    )
  }

  if (error || !video) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h3 className="text-lg font-medium text-red-600">{error || 'Video not found'}</h3>
          <button
            onClick={handleBack}
            className="mt-4 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90"
          >
            Go back
          </button>
        </div>
      </div>
    )
  }

  // In landscape mobile mode, show a more immersive video experience
  const isImmersiveMode = isLandscape && isMobile

  return (
    <WatchProgressProvider userId={userId || undefined}>
      <div className={`min-h-screen bg-background ${isImmersiveMode ? 'overflow-hidden' : 'pb-16'}`}>

        {/* Main content - Responsive layout */}
        <div className={`max-w-[1800px] mx-auto ${isImmersiveMode ? 'h-screen' : ''}`}>
          <div className={`flex flex-col lg:flex-row lg:gap-6 lg:px-6 lg:py-6 ${isImmersiveMode ? 'h-full' : ''}`}>
            {/* Main column - Video and info */}
            <div className={`flex-1 lg:max-w-[1100px] ${isImmersiveMode ? 'h-full' : ''}`}>
              {/* Video player - Full screen in landscape mobile, otherwise standard layout */}
              <div className={`relative w-full bg-black ${isImmersiveMode ? 'h-full' : ''}`}>
                <div className={isImmersiveMode ? 'h-full' : 'aspect-video'}>
                  {/* Floating back button in immersive mode */}
                  {isImmersiveMode && (
                    <button
                      onClick={handleBack}
                      className="absolute top-2 left-2 z-30 p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
                    >
                      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                  )}
                  <EmbeddedVideoPlayer
                    youtubeId={video.youtube_id}
                    videoId={video.id}
                    durationSeconds={video.duration_seconds || 0}
                    initialProgress={video.watch_progress}
                    initialProgressSeconds={video.watch_progress_seconds}
                    isShort={video.is_short}
                    autoplay
                    onTimeUpdate={setCurrentTime}
                    playbackRate={playbackRate}
                    onPlaybackRateChange={setPlaybackRate}
                    playerRef={playerRef}
                    onEnded={() => {
                      if (playlist.isActive) {
                        setShowAutoAdvance(true)
                      }
                    }}
                  />
                  <AutoAdvanceOverlay
                    isVisible={showAutoAdvance}
                    onCancel={() => setShowAutoAdvance(false)}
                  />
                </div>
              </div>

              {/* Content below video - hidden in immersive mode */}
              <div className={`px-3 sm:px-4 lg:px-0 py-3 sm:py-4 ${isImmersiveMode ? 'hidden' : ''}`}>
                {/* Playlist controls - only show when playlist is active */}
                {playlist.isActive && (
                  <div className="mb-3 sm:mb-4">
                    <PlaylistControls
                      onToggleQueue={() => setShowQueuePanel(!showQueuePanel)}
                      showQueueButton
                    />
                  </div>
                )}

                {/* Title - hidden on mobile (shown in header), visible on larger screens */}
                <h1 className="hidden sm:block text-lg sm:text-xl font-semibold mb-2 sm:mb-3">{video.title}</h1>

                {/* Mobile: Compact info row */}
                <div className="sm:hidden mb-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{video.channel_title}</span>
                    {video.published_at && (
                      <>
                        <span>•</span>
                        <span>{new Date(video.published_at).toLocaleDateString()}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Desktop: Channel info and actions row */}
                <div className="hidden sm:flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {video.channel_thumbnail ? (
                      <img
                        src={video.channel_thumbnail}
                        alt={video.channel_title}
                        className="w-10 h-10 rounded-full"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                        {video.channel_title.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="font-medium">{video.channel_title}</p>
                      {video.published_at && (
                        <p className="text-xs text-muted-foreground">
                          {new Date(video.published_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Desktop action buttons */}
                  <div className="flex items-center gap-2">
                    <a
                      href={`https://www.youtube.com/watch?v=${video.youtube_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-muted hover:bg-muted/80 transition-colors"
                      title="Open in YouTube"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/>
                      </svg>
                      <span>YouTube</span>
                    </a>
                    <button
                      onClick={handleToggleWatchLater}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                        video.watch_later
                          ? 'bg-accent text-white hover:bg-accent/90'
                          : 'bg-muted hover:bg-muted/80'
                      }`}
                      title={video.watch_later ? 'Remove from Watch Later' : 'Add to Watch Later'}
                    >
                      <span>{video.watch_later ? '✓' : '⏰'}</span>
                      <span>{video.watch_later ? 'In Watch Later' : 'Watch Later'}</span>
                    </button>
                    <div className="relative">
                      <button
                        onClick={() => setShowTagDialog(!showTagDialog)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                          videoTags.length > 0
                            ? 'bg-accent text-white hover:bg-accent/90'
                            : 'bg-muted hover:bg-muted/80'
                        }`}
                        title="Manage tags"
                      >
                        <span>🏷️</span>
                        <span>Tags{videoTags.length > 0 ? ` (${videoTags.length})` : ''}</span>
                      </button>
                      {/* Tag dialog */}
                      {showTagDialog && (
                        <div className="absolute right-0 top-full mt-2 w-80 bg-[#ffffff] dark:bg-[#262017] border rounded-lg shadow-lg p-4 z-20">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="font-medium">Manage Tags</h4>
                            <button
                              onClick={() => setShowTagDialog(false)}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              ✕
                            </button>
                          </div>

                          {videoGroups.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              This channel isn&apos;t in any group yet. Add it to a group first to use tags.
                            </p>
                          ) : (
                            <>
                              {/* Group selector */}
                              <div className="mb-3">
                                <label className="text-xs text-muted-foreground mb-1 block">Group</label>
                                <select
                                  value={selectedTagGroup || ''}
                                  onChange={(e) => setSelectedTagGroup(e.target.value)}
                                  className="w-full px-3 py-1.5 text-sm border rounded-lg bg-background"
                                >
                                  {videoGroups.map((g) => (
                                    <option key={g.id} value={g.id}>
                                      {g.icon} {g.name}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {/* Existing tags */}
                              {videoTags.length > 0 && (
                                <div className="mb-3">
                                  <label className="text-xs text-muted-foreground mb-1 block">Current tags</label>
                                  <div className="flex flex-wrap gap-1">
                                    {videoTags.map((tag) => (
                                      <span
                                        key={tag.id}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted rounded text-xs"
                                      >
                                        {tag.name}
                                        <button
                                          onClick={() => handleRemoveTag(tag)}
                                          className="text-muted-foreground hover:text-red-500"
                                        >
                                          ×
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Add new tag */}
                              <div>
                                <label className="text-xs text-muted-foreground mb-1 block">Add tags (comma separated)</label>
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    value={tagInput}
                                    onChange={(e) => setTagInput(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault()
                                        handleAddTag()
                                      }
                                    }}
                                    placeholder="e.g. tutorial, beginner"
                                    className="flex-1 px-3 py-1.5 text-sm border rounded-lg bg-background"
                                  />
                                  <button
                                    onClick={handleAddTag}
                                    disabled={!tagInput.trim()}
                                    className="px-3 py-1.5 text-sm bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    Add
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={handleDelete}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-muted hover:bg-red-500 hover:text-white transition-colors"
                      title="Delete video"
                    >
                      <span>🗑️</span>
                      <span>Delete</span>
                    </button>
                  </div>
                </div>

                {/* Mobile action buttons - horizontal scroll with proper touch targets */}
                <div className="sm:hidden flex items-center gap-2 overflow-x-auto pb-3 -mx-3 px-3 no-scrollbar">
                  <a
                    href={`https://www.youtube.com/watch?v=${video.youtube_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-4 min-h-[44px] rounded-full text-sm bg-muted hover:bg-muted/80 transition-colors whitespace-nowrap"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/>
                    </svg>
                    <span>YouTube</span>
                  </a>
                  <button
                    onClick={handleToggleWatchLater}
                    className={`flex items-center gap-1.5 px-4 min-h-[44px] rounded-full text-sm transition-colors whitespace-nowrap ${
                      video.watch_later
                        ? 'bg-accent text-white'
                        : 'bg-muted'
                    }`}
                  >
                    <span>{video.watch_later ? '✓' : '⏰'}</span>
                    <span>{video.watch_later ? 'Saved' : 'Later'}</span>
                  </button>
                  <button
                    onClick={() => setShowTagDialog(!showTagDialog)}
                    className={`flex items-center gap-1.5 px-4 min-h-[44px] rounded-full text-sm transition-colors whitespace-nowrap ${
                      videoTags.length > 0
                        ? 'bg-accent text-white'
                        : 'bg-muted'
                    }`}
                  >
                    <span>🏷️</span>
                    <span>Tags{videoTags.length > 0 ? ` (${videoTags.length})` : ''}</span>
                  </button>
                  <button
                    onClick={handleDelete}
                    className="flex items-center gap-1.5 px-4 min-h-[44px] rounded-full text-sm bg-muted hover:bg-red-500 hover:text-white transition-colors whitespace-nowrap"
                  >
                    <span>🗑️</span>
                    <span>Delete</span>
                  </button>
                </div>

                {/* Mobile tag dialog - bottom sheet style */}
                {showTagDialog && (
                  <div className="sm:hidden fixed inset-0 z-50">
                    <div
                      className="absolute inset-0 bg-black/50"
                      onClick={() => setShowTagDialog(false)}
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-[#ffffff] dark:bg-[#262017] rounded-t-2xl p-4 animate-slide-up max-h-[70vh] overflow-y-auto">
                      <div className="w-12 h-1 bg-muted rounded-full mx-auto mb-4" />
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="font-semibold text-lg">Manage Tags</h4>
                        <button
                          onClick={() => setShowTagDialog(false)}
                          className="p-2 -mr-2 text-muted-foreground hover:text-foreground"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>

                      {videoGroups.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          This channel isn&apos;t in any group yet. Add it to a group first to use tags.
                        </p>
                      ) : (
                        <>
                          <div className="mb-4">
                            <label className="text-sm text-muted-foreground mb-2 block">Group</label>
                            <select
                              value={selectedTagGroup || ''}
                              onChange={(e) => setSelectedTagGroup(e.target.value)}
                              className="w-full px-4 py-3 text-base border rounded-xl bg-background"
                            >
                              {videoGroups.map((g) => (
                                <option key={g.id} value={g.id}>
                                  {g.icon} {g.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          {videoTags.length > 0 && (
                            <div className="mb-4">
                              <label className="text-sm text-muted-foreground mb-2 block">Current tags</label>
                              <div className="flex flex-wrap gap-2">
                                {videoTags.map((tag) => (
                                  <span
                                    key={tag.id}
                                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-muted rounded-full text-sm"
                                  >
                                    {tag.name}
                                    <button
                                      onClick={() => handleRemoveTag(tag)}
                                      className="text-muted-foreground hover:text-red-500"
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          <div>
                            <label className="text-sm text-muted-foreground mb-2 block">Add tags (comma separated)</label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    handleAddTag()
                                  }
                                }}
                                placeholder="e.g. tutorial, beginner"
                                className="flex-1 px-4 py-3 text-base border rounded-xl bg-background"
                              />
                              <button
                                onClick={handleAddTag}
                                disabled={!tagInput.trim()}
                                className="px-5 py-3 text-base bg-accent text-white rounded-xl hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                              >
                                Add
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Mobile: Playback speed controls - proper touch targets */}
                <div className="sm:hidden flex items-center justify-between p-3 bg-muted rounded-xl mb-4">
                  <span className="text-sm font-medium text-muted-foreground">Speed</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => changePlaybackSpeed(-0.25)}
                      disabled={playbackRate <= 0.25}
                      className="flex items-center justify-center w-11 h-11 rounded-full bg-background transition-colors disabled:opacity-40 active:bg-accent/10"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                      </svg>
                    </button>
                    <button
                      onClick={resetPlaybackSpeed}
                      className="text-base font-bold min-w-[3.5rem] min-h-[44px] text-center active:text-accent"
                    >
                      {playbackRate === 1 ? '1x' : `${playbackRate % 1 === 0 ? playbackRate : playbackRate.toFixed(2)}x`}
                    </button>
                    <button
                      onClick={() => changePlaybackSpeed(0.25)}
                      disabled={playbackRate >= 2}
                      className="flex items-center justify-center w-11 h-11 rounded-full bg-background transition-colors disabled:opacity-40 active:bg-accent/10"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Mobile: Collapsible notes section */}
                <div className="lg:hidden">
                  <details className="group">
                    <summary className="flex items-center justify-between p-3 bg-card border rounded-xl cursor-pointer list-none">
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        <span className="font-medium">Notes</span>
                        {notes && <span className="text-xs text-muted-foreground">({notes.length} chars)</span>}
                      </div>
                      <svg className="w-5 h-5 text-muted-foreground transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </summary>
                    <div className="mt-3 p-3 bg-card border rounded-xl">
                      <div className="flex items-center justify-between mb-3">
                        <button
                          onClick={insertTimestamp}
                          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-accent text-white rounded-lg"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span>Add Timestamp</span>
                        </button>
                      </div>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Take notes while watching..."
                        className="w-full h-[200px] p-3 text-base border rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent bg-background"
                      />
                      {notes && (
                        <div className="mt-3 p-3 bg-muted rounded-xl text-sm">
                          <p className="text-xs font-medium text-muted-foreground mb-2">Preview (tap timestamps to jump):</p>
                          <div className="whitespace-pre-wrap break-words">
                            {renderNotesWithClickableTimestamps(notes)}
                          </div>
                        </div>
                      )}
                    </div>
                  </details>
                </div>
              </div>
            </div>

            {/* Right column - Notes (desktop only) */}
            <div className="hidden lg:block w-[400px] flex-shrink-0 py-6">
              <div className="bg-card border rounded-lg p-4 sticky top-20">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">Your Notes</h3>
                  <button
                    onClick={insertTimestamp}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent text-white rounded-md hover:bg-accent/90 transition-colors"
                    title="Insert current timestamp"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Timestamp</span>
                  </button>
                </div>

                {/* Playback Speed Controls */}
                <div className="flex items-center gap-2 mb-3 p-2 bg-muted rounded-lg">
                  <span className="text-xs font-medium text-muted-foreground">Speed:</span>
                  <button
                    onClick={() => changePlaybackSpeed(-0.25)}
                    disabled={playbackRate <= 0.25}
                    className="flex items-center justify-center w-7 h-7 rounded-md bg-background transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent/10 disabled:hover:bg-background"
                    title={playbackRate <= 0.25 ? "Minimum speed" : "Decrease speed"}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                    </svg>
                  </button>
                  <button
                    onClick={resetPlaybackSpeed}
                    className="text-sm font-semibold min-w-[3rem] text-center hover:text-accent transition-colors"
                    title="Click to reset to 1x"
                  >
                    {playbackRate === 1 ? '1x' : `${playbackRate % 1 === 0 ? playbackRate : playbackRate.toFixed(2)}x`}
                  </button>
                  <button
                    onClick={() => changePlaybackSpeed(0.25)}
                    disabled={playbackRate >= 2}
                    className="flex items-center justify-center w-7 h-7 rounded-md bg-background transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent/10 disabled:hover:bg-background"
                    title={playbackRate >= 2 ? "Maximum speed" : "Increase speed"}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </div>

                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Take notes while watching... Click timestamps to jump to that time."
                  className="w-full h-[520px] p-3 text-sm border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent bg-background"
                />

                {/* Preview area with clickable timestamps */}
                {notes && (
                  <div className="mt-3 p-3 bg-muted rounded-lg text-sm max-h-[200px] overflow-y-auto">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Preview (clickable timestamps):</p>
                    <div className="whitespace-pre-wrap break-words">
                      {renderNotesWithClickableTimestamps(notes)}
                    </div>
                  </div>
                )}

                <p className="text-xs text-muted-foreground mt-2">
                  Click the timestamp button to insert the current video time. Timestamps in the preview are clickable.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Queue panel - slides in from right */}
        <QueuePanel
          isOpen={showQueuePanel}
          onClose={() => setShowQueuePanel(false)}
        />

        {/* Bottom Navigation - hidden in immersive mode */}
        {!isImmersiveMode && (
          <BottomNav
            activeTab="feed"
            onTabChange={(tab) => {
              if (tab === 'feed') {
                router.push('/feed')
              } else if (tab === 'groups') {
                router.push('/groups')
              } else if (tab === 'settings') {
                router.push('/settings')
              }
            }}
          />
        )}
      </div>
    </WatchProgressProvider>
  )
}
