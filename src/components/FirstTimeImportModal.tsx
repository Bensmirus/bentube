'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

type ImportPhase = 'welcome' | 'limit-select' | 'importing' | 'complete' | 'error'

interface FirstTimeImportModalProps {
  isOpen: boolean
  onClose: () => void
  onComplete: () => void
  onSkip: () => void
}

// Progress polling interval in ms
const PROGRESS_POLL_INTERVAL = 1000

// Video limit options
const VIDEO_LIMIT_OPTIONS = [
  { value: 50, label: '50 videos', description: 'Quick import' },
  { value: 100, label: '100 videos', description: 'Recommended' },
  { value: 250, label: '250 videos', description: 'More history' },
  { value: 500, label: '500 videos', description: 'Extended history' },
  { value: null, label: 'All videos', description: 'Everything (slow)' },
]

export default function FirstTimeImportModal({
  isOpen,
  onClose,
  onComplete,
  onSkip,
}: FirstTimeImportModalProps) {
  const [phase, setPhase] = useState<ImportPhase>('welcome')
  const [videoLimit, setVideoLimit] = useState<number | null>(100)
  const [progress, setProgress] = useState({ current: 0, total: 0, message: '' })
  const [error, setError] = useState<string | null>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setPhase('welcome')
      setProgress({ current: 0, total: 0, message: '' })
      setError(null)
    }
  }, [isOpen])

  // Poll for real-time progress updates during video sync
  const startProgressPolling = useCallback(() => {
    // Clear any existing interval
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
    }

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/sync/progress')
        if (res.ok) {
          const data = await res.json()
          if (data.progress && data.isActive) {
            setProgress({
              current: data.progress.current || 0,
              total: data.progress.total || 0,
              message: data.progress.message || 'Syncing...',
            })
          }
        }
      } catch {
        // Ignore polling errors
      }
    }, PROGRESS_POLL_INTERVAL)
  }, [])

  const stopProgressPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
  }, [])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => stopProgressPolling()
  }, [stopProgressPolling])

  // Rollback function - delete all imported data on failure
  const rollbackImport = useCallback(async () => {
    try {
      // Delete all videos and channels for this user
      await fetch('/api/videos/delete-all', { method: 'DELETE' })
      // Delete all groups (which cascades to group_channels)
      await fetch('/api/groups/delete-all', { method: 'DELETE' })
    } catch {
      // Best effort - ignore rollback errors
      console.error('Rollback failed')
    }
  }, [])

  const handleStartImport = useCallback(async () => {
    setPhase('importing')
    setProgress({ current: 0, total: 0, message: 'Saving your preferences...' })
    setError(null)

    try {
      // Step 0: Save video limit preference
      await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoImportLimit: videoLimit }),
      })

      // Step 1: Import subscriptions
      setProgress({ current: 0, total: 0, message: 'Fetching your subscriptions...' })

      const subRes = await fetch('/api/sync/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!subRes.ok) {
        const data = await subRes.json()
        throw new Error(data.error || 'Failed to import subscriptions')
      }

      const subData = await subRes.json()
      const channelCount = subData.channelsImported || 0

      if (channelCount === 0) {
        setPhase('complete')
        setProgress({
          current: 0,
          total: 0,
          message: 'No subscriptions found on your YouTube account',
        })
        return
      }

      // Step 2: Sync videos with progress polling
      setProgress({
        current: 0,
        total: channelCount,
        message: `Found ${channelCount} channels. Fetching videos...`,
      })

      // Start polling for real-time progress
      startProgressPolling()

      const videoRes = await fetch('/api/sync/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupedOnly: true }),
      })

      // Stop polling when request completes
      stopProgressPolling()

      if (!videoRes.ok) {
        const data = await videoRes.json()
        throw new Error(data.error || 'Failed to fetch videos')
      }

      const videoData = await videoRes.json()

      setPhase('complete')
      setProgress({
        current: channelCount,
        total: channelCount,
        message: `Imported ${videoData.videosImported} videos from ${channelCount} channels`,
      })

    } catch (err) {
      stopProgressPolling()

      // PRD: On failure, rollback everything and start fresh on retry
      setProgress({ current: 0, total: 0, message: 'Rolling back...' })
      await rollbackImport()

      setPhase('error')
      setError(err instanceof Error ? err.message : 'Import failed')
    }
  }, [videoLimit, startProgressPolling, stopProgressPolling, rollbackImport])

  const handleRetry = useCallback(() => {
    setPhase('limit-select')
    setError(null)
  }, [])

  const handleComplete = useCallback(() => {
    onComplete()
    onClose()
  }, [onComplete, onClose])

  const handleSkip = useCallback(() => {
    onSkip()
    onClose()
  }, [onSkip, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#ffffff] dark:bg-[#262017] border rounded-2xl p-8 max-w-lg mx-4 shadow-2xl w-full">

        {/* Welcome Phase */}
        {phase === 'welcome' && (
          <div className="text-center space-y-6">
            <div className="text-6xl">🎬</div>
            <div>
              <h2 className="text-2xl font-bold">Welcome to Ben.Tube!</h2>
              <p className="mt-2 text-muted-foreground">
                Let&apos;s import your YouTube subscriptions to get started.
              </p>
            </div>
            <div className="space-y-3 pt-4">
              <button
                onClick={() => setPhase('limit-select')}
                className="w-full h-12 rounded-xl bg-accent text-white font-medium hover:bg-accent/90 transition-colors"
              >
                Import My Subscriptions
              </button>
              <button
                onClick={handleSkip}
                className="w-full h-12 rounded-xl border text-sm font-medium hover:bg-muted transition-colors"
              >
                Skip for Now
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              You can always import later from Settings
            </p>
          </div>
        )}

        {/* Video Limit Selection Phase */}
        {phase === 'limit-select' && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="text-4xl mb-3">📺</div>
              <h2 className="text-xl font-bold">How many videos?</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Choose how many recent videos to import from each channel.
              </p>
            </div>

            <div className="space-y-3">
              {VIDEO_LIMIT_OPTIONS.map((option) => (
                <button
                  key={option.value ?? 'all'}
                  onClick={() => setVideoLimit(option.value)}
                  className={`w-full p-4 rounded-xl border text-left transition-colors ${
                    videoLimit === option.value
                      ? 'border-accent bg-accent/10'
                      : 'hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{option.label}</p>
                      <p className="text-xs text-muted-foreground">{option.description}</p>
                    </div>
                    {videoLimit === option.value && (
                      <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                        <span className="text-white text-xs">✓</span>
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {videoLimit === null && (
              <div className="rounded-xl p-3 bg-amber-500/10 border border-amber-500/30">
                <div className="flex gap-2">
                  <span className="text-amber-600">⚠️</span>
                  <p className="text-xs text-amber-800 dark:text-amber-200">
                    Importing all videos uses a lot of API quota and may take a while.
                  </p>
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setPhase('welcome')}
                className="flex-1 h-12 rounded-xl border font-medium hover:bg-muted transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleStartImport}
                className="flex-1 h-12 rounded-xl bg-accent text-white font-medium hover:bg-accent/90 transition-colors"
              >
                Start Import
              </button>
            </div>
          </div>
        )}

        {/* Importing Phase */}
        {phase === 'importing' && (
          <div className="text-center space-y-6">
            <div className="relative">
              <div className="h-16 w-16 mx-auto animate-spin rounded-full border-4 border-accent/30 border-t-accent" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Importing...</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {progress.message}
              </p>
            </div>

            {/* Progress bar */}
            {progress.total > 0 && (
              <div className="space-y-2">
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent transition-all duration-300"
                    style={{
                      width: `${Math.round((progress.current / progress.total) * 100)}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {progress.current} / {progress.total} channels
                </p>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              This may take a minute. Please don&apos;t close this window.
            </p>
          </div>
        )}

        {/* Complete Phase */}
        {phase === 'complete' && (
          <div className="text-center space-y-6">
            <div className="text-6xl">🎉</div>
            <div>
              <h2 className="text-xl font-bold">Import Complete!</h2>
              <p className="mt-2 text-muted-foreground">
                {progress.message}
              </p>
            </div>
            <button
              onClick={handleComplete}
              className="w-full h-12 rounded-xl bg-accent text-white font-medium hover:bg-accent/90 transition-colors"
            >
              Start Watching
            </button>
          </div>
        )}

        {/* Error Phase */}
        {phase === 'error' && (
          <div className="text-center space-y-6">
            <div className="text-6xl">😕</div>
            <div>
              <h2 className="text-xl font-bold text-red-600">Import Failed</h2>
              <p className="mt-2 text-muted-foreground">
                {error || 'Something went wrong. Please try again.'}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleSkip}
                className="flex-1 h-12 rounded-xl border font-medium hover:bg-muted transition-colors"
              >
                Skip for Now
              </button>
              <button
                onClick={handleRetry}
                className="flex-1 h-12 rounded-xl bg-accent text-white font-medium hover:bg-accent/90 transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
