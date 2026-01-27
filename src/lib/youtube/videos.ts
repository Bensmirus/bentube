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

export type FetchVideosResult = {
  videos: YouTubeVideo[]
  error: string | null
  apiCalls: number
  quotaExhausted?: boolean
  playlistNotFound?: boolean
  shouldRefreshPlaylistId?: boolean
}

export type FetchProgressCallback = (message: string) => Promise<void>

/**
 * Detect if a video is a YouTube Short.
 *
 * AGGRESSIVE filter: Any video under 3 minutes 1 second is treated as a Short.
 * This catches all actual Shorts plus some false positives, but prevents
 * Shorts from leaking into the main feed.
 *
 * Detection logic:
 * 1. If title contains #Shorts - definitely a Short
 * 2. If duration > 3 minutes - never a Short
 * 3. If duration <= 3 minutes - treated as a Short (except "teaser" in title)
 * 4. Live streams are never Shorts (even with 0 duration)
 */
function isVideoShort(
  durationSeconds: number | null,
  title: string,
  _thumbnailWidth?: number,  // Kept for backwards compatibility, not used
  _thumbnailHeight?: number, // YouTube thumbnails don't reflect actual aspect ratio
  liveBroadcastContent?: string
): boolean {
  // Live streams are never Shorts (they have 0 duration but aren't Shorts)
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

  // Video is under threshold - check if it matches non-Short patterns
  // These patterns indicate the video is likely a trailer, clip, teaser, etc.
  for (const pattern of NON_SHORT_PATTERNS) {
    if (pattern.test(title)) {
      return false
    }
  }

  // Duration under threshold and no non-Short patterns found - treat as a Short
  // This is aggressive but necessary since YouTube Shorts are very common
  // and we can't reliably detect them otherwise
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

  // Check if published date is in the future (scheduled/premiere)
  const isScheduled = publishedAt ? new Date(publishedAt) > new Date() : false

  return { isLive, isUpcoming, isScheduled }
}

/**
 * Fetch recent videos from a channel's uploads playlist
 * Only fetches videos published after lastFetchedAt for incremental sync
 *
 * Handles edge cases:
 * - Playlist 404 (signals need to refresh uploads_playlist_id)
 * - Mid-sync quota exhaustion (stops gracefully)
 * - Live streams and premieres (filters out or marks appropriately)
 * - Scheduled videos (filters out future publishedAt)
 * - Rate limiting with retry
 */
export async function fetchChannelVideos(
  youtube: youtube_v3.Youtube,
  uploadsPlaylistId: string,
  channelId: string,
  lastFetchedAt?: Date | null,
  maxResults: number = 50,
  userId?: string,
  options?: {
    checkQuotaMidSync?: boolean
    filterLiveStreams?: boolean
    filterScheduled?: boolean
    onProgress?: FetchProgressCallback
  }
): Promise<FetchVideosResult> {
  const videoIds: string[] = []
  const videoPublishedDates: Map<string, string> = new Map()
  let apiCalls = 0
  const opts = {
    checkQuotaMidSync: options?.checkQuotaMidSync ?? true,
    filterLiveStreams: options?.filterLiveStreams ?? true,
    filterScheduled: options?.filterScheduled ?? true,
    onProgress: options?.onProgress,
  }

  try {
    console.log(`[fetchChannelVideos] Starting fetch for playlist ${uploadsPlaylistId}, maxResults=${maxResults}, lastFetchedAt=${lastFetchedAt}`)

    // Step 1: Get video IDs from playlist (1 unit per 50 items)
    let pageToken: string | undefined
    let fetchedCount = 0
    let shouldStopPaginating = false

    // Quota check optimization: only check database every N pages to reduce queries
    const QUOTA_CHECK_INTERVAL = 10
    let lastQuotaCheck: { percentUsed: number; isExhausted: boolean } | null = null

    let pageNum = 0
    do {
      pageNum++

      // Report progress: fetching page
      if (opts.onProgress) {
        await opts.onProgress(`Fetching page ${pageNum}...`)
      }

      // Mid-sync quota check - only check database every N pages to reduce DB load
      if (opts.checkQuotaMidSync && userId) {
        const shouldCheckQuota = pageNum === 1 || pageNum % QUOTA_CHECK_INTERVAL === 0
        if (shouldCheckQuota) {
          const quotaStatus = await getQuotaStatus(userId)
          lastQuotaCheck = { percentUsed: quotaStatus.percentUsed, isExhausted: quotaStatus.isExhausted }
          console.log(`[fetchChannelVideos] Quota check (page ${pageNum}): ${Math.round(quotaStatus.percentUsed * 100)}% used, exhausted=${quotaStatus.isExhausted}`)
        }
        if (lastQuotaCheck && (lastQuotaCheck.isExhausted || lastQuotaCheck.percentUsed >= QUOTA_CRITICAL_THRESHOLD)) {
          console.log(`[fetchChannelVideos] Quota critical (${Math.round((lastQuotaCheck.percentUsed || 0) * 100)}%), stopping mid-sync`)
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
            playlistId: uploadsPlaylistId,
            maxResults: Math.min(50, maxResults - fetchedCount),
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
          // Playlist not found - likely channel changed their uploads playlist ID
          return {
            videos: [],
            error: 'Playlist not found',
            apiCalls,
            playlistNotFound: true,
            shouldRefreshPlaylistId: true,
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

      console.log(`[fetchChannelVideos] Playlist response: ${playlistResponse.items?.length || 0} items, nextPageToken=${playlistResponse.nextPageToken}`)

      if (playlistResponse.items) {
        for (const item of playlistResponse.items) {
          const publishedAt = item.contentDetails?.videoPublishedAt

          // Incremental sync: skip videos already fetched
          if (lastFetchedAt && publishedAt) {
            if (new Date(publishedAt) <= lastFetchedAt) {
              // Videos are in reverse chronological order, so we can stop
              shouldStopPaginating = true
              break
            }
          }

          // Skip scheduled/upcoming videos (publishedAt in the future)
          if (opts.filterScheduled && publishedAt && new Date(publishedAt) > new Date()) {
            continue
          }

          const videoId = item.contentDetails?.videoId
          if (videoId) {
            videoIds.push(videoId)
            if (publishedAt) {
              videoPublishedDates.set(videoId, publishedAt)
            }
            fetchedCount++
          }
        }
      }

      if (shouldStopPaginating || fetchedCount >= maxResults) break
      pageToken = playlistResponse.nextPageToken || undefined
    } while (pageToken)

    console.log(`[fetchChannelVideos] Collected ${videoIds.length} video IDs after pagination`)

    if (videoIds.length === 0) {
      console.log(`[fetchChannelVideos] No video IDs found, returning empty`)
      return { videos: [], error: null, apiCalls }
    }

    // Step 2: Get video details (duration, etc.) - batch 50 at a time (1 unit per batch)
    const videos: YouTubeVideo[] = []

    // Report progress: processing videos
    if (opts.onProgress) {
      await opts.onProgress(`Processing ${videoIds.length} videos...`)
    }

    // Quota check optimization for video details: check every N batches
    const DETAILS_QUOTA_CHECK_INTERVAL = 5
    let batchNum = 0

    for (let i = 0; i < videoIds.length; i += 50) {
      batchNum++

      // Mid-sync quota check - only check database every N batches to reduce DB load
      if (opts.checkQuotaMidSync && userId) {
        const shouldCheckQuota = batchNum === 1 || batchNum % DETAILS_QUOTA_CHECK_INTERVAL === 0
        if (shouldCheckQuota) {
          const quotaStatus = await getQuotaStatus(userId)
          lastQuotaCheck = { percentUsed: quotaStatus.percentUsed, isExhausted: quotaStatus.isExhausted }
        }
        if (lastQuotaCheck && (lastQuotaCheck.isExhausted || lastQuotaCheck.percentUsed >= QUOTA_CRITICAL_THRESHOLD)) {
          console.log(`Quota critical during video details fetch, returning partial results`)
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

        // Track quota usage if userId provided
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

          // Filter out scheduled videos (redundant check but catches edge cases)
          if (opts.filterScheduled && liveStatus.isScheduled) {
            continue
          }

          const { formatted, seconds } = parseDuration(video.contentDetails?.duration)
          const title = video.snippet?.title || ''

          // Get thumbnail dimensions for aspect ratio detection
          // Prefer 'default' thumbnail as it preserves original aspect ratio
          const defaultThumb = video.snippet?.thumbnails?.default
          const thumbWidth = defaultThumb?.width ?? undefined
          const thumbHeight = defaultThumb?.height ?? undefined

          // Skip shorts completely - don't import them at all
          const isShort = isVideoShort(seconds, title, thumbWidth, thumbHeight, liveBroadcastContent ?? undefined)
          if (isShort) {
            continue
          }

          videos.push({
            videoId: video.id!,
            channelId,
            title,
            thumbnail: video.snippet?.thumbnails?.medium?.url || null,
            duration: formatted,
            durationSeconds: seconds,
            isShort: false, // All videos here are non-shorts (shorts are skipped above)
            description: video.snippet?.description?.substring(0, 500) || null,
            publishedAt: publishedAt || null,
          })
        }
      }
    }

    return { videos, error: null, apiCalls }
  } catch (error) {
    const ytError = parseYouTubeError(error)
    console.error('Failed to fetch channel videos:', ytError)
    return {
      videos: [],
      error: ytError.message,
      apiCalls,
      quotaExhausted: ytError.code === 'QUOTA_EXCEEDED',
      playlistNotFound: ytError.code === 'NOT_FOUND',
      shouldRefreshPlaylistId: ytError.code === 'NOT_FOUND',
    }
  }
}

/**
 * Refresh a channel's uploads playlist ID
 * Call this when playlist 404 occurs to get the current uploads playlist
 */
export async function refreshUploadsPlaylistId(
  youtube: youtube_v3.Youtube,
  channelId: string,
  userId?: string
): Promise<{ uploadsPlaylistId: string | null; error: string | null }> {
  try {
    const response = await withRateLimitAndRetry(async () => {
      const res = await youtube.channels.list({
        part: ['contentDetails'],
        id: [channelId],
      })
      return res.data
    })

    if (userId) {
      await trackQuotaUsage(userId, 'channels.list', 1)
    }

    const uploadsPlaylistId = response.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
    return { uploadsPlaylistId: uploadsPlaylistId || null, error: null }
  } catch (error) {
    const ytError = parseYouTubeError(error)
    return { uploadsPlaylistId: null, error: ytError.message }
  }
}
