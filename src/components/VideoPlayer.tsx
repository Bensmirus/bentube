'use client'

import { useCallback, useEffect, useRef, useState, memo } from 'react'
import { useWatchProgressContext } from '@/hooks/useWatchProgress'

type VideoPlayerProps = {
  youtubeId: string
  videoId: string // Internal video ID for progress tracking
  title: string
  durationSeconds: number
  initialProgress?: number // 0-1
  initialProgressSeconds?: number
  onClose?: () => void
  autoplay?: boolean
  isShort?: boolean // Shorts don't track progress (too short to matter)
}

declare global {
  interface Window {
    YT: typeof YT
    onYouTubeIframeAPIReady: () => void
  }
}

/**
 * YouTube video player with automatic progress tracking
 *
 * Features:
 * - Embeds YouTube player via IFrame API
 * - Tracks playback progress every 5 seconds
 * - Resumes from last position
 * - Syncs progress across devices via useWatchProgress hook
 * - Native app feel with smooth animations
 */
function VideoPlayerComponent({
  youtubeId,
  videoId,
  title,
  durationSeconds,
  initialProgress = 0,
  initialProgressSeconds,
  onClose,
  autoplay = true,
  isShort = false,
}: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YT.Player | null>(null)
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [, setIsPlaying] = useState(false)

  const { updateProgress } = useWatchProgressContext()

  // Calculate start position in seconds
  const startSeconds = initialProgressSeconds ?? Math.floor(initialProgress * durationSeconds)

  /**
   * Track current playback progress
   * Note: Shorts don't track progress (too short to matter)
   */
  const trackProgress = useCallback(() => {
    if (!playerRef.current || !isReady || isShort) return

    try {
      const currentTime = playerRef.current.getCurrentTime()
      const duration = playerRef.current.getDuration() || durationSeconds

      if (currentTime > 0 && duration > 0) {
        updateProgress(videoId, currentTime, duration)
      }
    } catch {
      // Player might not be ready yet
    }
  }, [videoId, durationSeconds, updateProgress, isReady, isShort])

  /**
   * Start progress tracking interval
   */
  const startTracking = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
    }

    // Track immediately
    trackProgress()

    // Then track every 5 seconds
    progressIntervalRef.current = setInterval(trackProgress, 5000)
  }, [trackProgress])

  /**
   * Stop progress tracking
   */
  const stopTracking = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
      progressIntervalRef.current = null
    }
    // Track final position
    trackProgress()
  }, [trackProgress])

  /**
   * Initialize YouTube IFrame API
   */
  useEffect(() => {
    // Load YouTube IFrame API if not already loaded
    if (!window.YT) {
      const tag = document.createElement('script')
      tag.src = 'https://www.youtube.com/iframe_api'
      const firstScriptTag = document.getElementsByTagName('script')[0]
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag)
    }

    const initPlayer = () => {
      if (!containerRef.current) return

      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId: youtubeId,
        playerVars: {
          autoplay: autoplay ? 1 : 0,
          start: startSeconds > 0 ? startSeconds : undefined,
          modestbranding: 1,
          rel: 0,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            setIsReady(true)
            if (autoplay) {
              setIsPlaying(true)
              startTracking()
            }
          },
          onStateChange: (event: YT.OnStateChangeEvent) => {
            switch (event.data) {
              case YT.PlayerState.PLAYING:
                setIsPlaying(true)
                startTracking()
                break
              case YT.PlayerState.PAUSED:
                setIsPlaying(false)
                stopTracking()
                break
              case YT.PlayerState.ENDED:
                setIsPlaying(false)
                stopTracking()
                // Mark as complete (not for shorts - they don't track progress)
                if (!isShort) {
                  updateProgress(videoId, durationSeconds, durationSeconds)
                }
                break
              case YT.PlayerState.BUFFERING:
                // Keep tracking during buffering
                break
            }
          },
        },
      })
    }

    if (window.YT && window.YT.Player) {
      initPlayer()
    } else {
      window.onYouTubeIframeAPIReady = initPlayer
    }

    return () => {
      stopTracking()
      if (playerRef.current) {
        playerRef.current.destroy()
      }
    }
  }, [youtubeId, startSeconds, autoplay, startTracking, stopTracking, videoId, durationSeconds, updateProgress, isShort])

  /**
   * Handle keyboard shortcuts
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors z-10"
        aria-label="Close video"
      >
        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Video title */}
      <div className="absolute top-4 left-4 right-16 z-10">
        <h2 className="text-white text-lg font-medium truncate">{title}</h2>
      </div>

      {/* Player container */}
      <div className="w-full max-w-6xl aspect-video mx-4">
        <div
          ref={containerRef}
          className="w-full h-full rounded-lg overflow-hidden shadow-2xl"
        />
      </div>

      {/* Loading state */}
      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-12 h-12 border-4 border-white/20 border-t-accent rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}

export const VideoPlayer = memo(VideoPlayerComponent)

/**
 * Video player modal hook
 * For easy integration with video cards
 */
export function useVideoPlayer() {
  const [activeVideo, setActiveVideo] = useState<{
    youtubeId: string
    videoId: string
    title: string
    durationSeconds: number
    progress?: number
    progressSeconds?: number
    isShort?: boolean
  } | null>(null)

  const openVideo = useCallback((video: {
    youtubeId: string
    videoId: string
    title: string
    durationSeconds: number
    progress?: number
    progressSeconds?: number
    isShort?: boolean
  }) => {
    setActiveVideo(video)
  }, [])

  const closeVideo = useCallback(() => {
    setActiveVideo(null)
  }, [])

  return {
    activeVideo,
    openVideo,
    closeVideo,
    isOpen: activeVideo !== null,
  }
}
