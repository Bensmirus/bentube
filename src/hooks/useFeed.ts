'use client'

import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { FeedVideo } from '@/components/VideoCard'
import type { Group } from '@/components/GroupSidebar'

// Request timeout helper
const fetchWithTimeout = async (
  url: string,
  options: RequestInit = {},
  timeoutMs = 10000
): Promise<Response> => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.')
    }
    throw error
  }
}

// Query keys for cache management
export const queryKeys = {
  feed: (params: FeedParams) => ['feed', params] as const,
  infiniteFeed: ['infiniteFeed'] as const, // Base key for infinite scroll queries
  groups: ['groups'] as const,
  inProgressCount: (groupId: string | null) => ['inProgressCount', groupId] as const,
  shortsCount: (groupId: string | null) => ['shortsCount', groupId] as const,
  syncStatus: ['syncStatus'] as const,
}

type FeedParams = {
  groupId: string | null
  search: string
  showInProgress: boolean
  showWatchLater?: boolean  // Optional - filter to only show watch later videos
  showShortsOnly?: boolean  // Optional - defaults to false (exclude shorts from main feed)
  tagIds?: string[]  // Optional - filter by tags (AND logic - must have all tags)
  minDate?: string  // Optional - ISO date string for minimum publish date
  maxDate?: string  // Optional - ISO date string for maximum publish date
  minDuration?: number  // Optional - minimum duration in seconds
  maxDuration?: number  // Optional - maximum duration in seconds
  channelIds?: string[]  // Optional - filter by specific channel IDs
  limit: number
  offset: number
}

type FeedResponse = {
  videos: FeedVideo[]
  total: number
  limit: number
  offset: number
}

// Fetch feed videos
async function fetchFeed(params: FeedParams): Promise<FeedResponse> {
  const searchParams = new URLSearchParams()
  if (params.groupId) searchParams.set('group_id', params.groupId)
  if (params.search) searchParams.set('search', params.search)
  if (params.showInProgress) searchParams.set('in_progress', 'true')
  if (params.showWatchLater) searchParams.set('watch_later', 'true')
  if (params.tagIds && params.tagIds.length > 0) {
    searchParams.set('tag_ids', params.tagIds.join(','))
  }
  // Date filters
  if (params.minDate) searchParams.set('min_date', params.minDate)
  if (params.maxDate) searchParams.set('max_date', params.maxDate)
  // Duration filters
  if (params.minDuration !== undefined) searchParams.set('min_duration', params.minDuration.toString())
  if (params.maxDuration !== undefined) searchParams.set('max_duration', params.maxDuration.toString())
  // Channel filter
  if (params.channelIds && params.channelIds.length > 0) {
    searchParams.set('channel_ids', params.channelIds.join(','))
  }
  // Shorts filtering: only show shorts when explicitly requested
  // When viewing main feed (!showShortsOnly), exclude shorts
  // When viewing shorts tab (showShortsOnly), only show shorts
  if (params.showShortsOnly) {
    searchParams.set('shorts_only', 'true')
  }
  // Note: We intentionally don't set include_shorts=false because
  // the database function defaults to excluding shorts anyway (p_include_shorts = false)
  searchParams.set('limit', params.limit.toString())
  searchParams.set('offset', params.offset.toString())

  const res = await fetchWithTimeout(`/api/feed?${searchParams}`)
  if (!res.ok) {
    throw new Error('Failed to fetch feed')
  }
  return res.json()
}

export function useFeed(params: FeedParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.feed(params),
    queryFn: () => fetchFeed(params),
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    enabled, // Only fetch when enabled (user is authenticated)
  })
}

// Infinite scroll feed - loads more videos as user scrolls
type InfiniteFeedParams = Omit<FeedParams, 'offset'>

export function useInfiniteFeed(params: InfiniteFeedParams, enabled = true) {
  return useInfiniteQuery({
    queryKey: ['infiniteFeed', params] as const,
    queryFn: ({ pageParam = 0 }) => fetchFeed({ ...params, offset: pageParam }),
    getNextPageParam: (lastPage) => {
      const nextOffset = lastPage.offset + lastPage.limit
      // If we got fewer videos than the limit, we've reached the end
      if (lastPage.videos.length < lastPage.limit) return undefined
      // If nextOffset >= total, we've reached the end
      if (nextOffset >= lastPage.total) return undefined
      return nextOffset
    },
    initialPageParam: 0,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    enabled,
  })
}

// Fetch groups
async function fetchGroups(): Promise<{ groups: Group[] }> {
  const res = await fetchWithTimeout('/api/groups')
  if (!res.ok) {
    throw new Error('Failed to fetch groups')
  }
  return res.json()
}

export function useGroups(enabled = true) {
  return useQuery({
    queryKey: queryKeys.groups,
    queryFn: fetchGroups,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 10 * 60 * 1000, // 10 minutes
    enabled, // Only fetch when enabled (user is authenticated)
  })
}

// Fetch in-progress count
async function fetchInProgressCount(groupId: string | null): Promise<number> {
  const params = new URLSearchParams()
  if (groupId) params.set('group_id', groupId)
  params.set('in_progress', 'true')
  params.set('limit', '1')

  const res = await fetchWithTimeout(`/api/feed?${params}`)
  if (!res.ok) {
    throw new Error('Failed to fetch in-progress count')
  }
  const data = await res.json()
  return data.total || 0
}

export function useInProgressCount(groupId: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.inProgressCount(groupId),
    queryFn: () => fetchInProgressCount(groupId),
    staleTime: 30 * 1000, // 30 seconds
    enabled, // Only fetch when enabled (user is authenticated)
  })
}

// Fetch shorts count
async function fetchShortsCount(groupId: string | null): Promise<number> {
  const params = new URLSearchParams()
  if (groupId) params.set('group_id', groupId)
  params.set('shorts_only', 'true')
  params.set('limit', '1')

  const res = await fetchWithTimeout(`/api/feed?${params}`)
  if (!res.ok) {
    throw new Error('Failed to fetch shorts count')
  }
  const data = await res.json()
  return data.total || 0
}

export function useShortsCount(groupId: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.shortsCount(groupId),
    queryFn: () => fetchShortsCount(groupId),
    staleTime: 30 * 1000, // 30 seconds
    enabled, // Only fetch when enabled (user is authenticated)
    // Don't let shorts count query failure block the app
    retry: false,
    throwOnError: false,
  })
}

// Fetch watch later count
async function fetchWatchLaterCount(groupId: string | null): Promise<number> {
  const params = new URLSearchParams()
  if (groupId) params.set('group_id', groupId)
  params.set('watch_later', 'true')
  params.set('limit', '1')

  const res = await fetchWithTimeout(`/api/feed?${params}`)
  if (!res.ok) {
    throw new Error('Failed to fetch watch later count')
  }
  const data = await res.json()
  return data.total || 0
}

export function useWatchLaterCount(groupId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['watchLaterCount', groupId] as const,
    queryFn: () => fetchWatchLaterCount(groupId),
    staleTime: 30 * 1000, // 30 seconds
    enabled,
  })
}

// Mutations for video actions
export function useToggleWatched() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ videoId, watched }: { videoId: string; watched: boolean }) => {
      const res = await fetchWithTimeout(`/api/feed/${videoId}/watch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watched }),
      })
      if (!res.ok) {
        throw new Error('Failed to update watch status')
      }
      return res.json()
    },
    onSuccess: () => {
      // Invalidate feed queries to refetch (use infiniteFeed base key to match all params)
      queryClient.invalidateQueries({ queryKey: queryKeys.infiniteFeed })
      queryClient.invalidateQueries({ queryKey: ['inProgressCount'] })
    },
  })
}

export function useToggleWatchLater() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ videoId, watchLater }: { videoId: string; watchLater: boolean }) => {
      const res = await fetchWithTimeout(`/api/feed/${videoId}/watch-later`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watch_later: watchLater }),
      })
      if (!res.ok) {
        throw new Error('Failed to update watch later status')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.infiniteFeed })
      queryClient.invalidateQueries({ queryKey: ['watchLaterCount'] })
    },
  })
}

export function useHideVideo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (videoId: string) => {
      const res = await fetchWithTimeout(`/api/feed/${videoId}/hide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hidden: true }),
      })
      if (!res.ok) {
        throw new Error('Failed to hide video')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.infiniteFeed })
    },
  })
}

export function useResetProgress() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (videoId: string) => {
      const res = await fetchWithTimeout(`/api/feed/${videoId}/progress/reset`, {
        method: 'POST',
      })
      if (!res.ok) {
        throw new Error('Failed to reset progress')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.infiniteFeed })
      queryClient.invalidateQueries({ queryKey: ['inProgressCount'] })
    },
  })
}

export function useDeleteVideo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (videoId: string) => {
      const res = await fetchWithTimeout(`/api/feed/${videoId}/delete`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        throw new Error('Failed to delete video')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.infiniteFeed })
      queryClient.invalidateQueries({ queryKey: ['inProgressCount'] })
      queryClient.invalidateQueries({ queryKey: ['watchLaterCount'] })
      queryClient.invalidateQueries({ queryKey: ['shortsCount'] })
    },
  })
}

export function useDeleteMultipleVideos() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (videoIds: string[]) => {
      const res = await fetchWithTimeout('/api/feed/delete-multiple', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoIds }),
      })
      if (!res.ok) {
        throw new Error('Failed to delete videos')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.infiniteFeed })
      queryClient.invalidateQueries({ queryKey: ['inProgressCount'] })
      queryClient.invalidateQueries({ queryKey: ['watchLaterCount'] })
      queryClient.invalidateQueries({ queryKey: ['shortsCount'] })
    },
  })
}

export function useCreateGroup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: { name: string; icon: string; color: string }) => {
      const res = await fetchWithTimeout('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to create group')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groups })
    },
  })
}
