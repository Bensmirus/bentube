'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePlaylist } from '@/hooks/usePlaylist'

type AutoAdvanceOverlayProps = {
  isVisible: boolean
  onCancel: () => void
  countdownSeconds?: number
}

export default function AutoAdvanceOverlay({
  isVisible,
  onCancel,
  countdownSeconds = 3,
}: AutoAdvanceOverlayProps) {
  const { hasNext, next, playlist } = usePlaylist()
  const [countdown, setCountdown] = useState(countdownSeconds)

  const nextVideo = hasNext ? playlist.videos[playlist.currentIndex + 1] : null

  const handleAdvance = useCallback(() => {
    next()
    onCancel()
  }, [next, onCancel])

  useEffect(() => {
    if (!isVisible || !hasNext) {
      setCountdown(countdownSeconds)
      return
    }

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          handleAdvance()
          return countdownSeconds
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [isVisible, hasNext, countdownSeconds, handleAdvance])

  if (!isVisible || !hasNext || !nextVideo) return null

  return (
    <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="text-center text-white max-w-md px-6">
        <p className="text-lg mb-2">Up next in {countdown}...</p>

        <div className="flex items-center gap-3 bg-white/10 rounded-lg p-3 mb-4">
          {nextVideo.thumbnail && (
            <img
              src={nextVideo.thumbnail}
              alt=""
              className="w-24 h-14 object-cover rounded"
            />
          )}
          <div className="text-left flex-1 min-w-0">
            <p className="font-medium text-sm line-clamp-2">{nextVideo.title}</p>
            <p className="text-xs text-white/70">{nextVideo.channel_title}</p>
          </div>
        </div>

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleAdvance}
            className="px-4 py-2 rounded-lg bg-accent hover:bg-accent/90 transition-colors text-sm font-medium"
          >
            Play Now
          </button>
        </div>
      </div>
    </div>
  )
}
