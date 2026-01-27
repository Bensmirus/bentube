/**
 * Unified Cron Handler
 * Reduces code duplication across refresh-high, refresh-medium, and refresh-low routes
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getYouTubeClient } from './client'
import { fetchChannelVideos } from './videos'
import { recordChannelSuccess, recordChannelFailure, getSkippableChannelIds } from './channel-health'
import { withRateLimitAndRetry, parseYouTubeError, type YouTubeError } from './utils'
import { checkQuotaAvailable, estimateQuotaNeeded } from './quota'
import { checkAndCreateAlerts } from './alerts'

export type ActivityLevel = 'high' | 'medium' | 'low'

export type CronConfig = {
  activityLevel: ActivityLevel
  staleCutoffHours: number
  maxChannelsPerRun: number
  videosPerChannel: number
}

export type CronResult = {
  success: boolean
  message: string
  channelsProcessed: number
  channelsFailed: number
  channelsSkipped: number
  videosAdded: number
  quotaUsed: number
  durationMs: number
  errors: { channelId: string; youtubeId: string; error: string }[]
}

type ChannelWithUser = {
  id: string
  youtube_id: string
  uploads_playlist_id: string | null
  last_fetched_at: string | null
  health_status: string | null
  group_channels: { channel_groups: { user_id: string } }[]
}

const ACTIVITY_CONFIGS: Record<ActivityLevel, CronConfig> = {
  high: {
    activityLevel: 'high',
    staleCutoffHours: 2,
    maxChannelsPerRun: 50,
    videosPerChannel: 20,
  },
  medium: {
    activityLevel: 'medium',
    staleCutoffHours: 6,
    maxChannelsPerRun: 75,
    videosPerChannel: 30,
  },
  low: {
    activityLevel: 'low',
    staleCutoffHours: 24,
    maxChannelsPerRun: 100,
    videosPerChannel: 50,
  },
}

/**
 * Run the cron refresh job for a specific activity level
 */
export async function runCronRefresh(activityLevel: ActivityLevel): Promise<CronResult> {
  const startTime = Date.now()
  const config = ACTIVITY_CONFIGS[activityLevel]
  const admin = createAdminClient()

  const result: CronResult = {
    success: true,
    message: '',
    channelsProcessed: 0,
    channelsFailed: 0,
    channelsSkipped: 0,
    videosAdded: 0,
    quotaUsed: 0,
    durationMs: 0,
    errors: [],
  }

  try {
    // Calculate stale cutoff time
    const staleCutoff = new Date(Date.now() - config.staleCutoffHours * 60 * 60 * 1000).toISOString()

    // Build query based on activity level
    let query = admin
      .from('channels')
      .select(
        `
        id,
        youtube_id,
        uploads_playlist_id,
        last_fetched_at,
        health_status,
        group_channels!inner(
          channel_groups!inner(user_id)
        )
      `
      )
      .or(`last_fetched_at.is.null,last_fetched_at.lt.${staleCutoff}`)
      .neq('health_status', 'dead') // Skip dead channels
      .limit(config.maxChannelsPerRun)

    // Only filter by activity level for high/medium (low handles all remaining)
    if (activityLevel !== 'low') {
      query = query.eq('activity_level', activityLevel)
    }

    const { data: channelsWithUsers, error: fetchError } = await query

    if (fetchError) {
      console.error(`[Cron-${activityLevel}] Failed to fetch channels:`, fetchError)
      return {
        ...result,
        success: false,
        message: `Failed to fetch channels: ${fetchError.message}`,
        durationMs: Date.now() - startTime,
      }
    }

    const channels = channelsWithUsers as ChannelWithUser[] | null

    if (!channels || channels.length === 0) {
      return {
        ...result,
        message: `No ${activityLevel}-activity channels need refreshing`,
        durationMs: Date.now() - startTime,
      }
    }

    // Get IDs of channels that should be skipped
    const channelIds = channels.map((c) => c.id)
    const skippableIds = await getSkippableChannelIds(channelIds)
    result.channelsSkipped = skippableIds.size

    // Group channels by user to minimize YouTube client creation
    const channelsByUser = new Map<string, ChannelWithUser[]>()
    for (const channel of channels) {
      if (skippableIds.has(channel.id)) continue
      if (!channel.uploads_playlist_id) continue

      const userId = channel.group_channels?.[0]?.channel_groups?.user_id
      if (!userId) continue

      if (!channelsByUser.has(userId)) {
        channelsByUser.set(userId, [])
      }
      channelsByUser.get(userId)!.push(channel)
    }

    // Process channels for each user
    for (const [userId, userChannels] of Array.from(channelsByUser)) {
      // Check quota before processing this user's channels
      const estimatedQuota = estimateQuotaNeeded({
        channelCount: userChannels.length,
        videosPerChannel: config.videosPerChannel,
      })

      const quotaCheck = await checkQuotaAvailable(userId, estimatedQuota, activityLevel === 'high')
      if (!quotaCheck.allowed) {
        console.log(`[Cron-${activityLevel}] Skipping user ${userId}: ${quotaCheck.reason}`)
        result.channelsSkipped += userChannels.length
        continue
      }

      // Get YouTube client
      const { client: youtube, error: ytError } = await getYouTubeClient(userId)
      if (!youtube || ytError) {
        console.error(`[Cron-${activityLevel}] Failed to get YouTube client for user ${userId}:`, ytError)
        result.channelsFailed += userChannels.length
        continue
      }

      // Process each channel
      for (const channel of userChannels) {
        const lastFetched = channel.last_fetched_at ? new Date(channel.last_fetched_at) : null

        try {
          // Use retry logic with rate limiting
          const { videos, apiCalls } = await withRateLimitAndRetry(
            () =>
              fetchChannelVideos(
                youtube,
                channel.uploads_playlist_id!,
                channel.youtube_id,
                lastFetched,
                config.videosPerChannel,
                userId
              ),
            {
              maxRetries: 2,
              onRetry: (attempt, error, delay) => {
                console.log(
                  `[Cron-${activityLevel}] Retrying channel ${channel.youtube_id} (attempt ${attempt}), waiting ${delay}ms`
                )
              },
            }
          )

          result.quotaUsed += apiCalls

          if (videos.length > 0) {
            // Check for trashed videos before inserting (consistency with manual sync)
            const videoIds = videos.map((v) => v.videoId)
            const { data: trashedVideos } = await admin
              .from('video_trash')
              .select('youtube_id')
              .eq('user_id', userId)
              .in('youtube_id', videoIds)

            const trashedIds = new Set(
              ((trashedVideos || []) as { youtube_id: string }[]).map((v) => v.youtube_id)
            )
            const filteredVideos = videos.filter((v) => !trashedIds.has(v.videoId))

            if (filteredVideos.length > 0) {
              const videosToUpsert = filteredVideos.map((v) => ({
                youtube_id: v.videoId,
                channel_id: channel.id,
                user_id: userId,
                title: v.title,
                thumbnail: v.thumbnail,
                duration: v.duration,
                duration_seconds: v.durationSeconds,
                is_short: v.isShort,
                description: v.description,
                published_at: v.publishedAt,
              }))

              // Conflict on user_id + youtube_id (each user has their own copy)
              await admin.from('videos').upsert(videosToUpsert as never, { onConflict: 'user_id,youtube_id' })
              result.videosAdded += filteredVideos.length

              // Track video-channel associations for duplicate detection (bulk insert)
              const videoChannelAssociations = filteredVideos.map((v) => ({
                user_id: userId,
                youtube_id: v.videoId,
                channel_id: channel.id,
              }))
              await admin
                .from('video_channels')
                .upsert(videoChannelAssociations as never, { onConflict: 'user_id,youtube_id,channel_id' })
            }
          }

          // Update last_fetched_at and record success
          await admin
            .from('channels')
            .update({ last_fetched_at: new Date().toISOString() } as never)
            .eq('id', channel.id)

          await recordChannelSuccess(channel.id)
          result.channelsProcessed++
        } catch (error) {
          const ytError = error as YouTubeError
          const parsedError = ytError.code ? ytError : parseYouTubeError(error)

          console.error(`[Cron-${activityLevel}] Error processing channel ${channel.youtube_id}:`, parsedError.message)

          // Record failure for health tracking
          await recordChannelFailure(channel.id, parsedError.message)

          result.channelsFailed++
          result.errors.push({
            channelId: channel.id,
            youtubeId: channel.youtube_id,
            error: parsedError.message,
          })

          // Still update last_fetched_at to prevent immediate re-processing
          await admin
            .from('channels')
            .update({ last_fetched_at: new Date().toISOString() } as never)
            .eq('id', channel.id)
        }
      }
    }

    result.message = `Processed ${result.channelsProcessed} channels, added ${result.videosAdded} videos`
    result.durationMs = Date.now() - startTime

    // Check for alerts after sync completes
    try {
      await checkAndCreateAlerts(result, `cron-${activityLevel}`)
    } catch (alertError) {
      console.error(`[Cron-${activityLevel}] Failed to check alerts:`, alertError)
    }

    return result
  } catch (error) {
    console.error(`[Cron-${activityLevel}] Unexpected error:`, error)
    return {
      ...result,
      success: false,
      message: error instanceof Error ? error.message : 'Unexpected error',
      durationMs: Date.now() - startTime,
    }
  }
}

/**
 * Run uniform cron refresh (same schedule for all channels)
 * User preference: All channels sync on the same 6-hour schedule
 */
export async function runUniformCronRefresh(): Promise<CronResult> {
  const startTime = Date.now()
  const admin = createAdminClient()

  // Uniform config: 6 hours stale cutoff, 30 videos per channel
  const STALE_CUTOFF_HOURS = 6
  const MAX_CHANNELS_PER_RUN = 100
  const VIDEOS_PER_CHANNEL = 30

  const result: CronResult = {
    success: true,
    message: '',
    channelsProcessed: 0,
    channelsFailed: 0,
    channelsSkipped: 0,
    videosAdded: 0,
    quotaUsed: 0,
    durationMs: 0,
    errors: [],
  }

  try {
    const staleCutoff = new Date(Date.now() - STALE_CUTOFF_HOURS * 60 * 60 * 1000).toISOString()

    // Get all channels that need refresh (no activity level filter - uniform schedule)
    const { data: channelsWithUsers, error: fetchError } = await admin
      .from('channels')
      .select(
        `
        id,
        youtube_id,
        uploads_playlist_id,
        last_fetched_at,
        health_status,
        group_channels!inner(
          channel_groups!inner(user_id)
        )
      `
      )
      .or(`last_fetched_at.is.null,last_fetched_at.lt.${staleCutoff}`)
      .neq('health_status', 'dead')
      .limit(MAX_CHANNELS_PER_RUN)

    if (fetchError) {
      console.error('[Cron-uniform] Failed to fetch channels:', fetchError)
      return {
        ...result,
        success: false,
        message: `Failed to fetch channels: ${fetchError.message}`,
        durationMs: Date.now() - startTime,
      }
    }

    const channels = channelsWithUsers as ChannelWithUser[] | null

    if (!channels || channels.length === 0) {
      return {
        ...result,
        message: 'No channels need refreshing',
        durationMs: Date.now() - startTime,
      }
    }

    // Get IDs of channels that should be skipped
    const channelIds = channels.map((c) => c.id)
    const skippableIds = await getSkippableChannelIds(channelIds)
    result.channelsSkipped = skippableIds.size

    // Group channels by user
    const channelsByUser = new Map<string, ChannelWithUser[]>()
    for (const channel of channels) {
      if (skippableIds.has(channel.id)) continue
      if (!channel.uploads_playlist_id) continue

      const userId = channel.group_channels?.[0]?.channel_groups?.user_id
      if (!userId) continue

      if (!channelsByUser.has(userId)) {
        channelsByUser.set(userId, [])
      }
      channelsByUser.get(userId)!.push(channel)
    }

    // Process channels for each user
    for (const [userId, userChannels] of Array.from(channelsByUser)) {
      // Check quota
      const estimatedQuota = estimateQuotaNeeded({
        channelCount: userChannels.length,
        videosPerChannel: VIDEOS_PER_CHANNEL,
      })

      const quotaCheck = await checkQuotaAvailable(userId, estimatedQuota, false)
      if (!quotaCheck.allowed) {
        console.log(`[Cron-uniform] Skipping user ${userId}: ${quotaCheck.reason}`)
        result.channelsSkipped += userChannels.length
        continue
      }

      // Get YouTube client
      const { client: youtube, error: ytError } = await getYouTubeClient(userId)
      if (!youtube || ytError) {
        console.error(`[Cron-uniform] Failed to get YouTube client for user ${userId}:`, ytError)
        result.channelsFailed += userChannels.length
        continue
      }

      // Process each channel
      for (const channel of userChannels) {
        const lastFetched = channel.last_fetched_at ? new Date(channel.last_fetched_at) : null

        try {
          const { videos, apiCalls } = await withRateLimitAndRetry(
            () =>
              fetchChannelVideos(
                youtube,
                channel.uploads_playlist_id!,
                channel.youtube_id,
                lastFetched,
                VIDEOS_PER_CHANNEL,
                userId
              ),
            {
              maxRetries: 2,
              onRetry: (attempt, _error, delay) => {
                console.log(
                  `[Cron-uniform] Retrying channel ${channel.youtube_id} (attempt ${attempt}), waiting ${delay}ms`
                )
              },
            }
          )

          result.quotaUsed += apiCalls

          if (videos.length > 0) {
            // Check for trashed videos before inserting
            const videoIds = videos.map((v) => v.videoId)
            const { data: trashedVideos } = await admin
              .from('video_trash')
              .select('youtube_id')
              .eq('user_id', userId)
              .in('youtube_id', videoIds)

            const trashedIds = new Set(
              ((trashedVideos || []) as { youtube_id: string }[]).map((v) => v.youtube_id)
            )
            const filteredVideos = videos.filter((v) => !trashedIds.has(v.videoId))

            if (filteredVideos.length > 0) {
              const videosToUpsert = filteredVideos.map((v) => ({
                youtube_id: v.videoId,
                channel_id: channel.id,
                user_id: userId,
                title: v.title,
                thumbnail: v.thumbnail,
                duration: v.duration,
                duration_seconds: v.durationSeconds,
                is_short: v.isShort,
                description: v.description,
                published_at: v.publishedAt,
              }))

              await admin.from('videos').upsert(videosToUpsert as never, { onConflict: 'user_id,youtube_id' })
              result.videosAdded += filteredVideos.length

              // Track video-channel associations for duplicate detection (bulk insert)
              const videoChannelAssociations = filteredVideos.map((v) => ({
                user_id: userId,
                youtube_id: v.videoId,
                channel_id: channel.id,
              }))
              await admin
                .from('video_channels')
                .upsert(videoChannelAssociations as never, { onConflict: 'user_id,youtube_id,channel_id' })
            }
          }

          await admin
            .from('channels')
            .update({ last_fetched_at: new Date().toISOString() } as never)
            .eq('id', channel.id)

          await recordChannelSuccess(channel.id)
          result.channelsProcessed++
        } catch (error) {
          const ytErr = error as YouTubeError
          const parsedError = ytErr.code ? ytErr : parseYouTubeError(error)

          console.error(`[Cron-uniform] Error processing channel ${channel.youtube_id}:`, parsedError.message)

          await recordChannelFailure(channel.id, parsedError.message)

          result.channelsFailed++
          result.errors.push({
            channelId: channel.id,
            youtubeId: channel.youtube_id,
            error: parsedError.message,
          })

          await admin
            .from('channels')
            .update({ last_fetched_at: new Date().toISOString() } as never)
            .eq('id', channel.id)
        }
      }
    }

    result.message = `Processed ${result.channelsProcessed} channels, added ${result.videosAdded} videos`
    result.durationMs = Date.now() - startTime

    // Check for alerts
    try {
      await checkAndCreateAlerts(result, 'cron-uniform')
    } catch (alertError) {
      console.error('[Cron-uniform] Failed to check alerts:', alertError)
    }

    return result
  } catch (error) {
    console.error('[Cron-uniform] Unexpected error:', error)
    return {
      ...result,
      success: false,
      message: error instanceof Error ? error.message : 'Unexpected error',
      durationMs: Date.now() - startTime,
    }
  }
}

/**
 * Rate limiting for cron auth failures
 * Protects against brute force attacks if CRON_SECRET is partially compromised
 */
const RATE_LIMIT_WINDOW_MS = 60 * 1000 // 1 minute window
const MAX_FAILURES_PER_WINDOW = 5 // Max 5 failed attempts per minute
const failedAttempts: { timestamp: number }[] = []

function isRateLimited(): boolean {
  const now = Date.now()
  // Remove expired entries
  while (failedAttempts.length > 0 && failedAttempts[0].timestamp < now - RATE_LIMIT_WINDOW_MS) {
    failedAttempts.shift()
  }
  return failedAttempts.length >= MAX_FAILURES_PER_WINDOW
}

function recordFailedAttempt(): void {
  failedAttempts.push({ timestamp: Date.now() })
  // Keep array bounded to prevent memory leak
  if (failedAttempts.length > MAX_FAILURES_PER_WINDOW * 2) {
    failedAttempts.splice(0, failedAttempts.length - MAX_FAILURES_PER_WINDOW)
  }
}

/**
 * Validate cron request authorization with rate limiting
 * Returns { valid: true } on success, or { valid: false, rateLimited: boolean } on failure
 */
export function validateCronAuth(
  authHeader: string | null,
  cronSecret: string | undefined
): { valid: boolean; rateLimited?: boolean } {
  // Check rate limit first
  if (isRateLimited()) {
    console.error('[Cron] Rate limited - too many failed auth attempts')
    return { valid: false, rateLimited: true }
  }

  if (!cronSecret) {
    console.error('CRON_SECRET not configured')
    recordFailedAttempt()
    return { valid: false }
  }

  const isValid = authHeader === `Bearer ${cronSecret}`

  if (!isValid) {
    console.error('[Cron] Invalid authorization header')
    recordFailedAttempt()
    return { valid: false }
  }

  return { valid: true }
}
