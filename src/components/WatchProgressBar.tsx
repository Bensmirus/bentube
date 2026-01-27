'use client'

import { memo, useMemo } from 'react'

type WatchProgressBarProps = {
  /** Progress value from 0 to 1 */
  progress: number
  /** Progress in seconds (optional, for tooltip) */
  progressSeconds?: number
  /** Total duration in seconds (optional, for tooltip) */
  durationSeconds?: number
  /** Whether the video is fully watched */
  watched?: boolean
  /** Custom height in pixels */
  height?: number
  /** Show percentage tooltip on hover */
  showTooltip?: boolean
  /** Custom accent color (CSS color value) */
  accentColor?: string
  /** Animate progress changes */
  animated?: boolean
  /** Show shimmer effect while loading */
  loading?: boolean
}

/**
 * Beautiful, professional-grade progress bar component
 *
 * Features:
 * - Smooth CSS animations
 * - Gradient accent color
 * - Glass morphism design
 * - Percentage tooltip
 * - Native app feel
 */
function WatchProgressBarComponent({
  progress,
  progressSeconds,
  durationSeconds,
  watched = false,
  height = 3,
  showTooltip = true,
  accentColor,
  animated = true,
  loading = false,
}: WatchProgressBarProps) {
  // Clamp progress between 0 and 1
  const clampedProgress = Math.min(1, Math.max(0, progress))
  const percentage = Math.round(clampedProgress * 100)

  // Format time for tooltip
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
    if (watched) return 'Watched'
    if (progressSeconds !== undefined && durationSeconds !== undefined && durationSeconds > 0) {
      return `${formatTime(progressSeconds)} / ${formatTime(durationSeconds)} (${percentage}%)`
    }
    return `${percentage}%`
  }, [watched, progressSeconds, durationSeconds, percentage])

  // Don't render if no progress and not loading
  if (!loading && clampedProgress === 0) {
    return null
  }

  // Don't render if fully watched (shown via opacity instead)
  if (watched && clampedProgress >= 1) {
    return null
  }

  return (
    <div
      className="group/progress absolute bottom-0 left-0 right-0 z-10"
      style={{ height: `${height}px` }}
      title={showTooltip ? tooltipText : undefined}
    >
      {/* Background track */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        style={{ height: `${height}px` }}
      />

      {/* Progress fill */}
      <div
        className={`
          absolute left-0 top-0 bottom-0
          ${loading ? 'animate-shimmer' : ''}
          ${animated ? 'transition-[width] duration-300 ease-out' : ''}
        `}
        style={{
          width: loading ? '100%' : `${percentage}%`,
          height: `${height}px`,
          background: loading
            ? 'linear-gradient(90deg, transparent, rgba(196, 149, 106, 0.3), transparent)'
            : accentColor
            ? accentColor
            : 'linear-gradient(90deg, #c4956a 0%, #d4a574 50%, #c4956a 100%)',
          backgroundSize: loading ? '200% 100%' : '100% 100%',
        }}
      />

      {/* Glow effect on progress edge */}
      {!loading && clampedProgress > 0 && clampedProgress < 1 && (
        <div
          className="absolute top-0 bottom-0 w-2 pointer-events-none transition-all duration-300 ease-out"
          style={{
            left: `calc(${percentage}% - 4px)`,
            background: 'radial-gradient(circle at center, rgba(196, 149, 106, 0.8) 0%, transparent 70%)',
            filter: 'blur(2px)',
          }}
        />
      )}

      {/* Hover expansion effect */}
      <div
        className={`
          absolute inset-0 opacity-0 group-hover/progress:opacity-100
          transition-opacity duration-200
          ${animated ? 'transition-[height] duration-200' : ''}
        `}
        style={{
          height: `${height + 2}px`,
          marginTop: '-1px',
          background: 'linear-gradient(90deg, rgba(196, 149, 106, 0.2) 0%, transparent 100%)',
        }}
      />
    </div>
  )
}

export const WatchProgressBar = memo(WatchProgressBarComponent)

/**
 * Compact inline progress indicator
 * For use in lists or smaller contexts
 */
type CompactProgressProps = {
  progress: number
  watched?: boolean
  size?: 'sm' | 'md'
}

function CompactProgressIndicatorComponent({
  progress,
  watched = false,
  size = 'sm',
}: CompactProgressProps) {
  const percentage = Math.round(Math.min(1, Math.max(0, progress)) * 100)

  if (progress === 0 && !watched) return null

  const sizeClasses = {
    sm: 'text-[10px] min-w-[32px] px-1 py-0.5',
    md: 'text-xs min-w-[40px] px-1.5 py-0.5',
  }

  return (
    <span
      className={`
        inline-flex items-center justify-center
        rounded font-mono font-medium
        ${sizeClasses[size]}
        ${watched
          ? 'bg-green-500/20 text-green-400'
          : 'bg-accent/20 text-accent'
        }
      `}
    >
      {watched ? '100%' : `${percentage}%`}
    </span>
  )
}

export const CompactProgressIndicator = memo(CompactProgressIndicatorComponent)

/**
 * Circular progress indicator
 * For avatar overlays or compact views
 */
type CircularProgressProps = {
  progress: number
  size?: number
  strokeWidth?: number
  watched?: boolean
}

function CircularProgressComponent({
  progress,
  size = 24,
  strokeWidth = 2,
  watched = false,
}: CircularProgressProps) {
  const percentage = Math.min(1, Math.max(0, progress))
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - percentage * circumference

  if (progress === 0 && !watched) return null

  return (
    <svg
      width={size}
      height={size}
      className="transform -rotate-90"
    >
      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(0, 0, 0, 0.3)"
        strokeWidth={strokeWidth}
      />
      {/* Progress circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={watched ? '#22c55e' : '#c4956a'}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-[stroke-dashoffset] duration-300 ease-out"
      />
    </svg>
  )
}

export const CircularProgress = memo(CircularProgressComponent)
