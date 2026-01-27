import { youtube_v3 } from 'googleapis'
import type { YouTubeSubscription } from './types'
import { trackQuotaUsage, getQuotaStatus, QUOTA_CRITICAL_THRESHOLD } from './quota'
import { parseYouTubeError, withRateLimitAndRetry, YouTubeError } from './utils'

export type FetchSubscriptionsResult = {
  subscriptions: YouTubeSubscription[]
  error: string | null
  apiCalls: number
  quotaExhausted?: boolean
}

/**
 * Fetch all subscriptions for authenticated user
 * Handles pagination (50 items per page, 1 unit per request)
 *
 * Handles edge cases:
 * - Mid-sync quota exhaustion (stops gracefully, returns partial results)
 * - Rate limiting with retry
 * - Large subscription lists (1000+)
 */
export async function fetchAllSubscriptions(
  youtube: youtube_v3.Youtube,
  userId?: string,
  options?: {
    checkQuotaMidSync?: boolean
    maxSubscriptions?: number
  }
): Promise<FetchSubscriptionsResult> {
  const subscriptions: YouTubeSubscription[] = []
  let pageToken: string | undefined
  let apiCalls = 0
  const opts = {
    checkQuotaMidSync: options?.checkQuotaMidSync ?? true,
    maxSubscriptions: options?.maxSubscriptions ?? 2000, // Safety limit
  }

  try {
    do {
      // Mid-sync quota check before each API call
      if (opts.checkQuotaMidSync && userId) {
        const quotaStatus = await getQuotaStatus(userId)
        if (quotaStatus.isExhausted || quotaStatus.percentUsed >= QUOTA_CRITICAL_THRESHOLD) {
          console.log(`Quota critical (${Math.round(quotaStatus.percentUsed * 100)}%), returning partial subscriptions`)
          return {
            subscriptions,
            error: null,
            apiCalls,
            quotaExhausted: true,
          }
        }
      }

      let responseData: youtube_v3.Schema$SubscriptionListResponse
      try {
        responseData = await withRateLimitAndRetry(async () => {
          const response = await youtube.subscriptions.list({
            part: ['snippet', 'contentDetails'],
            mine: true,
            maxResults: 50,
            pageToken,
          })
          return response.data
        })
        apiCalls++

        // Track quota usage if userId provided
        if (userId) {
          await trackQuotaUsage(userId, 'subscriptions.list', 1)
        }
      } catch (err) {
        const ytError = err as YouTubeError
        if (ytError.code === 'QUOTA_EXCEEDED') {
          return {
            subscriptions,
            error: 'Quota exceeded',
            apiCalls,
            quotaExhausted: true,
          }
        }
        throw err
      }

      if (responseData.items) {
        for (const item of responseData.items) {
          const channelId = item.snippet?.resourceId?.channelId
          if (!channelId) continue

          subscriptions.push({
            channelId,
            title: item.snippet?.title || 'Unknown Channel',
            thumbnail: item.snippet?.thumbnails?.default?.url || null,
            uploadsPlaylistId: null, // Will be fetched separately via channel details
          })
        }
      }

      // Safety check for very large subscription lists
      if (subscriptions.length >= opts.maxSubscriptions) {
        console.log(`Reached max subscriptions limit (${opts.maxSubscriptions}), stopping`)
        break
      }

      pageToken = responseData.nextPageToken || undefined
    } while (pageToken)

    return { subscriptions, error: null, apiCalls }
  } catch (error) {
    const ytError = parseYouTubeError(error)
    console.error('Failed to fetch subscriptions:', ytError)
    return {
      subscriptions,
      error: ytError.message,
      apiCalls,
      quotaExhausted: ytError.code === 'QUOTA_EXCEEDED',
    }
  }
}

export type FetchChannelDetailsResult = {
  uploadsMap: Map<string, string>
  apiCalls: number
  quotaExhausted?: boolean
  failedChannels?: string[]
}

/**
 * Fetch channel details to get uploads playlist ID
 * Batch up to 50 channel IDs per request (1 unit)
 *
 * Handles edge cases:
 * - Mid-sync quota exhaustion (returns partial results)
 * - Rate limiting with retry
 * - Individual batch failures (continues with other batches)
 */
export async function fetchChannelDetails(
  youtube: youtube_v3.Youtube,
  channelIds: string[],
  userId?: string,
  options?: {
    checkQuotaMidSync?: boolean
  }
): Promise<FetchChannelDetailsResult> {
  const uploadsMap = new Map<string, string>()
  const failedChannels: string[] = []
  let apiCalls = 0
  const opts = {
    checkQuotaMidSync: options?.checkQuotaMidSync ?? true,
  }

  // Batch into groups of 50
  for (let i = 0; i < channelIds.length; i += 50) {
    // Mid-sync quota check before each batch
    if (opts.checkQuotaMidSync && userId) {
      const quotaStatus = await getQuotaStatus(userId)
      if (quotaStatus.isExhausted || quotaStatus.percentUsed >= QUOTA_CRITICAL_THRESHOLD) {
        console.log(`Quota critical during channel details fetch, returning partial results`)
        // Mark remaining channels as failed
        for (let j = i; j < channelIds.length; j++) {
          failedChannels.push(channelIds[j])
        }
        return {
          uploadsMap,
          apiCalls,
          quotaExhausted: true,
          failedChannels,
        }
      }
    }

    const batch = channelIds.slice(i, i + 50)

    try {
      const responseData = await withRateLimitAndRetry(async () => {
        const response = await youtube.channels.list({
          part: ['contentDetails'],
          id: batch,
        })
        return response.data
      })
      apiCalls++

      // Track quota usage if userId provided
      if (userId) {
        await trackQuotaUsage(userId, 'channels.list', 1)
      }

      if (responseData.items) {
        // Track which channels we got data for
        const receivedChannelIds = new Set<string>()

        for (const channel of responseData.items) {
          const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads
          if (channel.id) {
            receivedChannelIds.add(channel.id)
            if (uploadsPlaylistId) {
              uploadsMap.set(channel.id, uploadsPlaylistId)
            }
          }
        }

        // Mark channels that weren't in the response as failed (deleted/private)
        for (const channelId of batch) {
          if (!receivedChannelIds.has(channelId)) {
            failedChannels.push(channelId)
          }
        }
      }
    } catch (error) {
      const ytError = parseYouTubeError(error)
      console.error('Failed to fetch channel details for batch:', ytError)

      if (ytError.code === 'QUOTA_EXCEEDED') {
        // Mark remaining channels as failed
        for (let j = i; j < channelIds.length; j++) {
          failedChannels.push(channelIds[j])
        }
        return {
          uploadsMap,
          apiCalls,
          quotaExhausted: true,
          failedChannels,
        }
      }

      // For other errors, mark this batch as failed but continue
      failedChannels.push(...batch)
    }
  }

  return {
    uploadsMap,
    apiCalls,
    failedChannels: failedChannels.length > 0 ? failedChannels : undefined,
  }
}
