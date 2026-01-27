'use client'

import { memo, useCallback } from 'react'
import { formatRelativeTime, formatDuration } from '@/lib/utils'
import { VideoProgressBar } from './VideoProgressBar'
import { type FeedVideo } from './VideoCard'

type VideoListItemProps = {
  video: FeedVideo
  onWatch?: (videoId: string) => void
  onToggleWatchLater?: (videoId: string) => void
  onTag?: (videoId: string, event: React.MouseEvent) => void
  onDelete?: (videoId: string) => void
  isSelectionMode?: boolean
  isSelected?: boolean
  onToggleSelection?: (videoId: string) => void
}

// Simple icon components
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

const VideoListItem = memo(function VideoListItem({
  video,
  onWatch,
  onToggleWatchLater,
  onTag,
  onDelete,
  isSelectionMode = false,
  isSelected = false,
  onToggleSelection,
}: VideoListItemProps) {
  // Memoize click handlers
  const handleWatch = useCallback(() => {
    if (isSelectionMode) {
      onToggleSelection?.(video.id)
    } else {
      onWatch?.(video.youtube_id)
    }
  }, [isSelectionMode, onToggleSelection, video.id, onWatch, video.youtube_id])
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
      className={`group relative flex gap-3 px-4 py-2.5 rounded-lg bg-card border transition-all hover:border-accent/50 cursor-pointer ${
        video.watched ? 'opacity-60' : ''
      } ${isSelected ? 'ring-2 ring-accent border-accent' : ''}`}
      onClick={handleWatch}
    >
      {/* Selection checkbox */}
      {isSelectionMode && (
        <div className="flex-shrink-0 flex items-center">
          <div
            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
              isSelected
                ? 'bg-accent border-accent text-white'
                : 'bg-muted border-muted-foreground/30 hover:border-accent'
            }`}
          >
            {isSelected && (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
        </div>
      )}
      {/* Channel avatar */}
      <div className="flex-shrink-0">
        {video.channel_thumbnail ? (
          <img
            src={video.channel_thumbnail}
            alt={video.channel_title}
            loading="lazy"
            decoding="async"
            className="w-8 h-8 rounded-full"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
            {video.channel_title.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Video info */}
      <div className="flex-1 min-w-0 flex items-center gap-4">
        {/* Title and meta */}
        <div className="flex-1 min-w-0">
          <h3
            className="font-medium text-sm leading-tight line-clamp-1 hover:text-accent"
            title={video.title}
          >
            {video.title}
          </h3>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-xs text-muted-foreground">
              {video.channel_title}
            </p>
            <span className="text-xs text-muted-foreground">•</span>
            <p className="text-xs text-muted-foreground">
              {formatRelativeTime(video.published_at)}
            </p>
            {video.duration_seconds && (
              <>
                <span className="text-xs text-muted-foreground">•</span>
                <p className="text-xs text-muted-foreground font-mono">
                  {formatDuration(video.duration_seconds)}
                </p>
              </>
            )}
          </div>
        </div>

        {/* Progress indicator */}
        {video.watch_progress > 0 && (
          <div className="flex-shrink-0 w-32">
            <VideoProgressBar
              progress={video.watch_progress}
              progressSeconds={video.watch_progress_seconds}
              durationSeconds={video.duration_seconds ?? 0}
            />
          </div>
        )}

        {/* Badges and indicators */}
        <div className="flex-shrink-0 flex items-center gap-2">
          {video.is_short && (
            <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded font-medium">
              SHORT
            </span>
          )}
          {video.has_tags && (
            <div className="bg-accent/90 text-white p-1 rounded">
              <TagIcon className="w-3 h-3" />
            </div>
          )}
          {video.watch_later && (
            <div className="bg-accent text-white p-1 rounded">
              <ClockFilledIcon className="w-3.5 h-3.5" />
            </div>
          )}
        </div>

        {/* Actions - hidden in selection mode */}
        {!isSelectionMode && (
        <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100">
          <button
            onClick={handleToggleWatchLater}
            className="p-1.5 rounded-full hover:bg-muted transition-colors"
            title={video.watch_later ? 'Remove from Watch Later' : 'Add to Watch Later'}
          >
            {video.watch_later ? '✓' : '⏰'}
          </button>
          {onTag && (
            <button
              onClick={handleTag}
              className="p-1.5 rounded-full hover:bg-muted transition-colors"
              title="Tag video"
            >
              🏷️
            </button>
          )}
          {onDelete && (
            <button
              onClick={handleDelete}
              className="p-1.5 rounded-full hover:bg-red-500 hover:text-white transition-colors"
              title="Delete video"
            >
              🗑️
            </button>
          )}
        </div>
        )}
      </div>
    </div>
  )
})

export default VideoListItem
