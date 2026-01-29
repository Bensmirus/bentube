'use client'

import { useState, useCallback } from 'react'
import { WaveformIcon } from './groups/EditGroupModal'

type AddChannelPhase = 'input' | 'loading' | 'preview' | 'importing' | 'complete' | 'error'

type ChannelPreview = {
  channelId: string
  title: string
  thumbnail: string
  subscriberCount: string
  videoCount: number
  description: string
  uploadsPlaylistId: string
  hasWarning: boolean
  warningMessage: string | null
}

type Group = {
  id: string
  name: string
  icon: string
  color?: string
}

interface AddChannelModalProps {
  isOpen: boolean
  onClose: () => void
  onComplete: () => void
  groups: Group[]
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
  const [videoLimit, setVideoLimit] = useState<number | null>(50) // null means no limit
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState({ current: 0, total: 0, message: '' })

  const resetModal = useCallback(() => {
    setPhase('input')
    setUrl('')
    setChannelPreview(null)
    setSelectedGroupIds([])
    setError(null)
    setProgress({ current: 0, total: 0, message: '' })
    setVideoLimit(50)
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
      const res = await fetch('/api/channels/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to look up channel')
        setPhase('error')
        return
      }

      setChannelPreview(data)
      setPhase('preview')
    } catch (err) {
      console.error('Channel lookup error:', err)
      setError('Failed to look up channel')
      setPhase('error')
    }
  }, [url])

  const handleAddChannel = useCallback(async () => {
    if (!channelPreview || selectedGroupIds.length === 0) return

    setPhase('importing')
    setProgress({ current: 0, total: 100, message: 'Adding channel...' })

    try {
      const res = await fetch('/api/channels/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: channelPreview.channelId,
          title: channelPreview.title,
          thumbnail: channelPreview.thumbnail,
          uploadsPlaylistId: channelPreview.uploadsPlaylistId,
          groupIds: selectedGroupIds,
          videoLimit: videoLimit,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to add channel')
        setPhase('error')
        return
      }

      setProgress({
        current: data.videosImported,
        total: data.videosImported,
        message: `Imported ${data.videosImported} videos`,
      })
      setPhase('complete')
    } catch (err) {
      console.error('Add channel error:', err)
      setError('Failed to add channel')
      setPhase('error')
    }
  }, [channelPreview, selectedGroupIds, videoLimit])

  const toggleGroup = useCallback((groupId: string) => {
    setSelectedGroupIds((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId]
    )
  }, [])

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
          <h2 className="text-lg font-semibold">Add Channel</h2>
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
                YouTube Channel URL
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
                placeholder="https://youtube.com/@channel or channel URL"
                className="w-full h-11 px-4 rounded-xl border bg-muted/30 text-sm placeholder:text-muted-foreground/50 outline-none focus:ring-2 focus:ring-accent/50"
                autoFocus
              />
              <p className="text-xs text-muted-foreground mt-2">
                Paste a YouTube channel URL, @handle, or channel page link
              </p>
            </div>

            <button
              onClick={handleLookup}
              disabled={!url.trim()}
              className="w-full h-11 rounded-xl text-sm font-medium bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Look Up Channel
            </button>
          </div>
        )}

        {/* Phase: Loading */}
        {phase === 'loading' && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent mb-4" />
            <p className="text-sm text-muted-foreground">Looking up channel...</p>
          </div>
        )}

        {/* Phase: Preview */}
        {phase === 'preview' && channelPreview && (
          <div className="space-y-5">
            {/* Channel Info */}
            <div className="flex items-start gap-4">
              {channelPreview.thumbnail && (
                <img
                  src={channelPreview.thumbnail}
                  alt={channelPreview.title}
                  className="w-16 h-16 rounded-full object-cover shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold truncate">{channelPreview.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {channelPreview.subscriberCount}
                </p>
                <p className="text-sm text-muted-foreground">
                  {channelPreview.videoCount.toLocaleString()} videos
                </p>
              </div>
            </div>

            {/* Warnings */}
            {channelPreview.hasWarning && channelPreview.warningMessage && (
              <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
                <p className="text-sm text-yellow-600 dark:text-yellow-400">
                  ⚠️ {channelPreview.warningMessage}
                </p>
              </div>
            )}

            {channelPreview.videoCount === 0 && (
              <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
                <p className="text-sm text-yellow-600 dark:text-yellow-400">
                  ⚠️ This channel has no videos. You can still add it.
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

            {/* Video Limit */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Number of videos to import
              </label>
              <select
                value={videoLimit === null ? 'all' : videoLimit.toString()}
                onChange={(e) => setVideoLimit(e.target.value === 'all' ? null : parseInt(e.target.value))}
                className="w-full h-11 px-4 rounded-xl border bg-muted/30 text-sm outline-none focus:ring-2 focus:ring-accent/50"
              >
                <option value="10">10 videos</option>
                <option value="25">25 videos</option>
                <option value="50">50 videos</option>
                <option value="100">100 videos</option>
                <option value="200">200 videos</option>
                <option value="all">All videos</option>
              </select>
              <p className="text-xs text-muted-foreground mt-2">
                Most recent videos will be imported first
              </p>
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
                onClick={handleAddChannel}
                disabled={selectedGroupIds.length === 0}
                className="flex-1 h-11 rounded-xl text-sm font-medium bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Channel
              </button>
            </div>
          </div>
        )}

        {/* Phase: Importing */}
        {phase === 'importing' && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent mb-4" />
            <p className="text-sm text-muted-foreground">{progress.message || 'Importing videos...'}</p>
            {progress.total > 0 && (
              <div className="w-full mt-4">
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent transition-all duration-300"
                    style={{ width: `${Math.min((progress.current / progress.total) * 100, 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Phase: Complete */}
        {phase === 'complete' && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
              <CheckIcon className="w-8 h-8 text-green-500" />
            </div>
            <h3 className="font-semibold mb-2">Channel Added!</h3>
            <p className="text-sm text-muted-foreground text-center mb-6">
              {progress.message}
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
