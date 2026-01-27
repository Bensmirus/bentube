'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

type WatchProgress = {
  progress: number // 0-1
  progressSeconds: number
  watched: boolean
  lastPositionAt: string
}

type ProgressUpdate = {
  videoId: string
  progressSeconds: number
  durationSeconds: number
}

type UseWatchProgressOptions = {
  // Debounce delay for saving progress (ms)
  saveDebounceMs?: number
  // Enable real-time sync across devices
  enableRealtime?: boolean
  // User ID for real-time subscription filtering
  userId?: string
}

type WatchProgressStore = Map<string, WatchProgress>

// Maximum number of videos to keep in memory (prevents unbounded growth)
const MAX_PROGRESS_CACHE_SIZE = 500

/**
 * Professional-grade watch progress tracking hook
 *
 * Features:
 * - Second-precise progress tracking
 * - Debounced saves to reduce API calls
 * - Batch updates for efficiency
 * - Real-time sync across devices via Supabase
 * - Optimistic updates for instant UI feedback
 * - Conflict resolution with server timestamps
 * - LRU cache to prevent memory leaks (max 500 videos)
 */
export function useWatchProgress(options: UseWatchProgressOptions = {}) {
  const {
    saveDebounceMs = 5000, // Save every 5 seconds
    enableRealtime = true,
    userId,
  } = options

  // Progress store
  const [progressStore, setProgressStore] = useState<WatchProgressStore>(new Map())

  // Pending updates queue
  const pendingUpdates = useRef<Map<string, ProgressUpdate>>(new Map())
  const batchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Real-time channel
  const channelRef = useRef<RealtimeChannel | null>(null)
  const supabaseRef = useRef(createClient())

  // Track if we're currently saving
  const isSavingRef = useRef(false)

  /**
   * Send batched updates to the server
   * Handles concurrent save attempts by queuing next flush
   */
  const flushUpdates = useCallback(async () => {
    if (pendingUpdates.current.size === 0) {
      return
    }

    // If already saving, queue another flush after delay
    if (isSavingRef.current) {
      setTimeout(() => flushUpdates(), 1000)
      return
    }

    isSavingRef.current = true

    const updates = Array.from(pendingUpdates.current.values()).map((u) => ({
      video_id: u.videoId,
      progress_seconds: u.progressSeconds,
      duration_seconds: u.durationSeconds,
      timestamp: new Date().toISOString(),
    }))

    // Clear pending updates before sending
    pendingUpdates.current.clear()

    try {
      const response = await fetch('/api/feed/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      })

      if (!response.ok) {
        console.error('Failed to save progress:', await response.text())
        // Re-add failed updates to queue for retry
        updates.forEach(u => {
          pendingUpdates.current.set(u.video_id, {
            videoId: u.video_id,
            progressSeconds: u.progress_seconds,
            durationSeconds: u.duration_seconds,
          })
        })
        // Retry after delay
        setTimeout(() => flushUpdates(), 5000)
      }
    } catch (error) {
      console.error('Error saving progress:', error)
      // Re-add failed updates for retry
      updates.forEach(u => {
        pendingUpdates.current.set(u.video_id, {
          videoId: u.video_id,
          progressSeconds: u.progress_seconds,
          durationSeconds: u.duration_seconds,
        })
      })
      // Retry after delay
      setTimeout(() => flushUpdates(), 5000)
    } finally {
      isSavingRef.current = false
    }
  }, [])

  /**
   * Schedule a batched save
   */
  const scheduleSave = useCallback(() => {
    // Clear existing save timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    // Schedule new save
    saveTimeoutRef.current = setTimeout(() => {
      flushUpdates()
    }, saveDebounceMs)
  }, [flushUpdates, saveDebounceMs])

  /**
   * Update progress for a video
   * Batches updates and debounces saves for efficiency
   * Implements LRU cache to prevent memory leaks
   */
  const updateProgress = useCallback(
    (videoId: string, progressSeconds: number, durationSeconds: number) => {
      if (durationSeconds <= 0) return

      const progress = Math.min(1, Math.max(0, progressSeconds / durationSeconds))
      const watched = progress >= 0.9

      // Optimistic update to store with LRU cache
      setProgressStore((prev) => {
        const newStore = new Map(prev)

        // Remove old entry if it exists (for LRU ordering)
        newStore.delete(videoId)

        // Add updated entry (most recent)
        newStore.set(videoId, {
          progress,
          progressSeconds: Math.floor(progressSeconds),
          watched,
          lastPositionAt: new Date().toISOString(),
        })

        // Enforce cache size limit (LRU eviction)
        if (newStore.size > MAX_PROGRESS_CACHE_SIZE) {
          // Remove oldest entries (first items in Map)
          const entries = Array.from(newStore.entries())
          const toKeep = entries.slice(-MAX_PROGRESS_CACHE_SIZE)
          return new Map(toKeep)
        }

        return newStore
      })

      // Add to pending updates
      pendingUpdates.current.set(videoId, {
        videoId,
        progressSeconds: Math.floor(progressSeconds),
        durationSeconds: Math.floor(durationSeconds),
      })

      // Schedule save
      scheduleSave()
    },
    [scheduleSave]
  )

  /**
   * Get progress for a video
   */
  const getProgress = useCallback(
    (videoId: string): WatchProgress | undefined => {
      return progressStore.get(videoId)
    },
    [progressStore]
  )

  /**
   * Get progress percentage for display
   */
  const getProgressPercent = useCallback(
    (videoId: string): number => {
      const progress = progressStore.get(videoId)
      return progress ? Math.round(progress.progress * 100) : 0
    },
    [progressStore]
  )

  /**
   * Fetch initial progress for videos
   */
  const fetchProgress = useCallback(async (videoIds: string[]) => {
    if (videoIds.length === 0) return

    try {
      const response = await fetch(`/api/feed/progress?ids=${videoIds.join(',')}`)
      if (!response.ok) return

      const data = await response.json()
      const progressMap = data.progress as Record<
        string,
        { progress: number; progress_seconds: number; watched: boolean; last_position_at: string }
      >

      setProgressStore((prev) => {
        const newStore = new Map(prev)
        for (const [videoId, p] of Object.entries(progressMap)) {
          // Only update if we don't have a more recent local update
          const existing = newStore.get(videoId)
          if (!existing || new Date(p.last_position_at) > new Date(existing.lastPositionAt)) {
            newStore.set(videoId, {
              progress: p.progress,
              progressSeconds: p.progress_seconds,
              watched: p.watched,
              lastPositionAt: p.last_position_at,
            })
          }
        }
        return newStore
      })
    } catch (error) {
      console.error('Error fetching progress:', error)
    }
  }, [])

  /**
   * Initialize real-time subscription for cross-device sync
   */
  useEffect(() => {
    if (!enableRealtime || !userId) return

    const supabase = supabaseRef.current

    // Subscribe to watch_status changes for this user
    channelRef.current = supabase
      .channel(`watch_progress:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'watch_status',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const { new: newRecord } = payload as unknown as {
            new: {
              video_id: string
              watch_progress: number
              watch_progress_seconds: number
              watched: boolean
              last_position_at: string
            }
          }

          if (!newRecord) return

          // Update local store with server data
          setProgressStore((prev) => {
            const existing = prev.get(newRecord.video_id)

            // Only update if server timestamp is newer
            if (
              existing &&
              new Date(existing.lastPositionAt) >= new Date(newRecord.last_position_at)
            ) {
              return prev
            }

            const newStore = new Map(prev)
            newStore.set(newRecord.video_id, {
              progress: newRecord.watch_progress,
              progressSeconds: newRecord.watch_progress_seconds,
              watched: newRecord.watched,
              lastPositionAt: newRecord.last_position_at,
            })
            return newStore
          })
        }
      )
      .subscribe()

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [enableRealtime, userId])

  /**
   * Flush pending updates on unmount
   * Uses sendBeacon for reliable delivery during cleanup
   */
  useEffect(() => {
    const currentSaveTimeout = saveTimeoutRef.current
    const currentBatchTimeout = batchTimeoutRef.current
    const currentPendingUpdates = pendingUpdates.current

    return () => {
      if (currentSaveTimeout) {
        clearTimeout(currentSaveTimeout)
      }
      if (currentBatchTimeout) {
        clearTimeout(currentBatchTimeout)
      }
      // Use sendBeacon for reliable unmount flush (doesn't require awaiting)
      if (currentPendingUpdates.size > 0) {
        const updates = Array.from(currentPendingUpdates.values()).map((u) => ({
          video_id: u.videoId,
          progress_seconds: u.progressSeconds,
          duration_seconds: u.durationSeconds,
          timestamp: new Date().toISOString(),
        }))

        const blob = new Blob(
          [JSON.stringify({ updates })],
          { type: 'application/json' }
        )

        navigator.sendBeacon('/api/feed/progress', blob)
      }
    }
  }, [])

  /**
   * Flush updates before page unload
   * Uses sendBeacon with proper content-type for reliable delivery
   */
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (pendingUpdates.current.size > 0) {
        // Use sendBeacon for reliable delivery during unload
        const updates = Array.from(pendingUpdates.current.values()).map((u) => ({
          video_id: u.videoId,
          progress_seconds: u.progressSeconds,
          duration_seconds: u.durationSeconds,
          timestamp: new Date().toISOString(),
        }))

        // Create Blob with correct content-type (critical for API parsing)
        const blob = new Blob(
          [JSON.stringify({ updates })],
          { type: 'application/json' }
        )

        navigator.sendBeacon('/api/feed/progress', blob)
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  return {
    progressStore,
    updateProgress,
    getProgress,
    getProgressPercent,
    fetchProgress,
    flushUpdates,
  }
}

/**
 * Context provider for watch progress
 * Use this to share progress state across components
 */
type WatchProgressContextType = ReturnType<typeof useWatchProgress>

const WatchProgressContext = createContext<WatchProgressContextType | null>(null)

export function WatchProgressProvider({
  children,
  userId,
}: {
  children: ReactNode
  userId?: string
}) {
  const watchProgress = useWatchProgress({ userId, enableRealtime: !!userId })

  return (
    <WatchProgressContext.Provider value={watchProgress}>
      {children}
    </WatchProgressContext.Provider>
  )
}

export function useWatchProgressContext() {
  const context = useContext(WatchProgressContext)
  if (!context) {
    throw new Error('useWatchProgressContext must be used within a WatchProgressProvider')
  }
  return context
}
