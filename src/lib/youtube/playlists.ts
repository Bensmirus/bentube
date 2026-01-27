import { youtube_v3 } from 'googleapis'
import { parseDuration } from '@/lib/utils'
import type { YouTubeVideo } from './types'
import { trackQuotaUsage, getQuotaStatus, QUOTA_CRITICAL_THRESHOLD } from './quota'
import { parseYouTubeError, withRateLimitAndRetry, YouTubeError } from './utils'

const SHORTS_DURATION_THRESHOLD = 181 // seconds (3 minutes 1 second - aggressive filter)

// Live broadcast content types to filter
const LIVE_BROADCAST_TYPES = ['live', 'upcoming'] as const

// Patterns that indicate a video is likely NOT a Short even if under 60s
const NON_SHORT_PATTERNS = [
  /teaser/i,
]

export type FetchPlaylistVideosResult = {
  videos: YouTubeVideo[]
  error: string | null
  apiCalls: number
  quotaExhausted?: boolean
  playlistNotFound?: boolean
}

export type FetchProgressCallback = (message: string) => Promise<void>

/**
 * Detect if a video is a YouTube Short.
 */
function isVideoShort(
  durationSeconds: number | null,
  title: string,
  liveBroadcastContent?: string
): boolean {
  // Live streams are never Shorts
  if (liveBroadcastContent && LIVE_BROADCAST_TYPES.includes(liveBroadcastContent as typeof LIVE_BROADCAST_TYPES[number])) {
    return false
  }

  // Title contains #Shorts - creator explicitly tagged it as a Short
  if (/#shorts/i.test(title)) {
    return true
  }

  // Videos over threshold are never Shorts
  if (durationSeconds === null || durationSeconds > SHORTS_DURATION_THRESHOLD) {
    return false
  }

  // Check if it matches non-Short patterns
  for (const pattern of NON_SHORT_PATTERNS) {
    if (pattern.test(title)) {
      return false
    }
  }

  // Duration under threshold - treat as a Short
  return true
}

/**
 * Check if a video is a live stream or scheduled premiere
 */
function isLiveOrPremiere(
  liveBroadcastContent?: string | null,
  publishedAt?: string | null
): { isLive: boolean; isUpcoming: boolean; isScheduled: boolean } {
  const isLive = liveBroadcastContent === 'live'
  const isUpcoming = liveBroadcastContent === 'upcoming'
  const isScheduled = publishedAt ? new Date(publishedAt) > new Date() : false
  return { isLive, isUpcoming, isScheduled }
}

/**
 * Fetch videos from a YouTube playlist (not a channel's uploads playlist)
 * This is for importing arbitrary user playlists, not for channel sync.
 *
 * Key differences from fetchChannelVideos:
 * - No incremental sync (no lastFetchedAt) - always fetches all videos
 * - Playlist owner is not necessarily the video uploader
 * - Videos can be from multiple channels
 */
export async function fetchPlaylistVideos(
  youtube: youtube_v3.Youtube,
  playlistId: string,
  userId?: string,
  options?: {
    maxResults?: number
    checkQuotaMidSync?: boolean
    filterLiveStreams?: boolean
    filterScheduled?: boolean
    filterShorts?: boolean
    onProgress?: FetchProgressCallback
    existingVideoIds?: Set<string>  // Skip videos that already exist (for refresh)
  }
): Promise<FetchPlaylistVideosResult> {
  const videoIds: string[] = []
  const videoChannelMap: Map<string, string> = new Map() // videoId -> channelId
  let apiCalls = 0

  const opts = {
    maxResults: options?.maxResults ?? 5000, // Default high limit for playlists
    checkQuotaMidSync: options?.checkQuotaMidSync ?? true,
    filterLiveStreams: options?.filterLiveStreams ?? true,
    filterScheduled: options?.filterScheduled ?? true,
    filterShorts: options?.filterShorts ?? true,
    onProgress: options?.onProgress,
    existingVideoIds: options?.existingVideoIds ?? new Set<string>(),
  }

  try {
    console.log(`[fetchPlaylistVideos] Starting fetch for playlist ${playlistId}, maxResults=${opts.maxResults}`)

    // Step 1: Get video IDs from playlist
    let pageToken: string | undefined
    let fetchedCount = 0

    // Quota check optimization: only check database every N pages
    const QUOTA_CHECK_INTERVAL = 10
    let lastQuotaCheck: { percentUsed: number; isExhausted: boolean } | null = null

    let pageNum = 0
    do {
      pageNum++

      // Report progress: fetching page
      if (opts.onProgress) {
        await opts.onProgress(`Fetching page ${pageNum}...`)
      }

      // Mid-sync quota check
      if (opts.checkQuotaMidSync && userId) {
        const shouldCheckQuota = pageNum === 1 || pageNum % QUOTA_CHECK_INTERVAL === 0
        if (shouldCheckQuota) {
          const quotaStatus = await getQuotaStatus(userId)
          lastQuotaCheck = { percentUsed: quotaStatus.percentUsed, isExhausted: quotaStatus.isExhausted }
          console.log(`[fetchPlaylistVideos] Quota check (page ${pageNum}): ${Math.round(quotaStatus.percentUsed * 100)}% used`)
        }
        if (lastQuotaCheck && (lastQuotaCheck.isExhausted || lastQuotaCheck.percentUsed >= QUOTA_CRITICAL_THRESHOLD)) {
          console.log(`[fetchPlaylistVideos] Quota critical, stopping mid-sync`)
          return {
            videos: [],
            error: null,
            apiCalls,
            quotaExhausted: true,
          }
        }
      }

      let playlistResponse: youtube_v3.Schema$PlaylistItemListResponse
      try {
        playlistResponse = await withRateLimitAndRetry(async () => {
          const response = await youtube.playlistItems.list({
            part: ['snippet', 'contentDetails'],
            playlistId,
            maxResults: Math.min(50, opts.maxResults - fetchedCount),
            pageToken,
          })
          return response.data
        })
        apiCalls++

        // Track quota usage if userId provided
        if (userId) {
          await trackQuotaUsage(userId, 'playlistItems.list', 1)
        }
      } catch (err) {
        const ytError = err as YouTubeError
        if (ytError.code === 'NOT_FOUND') {
          return {
            videos: [],
            error: 'Playlist not found or is private',
            apiCalls,
            playlistNotFound: true,
          }
        }
        if (ytError.code === 'QUOTA_EXCEEDED') {
          return {
            videos: [],
            error: 'Quota exceeded',
            apiCalls,
            quotaExhausted: true,
          }
        }
        throw err
      }

      console.log(`[fetchPlaylistVideos] Page ${pageNum}: ${playlistResponse.items?.length || 0} items`)

      if (playlistResponse.items) {
        for (const item of playlistResponse.items) {
          const videoId = item.contentDetails?.videoId
          const channelId = item.snippet?.videoOwnerChannelId

          if (videoId) {
            // Skip if we already have this video (for refresh scenario)
            if (opts.existingVideoIds.has(videoId)) {
              continue
            }

            // Skip scheduled/upcoming videos
            const publishedAt = item.contentDetails?.videoPublishedAt
            if (opts.filterScheduled && publishedAt && new Date(publishedAt) > new Date()) {
              continue
            }

            videoIds.push(videoId)
            if (channelId) {
              videoChannelMap.set(videoId, channelId)
            }
            fetchedCount++
          }
        }
      }

      if (fetchedCount >= opts.maxResults) break
      pageToken = playlistResponse.nextPageToken || undefined
    } while (pageToken)

    console.log(`[fetchPlaylistVideos] Collected ${videoIds.length} video IDs`)

    if (videoIds.length === 0) {
      return { videos: [], error: null, apiCalls }
    }

    // Step 2: Get video details - batch 50 at a time
    const videos: YouTubeVideo[] = []

    if (opts.onProgress) {
      await opts.onProgress(`Processing ${videoIds.length} videos...`)
    }

    const DETAILS_QUOTA_CHECK_INTERVAL = 5
    let batchNum = 0

    for (let i = 0; i < videoIds.length; i += 50) {
      batchNum++

      // Mid-sync quota check
      if (opts.checkQuotaMidSync && userId) {
        const shouldCheckQuota = batchNum === 1 || batchNum % DETAILS_QUOTA_CHECK_INTERVAL === 0
        if (shouldCheckQuota) {
          const quotaStatus = await getQuotaStatus(userId)
          lastQuotaCheck = { percentUsed: quotaStatus.percentUsed, isExhausted: quotaStatus.isExhausted }
        }
        if (lastQuotaCheck && (lastQuotaCheck.isExhausted || lastQuotaCheck.percentUsed >= QUOTA_CRITICAL_THRESHOLD)) {
          console.log(`[fetchPlaylistVideos] Quota critical during video details fetch`)
          return {
            videos,
            error: null,
            apiCalls,
            quotaExhausted: true,
          }
        }
      }

      const batch = videoIds.slice(i, i + 50)

      let videoResponse: youtube_v3.Schema$VideoListResponse
      try {
        videoResponse = await withRateLimitAndRetry(async () => {
          const response = await youtube.videos.list({
            part: ['snippet', 'contentDetails', 'liveStreamingDetails'],
            id: batch,
          })
          return response.data
        })
        apiCalls++

        if (userId) {
          await trackQuotaUsage(userId, 'videos.list', 1)
        }
      } catch (err) {
        const ytError = err as YouTubeError
        if (ytError.code === 'QUOTA_EXCEEDED') {
          return {
            videos,
            error: 'Quota exceeded',
            apiCalls,
            quotaExhausted: true,
          }
        }
        throw err
      }

      if (videoResponse.items) {
        for (const video of videoResponse.items) {
          const liveBroadcastContent = video.snippet?.liveBroadcastContent
          const publishedAt = video.snippet?.publishedAt

          // Check if this is a live stream or premiere
          const liveStatus = isLiveOrPremiere(liveBroadcastContent, publishedAt)

          // Filter out active live streams and upcoming premieres
          if (opts.filterLiveStreams && (liveStatus.isLive || liveStatus.isUpcoming)) {
            continue
          }

          // Filter out scheduled videos
          if (opts.filterScheduled && liveStatus.isScheduled) {
            continue
          }

          const { formatted, seconds } = parseDuration(video.contentDetails?.duration)
          const title = video.snippet?.title || ''

          // Filter shorts if requested
          const isShort = isVideoShort(seconds, title, liveBroadcastContent ?? undefined)
          if (opts.filterShorts && isShort) {
            continue
          }

          // Get channel ID from our map or from the video snippet
          const channelId = videoChannelMap.get(video.id!) || video.snippet?.channelId || 'unknown'

          videos.push({
            videoId: video.id!,
            channelId,
            channelTitle: video.snippet?.channelTitle || null,
            title,
            thumbnail: video.snippet?.thumbnails?.medium?.url || null,
            duration: formatted,
            durationSeconds: seconds,
            isShort,
            publishedAt: publishedAt || null,
          })
        }
      }
    }

    return { videos, error: null, apiCalls }
  } catch (error) {
    const ytError = parseYouTubeError(error)
    console.error('[fetchPlaylistVideos] Error:', ytError)
    return {
      videos: [],
      error: ytError.message,
      apiCalls,
      quotaExhausted: ytError.code === 'QUOTA_EXCEEDED',
      playlistNotFound: ytError.code === 'NOT_FOUND',
    }
  }
}
