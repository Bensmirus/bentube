'use client'

import { memo, useCallback } from 'react'
import { formatRelativeTime, formatDuration } from '@/lib/utils'
import { VideoProgressBar } from './VideoProgressBar'

export type FeedVideo = {
  id: string
  youtube_id: string
  title: string
  thumbnail: string | null
  duration: string | null
  duration_seconds: number | null
  is_short: boolean
  published_at: string | null
  channel_title: string
  channel_thumbnail: string | null
  watched: boolean
  hidden: boolean
  watch_later: boolean
  watch_progress: number
  watch_progress_seconds: number
  has_tags?: boolean
}

type VideoCardProps = {
  video: FeedVideo
  onWatch?: (videoId: string) => void
  onToggleWatchLater?: (videoId: string) => void
  onTag?: (videoId: string, event: React.MouseEvent) => void
  onDelete?: (videoId: string) => void
  isSelectionMode?: boolean
  isSelected?: boolean
  onToggleSelection?: (videoId: string) => void
}

// Simple icon components - defined before the main component
function ClockFilledIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM12.75 6a.75.75 0 00-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 000-1.5h-3.75V6z" clipRule="evenodd" />
    </svg>
  )
}

function TagIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
    </svg>
  )
}

const VideoCard = memo(function VideoCard({
  video,
  onWatch,
  onToggleWatchLater,
  onTag,
  onDelete,
  isSelectionMode = false,
  isSelected = false,
  onToggleSelection,
}: VideoCardProps) {
  const thumbnailUrl = video.thumbnail || `https://i.ytimg.com/vi/${video.youtube_id}/mqdefault.jpg`

  // Memoize click handlers to prevent recreation on every render
  const handleWatch = useCallback(() => {
    if (isSelectionMode) {
      onToggleSelection?.(video.id)
    } else {
      onWatch?.(video.youtube_id)
    }
  }, [isSelectionMode, onToggleSelection, video.id, onWatch, video.youtube_id])
  const handleTitleClick = useCallback(() => onWatch?.(video.youtube_id), [onWatch, video.youtube_id])
  const handleToggleWatchLater = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onToggleWatchLater?.(video.id)
  }, [onToggleWatchLater, video.id])
  const handleTag = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onTag?.(video.id, e)
  }, [onTag, video.id])
  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onDelete?.(video.id)
  }, [onDelete, video.id])

  return (
    <div
      className={`group relative rounded-lg overflow-hidden bg-card border transition-all hover:border-accent/50 ${
        video.watched ? 'opacity-60' : ''
      } ${isSelected ? 'ring-2 ring-accent border-accent' : ''}`}
    >
      {/* Thumbnail */}
      <div
        className="relative aspect-video cursor-pointer"
        onClick={handleWatch}
      >
        <img
          src={thumbnailUrl}
          alt={video.title}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover"
        />

        {/* Duration badge */}
        {video.duration_seconds && (
          <span className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded font-mono">
            {formatDuration(video.duration_seconds)}
          </span>
        )}

        {/* Shorts badge */}
        {video.is_short && !isSelectionMode && (
          <span className="absolute top-2 left-2 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded font-medium">
            SHORT
          </span>
        )}

        {/* Selection checkbox */}
        {isSelectionMode && (
          <div className="absolute top-2 left-2 z-10">
            <div
              className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                isSelected
                  ? 'bg-accent border-accent text-white'
                  : 'bg-white/80 border-white/80 hover:border-accent'
              }`}
            >
              {isSelected && (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
          </div>
        )}

        {/* Tag indicator - discrete icon in bottom-left corner */}
        {video.has_tags && (
          <div className="absolute bottom-2 left-2 bg-accent/90 text-white p-1 rounded">
            <TagIcon className="w-3 h-3" />
          </div>
        )}

        {/* Hover overlay with actions - hidden in selection mode */}
        {!isSelectionMode && (
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button
            onClick={handleToggleWatchLater}
            className={`p-2 rounded-full transition-colors text-xl w-10 h-10 flex items-center justify-center ${
              video.watch_later
                ? 'bg-accent text-white hover:bg-accent/90'
                : 'bg-white/80 hover:bg-white/90'
            }`}
            title={video.watch_later ? 'Remove from Watch Later' : 'Add to Watch Later'}
          >
            ⏰
          </button>
          {onTag && (
            <button
              onClick={handleTag}
              className="p-2 rounded-full bg-white/80 hover:bg-white/90 transition-colors text-xl"
              title="Tag video"
            >
              🏷️
            </button>
          )}
          {onDelete && (
            <button
              onClick={handleDelete}
              className="p-2 rounded-full bg-white/80 hover:bg-red-500 hover:text-white transition-colors text-xl w-10 h-10 flex items-center justify-center"
              title="Delete video"
            >
              🗑️
            </button>
          )}
        </div>
        )}
      </div>

      {/* Progress bar BELOW thumbnail */}
      {video.watch_progress > 0 && (
        <div className="px-3 pt-2">
          <VideoProgressBar
            progress={video.watch_progress}
            progressSeconds={video.watch_progress_seconds}
            durationSeconds={video.duration_seconds ?? 0}
          />
        </div>
      )}

      {/* Video info */}
      <div className="p-3">
        <div className="flex gap-3">
          {/* Channel avatar */}
          <div className="flex-shrink-0">
            {video.channel_thumbnail ? (
              <img
                src={video.channel_thumbnail}
                alt={video.channel_title}
                loading="lazy"
                decoding="async"
                className="w-9 h-9 rounded-full"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                {video.channel_title.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Title and meta */}
          <div className="flex-1 min-w-0">
            <h3
              className="font-medium text-sm leading-tight line-clamp-2 cursor-pointer hover:text-accent"
              onClick={handleTitleClick}
              title={video.title}
            >
              {video.title}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {video.channel_title}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatRelativeTime(video.published_at)}
            </p>
          </div>
        </div>
      </div>

      {/* Watch Later indicator */}
      {video.watch_later && (
        <div className="absolute top-2 right-2 bg-accent text-white p-1 rounded">
          <ClockFilledIcon className="w-4 h-4" />
        </div>
      )}
    </div>
  )
})

export default VideoCard
