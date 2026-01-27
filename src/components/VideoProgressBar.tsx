'use client'

import { memo, useMemo } from 'react'

type VideoProgressBarProps = {
  /** Progress value from 0 to 1 (e.g., 0.45 for 45%) */
  progress: number
  /** Progress in seconds */
  progressSeconds: number
  /** Total duration in seconds */
  durationSeconds: number
  className?: string
}

/**
 * Progress bar displayed below video thumbnails
 *
 * Features:
 * - Same width as thumbnail
 * - Percentage shown to the right
 * - Ben.Tube accent color (#c4956a)
 * - Hover tooltip showing "Resume at 12:34"
 * - No bar shown if progress is 0%
 */
function VideoProgressBarComponent({
  progress,
  progressSeconds,
  durationSeconds,
  className = '',
}: VideoProgressBarProps) {
  // Clamp progress between 0 and 1
  const clampedProgress = Math.min(1, Math.max(0, progress))
  const percentage = Math.round(clampedProgress * 100)

  // Format time for tooltip (e.g., "12:34" or "1:23:45")
  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`
  }

  const tooltipText = useMemo(() => {
    if (progressSeconds > 0 && durationSeconds > 0) {
      return `Resume at ${formatTime(progressSeconds)}`
    }
    return `${percentage}% watched`
  }, [progressSeconds, durationSeconds, percentage])

  // Don't render if no progress
  if (clampedProgress === 0) {
    return null
  }

  return (
    <div
      className={`flex items-center gap-2 ${className}`}
      title={tooltipText}
    >
      {/* Progress bar track */}
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        {/* Progress fill */}
        <div
          className="h-full rounded-full transition-[width] duration-300 ease-out"
          style={{
            width: `${percentage}%`,
            background: 'linear-gradient(90deg, #c4956a 0%, #d4a574 50%, #c4956a 100%)',
          }}
        />
      </div>

      {/* Percentage text */}
      <span className="text-xs text-muted-foreground font-medium min-w-[32px] text-right">
        {percentage}%
      </span>
    </div>
  )
}

export const VideoProgressBar = memo(VideoProgressBarComponent)
