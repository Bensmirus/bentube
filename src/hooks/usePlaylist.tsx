'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { FeedVideo } from '@/components/VideoCard'

type PlaylistSource =
  | { type: 'group'; groupId: string; groupName: string }
  | { type: 'shuffle' }
  | { type: 'manual' }

type PlaylistState = {
  videos: FeedVideo[]
  currentIndex: number
  source: PlaylistSource | null
  isActive: boolean
}

type PlaylistContextType = {
  playlist: PlaylistState
  currentVideo: FeedVideo | null
  hasNext: boolean
  hasPrevious: boolean
  loadGroupPlaylist: (groupId: string, groupName: string) => Promise<void>
  loadShuffledPlaylist: (videos: FeedVideo[]) => void
  next: () => void
  previous: () => void
  jumpTo: (index: number) => void
  shuffle: () => void
  clear: () => void
  clearPlaylist: () => void
  isLoading: boolean
}

const initialState: PlaylistState = {
  videos: [],
  currentIndex: 0,
  source: null,
  isActive: false,
}

const PlaylistContext = createContext<PlaylistContextType | null>(null)

export function PlaylistProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [playlist, setPlaylist] = useState<PlaylistState>(initialState)
  const [isLoading, setIsLoading] = useState(false)

  const currentVideo = playlist.isActive && playlist.videos.length > 0
    ? playlist.videos[playlist.currentIndex]
    : null

  const hasNext = playlist.isActive && playlist.currentIndex < playlist.videos.length - 1
  const hasPrevious = playlist.isActive && playlist.currentIndex > 0

  const loadGroupPlaylist = useCallback(async (groupId: string, groupName: string) => {
    setIsLoading(true)

    try {
      const response = await fetch(`/api/feed/quick-play?groupId=${groupId}&limit=10`)

      if (!response.ok) {
        throw new Error('Failed to fetch playlist')
      }

      const data = await response.json()
      const videos: FeedVideo[] = data.videos || []

      if (videos.length === 0) {
        setIsLoading(false)
        return
      }

      setPlaylist({
        videos,
        currentIndex: 0,
        source: { type: 'group', groupId, groupName },
        isActive: true,
      })

      router.push(`/watch/${videos[0].id}?playlist=group:${groupId}`)
    } catch (error) {
      console.error('Error loading playlist:', error)
    } finally {
      setIsLoading(false)
    }
  }, [router])

  const loadShuffledPlaylist = useCallback((videos: FeedVideo[]) => {
    if (videos.length === 0) return

    // Shuffle the videos using Fisher-Yates algorithm
    const shuffled = [...videos]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }

    // Take up to 10 videos
    const playlistVideos = shuffled.slice(0, 10)

    setPlaylist({
      videos: playlistVideos,
      currentIndex: 0,
      source: { type: 'shuffle' },
      isActive: true,
    })

    router.push(`/watch/${playlistVideos[0].id}?playlist=shuffle`)
  }, [router])

  const next = useCallback(() => {
    if (!hasNext) return

    const nextIndex = playlist.currentIndex + 1
    const nextVideo = playlist.videos[nextIndex]

    setPlaylist(prev => ({
      ...prev,
      currentIndex: nextIndex,
    }))

    const playlistParam = playlist.source?.type === 'group'
      ? `?playlist=group:${playlist.source.groupId}`
      : playlist.source?.type === 'shuffle'
      ? '?playlist=shuffle'
      : ''
    router.push(`/watch/${nextVideo.id}${playlistParam}`)
  }, [hasNext, playlist, router])

  const previous = useCallback(() => {
    if (!hasPrevious) return

    const prevIndex = playlist.currentIndex - 1
    const prevVideo = playlist.videos[prevIndex]

    setPlaylist(prev => ({
      ...prev,
      currentIndex: prevIndex,
    }))

    const playlistParam = playlist.source?.type === 'group'
      ? `?playlist=group:${playlist.source.groupId}`
      : playlist.source?.type === 'shuffle'
      ? '?playlist=shuffle'
      : ''
    router.push(`/watch/${prevVideo.id}${playlistParam}`)
  }, [hasPrevious, playlist, router])

  const jumpTo = useCallback((index: number) => {
    if (index < 0 || index >= playlist.videos.length) return

    const targetVideo = playlist.videos[index]

    setPlaylist(prev => ({
      ...prev,
      currentIndex: index,
    }))

    const playlistParam = playlist.source?.type === 'group'
      ? `?playlist=group:${playlist.source.groupId}`
      : playlist.source?.type === 'shuffle'
      ? '?playlist=shuffle'
      : ''
    router.push(`/watch/${targetVideo.id}${playlistParam}`)
  }, [playlist, router])

  const shuffle = useCallback(() => {
    setPlaylist(prev => {
      const currentVideo = prev.videos[prev.currentIndex]
      const otherVideos = prev.videos.filter((_, i) => i !== prev.currentIndex)

      for (let i = otherVideos.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[otherVideos[i], otherVideos[j]] = [otherVideos[j], otherVideos[i]]
      }

      return {
        ...prev,
        videos: [currentVideo, ...otherVideos],
        currentIndex: 0,
      }
    })
  }, [])

  const clear = useCallback(() => {
    setPlaylist(initialState)
  }, [])

  return (
    <PlaylistContext.Provider
      value={{
        playlist,
        currentVideo,
        hasNext,
        hasPrevious,
        loadGroupPlaylist,
        loadShuffledPlaylist,
        next,
        previous,
        jumpTo,
        shuffle,
        clear,
        clearPlaylist: clear,
        isLoading,
      }}
    >
      {children}
    </PlaylistContext.Provider>
  )
}

export function usePlaylist() {
  const context = useContext(PlaylistContext)
  if (!context) {
    throw new Error('usePlaylist must be used within a PlaylistProvider')
  }
  return context
}
