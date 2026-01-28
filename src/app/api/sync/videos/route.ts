import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { getYouTubeClientWithRefresh } from '@/lib/youtube/client'
import { fetchChannelVideos, refreshUploadsPlaylistId } from '@/lib/youtube/videos'
import { fetchPlaylistVideos } from '@/lib/youtube/playlists'
import { checkQuotaAvailable, estimateQuotaNeeded } from '@/lib/youtube/quota'
import {
  SyncProgressTracker,
  acquireSyncLock,
  releaseSyncLock,
  extendSyncLock,
  isSyncCancelled,
} from '@/lib/youtube/sync-progress'
import { recordChannelSuccess, recordChannelFailure, getSkippableChannelIds } from '@/lib/youtube/channel-health'
import { parseYouTubeError, type YouTubeError } from '@/lib/youtube/utils'
import { getEffectiveVideoLimit } from '@/lib/user/video-limit'
import {
  stageVideos,
  stageVideoChannelsBulk,
  commitSync,
  rollbackSync,
  pauseSyncForQuota,
  StagingError,
} from '@/lib/youtube/sync-staging'
import { NextRequest, NextResponse } from 'next/server'

// Extend lock every 5 minutes during long syncs
const LOCK_EXTEND_INTERVAL_MS = 5 * 60 * 1000
// Refresh token every 30 minutes during long syncs
const TOKEN_REFRESH_INTERVAL_MS = 30 * 60 * 1000
// Update progress every N channels to reduce database writes (performance optimization)
const PROGRESS_UPDATE_INTERVAL = 10

type Channel = {
  id: string
  youtube_id: string
  title: string
  uploads_playlist_id: string | null
  last_fetched_at: string | null
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  let lockId: string | null = null
  let userId: string | null = null

  try {
    const supabase = await createServerSupabaseClient()
    const admin = createAdminClient()

    const { userId: uid, error: userError } = await getInternalUserId(supabase as never)
    if (userError || !uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    userId = uid

    // Acquire distributed lock to prevent concurrent syncs
    lockId = await acquireSyncLock(userId)
    if (!lockId) {
      return NextResponse.json(
        { error: 'A sync is already in progress. Please wait for it to complete.' },
        { status: 409 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const channelId = body.channelId as string | undefined
    const groupId = body.groupId as string | undefined
    // groupedOnly is now the default and only behavior - we only sync channels in groups
    // fullSync forces re-fetch of all videos regardless of last_fetched_at

    // Get user's video import limit setting
    // - mode: 'new_only' = only videos since last sync (0 for new channels)
    // - mode: 'limited' = fetch up to limit videos
    // - mode: 'unlimited' = fetch all videos (limit = 50000)
    const videoLimitConfig = await getEffectiveVideoLimit(userId)

    // Get channels to sync
    let channelIdsToSync: string[] = []

    if (channelId) {
      // Sync a specific channel
      channelIdsToSync = [channelId]
    } else if (groupId) {
      // Sync channels from a specific group
      // First verify the group belongs to this user
      const { data: groupCheck } = await admin
        .from('channel_groups')
        .select('id')
        .eq('id', groupId)
        .eq('user_id', userId)
        .single()

      if (!groupCheck) {
        return NextResponse.json({ error: 'Group not found' }, { status: 404 })
      }

      const { data: groupChannels, error: groupChannelsError } = await admin
        .from('group_channels')
        .select('channel_id')
        .eq('group_id', groupId)

      if (groupChannelsError) {
        console.error('[VideoSync] Failed to fetch group channels:', groupChannelsError)
        return NextResponse.json({ error: 'Failed to fetch channels' }, { status: 500 })
      }

      const groupChannelsData = groupChannels as { channel_id: string }[] | null
      channelIdsToSync = (groupChannelsData || []).map((c) => c.channel_id).filter(Boolean)

      if (channelIdsToSync.length === 0) {
        return NextResponse.json({
          success: true,
          videosImported: 0,
          channelsSynced: 0,
          message: 'No channels in this group.',
        })
      }
    } else {
      // Get all channels the user is subscribed to via their groups
      const { data: userChannels, error: groupChannelsError } = await admin
        .from('group_channels')
        .select('channel_id, channel_groups!inner(user_id)')
        .eq('channel_groups.user_id', userId)

      if (groupChannelsError) {
        console.error('[VideoSync] Failed to fetch group channels:', groupChannelsError)
        return NextResponse.json({ error: 'Failed to fetch channels' }, { status: 500 })
      }

      const userChannelsData = userChannels as { channel_id: string }[] | null

      if (!userChannelsData || userChannelsData.length === 0) {
        return NextResponse.json({
          success: true,
          videosImported: 0,
          channelsSynced: 0,
          message: 'No channels to sync. Import your subscriptions first.',
        })
      }

      channelIdsToSync = Array.from(new Set(userChannelsData.map((c) => c.channel_id).filter(Boolean)))
    }

    // Check we have channel IDs to sync
    if (channelIdsToSync.length === 0) {
      return NextResponse.json({
        success: true,
        videosImported: 0,
        channelsSynced: 0,
        message: 'No channels to sync. Import your subscriptions first.',
      })
    }

    console.log(`[VideoSync] Fetching details for ${channelIdsToSync.length} channels`)

    // Fetch all channel details in a single query
    // PostgreSQL handles large IN clauses efficiently with proper indexing
    const { data: fetchedChannels, error: channelsError } = await admin
      .from('channels')
      .select('id, youtube_id, title, uploads_playlist_id, last_fetched_at')
      .in('id', channelIdsToSync)

    if (channelsError) {
      console.error('[VideoSync] Failed to fetch channel details:', channelsError)
      return NextResponse.json({ error: 'Failed to fetch channel details: ' + channelsError.message }, { status: 500 })
    }

    const channelsData = (fetchedChannels || []) as Channel[]

    if (channelsData.length === 0) {
      console.error('[VideoSync] No channels found in database for IDs:', channelIdsToSync.slice(0, 5))
      return NextResponse.json({
        error: 'Channels not found in database. Try re-importing your subscriptions.'
      }, { status: 500 })
    }

    // Filter out channels without uploads playlist
    const validChannels = channelsData.filter((c) => c.uploads_playlist_id)

    if (validChannels.length === 0) {
      return NextResponse.json({
        success: true,
        videosImported: 0,
        channelsSynced: 0,
        message: 'No valid channels to sync.',
      })
    }

    // Check quota before starting
    // Count channels that need full sync (never fetched before)
    const newChannelsCount = validChannels.filter(c => !c.last_fetched_at).length
    const estimatedQuota = estimateQuotaNeeded({
      channelCount: validChannels.length,
      videosPerChannel: 50, // Default fetch size
      fullSync: newChannelsCount > validChannels.length / 2, // Estimate based on new channels ratio
    })

    const quotaCheck = await checkQuotaAvailable(userId, estimatedQuota)
    if (!quotaCheck.allowed) {
      return NextResponse.json(
        {
          error: quotaCheck.reason,
          quotaStatus: quotaCheck.status,
        },
        { status: 429 }
      )
    }

    // Get YouTube client with refresh capability for long operations
    const ytResult = await getYouTubeClientWithRefresh(userId)
    if ('error' in ytResult && ytResult.error) {
      console.error('[VideoSync] YouTube client error:', ytResult.error)
      return NextResponse.json({ error: ytResult.error || 'YouTube not connected' }, { status: 400 })
    }

    // Type guard ensures we have a valid client at this point
    if (!('client' in ytResult) || !ytResult.client) {
      return NextResponse.json({ error: 'Failed to get YouTube client' }, { status: 400 })
    }

    const youtube = ytResult.client
    const checkAndRefreshIfNeeded = ytResult.checkAndRefreshIfNeeded

    // Get channels that should be skipped (dead channels)
    const skippableIds = await getSkippableChannelIds(validChannels.map((c) => c.id))

    // Initialize progress tracker with sync ID for staging
    const progress = new SyncProgressTracker(userId)
    const syncId = progress.getSyncId()
    const activeChannels = validChannels.filter((c) => !skippableIds.has(c.id))
    await progress.start(activeChannels.length)
    // Track queued channels for quota resume functionality
    await progress.setQueuedChannels(activeChannels.map(c => c.id))
    await progress.setPhase('syncing_videos', `Syncing ${activeChannels.length} channels...`)

    let totalVideos = 0
    let channelsProcessed = 0
    let channelsFailed = 0
    let quotaExhausted = false
    let syncFailed = false // Track if sync failed (for rollback)
    const errors: { channelId: string; channelName: string; error: string }[] = []

    // Track time for periodic maintenance
    let lastLockExtend = Date.now()
    let lastTokenRefresh = Date.now()

    let syncCancelled = false

    for (let i = 0; i < activeChannels.length; i++) {
      // Stop if quota exhausted
      if (quotaExhausted) {
        console.log('[VideoSync] Stopping due to quota exhaustion')
        break
      }

      // Check for user-requested cancellation
      if (await isSyncCancelled(userId, lockId)) {
        console.log('[VideoSync] Sync cancelled by user')
        syncCancelled = true
        break
      }

      const channel = activeChannels[i]
      const now = Date.now()

      // Extend lock periodically during long syncs
      if (now - lastLockExtend > LOCK_EXTEND_INTERVAL_MS) {
        const extended = await extendSyncLock(userId, lockId)
        if (!extended) {
          console.error('[VideoSync] Failed to extend lock, stopping sync')
          // Rollback staged videos and return error (don't silently break)
          if (totalVideos > 0) {
            await rollbackSync(syncId)
          }
          await progress.complete('Sync stopped: failed to extend lock')
          return NextResponse.json(
            {
              error: 'Sync stopped unexpectedly. Please try again.',
              success: false,
              videosImported: 0,
              channelsSynced: channelsProcessed,
              channelsFailed: channelsFailed + (activeChannels.length - i),
              rolledBack: true,
            },
            { status: 500 }
          )
        }
        lastLockExtend = now
      }

      // Refresh token periodically during long syncs
      if (now - lastTokenRefresh > TOKEN_REFRESH_INTERVAL_MS) {
        const refreshed = await checkAndRefreshIfNeeded()
        if (!refreshed) {
          console.error('[VideoSync] Token refresh failed, stopping sync')
          errors.push({
            channelId: channel.id,
            channelName: channel.title,
            error: 'Authentication expired during sync',
          })
          break
        }
        lastTokenRefresh = now
      }

      // Set current channel name (but don't update count yet - happens after processing)
      // Only update progress every N channels to reduce database writes
      if (i === 0 || i % PROGRESS_UPDATE_INTERVAL === 0 || i === activeChannels.length - 1) {
        await progress.updateProgress(
          progress.getProgress().stats.channelsProcessed,
          channel.title,
          `Syncing ${channel.title}... (${i + 1}/${activeChannels.length})`
        )
      }

      // Check if we have any videos for this channel in the database
      // If not, treat it as a new channel regardless of last_fetched_at
      const { count: existingVideoCount } = await admin
        .from('videos')
        .select('id', { count: 'exact', head: true })
        .eq('channel_id', channel.id)
        .eq('user_id', userId)

      // Determine channel state
      const hasNoVideos = (existingVideoCount ?? 0) === 0
      const isNewChannel = !channel.last_fetched_at || hasNoVideos
      let currentPlaylistId = channel.uploads_playlist_id!

      // Determine how many videos to fetch and whether to use date filter
      let maxVideosToFetch: number
      let lastFetched: Date | null = null

      if (videoLimitConfig.mode === 'new_only') {
        // "New only" mode: only fetch videos since last sync
        // For new channels, skip entirely (import 0 videos - no point of comparison)
        if (isNewChannel) {
          await recordChannelSuccess(channel.id)
          await progress.channelProcessed(0, channel.id)
          channelsProcessed++
          continue
        }
        // For existing channels, use date filter (incremental sync)
        lastFetched = new Date(channel.last_fetched_at!)
        maxVideosToFetch = 50
      } else {
        // "limited" or "unlimited" mode: fetch the last X videos from the channel
        // NO date filter - we always fetch from the most recent videos
        // Duplicates are handled by the staging system (skipped on insert)
        lastFetched = null // No date filter
        maxVideosToFetch = videoLimitConfig.limit
      }

      try {
        // Fetch videos with all edge case handling built in
        const result = await fetchChannelVideos(
          youtube,
          currentPlaylistId,
          channel.youtube_id,
          lastFetched,
          maxVideosToFetch,
          userId,
          {
            checkQuotaMidSync: true,
            filterLiveStreams: true,
            filterScheduled: true,
            onProgress: async (message: string) => {
              // Update progress with micro-activity (only for milestone channels to reduce writes)
              if (i % PROGRESS_UPDATE_INTERVAL === 0 || i === activeChannels.length - 1) {
                await progress.updateProgress(
                  progress.getProgress().stats.channelsProcessed,
                  channel.title,
                  message
                )
              }
            },
          }
        )

        progress.addQuotaUsage(result.apiCalls)

        // Handle quota exhaustion - pause sync and wait for quota reset
        if (result.quotaExhausted) {
          console.log(`[VideoSync] Quota exhausted at channel ${i + 1}/${activeChannels.length}`)
          quotaExhausted = true
          // Stage any videos we got before quota ran out
          if (result.videos.length > 0) {
            const staged = await stageVideosForSync(admin, syncId, channel.id, userId, result.videos)
            totalVideos += staged
          }
          // Pause sync - will resume when quota resets
          const resumeTime = await pauseSyncForQuota(syncId)
          console.log(`[VideoSync] Sync paused, will resume after ${resumeTime?.toISOString()}`)
          // IMPORTANT: Break immediately - no point processing more channels without quota
          break
        }

        // Handle playlist not found - try to refresh playlist ID
        if (result.playlistNotFound && result.shouldRefreshPlaylistId) {
          console.log(`[VideoSync] Playlist not found for ${channel.title}, attempting refresh`)

          const refreshResult = await refreshUploadsPlaylistId(youtube, channel.youtube_id, userId)

          if (refreshResult.uploadsPlaylistId && refreshResult.uploadsPlaylistId !== currentPlaylistId) {
            // Update the channel's uploads playlist ID
            await admin
              .from('channels')
              .update({ uploads_playlist_id: refreshResult.uploadsPlaylistId } as never)
              .eq('id', channel.id)

            // Retry with new playlist ID
            currentPlaylistId = refreshResult.uploadsPlaylistId
            const retryResult = await fetchChannelVideos(
              youtube,
              currentPlaylistId,
              channel.youtube_id,
              lastFetched,
              maxVideosToFetch,
              userId,
              {
                checkQuotaMidSync: true,
                filterLiveStreams: true,
                filterScheduled: true,
                onProgress: async (message: string) => {
                  // Update progress with micro-activity (only for milestone channels)
                  if (i % PROGRESS_UPDATE_INTERVAL === 0 || i === activeChannels.length - 1) {
                    await progress.updateProgress(
                      progress.getProgress().stats.channelsProcessed,
                      channel.title,
                      message
                    )
                  }
                },
              }
            )

            if (!retryResult.error && retryResult.videos.length > 0) {
              const staged = await stageVideosForSync(admin, syncId, channel.id, userId, retryResult.videos)
              totalVideos += staged
              await recordChannelSuccess(channel.id)
              await progress.channelProcessed(staged, channel.id)
              // Update current count after processing
              await progress.updateProgress(
                progress.getProgress().stats.channelsProcessed,
                channel.title,
                `Processed ${channel.title} (${progress.getProgress().stats.channelsProcessed}/${activeChannels.length})`
              )
              channelsProcessed++
              continue
            }
          }

          // Refresh failed or no new playlist ID
          await recordChannelFailure(channel.id, 'Playlist not found')
          channelsFailed++
          errors.push({
            channelId: channel.id,
            channelName: channel.title,
            error: 'Channel uploads playlist not found (may have been deleted)',
          })
          await progress.channelFailed({
            channelId: channel.id,
            channelName: channel.title,
            errorCode: 'NOT_FOUND',
            message: 'Playlist not found',
            timestamp: new Date().toISOString(),
          })
          // Update current count after failed channel
          await progress.updateProgress(
            progress.getProgress().stats.channelsProcessed + progress.getProgress().stats.channelsFailed,
            channel.title,
            `Failed: ${channel.title} (${progress.getProgress().stats.channelsProcessed + progress.getProgress().stats.channelsFailed}/${activeChannels.length})`
          )
          continue
        }

        // Handle other errors
        if (result.error && !result.videos.length) {
          throw new Error(result.error)
        }

        if (result.videos.length === 0) {
          // Still update last_fetched_at even if no new videos
          await admin
            .from('channels')
            .update({ last_fetched_at: new Date().toISOString() } as never)
            .eq('id', channel.id)

          await recordChannelSuccess(channel.id)
          await progress.channelProcessed(0, channel.id)
          // Update current count after processing
          await progress.updateProgress(
            progress.getProgress().stats.channelsProcessed,
            channel.title,
            `Processed ${channel.title} (${progress.getProgress().stats.channelsProcessed}/${activeChannels.length}) - no new videos`
          )
          channelsProcessed++
          continue
        }

        // Stage videos for commit (all-or-nothing sync)
        const staged = await stageVideosForSync(admin, syncId, channel.id, userId, result.videos)

        totalVideos += staged
        channelsProcessed++

        // Update last_fetched_at and record success
        await admin
          .from('channels')
          .update({ last_fetched_at: new Date().toISOString() } as never)
          .eq('id', channel.id)

        await recordChannelSuccess(channel.id)
        await progress.channelProcessed(staged, channel.id)
        // Update current count after processing (fixes progress stuck at 0/1 bug)
        await progress.updateProgress(
          progress.getProgress().stats.channelsProcessed,
          channel.title,
          `Processed ${channel.title} (${progress.getProgress().stats.channelsProcessed}/${activeChannels.length})`
        )
      } catch (error) {
        // Handle StagingError specifically - critical error that should fail the whole sync
        if (error instanceof StagingError) {
          console.error(`[VideoSync] STAGING FAILED for ${channel.title}: ${error.message}`)
          console.error(`[VideoSync] Staged ${error.staged}/${error.total} videos before failure at batch ${error.batchNumber}`)

          // Mark sync as failed - will trigger rollback at the end
          syncFailed = true
          channelsFailed++
          errors.push({
            channelId: channel.id,
            channelName: channel.title,
            error: `Staging failed: ${error.message} (saved ${error.staged}/${error.total} videos)`,
          })

          await progress.channelFailed({
            channelId: channel.id,
            channelName: channel.title,
            errorCode: 'STAGING_ERROR',
            message: error.message,
            timestamp: new Date().toISOString(),
          })

          // Stop processing - staging failure is critical
          break
        }

        const ytError = error as YouTubeError
        const parsedError = ytError.code ? ytError : parseYouTubeError(error)

        console.error(`[VideoSync] Failed to sync ${channel.title}:`, parsedError.message)

        // Check if this is a quota error
        if (parsedError.code === 'QUOTA_EXCEEDED') {
          quotaExhausted = true
        }

        // Record failure for health tracking
        await recordChannelFailure(channel.id, parsedError.message)

        channelsFailed++
        errors.push({
          channelId: channel.id,
          channelName: channel.title,
          error: parsedError.message,
        })

        await progress.channelFailed({
          channelId: channel.id,
          channelName: channel.title,
          errorCode: parsedError.code,
          message: parsedError.message,
          timestamp: new Date().toISOString(),
        })
        // Update current count after failed channel
        await progress.updateProgress(
          progress.getProgress().stats.channelsProcessed + progress.getProgress().stats.channelsFailed,
          channel.title,
          `Failed: ${channel.title} (${progress.getProgress().stats.channelsProcessed + progress.getProgress().stats.channelsFailed}/${activeChannels.length})`
        )

        // Still update last_fetched_at to prevent immediate re-processing
        await admin
          .from('channels')
          .update({ last_fetched_at: new Date().toISOString() } as never)
          .eq('id', channel.id)
      }
    }

    // ========================================================================
    // PLAYLIST SYNC PHASE
    // After syncing channels, also sync any imported playlists
    // ========================================================================
    let playlistsProcessed = 0
    if (!syncCancelled && !syncFailed && !quotaExhausted) {
      // Get playlists that are in groups (consistent with channel behavior)
      // Only sync playlists that the user has organized into groups
      const { data: groupPlaylistIds } = await admin
        .from('group_playlists')
        .select('playlist_id, channel_groups!inner(user_id)')
        .eq('channel_groups.user_id', userId)

      const playlistIdsInGroups = Array.from(
        new Set(
          ((groupPlaylistIds || []) as { playlist_id: string }[])
            .map(gp => gp.playlist_id)
            .filter(Boolean)
        )
      )

      // Fetch playlist details only for playlists in groups
      let playlists: { id: string; youtube_playlist_id: string; title: string }[] = []
      if (playlistIdsInGroups.length > 0) {
        const { data: userPlaylists } = await admin
          .from('user_playlists')
          .select('id, youtube_playlist_id, title')
          .in('id', playlistIdsInGroups)

        playlists = (userPlaylists || []) as { id: string; youtube_playlist_id: string; title: string }[]
      }

      if (playlists.length > 0) {
        console.log(`[VideoSync] Syncing ${playlists.length} playlists...`)
        // Update total to include playlists for accurate progress tracking
        await progress.setTotal(activeChannels.length + playlists.length)
        await progress.setPhase('syncing_playlists', `Syncing ${playlists.length} playlists...`)

        for (const playlist of playlists) {
          // Check for stop conditions
          if (quotaExhausted || await isSyncCancelled(userId, lockId)) break

          // Extend lock if needed
          const now = Date.now()
          if (now - lastLockExtend > LOCK_EXTEND_INTERVAL_MS) {
            const extended = await extendSyncLock(userId, lockId)
            if (!extended) {
              console.error('[VideoSync] Failed to extend lock during playlist sync')
              break
            }
            lastLockExtend = now
          }

          // Get existing video IDs for this playlist (to skip)
          const { data: existingVideos } = await admin
            .from('videos')
            .select('youtube_id')
            .eq('source_playlist_id', playlist.id)
            .eq('user_id', userId)

          const existingVideoIds = new Set(
            ((existingVideos || []) as { youtube_id: string }[]).map(v => v.youtube_id)
          )

          console.log(`[VideoSync] Playlist "${playlist.title}": ${existingVideoIds.size} existing videos`)

          try {
            // Fetch new videos from playlist
            const result = await fetchPlaylistVideos(
              youtube,
              playlist.youtube_playlist_id,
              userId,
              {
                existingVideoIds,
                checkQuotaMidSync: true,
                filterLiveStreams: true,
                filterScheduled: true,
                filterShorts: true,
              }
            )

            progress.addQuotaUsage(result.apiCalls)

            if (result.quotaExhausted) {
              console.log('[VideoSync] Quota exhausted during playlist sync')
              quotaExhausted = true
              break
            }

            if (result.videos.length > 0) {
              console.log(`[VideoSync] Playlist "${playlist.title}": ${result.videos.length} new videos`)

              // Build a map of channelId -> channelTitle from the videos
              const channelTitleMap = new Map<string, string>()
              for (const v of result.videos) {
                if (v.channelId && v.channelId !== 'unknown' && v.channelTitle && !channelTitleMap.has(v.channelId)) {
                  channelTitleMap.set(v.channelId, v.channelTitle)
                }
              }

              // Get or create channel entries for the videos
              const uniqueChannelIds = Array.from(new Set(result.videos.map(v => v.channelId)))
              const channelIdMap = new Map<string, string>()

              for (const ytChannelId of uniqueChannelIds) {
                if (ytChannelId === 'unknown') continue

                // First check if channel already exists
                const { data: existingChannel } = await admin
                  .from('channels')
                  .select('id, title')
                  .eq('youtube_id', ytChannelId)
                  .single()

                if (existingChannel) {
                  // Channel exists - use its id, but update title if it's "Unknown Channel"
                  const existing = existingChannel as { id: string; title: string }
                  channelIdMap.set(ytChannelId, existing.id)

                  // Update title if it was a placeholder
                  const channelTitle = channelTitleMap.get(ytChannelId)
                  if (channelTitle && existing.title === 'Unknown Channel') {
                    await admin
                      .from('channels')
                      .update({ title: channelTitle } as never)
                      .eq('id', existing.id)
                  }
                } else {
                  // Channel doesn't exist - create it
                  const channelTitle = channelTitleMap.get(ytChannelId) || 'Unknown Channel'
                  const { data: chData } = await admin
                    .from('channels')
                    .insert({
                      youtube_id: ytChannelId,
                      title: channelTitle,
                      activity_level: 'low',
                    } as never)
                    .select('id')
                    .single()
                  if (chData) {
                    channelIdMap.set(ytChannelId, (chData as { id: string }).id)
                  }
                }
              }

              // Stage videos with source_playlist_id
              const videosToStage = result.videos
                .filter(v => channelIdMap.has(v.channelId))
                .map(v => ({
                  videoId: v.videoId,
                  title: v.title,
                  thumbnail: v.thumbnail,
                  duration: v.duration,
                  durationSeconds: v.durationSeconds,
                  isShort: v.isShort,
                  publishedAt: v.publishedAt,
                  channelId: channelIdMap.get(v.channelId)!,
                }))

              // Stage each video with its correct channel_id
              for (const video of videosToStage) {
                await stageVideos(
                  syncId,
                  userId,
                  video.channelId,
                  [{
                    videoId: video.videoId,
                    title: video.title,
                    thumbnail: video.thumbnail,
                    duration: video.duration,
                    durationSeconds: video.durationSeconds,
                    isShort: video.isShort,
                    publishedAt: video.publishedAt,
                  }],
                  playlist.id  // source_playlist_id
                )
              }

              totalVideos += videosToStage.length
            }

            // Update last_refreshed_at
            await admin
              .from('user_playlists')
              .update({ last_refreshed_at: new Date().toISOString() } as never)
              .eq('id', playlist.id)

            playlistsProcessed++
            // Update progress to reflect playlist completion
            await progress.updateProgress(
              activeChannels.length + playlistsProcessed,
              playlist.title,
              `Processed playlist "${playlist.title}" (${playlistsProcessed}/${playlists.length})`
            )
          } catch (error) {
            console.error(`[VideoSync] Failed to sync playlist "${playlist.title}":`, error)
            // Don't fail the whole sync for playlist errors, but still update progress
            playlistsProcessed++
            await progress.updateProgress(
              activeChannels.length + playlistsProcessed,
              playlist.title,
              `Playlist "${playlist.title}" had errors (${playlistsProcessed}/${playlists.length})`
            )
          }
        }

        console.log(`[VideoSync] Playlist sync complete: ${playlistsProcessed} playlists processed`)
      }
    }

    // Determine sync outcome for commit/rollback decision
    // Allow partial success: commit if at least some channels succeeded
    // Only rollback if ALL channels failed or critical errors occurred
    const syncSucceeded = !syncCancelled && !syncFailed && channelsProcessed > 0
    const shouldCommit = syncSucceeded || quotaExhausted // Commit on success OR quota pause (resume later)

    let videosCommitted = 0
    let duplicatesLinked = 0

    if (shouldCommit && totalVideos > 0) {
      // Commit all staged videos to the main table
      console.log(`[VideoSync] Committing ${totalVideos} staged videos...`)
      const commitResult = await commitSync(syncId)
      if (commitResult) {
        videosCommitted = commitResult.videosCommitted
        duplicatesLinked = commitResult.duplicatesLinked
        console.log(`[VideoSync] Committed ${videosCommitted} videos, linked ${duplicatesLinked} duplicates`)
      } else {
        // Commit failed - this is a serious error
        console.error('[VideoSync] Failed to commit staged videos')
        syncFailed = true
      }
    } else if (!shouldCommit && totalVideos > 0) {
      // Rollback all staged videos (all-or-nothing)
      console.log(`[VideoSync] Rolling back ${totalVideos} staged videos due to sync failure...`)
      const rollbackResult = await rollbackSync(syncId)
      if (rollbackResult) {
        console.log(`[VideoSync] Rolled back ${rollbackResult.videosDiscarded} videos`)
      }
      totalVideos = 0 // Reset count since we rolled back
    }

    // Record sync in history
    await admin.rpc('record_sync_completion', {
      p_user_id: userId,
      p_sync_type: 'manual',
      p_started_at: new Date(startTime).toISOString(),
      p_success: syncSucceeded,
      p_channels_processed: channelsProcessed,
      p_channels_failed: channelsFailed,
      p_videos_added: videosCommitted,
      p_quota_used: progress.getProgress().stats.quotaUsed,
      p_error_message: syncCancelled
        ? 'Sync cancelled by user - all changes rolled back'
        : syncFailed
          ? 'Sync failed - all changes rolled back'
          : quotaExhausted
            ? 'Sync paused: quota exhausted - will resume when quota resets'
            : errors.length > 0 && channelsProcessed > 0
              ? `Partial success: ${channelsProcessed} channels succeeded, ${channelsFailed} failed`
              : errors.length > 0
                ? 'All channels failed'
                : null,
    } as never)

    // Complete progress tracking
    const finalMessage = syncCancelled
      ? `Sync cancelled - rolled back all changes`
      : syncFailed
        ? `Sync failed - rolled back all changes`
        : quotaExhausted
          ? `Sync paused at ${channelsProcessed}/${activeChannels.length} channels (quota exhausted) - ${videosCommitted} videos saved`
          : errors.length > 0 && channelsProcessed > 0
            ? `Partial success: ${channelsProcessed} channels synced (${videosCommitted} videos), ${channelsFailed} channels failed`
            : errors.length > 0
              ? `All channels failed - no videos imported`
              : `Synced ${channelsProcessed} channels, added ${videosCommitted} videos`

    await progress.complete(finalMessage)

    return NextResponse.json({
      success: syncSucceeded,
      videosImported: videosCommitted,
      channelsSynced: channelsProcessed,
      channelsFailed,
      channelsSkipped: skippableIds.size,
      quotaExhausted,
      quotaPaused: quotaExhausted, // Indicates sync will resume after quota reset
      cancelled: syncCancelled,
      rolledBack: !shouldCommit && !quotaExhausted,
      duplicatesLinked,
      errors: errors.length > 0 ? errors : undefined,
      durationMs: Date.now() - startTime,
      quotaUsed: progress.getProgress().stats.quotaUsed,
    })
  } catch (error) {
    console.error('[VideoSync] Unexpected error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  } finally {
    // Always release the lock
    if (userId && lockId) {
      await releaseSyncLock(userId, lockId)
    }
  }
}

// Helper function to stage videos for later commit (all-or-nothing sync)
async function stageVideosForSync(
  admin: ReturnType<typeof createAdminClient>,
  syncId: string,
  channelId: string,
  userId: string,
  videos: Array<{
    videoId: string
    title: string
    thumbnail: string | null
    duration: string | null
    durationSeconds: number | null
    isShort: boolean
    publishedAt: string | null
  }>
): Promise<number> {
  if (videos.length === 0) return 0

  // Get trashed video IDs for this user to filter them out
  const videoIds = videos.map(v => v.videoId)
  const { data: trashedVideos } = await admin
    .from('video_trash')
    .select('youtube_id')
    .eq('user_id', userId)
    .in('youtube_id', videoIds)

  const trashedIds = new Set(
    ((trashedVideos || []) as { youtube_id: string }[]).map(b => b.youtube_id)
  )

  // Filter out trashed videos
  const filteredVideos = videos.filter(v => !trashedIds.has(v.videoId))

  if (filteredVideos.length === 0) {
    console.log(`[VideoSync] All ${videos.length} videos were in trash, skipping`)
    return 0
  }

  if (trashedIds.size > 0) {
    console.log(`[VideoSync] Filtered out ${trashedIds.size} trashed videos`)
  }

  // Stage videos instead of direct insert
  const staged = await stageVideos(syncId, userId, channelId, filteredVideos)

  // Also stage video-channel associations for duplicate tracking (bulk insert)
  const filteredVideoIds = filteredVideos.map(v => v.videoId)
  await stageVideoChannelsBulk(syncId, userId, channelId, filteredVideoIds)

  return staged
}

