/**
 * Cron: Retry Dead Channels
 * Automatically retries channels marked as "dead" using exponential backoff
 * Schedule: Daily at 5am UTC
 */

import { validateCronAuth } from '@/lib/youtube/cron-handler'
import { createAdminClient } from '@/lib/supabase/admin'
import { getYouTubeClient } from '@/lib/youtube/client'
import { fetchChannelVideos, refreshUploadsPlaylistId } from '@/lib/youtube/videos'
import { recordChannelSuccess, recordChannelFailure } from '@/lib/youtube/channel-health'
import { withRateLimitAndRetry } from '@/lib/youtube/utils'
import { checkQuotaAvailable } from '@/lib/youtube/quota'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 300

type DeadChannel = {
  id: string
  youtube_id: string
  uploads_playlist_id: string | null
  consecutive_failures: number
  last_failure_at: string
}

type RetryResult = {
  success: boolean
  message: string
  channelsChecked: number
  channelsRecovered: number
  channelsStillDead: number
  channelsSkipped: number
  videosAdded: number
  quotaUsed: number
  durationMs: number
  details: {
    channelId: string
    youtubeId: string
    result: 'recovered' | 'still_dead' | 'skipped'
    reason?: string
  }[]
}

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const authHeader = request.headers.get('authorization')
  const authResult = validateCronAuth(authHeader, process.env.CRON_SECRET)

  if (!authResult.valid) {
    const status = authResult.rateLimited ? 429 : 401
    const error = authResult.rateLimited ? 'Too many failed attempts' : 'Unauthorized'
    return NextResponse.json({ error }, { status })
  }

  const admin = createAdminClient()
  const result: RetryResult = {
    success: true,
    message: '',
    channelsChecked: 0,
    channelsRecovered: 0,
    channelsStillDead: 0,
    channelsSkipped: 0,
    videosAdded: 0,
    quotaUsed: 0,
    durationMs: 0,
    details: [],
  }

  try {
    // Get dead channels that are ready for retry (using exponential backoff)
    const { data: deadChannels, error: fetchError } = await admin.rpc(
      'get_dead_channels_for_retry',
      { p_limit: 25 } as never // Limit to prevent long-running jobs
    )

    if (fetchError) {
      console.error('[Cron-RetryDead] Failed to fetch dead channels:', fetchError)
      return NextResponse.json({
        ...result,
        success: false,
        message: `Failed to fetch dead channels: ${fetchError.message}`,
        durationMs: Date.now() - startTime,
      })
    }

    const channels = deadChannels as DeadChannel[] | null

    if (!channels || channels.length === 0) {
      return NextResponse.json({
        ...result,
        message: 'No dead channels ready for retry',
        durationMs: Date.now() - startTime,
      })
    }

    result.channelsChecked = channels.length

    // Get user IDs for each channel (need YouTube client per user)
    const { data: channelUsers } = await admin
      .from('group_channels')
      .select(`
        channel_id,
        channel_groups!inner(user_id)
      `)
      .in('channel_id', channels.map(c => c.id))

    // Build channel -> user mapping
    const channelToUser = new Map<string, string>()
    for (const cu of (channelUsers || []) as { channel_id: string; channel_groups: { user_id: string } }[]) {
      channelToUser.set(cu.channel_id, cu.channel_groups.user_id)
    }

    // Process each dead channel
    for (const channel of channels) {
      const userId = channelToUser.get(channel.id)

      if (!userId) {
        result.channelsSkipped++
        result.details.push({
          channelId: channel.id,
          youtubeId: channel.youtube_id,
          result: 'skipped',
          reason: 'No user found for channel',
        })
        continue
      }

      // Check quota before attempting
      const quotaCheck = await checkQuotaAvailable(userId, 3, false) // ~3 units needed
      if (!quotaCheck.allowed) {
        result.channelsSkipped++
        result.details.push({
          channelId: channel.id,
          youtubeId: channel.youtube_id,
          result: 'skipped',
          reason: quotaCheck.reason || 'Quota exhausted',
        })
        continue
      }

      // Get YouTube client
      const { client: youtube, error: ytError } = await getYouTubeClient(userId)
      if (!youtube || ytError) {
        result.channelsSkipped++
        result.details.push({
          channelId: channel.id,
          youtubeId: channel.youtube_id,
          result: 'skipped',
          reason: ytError || 'Failed to get YouTube client',
        })
        continue
      }

      try {
        // If no playlist ID, try to get one first
        let playlistId = channel.uploads_playlist_id
        if (!playlistId) {
          const refreshResult = await refreshUploadsPlaylistId(youtube, channel.youtube_id, userId)
          result.quotaUsed++

          if (!refreshResult.uploadsPlaylistId) {
            await recordChannelFailure(channel.id, 'No uploads playlist ID')
            result.channelsStillDead++
            result.details.push({
              channelId: channel.id,
              youtubeId: channel.youtube_id,
              result: 'still_dead',
              reason: 'Could not get uploads playlist ID',
            })
            continue
          }

          playlistId = refreshResult.uploadsPlaylistId

          // Update the channel with the new playlist ID
          await admin
            .from('channels')
            .update({
              uploads_playlist_id: playlistId,
              last_playlist_refresh: new Date().toISOString(),
            } as never)
            .eq('id', channel.id)
        }

        // Try to fetch videos
        const { videos, error, apiCalls, playlistNotFound } = await withRateLimitAndRetry(
          () => fetchChannelVideos(
            youtube,
            playlistId!,
            channel.youtube_id,
            null, // Fetch last 10 videos
            10,
            userId,
            { checkQuotaMidSync: false }
          ),
          { maxRetries: 1 }
        )

        result.quotaUsed += apiCalls

        if (playlistNotFound) {
          // Playlist doesn't exist anymore, try refreshing
          const refreshResult = await refreshUploadsPlaylistId(youtube, channel.youtube_id, userId)
          result.quotaUsed++

          if (!refreshResult.uploadsPlaylistId) {
            await recordChannelFailure(channel.id, 'Playlist not found and refresh failed')
            result.channelsStillDead++
            result.details.push({
              channelId: channel.id,
              youtubeId: channel.youtube_id,
              result: 'still_dead',
              reason: 'Playlist not found, refresh failed',
            })
            continue
          }

          // Update playlist ID and try again in next run
          await admin
            .from('channels')
            .update({
              uploads_playlist_id: refreshResult.uploadsPlaylistId,
              last_playlist_refresh: new Date().toISOString(),
            } as never)
            .eq('id', channel.id)

          // Mark as still failing but with updated playlist ID
          await recordChannelFailure(channel.id, 'Playlist refreshed, will retry next run')
          result.channelsStillDead++
          result.details.push({
            channelId: channel.id,
            youtubeId: channel.youtube_id,
            result: 'still_dead',
            reason: 'Playlist refreshed, will retry next run',
          })
          continue
        }

        if (error) {
          await recordChannelFailure(channel.id, error)
          result.channelsStillDead++
          result.details.push({
            channelId: channel.id,
            youtubeId: channel.youtube_id,
            result: 'still_dead',
            reason: error,
          })
          continue
        }

        // Success! Channel is alive again
        await recordChannelSuccess(channel.id)

        // Save any new videos
        if (videos.length > 0) {
          const videosToUpsert = videos.map(v => ({
            youtube_id: v.videoId,
            channel_id: channel.id,
            user_id: userId,
            title: v.title,
            thumbnail: v.thumbnail,
            duration: v.duration,
            duration_seconds: v.durationSeconds,
            is_short: v.isShort,
            published_at: v.publishedAt,
          }))

          // Conflict on user_id + youtube_id (each user has their own copy)
          await admin.from('videos').upsert(videosToUpsert as never, { onConflict: 'user_id,youtube_id' })
          result.videosAdded += videos.length
        }

        // Update last_fetched_at
        await admin
          .from('channels')
          .update({ last_fetched_at: new Date().toISOString() } as never)
          .eq('id', channel.id)

        result.channelsRecovered++
        result.details.push({
          channelId: channel.id,
          youtubeId: channel.youtube_id,
          result: 'recovered',
        })

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        await recordChannelFailure(channel.id, errorMessage)
        result.channelsStillDead++
        result.details.push({
          channelId: channel.id,
          youtubeId: channel.youtube_id,
          result: 'still_dead',
          reason: errorMessage,
        })
      }
    }

    result.message = `Retried ${result.channelsChecked} dead channels: ${result.channelsRecovered} recovered, ${result.channelsStillDead} still dead, ${result.channelsSkipped} skipped`
    result.durationMs = Date.now() - startTime

    return NextResponse.json(result)
  } catch (error) {
    console.error('[Cron-RetryDead] Unexpected error:', error)
    return NextResponse.json({
      ...result,
      success: false,
      message: error instanceof Error ? error.message : 'Unexpected error',
      durationMs: Date.now() - startTime,
    })
  }
}
