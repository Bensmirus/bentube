'use client'

import { useState, useCallback } from 'react'
import { WaveformIcon } from './groups/EditGroupModal'

type AddVideoPhase = 'input' | 'loading' | 'preview' | 'adding' | 'complete' | 'error'

type VideoPreview = {
  videoId: string
  title: string
  thumbnail: string
  channelId: string
  channelTitle: string
  channelThumbnail: string | null
  publishedAt: string
  duration: string
  viewCount: string
  description: string
  alreadyExists: boolean
  isShort: boolean
}

type Group = {
  id: string
  name: string
  icon: string
  color?: string
}

interface AddVideoModalProps {
  isOpen: boolean
  onClose: () => void
  onComplete: () => void
  groups: Group[]
}

export default function AddVideoModal({
  isOpen,
  onClose,
  onComplete,
  groups,
}: AddVideoModalProps) {
  const [phase, setPhase] = useState<AddVideoPhase>('input')
  const [url, setUrl] = useState('')
  const [videoPreview, setVideoPreview] = useState<VideoPreview | null>(null)
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const resetModal = useCallback(() => {
    setPhase('input')
    setUrl('')
    setVideoPreview(null)
    setSelectedGroupIds([])
    setError(null)
  }, [])

  const handleClose = useCallback(() => {
    resetModal()
    onClose()
  }, [resetModal, onClose])

  const handleLookup = useCallback(async () => {
    if (!url.trim()) return

    setPhase('loading')
    setError(null)

    try {
      const res = await fetch('/api/videos/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to look up video')
        setPhase('error')
        return
      }

      setVideoPreview(data)
      setPhase('preview')
    } catch (err) {
      console.error('Video lookup error:', err)
      setError('Failed to look up video')
      setPhase('error')
    }
  }, [url])

  const handleAddVideo = useCallback(async () => {
    if (!videoPreview || selectedGroupIds.length === 0) return

    setPhase('adding')

    try {
      const res = await fetch('/api/videos/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: videoPreview.videoId,
          title: videoPreview.title,
          thumbnail: videoPreview.thumbnail,
          channelId: videoPreview.channelId,
          channelTitle: videoPreview.channelTitle,
          channelThumbnail: videoPreview.channelThumbnail,
          publishedAt: videoPreview.publishedAt,
          duration: videoPreview.duration,
          groupIds: selectedGroupIds,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to add video')
        setPhase('error')
        return
      }

      setPhase('complete')
    } catch (err) {
      console.error('Add video error:', err)
      setError('Failed to add video')
      setPhase('error')
    }
  }, [videoPreview, selectedGroupIds])

  const toggleGroup = useCallback((groupId: string) => {
    setSelectedGroupIds((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId]
    )
  }, [])

  // Format duration from ISO 8601 to readable format
  const formatDuration = (isoDuration: string) => {
    const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
    if (!match) return isoDuration
    const hours = match[1] ? parseInt(match[1]) : 0
    const minutes = match[2] ? parseInt(match[2]) : 0
    const seconds = match[3] ? parseInt(match[3]) : 0

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  // Format view count
  const formatViewCount = (count: string) => {
    const num = parseInt(count)
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M views`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K views`
    return `${num} views`
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md rounded-2xl border isolate bg-[#ffffff] dark:bg-[#262017] p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Add Video</h2>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Phase: Input */}
        {phase === 'input' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                YouTube Video URL
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
                placeholder="https://youtube.com/watch?v=... or youtu.be/..."
                className="w-full h-11 px-4 rounded-xl border bg-muted/30 text-sm placeholder:text-muted-foreground/50 outline-none focus:ring-2 focus:ring-accent/50"
                autoFocus
              />
              <p className="text-xs text-muted-foreground mt-2">
                Paste a YouTube video URL to add it to your groups
              </p>
            </div>

            <button
              onClick={handleLookup}
              disabled={!url.trim()}
              className="w-full h-11 rounded-xl text-sm font-medium bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Look Up Video
            </button>
          </div>
        )}

        {/* Phase: Loading */}
        {phase === 'loading' && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent mb-4" />
            <p className="text-sm text-muted-foreground">Looking up video...</p>
          </div>
        )}

        {/* Phase: Preview */}
        {phase === 'preview' && videoPreview && (
          <div className="space-y-5">
            {/* Video Thumbnail */}
            <div className="relative aspect-video rounded-xl overflow-hidden bg-muted">
              <img
                src={videoPreview.thumbnail}
                alt={videoPreview.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-white text-xs font-medium">
                {formatDuration(videoPreview.duration)}
              </div>
            </div>

            {/* Video Info */}
            <div>
              <h3 className="font-semibold line-clamp-2">{videoPreview.title}</h3>
              <div className="flex items-center gap-2 mt-2">
                {videoPreview.channelThumbnail && (
                  <img
                    src={videoPreview.channelThumbnail}
                    alt={videoPreview.channelTitle}
                    className="w-6 h-6 rounded-full"
                  />
                )}
                <span className="text-sm text-muted-foreground">{videoPreview.channelTitle}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {formatViewCount(videoPreview.viewCount)}
              </p>
            </div>

            {/* Already exists notice */}
            {videoPreview.alreadyExists && (
              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30">
                <p className="text-sm text-blue-600 dark:text-blue-400">
                  This video is already in your library. You can add it to more groups.
                </p>
              </div>
            )}

            {/* Shorts warning */}
            {videoPreview.isShort && (
              <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
                <p className="text-sm text-yellow-600 dark:text-yellow-400">
                  This is a YouTube Short. Shorts are normally skipped during sync, but you can still add it manually.
                </p>
              </div>
            )}

            {/* Group Selection */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Add to Groups
              </label>
              {groups.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No groups yet. Create a group first.
                </p>
              ) : (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {groups.map((group) => (
                    <label
                      key={group.id}
                      className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer hover:bg-muted/50 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedGroupIds.includes(group.id)}
                        onChange={() => toggleGroup(group.id)}
                        className="w-4 h-4 rounded border-2 accent-accent"
                      />
                      <span className="text-lg">{group.icon === 'waveform' ? <WaveformIcon className="w-5 h-5" /> : group.icon}</span>
                      <span className="text-sm font-medium">{group.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setPhase('input')}
                className="flex-1 h-11 rounded-xl text-sm font-medium bg-muted hover:bg-muted/80 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleAddVideo}
                disabled={selectedGroupIds.length === 0}
                className="flex-1 h-11 rounded-xl text-sm font-medium bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Video
              </button>
            </div>
          </div>
        )}

        {/* Phase: Adding */}
        {phase === 'adding' && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent mb-4" />
            <p className="text-sm text-muted-foreground">Adding video...</p>
          </div>
        )}

        {/* Phase: Complete */}
        {phase === 'complete' && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
              <CheckIcon className="w-8 h-8 text-green-500" />
            </div>
            <h3 className="font-semibold mb-2">Video Added!</h3>
            <p className="text-sm text-muted-foreground text-center mb-6">
              The video has been added to your selected groups.
            </p>
            <button
              onClick={() => {
                onComplete()
                handleClose()
              }}
              className="px-6 py-2.5 rounded-xl text-sm font-medium bg-accent text-white hover:bg-accent/90 transition-colors"
            >
              Done
            </button>
          </div>
        )}

        {/* Phase: Error */}
        {phase === 'error' && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
              <ErrorIcon className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="font-semibold mb-2">Error</h3>
            <p className="text-sm text-muted-foreground text-center mb-6">
              {error}
            </p>
            <button
              onClick={() => setPhase('input')}
              className="px-6 py-2.5 rounded-xl text-sm font-medium bg-accent text-white hover:bg-accent/90 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  )
}
