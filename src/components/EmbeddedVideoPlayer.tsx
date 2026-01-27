'use client'

import { useCallback, useEffect, useRef, useState, memo } from 'react'
import { useWatchProgressContext } from '@/hooks/useWatchProgress'

type EmbeddedVideoPlayerProps = {
  youtubeId: string
  videoId: string // Internal video ID for progress tracking
  durationSeconds: number
  initialProgress?: number // 0-1
  initialProgressSeconds?: number
  autoplay?: boolean
  isShort?: boolean // Shorts don't track progress (too short to matter)
  onTimeUpdate?: (currentTime: number) => void // Callback for current playback time
  playbackRate?: number // Desired playback rate (0.25-2)
  onPlaybackRateChange?: (rate: number) => void // Callback when rate actually changes
  onEnded?: () => void // Callback when video finishes playing
  playerRef?: React.MutableRefObject<{
    seekTo: (seconds: number) => void
    setPlaybackRate?: (rate: number) => void
    getPlaybackRate?: () => number
    togglePlay?: () => void
    isPlaying?: () => boolean
  } | null>
}

declare global {
  interface Window {
    YT: typeof YT
    onYouTubeIframeAPIReady: () => void
  }
}

/**
 * Embedded YouTube video player for dedicated watch page
 *
 * Features:
 * - Embeds YouTube player via IFrame API
 * - Tracks playback progress every 5 seconds
 * - Resumes from last position
 * - Syncs progress across devices via useWatchProgress hook
 * - No modal overlay - designed to be embedded in a page
 */
function EmbeddedVideoPlayerComponent({
  youtubeId,
  videoId,
  durationSeconds,
  initialProgress = 0,
  initialProgressSeconds,
  autoplay = true,
  isShort = false,
  onTimeUpdate,
  playbackRate = 1,
  onPlaybackRateChange,
  onEnded,
  playerRef: externalPlayerRef,
}: EmbeddedVideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YT.Player | null>(null)
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [, setIsPlaying] = useState(false)

  // Use refs for callbacks and values to avoid stale closures and unnecessary effect re-runs
  const onTimeUpdateRef = useRef(onTimeUpdate)
  const onPlaybackRateChangeRef = useRef(onPlaybackRateChange)
  const onEndedRef = useRef(onEnded)
  const playbackRateRef = useRef(playbackRate)

  // Keep refs in sync with props
  useEffect(() => {
    onTimeUpdateRef.current = onTimeUpdate
  }, [onTimeUpdate])

  useEffect(() => {
    onPlaybackRateChangeRef.current = onPlaybackRateChange
  }, [onPlaybackRateChange])

  useEffect(() => {
    onEndedRef.current = onEnded
  }, [onEnded])

  useEffect(() => {
    playbackRateRef.current = playbackRate
  }, [playbackRate])

  const { updateProgress } = useWatchProgressContext()
  const updateProgressRef = useRef(updateProgress)
  useEffect(() => {
    updateProgressRef.current = updateProgress
  }, [updateProgress])

  // Calculate start position in seconds
  const startSeconds = initialProgressSeconds ?? Math.floor(initialProgress * durationSeconds)

  /**
   * Track current playback progress
   * Note: Shorts don't track progress (too short to matter)
   * Uses refs for callbacks to maintain stable function reference
   */
  const trackProgress = useCallback(() => {
    if (!playerRef.current || isShort) return

    try {
      const currentTime = playerRef.current.getCurrentTime()
      const duration = playerRef.current.getDuration() || durationSeconds

      // Call time update callback if provided (via ref to avoid stale closure)
      onTimeUpdateRef.current?.(currentTime)

      if (currentTime > 0 && duration > 0) {
        updateProgressRef.current(videoId, currentTime, duration)
      }
    } catch {
      // Player might not be ready yet
    }
  }, [videoId, durationSeconds, isShort])

  // Store trackProgress in a ref so we can use it in tracking without causing re-renders
  const trackProgressRef = useRef(trackProgress)
  useEffect(() => {
    trackProgressRef.current = trackProgress
  }, [trackProgress])

  /**
   * Start progress tracking interval
   * Uses ref to avoid being recreated when trackProgress changes
   */
  const startTracking = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
    }

    // Track immediately
    trackProgressRef.current()

    // Then track every 5 seconds
    progressIntervalRef.current = setInterval(() => trackProgressRef.current(), 5000)
  }, [])

  /**
   * Stop progress tracking
   */
  const stopTracking = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
      progressIntervalRef.current = null
    }
    // Track final position
    trackProgressRef.current()
  }, [])

  /**
   * Update playback rate when prop changes
   */
  useEffect(() => {
    if (isReady && playerRef.current && typeof playbackRate === 'number') {
      playerRef.current.setPlaybackRate(playbackRate)
    }
  }, [isReady, playbackRate])

  /**
   * Initialize YouTube IFrame API
   */
  useEffect(() => {
    let isMounted = true

    const initPlayer = () => {
      if (!isMounted || !containerRef.current) return

      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId: youtubeId,
        width: '100%',
        height: '100%',
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
            if (!isMounted) return
            setIsReady(true)

            // Apply initial playback rate if not default
            if (playbackRateRef.current !== 1 && playerRef.current) {
              playerRef.current.setPlaybackRate(playbackRateRef.current)
            }

            // Expose seekTo, playback speed, and play/pause methods via external ref if provided
            if (externalPlayerRef && playerRef.current) {
              externalPlayerRef.current = {
                seekTo: (seconds: number) => {
                  playerRef.current?.seekTo(seconds, true)
                },
                setPlaybackRate: (rate: number) => {
                  playerRef.current?.setPlaybackRate(rate)
                },
                getPlaybackRate: () => {
                  return playerRef.current?.getPlaybackRate() || 1
                },
                togglePlay: () => {
                  if (!playerRef.current) return
                  const state = playerRef.current.getPlayerState()
                  if (state === YT.PlayerState.PLAYING) {
                    playerRef.current.pauseVideo()
                  } else {
                    playerRef.current.playVideo()
                  }
                },
                isPlaying: () => {
                  return playerRef.current?.getPlayerState() === YT.PlayerState.PLAYING
                },
              }
            }

            if (autoplay) {
              setIsPlaying(true)
              startTracking()
            }
          },
          onPlaybackRateChange: (event: YT.OnPlaybackRateChangeEvent) => {
            // Use ref to always get latest callback
            onPlaybackRateChangeRef.current?.(event.data)
          },
          onStateChange: (event: YT.OnStateChangeEvent) => {
            if (!isMounted) return
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
                  updateProgressRef.current(videoId, durationSeconds, durationSeconds)
                }
                // Notify parent that video ended (for playlist auto-advance)
                onEndedRef.current?.()
                break
              case YT.PlayerState.BUFFERING:
                // Keep tracking during buffering
                break
            }
          },
        },
      })
    }

    // Load YouTube IFrame API if not already loaded
    if (window.YT && window.YT.Player) {
      initPlayer()
    } else {
      // Check if script is already being loaded
      const existingScript = document.querySelector('script[src*="youtube.com/iframe_api"]')
      if (!existingScript) {
        const tag = document.createElement('script')
        tag.src = 'https://www.youtube.com/iframe_api'
        const firstScriptTag = document.getElementsByTagName('script')[0]
        firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag)
      }

      // Use a polling approach instead of overwriting the global callback
      // This prevents race conditions when multiple components mount
      const checkReady = setInterval(() => {
        if (window.YT && window.YT.Player) {
          clearInterval(checkReady)
          initPlayer()
        }
      }, 100)

      // Clear interval on cleanup
      return () => {
        isMounted = false
        clearInterval(checkReady)
        setIsReady(false)
        stopTracking()
        if (playerRef.current) {
          playerRef.current.destroy()
          playerRef.current = null
        }
        if (externalPlayerRef) {
          externalPlayerRef.current = null
        }
      }
    }

    return () => {
      isMounted = false
      // Reset ready state BEFORE destroying to prevent methods being called on destroyed player
      setIsReady(false)
      stopTracking()
      if (playerRef.current) {
        playerRef.current.destroy()
        playerRef.current = null
      }
      // Clear external ref to prevent stale method calls
      if (externalPlayerRef) {
        externalPlayerRef.current = null
      }
    }
    // Only recreate player when video changes or core settings change
    // Callbacks are accessed via refs to avoid unnecessary recreation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [youtubeId, startSeconds, autoplay, videoId, durationSeconds, isShort])

  return (
    <div className="relative w-full h-full bg-black">
      {/* Player container */}
      <div
        ref={containerRef}
        className="w-full h-full"
      />

      {/* Loading state */}
      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <div className="w-12 h-12 border-4 border-white/20 border-t-accent rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}

export const EmbeddedVideoPlayer = memo(EmbeddedVideoPlayerComponent)
