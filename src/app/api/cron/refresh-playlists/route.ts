/**
 * Cron: Refresh Playlists
 * Proactively refreshes uploads_playlist_id for channels that haven't been verified recently
 * Prevents playlist 404 errors before they happen
 * Schedule: Weekly on Sundays at 2am UTC
 */

import { validateCronAuth } from '@/lib/youtube/cron-handler'
import { createAdminClient } from '@/lib/supabase/admin'
import { getYouTubeClient } from '@/lib/youtube/client'
import { checkQuotaAvailable, trackQuotaUsage } from '@/lib/youtube/quota'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 300

type StalePlaylistChannel = {
  id: string
  youtube_id: string
  uploads_playlist_id: string | null
  last_playlist_refresh: string | null
  user_id: string
}

type RefreshResult = {
  success: boolean
  message: string
  channelsChecked: number
  playlistsUpdated: number
  playlistsUnchanged: number
  channelsFailed: number
  channelsSkipped: number
  quotaUsed: number
  durationMs: number
  details: {
    channelId: string
    youtubeId: string
    result: 'updated' | 'unchanged' | 'failed' | 'skipped'
    oldPlaylistId?: string | null
    newPlaylistId?: string | null
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
  const result: RefreshResult = {
    success: true,
    message: '',
    channelsChecked: 0,
    playlistsUpdated: 0,
    playlistsUnchanged: 0,
    channelsFailed: 0,
    channelsSkipped: 0,
    quotaUsed: 0,
    durationMs: 0,
    details: [],
  }

  try {
    // Get channels with stale playlist IDs (>30 days since last refresh)
    const { data: staleChannels, error: fetchError } = await admin.rpc(
      'get_channels_needing_playlist_refresh',
      { p_stale_days: 30, p_limit: 50 } as never
    )

    if (fetchError) {
      console.error('[Cron-RefreshPlaylists] Failed to fetch channels:', fetchError)
      return NextResponse.json({
        ...result,
        success: false,
        message: `Failed to fetch channels: ${fetchError.message}`,
        durationMs: Date.now() - startTime,
      })
    }

    const channels = staleChannels as StalePlaylistChannel[] | null

    if (!channels || channels.length === 0) {
      return NextResponse.json({
        ...result,
        message: 'No channels need playlist refresh',
        durationMs: Date.now() - startTime,
      })
    }

    result.channelsChecked = channels.length

    // Group by user to minimize client creation
    const channelsByUser = new Map<string, StalePlaylistChannel[]>()
    for (const channel of channels) {
      if (!channelsByUser.has(channel.user_id)) {
        channelsByUser.set(channel.user_id, [])
      }
      channelsByUser.get(channel.user_id)!.push(channel)
    }

    // Process each user's channels
    for (const [userId, userChannels] of Array.from(channelsByUser)) {
      // Check quota before processing this user's channels
      const quotaCheck = await checkQuotaAvailable(userId, userChannels.length, false)
      if (!quotaCheck.allowed) {
        for (const channel of userChannels) {
          result.channelsSkipped++
          result.details.push({
            channelId: channel.id,
            youtubeId: channel.youtube_id,
            result: 'skipped',
            reason: quotaCheck.reason || 'Quota exhausted',
          })
        }
        continue
      }

      // Get YouTube client
      const { client: youtube, error: ytError } = await getYouTubeClient(userId)
      if (!youtube || ytError) {
        for (const channel of userChannels) {
          result.channelsSkipped++
          result.details.push({
            channelId: channel.id,
            youtubeId: channel.youtube_id,
            result: 'skipped',
            reason: ytError || 'Failed to get YouTube client',
          })
        }
        continue
      }

      // Batch fetch channel details (50 at a time)
      for (let i = 0; i < userChannels.length; i += 50) {
        const batch = userChannels.slice(i, i + 50)
        const channelIds = batch.map(c => c.youtube_id)

        try {
          const response = await youtube.channels.list({
            part: ['contentDetails'],
            id: channelIds,
          })
          result.quotaUsed++

          await trackQuotaUsage(userId, 'channels.list', 1)

          // Process results
          const resultsMap = new Map<string, string | undefined>()
          for (const item of response.data.items || []) {
            if (item.id) {
              resultsMap.set(
                item.id,
                item.contentDetails?.relatedPlaylists?.uploads ?? undefined
              )
            }
          }

          // Update each channel
          for (const channel of batch) {
            const newPlaylistId = resultsMap.get(channel.youtube_id)

            if (newPlaylistId === undefined) {
              // Channel not found in API response
              result.channelsFailed++
              result.details.push({
                channelId: channel.id,
                youtubeId: channel.youtube_id,
                result: 'failed',
                reason: 'Channel not found in YouTube API',
              })
              continue
            }

            const oldPlaylistId = channel.uploads_playlist_id

            if (newPlaylistId !== oldPlaylistId) {
              // Playlist ID changed - update it
              await admin
                .from('channels')
                .update({
                  uploads_playlist_id: newPlaylistId,
                  last_playlist_refresh: new Date().toISOString(),
                } as never)
                .eq('id', channel.id)

              result.playlistsUpdated++
              result.details.push({
                channelId: channel.id,
                youtubeId: channel.youtube_id,
                result: 'updated',
                oldPlaylistId,
                newPlaylistId,
              })
            } else {
              // Playlist ID unchanged - just update the timestamp
              await admin
                .from('channels')
                .update({
                  last_playlist_refresh: new Date().toISOString(),
                } as never)
                .eq('id', channel.id)

              result.playlistsUnchanged++
              result.details.push({
                channelId: channel.id,
                youtubeId: channel.youtube_id,
                result: 'unchanged',
              })
            }
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          console.error('[Cron-RefreshPlaylists] Batch fetch error:', errorMessage)

          for (const channel of batch) {
            result.channelsFailed++
            result.details.push({
              channelId: channel.id,
              youtubeId: channel.youtube_id,
              result: 'failed',
              reason: errorMessage,
            })
          }
        }
      }
    }

    result.message = `Checked ${result.channelsChecked} channels: ${result.playlistsUpdated} updated, ${result.playlistsUnchanged} unchanged, ${result.channelsFailed} failed, ${result.channelsSkipped} skipped`
    result.durationMs = Date.now() - startTime

    return NextResponse.json(result)
  } catch (error) {
    console.error('[Cron-RefreshPlaylists] Unexpected error:', error)
    return NextResponse.json({
      ...result,
      success: false,
      message: error instanceof Error ? error.message : 'Unexpected error',
      durationMs: Date.now() - startTime,
    })
  }
}
