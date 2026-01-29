import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { getYouTubeClient } from '@/lib/youtube/client'
import { fetchChannelVideos } from '@/lib/youtube/videos'
import { getEffectiveVideoLimit } from '@/lib/user/video-limit'
import { acquireSyncLock, releaseSyncLock } from '@/lib/youtube/sync-progress'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const admin = createAdminClient()

  const { userId, error: userError } = await getInternalUserId(supabase)
  if (userError || !userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const {
    channelId,
    title,
    thumbnail,
    uploadsPlaylistId,
    groupIds,
    videoLimit: requestedVideoLimit,
  } = await request.json()

  if (!channelId || !groupIds || groupIds.length === 0) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Acquire sync lock to prevent race conditions with ongoing syncs
  const lockId = await acquireSyncLock(userId)
  if (!lockId) {
    return NextResponse.json(
      { error: 'A sync is currently in progress. Please wait for it to complete before adding channels.' },
      { status: 409 }
    )
  }

  try {
    // Verify all group IDs belong to this user
    const { data: userGroups, error: groupsError } = await admin
      .from('channel_groups')
      .select('id')
      .eq('user_id', userId)
      .in('id', groupIds)

    if (groupsError) {
      console.error('[AddChannel] Failed to verify groups:', groupsError)
      return NextResponse.json({ error: 'Failed to verify groups' }, { status: 500 })
    }

    const validGroupIds = (userGroups || []).map((g: { id: string }) => g.id)
    if (validGroupIds.length !== groupIds.length) {
      return NextResponse.json({ error: 'Invalid group selection' }, { status: 403 })
    }

    // 1. Upsert channel (creates if doesn't exist)
    // Note: 'as never' casts are needed due to incomplete Supabase type generation
    // TODO: Regenerate Supabase types with `npx supabase gen types typescript`
    const { data: channelData, error: channelError } = await admin
      .from('channels')
      .upsert({
        youtube_id: channelId,
        title,
        thumbnail,
        uploads_playlist_id: uploadsPlaylistId,
        activity_level: 'medium',
      } as never, { onConflict: 'youtube_id' })
      .select('id')
      .single()

    if (channelError || !channelData) {
      console.error('[AddChannel] Failed to create channel:', channelError)
      throw new Error('Failed to create channel')
    }

    const channel = channelData as { id: string }

    // 2. Create user subscription
    await admin
      .from('user_subscriptions')
      .upsert({
        user_id: userId,
        channel_id: channel.id,
      } as never, { onConflict: 'user_id,channel_id', ignoreDuplicates: true })

    // 3. Add channel to selected groups
    const groupChannels = groupIds.map((groupId: string) => ({
      group_id: groupId,
      channel_id: channel.id,
    }))

    await admin
      .from('group_channels')
      .upsert(groupChannels as never, { onConflict: 'group_id,channel_id', ignoreDuplicates: true })

    // 4. Import videos from the channel
    const { client: youtube, error: ytError } = await getYouTubeClient(userId)
    if (!youtube || ytError) {
      // Channel added but videos not imported - return partial success with 207 status
      return NextResponse.json({
        success: false,
        partial: true,
        channelId: channel.id,
        videosImported: 0,
        error: 'Channel added but could not import videos (YouTube not connected). Please reconnect YouTube and sync manually.',
      }, { status: 207 }) // 207 Multi-Status indicates partial success
    }

    // Use the requested video limit from the modal, or fall back to user's global setting
    let videoLimit: number
    if (requestedVideoLimit !== undefined && requestedVideoLimit !== null) {
      // Use the specific limit chosen in the add channel modal
      videoLimit = requestedVideoLimit
      console.log(`[AddChannel] Using requested video limit: ${videoLimit}`)
    } else if (requestedVideoLimit === null) {
      // "All videos" selected - use a very high number (no practical limit)
      videoLimit = 10000
      console.log(`[AddChannel] Using "all videos" mode (limit: ${videoLimit})`)
    } else {
      // Fall back to user's global video import limit setting
      const videoLimitConfig = await getEffectiveVideoLimit(userId)
      // For adding a channel, "new only" mode means import 0 videos
      // (no point of comparison for a brand new channel)
      videoLimit = videoLimitConfig.mode === 'new_only' ? 0 : (videoLimitConfig.limit ?? 10000)
      console.log(`[AddChannel] Using global video limit: ${videoLimit} (mode: ${videoLimitConfig.mode})`)
    }
    console.log(`[AddChannel] Fetching videos with limit: ${videoLimit}, uploadsPlaylistId: ${uploadsPlaylistId}`)

    const result = await fetchChannelVideos(
      youtube,
      uploadsPlaylistId,
      channelId,
      null, // No date filter - we use video count limit instead
      videoLimit,
      userId,
      {
        checkQuotaMidSync: true,
        filterLiveStreams: true,
        filterScheduled: true,
      }
    )

    console.log(`[AddChannel] fetchChannelVideos result:`, {
      videosCount: result.videos.length,
      error: result.error,
      apiCalls: result.apiCalls,
      quotaExhausted: result.quotaExhausted,
      playlistNotFound: result.playlistNotFound,
    })

    // 5. Save videos to database
    let videosImported = 0
    if (result.videos.length > 0) {
      const videosToUpsert = result.videos.map((v) => ({
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

      const { error: videoError } = await admin
        .from('videos')
        .upsert(videosToUpsert as never, { onConflict: 'user_id,youtube_id' })

      if (videoError) {
        console.error('[AddChannel] Failed to insert videos:', videoError)
      } else {
        videosImported = result.videos.length
      }
    }

    // 6. Update last_fetched_at
    await admin
      .from('channels')
      .update({ last_fetched_at: new Date().toISOString() } as never)
      .eq('id', channel.id)

    return NextResponse.json({
      success: true,
      channelId: channel.id,
      videosImported,
    })
  } catch (error) {
    console.error('[AddChannel] Error:', error)
    return NextResponse.json({ error: 'Failed to add channel' }, { status: 500 })
  } finally {
    // Always release the sync lock
    await releaseSyncLock(userId, lockId)
  }
}
