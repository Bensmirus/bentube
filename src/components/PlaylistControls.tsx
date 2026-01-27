'use client'

import { usePlaylist } from '@/hooks/usePlaylist'

type PlaylistControlsProps = {
  onToggleQueue?: () => void
  showQueueButton?: boolean
}

export default function PlaylistControls({ onToggleQueue, showQueueButton = true }: PlaylistControlsProps) {
  const { playlist, hasNext, hasPrevious, next, previous } = usePlaylist()

  if (!playlist.isActive) return null

  const position = playlist.currentIndex + 1
  const total = playlist.videos.length
  const sourceName = playlist.source?.type === 'group' ? playlist.source.groupName : 'Playlist'

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2 bg-muted/50 rounded-lg">
      <div className="flex items-center gap-2">
        <button
          onClick={previous}
          disabled={!hasPrevious}
          className="p-2 rounded-lg hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Previous video (P)"
        >
          <PreviousIcon className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 px-3">
          <span className="text-sm font-medium">{position}</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm text-muted-foreground">{total}</span>
        </div>

        <button
          onClick={next}
          disabled={!hasNext}
          className="p-2 rounded-lg hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Next video (N)"
        >
          <NextIcon className="w-5 h-5" />
        </button>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">{sourceName}</span>

        {showQueueButton && onToggleQueue && (
          <button
            onClick={onToggleQueue}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
            title="Toggle queue (Q)"
          >
            <QueueIcon className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  )
}

function PreviousIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
    </svg>
  )
}

function NextIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M6 18l8.5-6L6 6v12zm8.5-6v6h2V6h-2v6z" />
    </svg>
  )
}

function QueueIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h10M4 18h6" />
    </svg>
  )
}
