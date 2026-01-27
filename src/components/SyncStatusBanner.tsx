'use client'

import { useState, useEffect } from 'react'
import { useSyncStatus } from '@/hooks/useSyncStatus'

/**
 * Global Sync Status Banner
 *
 * Shows sync progress across all pages. Features:
 * - Real-time progress with percentage and ETA
 * - Cancel button for active syncs
 * - Success/failure summary after sync completes
 * - Auto-dismisses after showing results
 */
export function SyncStatusBanner() {
  const {
    isActive,
    progress,
    percentage,
    formattedEta,
    isSyncing,
    isStarting,
    isCompleting,
    isRecentlyCompleted,
    isRecentlyFailed,
    channelsProcessed,
    channelsFailed,
    videosAdded,
    errors,
    cancelSync,
    isCancelling,
  } = useSyncStatus()

  // Track if user dismissed the result banner
  const [dismissed, setDismissed] = useState(false)
  // Track last sync ID to reset dismissed state for new syncs
  const [lastSyncPhase, setLastSyncPhase] = useState<string | null>(null)

  // Reset dismissed state when a new sync starts
  useEffect(() => {
    if (progress?.phase && progress.phase !== lastSyncPhase) {
      if (progress.phase === 'starting' || progress.phase === 'syncing_videos') {
        setDismissed(false)
      }
      setLastSyncPhase(progress.phase)
    }
  }, [progress?.phase, lastSyncPhase])

  // Auto-dismiss result after 15 seconds
  useEffect(() => {
    if (isRecentlyCompleted || isRecentlyFailed) {
      const timer = setTimeout(() => {
        setDismissed(true)
      }, 15000)
      return () => clearTimeout(timer)
    }
  }, [isRecentlyCompleted, isRecentlyFailed])

  // Don't show if nothing happening or dismissed
  const showActiveBanner = isActive && (isSyncing || isStarting || isCompleting)
  const showResultBanner = (isRecentlyCompleted || isRecentlyFailed) && !dismissed

  if (!showActiveBanner && !showResultBanner) {
    return null
  }

  // Active sync banner
  if (showActiveBanner) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-primary text-primary-foreground shadow-lg">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            {/* Progress info */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {/* Spinning indicator */}
              <div className="flex-shrink-0">
                <svg
                  className="animate-spin h-5 w-5"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">
                    {isStarting && 'Starting sync...'}
                    {isSyncing && progress?.currentItem && `Syncing: ${progress.currentItem}`}
                    {isSyncing && !progress?.currentItem && 'Syncing channels...'}
                    {isCompleting && 'Finishing up...'}
                  </span>
                </div>

                {/* Progress bar and stats */}
                {progress && progress.total > 0 && (
                  <div className="flex items-center gap-3 mt-1">
                    {/* Mini progress bar */}
                    <div className="flex-1 h-1.5 bg-primary-foreground/20 rounded-full overflow-hidden max-w-xs">
                      <div
                        className="h-full bg-primary-foreground/80 rounded-full transition-all duration-300"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>

                    {/* Stats */}
                    <span className="text-sm text-primary-foreground/80 whitespace-nowrap">
                      {progress.current}/{progress.total} channels
                      {formattedEta && ` • ~${formattedEta}`}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Cancel button */}
            <button
              onClick={() => cancelSync()}
              disabled={isCancelling}
              className="flex-shrink-0 px-3 py-1.5 text-sm font-medium bg-primary-foreground/20 hover:bg-primary-foreground/30 rounded-lg transition-colors disabled:opacity-50"
            >
              {isCancelling ? 'Cancelling...' : 'Cancel'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Result banner (success or failure)
  if (showResultBanner) {
    const isSuccess = isRecentlyCompleted && channelsFailed === 0
    const isPartial = isRecentlyCompleted && channelsFailed > 0
    const isFailed = isRecentlyFailed

    return (
      <div
        className={`fixed top-0 left-0 right-0 z-50 shadow-lg ${
          isSuccess
            ? 'bg-green-600 text-white'
            : isPartial
            ? 'bg-amber-500 text-white'
            : 'bg-red-600 text-white'
        }`}
      >
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            {/* Result info */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {/* Icon */}
              <div className="flex-shrink-0">
                {isSuccess && (
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
                {isPartial && (
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                )}
                {isFailed && (
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                )}
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <span className="font-medium">
                  {isSuccess && 'Sync complete!'}
                  {isPartial && 'Sync finished with issues'}
                  {isFailed && 'Sync failed'}
                </span>
                <span className="text-sm opacity-90 ml-2">
                  {isSuccess && `${channelsProcessed} channels synced, ${videosAdded} new videos`}
                  {isPartial &&
                    `${channelsProcessed} synced, ${channelsFailed} failed, ${videosAdded} new videos`}
                  {isFailed && progress?.message}
                </span>

                {/* Show failed channels if any */}
                {isPartial && errors.length > 0 && (
                  <div className="mt-1 text-sm opacity-80">
                    Failed: {errors.slice(0, 3).map((e) => e.channelName || 'Unknown').join(', ')}
                    {errors.length > 3 && ` +${errors.length - 3} more`}
                  </div>
                )}
              </div>
            </div>

            {/* Dismiss button */}
            <button
              onClick={() => setDismissed(true)}
              className="flex-shrink-0 p-1.5 hover:bg-white/20 rounded-lg transition-colors"
              aria-label="Dismiss"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
