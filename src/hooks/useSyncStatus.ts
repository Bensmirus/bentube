'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { SyncProgressData, SyncPhase } from '@/lib/youtube/sync-progress'

// Types for the sync progress API response
export type SyncProgressResponse = {
  progress: SyncProgressData | null
  isActive: boolean
  eta: {
    estimatedSecondsRemaining: number
    estimatedCompletionTime: string
    averageChannelTimeSeconds: number
  } | null
}

// Query key for sync status
export const syncStatusKey = ['syncStatus'] as const

/**
 * Hook to track real-time sync status across the app
 * Polls every 2 seconds when a sync is active, otherwise every 30 seconds
 */
export function useSyncStatus() {
  const queryClient = useQueryClient()

  const { data, isLoading, error, refetch } = useQuery<SyncProgressResponse>({
    queryKey: syncStatusKey,
    queryFn: async () => {
      const response = await fetch('/api/sync/progress')
      if (!response.ok) {
        throw new Error('Failed to fetch sync status')
      }
      return response.json()
    },
    // Poll more frequently when sync is active
    refetchInterval: (query) => {
      const data = query.state.data as SyncProgressResponse | undefined
      if (data?.isActive) {
        return 2000 // 2 seconds when active
      }
      return 30000 // 30 seconds when idle
    },
    refetchIntervalInBackground: false,
    staleTime: 1000, // Consider stale after 1 second
  })

  // Mutation to cancel sync
  const cancelMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/sync/cancel', {
        method: 'POST',
      })
      if (!response.ok) {
        throw new Error('Failed to cancel sync')
      }
      return response.json()
    },
    onSuccess: () => {
      // Invalidate to get fresh status
      queryClient.invalidateQueries({ queryKey: syncStatusKey })
    },
  })

  // Helper to check if sync is in a specific phase
  const isInPhase = (phases: SyncPhase[]): boolean => {
    if (!data?.progress) return false
    return phases.includes(data.progress.phase)
  }

  // Calculate percentage
  const percentage = data?.progress
    ? data.progress.total > 0
      ? Math.round((data.progress.current / data.progress.total) * 100)
      : 0
    : 0

  // Format ETA for display
  const formatEta = (): string | null => {
    if (!data?.eta?.estimatedSecondsRemaining) return null
    const seconds = data.eta.estimatedSecondsRemaining
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    if (minutes < 60) return `${minutes}m ${remainingSeconds}s`
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    return `${hours}h ${remainingMinutes}m`
  }

  // Check if sync recently completed (within last 10 seconds)
  const isRecentlyCompleted = (): boolean => {
    if (!data?.progress?.completedAt) return false
    const completedAt = new Date(data.progress.completedAt)
    const now = new Date()
    const diffSeconds = (now.getTime() - completedAt.getTime()) / 1000
    return diffSeconds < 10 && data.progress.phase === 'complete'
  }

  // Check if sync recently failed
  const isRecentlyFailed = (): boolean => {
    if (!data?.progress?.completedAt) return false
    const completedAt = new Date(data.progress.completedAt)
    const now = new Date()
    const diffSeconds = (now.getTime() - completedAt.getTime()) / 1000
    return diffSeconds < 10 && data.progress.phase === 'error'
  }

  return {
    // Raw data
    progress: data?.progress ?? null,
    isActive: data?.isActive ?? false,
    eta: data?.eta ?? null,

    // Loading state
    isLoading,
    error,

    // Computed values
    percentage,
    formattedEta: formatEta(),
    isRecentlyCompleted: isRecentlyCompleted(),
    isRecentlyFailed: isRecentlyFailed(),

    // Phase helpers
    isSyncing: isInPhase(['syncing_videos', 'syncing_playlists', 'fetching_subscriptions', 'fetching_channel_details']),
    isStarting: isInPhase(['starting']),
    isCompleting: isInPhase(['completing']),
    isComplete: isInPhase(['complete']),
    isError: isInPhase(['error']),

    // Stats shortcuts
    channelsProcessed: data?.progress?.stats.channelsProcessed ?? 0,
    channelsFailed: data?.progress?.stats.channelsFailed ?? 0,
    videosAdded: data?.progress?.stats.videosAdded ?? 0,
    errors: data?.progress?.errors ?? [],

    // Actions
    cancelSync: cancelMutation.mutate,
    isCancelling: cancelMutation.isPending,
    refetch,
  }
}
