'use client'

import { usePlaylist } from '@/hooks/usePlaylist'

type QueuePanelProps = {
  isOpen: boolean
  onClose: () => void
}

export default function QueuePanel({ isOpen, onClose }: QueuePanelProps) {
  const { playlist, jumpTo, shuffle, clear } = usePlaylist()

  if (!isOpen || !playlist.isActive) return null

  const sourceName = playlist.source?.type === 'group' ? playlist.source.groupName : 'Playlist'

  return (
    <div className="fixed right-0 top-0 bottom-0 w-80 isolate bg-[#ffffff] dark:bg-[#262017] border-l shadow-lg z-[120] flex flex-col">
      <div className="flex items-center justify-between p-4 border-b">
        <div>
          <h2 className="font-semibold">Queue</h2>
          <p className="text-xs text-muted-foreground">{sourceName}</p>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <CloseIcon className="w-5 h-5" />
        </button>
      </div>

      <div className="flex items-center gap-2 p-3 border-b">
        <button
          onClick={shuffle}
          className="flex-1 px-3 py-1.5 text-sm rounded-lg bg-muted hover:bg-muted/80 transition-colors"
        >
          Shuffle
        </button>
        <button
          onClick={clear}
          className="flex-1 px-3 py-1.5 text-sm rounded-lg bg-muted hover:bg-muted/80 transition-colors text-red-500"
        >
          Clear
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {playlist.videos.map((video, index) => {
          const isCurrent = index === playlist.currentIndex
          const isPast = index < playlist.currentIndex

          return (
            <button
              key={video.id}
              onClick={() => jumpTo(index)}
              className={`w-full flex items-center gap-3 p-3 hover:bg-muted transition-colors text-left ${
                isCurrent ? 'bg-accent/10' : ''
              }`}
            >
              <div className="relative shrink-0">
                {video.thumbnail ? (
                  <img
                    src={video.thumbnail}
                    alt=""
                    className={`w-20 h-12 object-cover rounded ${isPast ? 'opacity-50' : ''}`}
                  />
                ) : (
                  <div className="w-20 h-12 bg-muted rounded" />
                )}
                {isCurrent && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded">
                    <NowPlayingIcon className="w-6 h-6 text-white" />
                  </div>
                )}
                {isPast && (
                  <div className="absolute bottom-1 right-1">
                    <CheckIcon className="w-4 h-4 text-green-500" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium line-clamp-2 ${isPast ? 'text-muted-foreground' : ''}`}>
                  {video.title}
                </p>
                <p className="text-xs text-muted-foreground">{video.channel_title}</p>
              </div>

              <span className="text-xs text-muted-foreground shrink-0">{index + 1}</span>
            </button>
          )
        })}
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

function NowPlayingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}
