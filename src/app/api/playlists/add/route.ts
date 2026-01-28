import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { getYouTubeClient } from '@/lib/youtube/client'
import { fetchPlaylistVideos } from '@/lib/youtube/playlists'
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
    playlistId,
    title,
    thumbnail,
    description,
    channelId: playlistOwnerId,
    channelTitle: playlistOwnerTitle,
    groupIds,
    isRefresh = false,  // true if refreshing existing playlist
    existingPlaylistDbId = null,  // the existing user_playlists.id if refreshing
  } = await request.json()

  if (!playlistId || !groupIds || groupIds.length === 0) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Acquire sync lock to prevent race conditions
  const lockId = await acquireSyncLock(userId)
  if (!lockId) {
    return NextResponse.json(
      { error: 'A sync is currently in progress. Please wait for it to complete.' },
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
      console.error('[AddPlaylist] Failed to verify groups:', groupsError)
      return NextResponse.json({ error: 'Failed to verify groups' }, { status: 500 })
    }

    const validGroupIds = (userGroups || []).map((g: { id: string }) => g.id)
    if (validGroupIds.length !== groupIds.length) {
      return NextResponse.json({ error: 'Invalid group selection' }, { status: 403 })
    }

    // 1. Ensure playlist owner's channel exists in our channels table (for display purposes)
    let channelDbId: string | null = null
    if (playlistOwnerId) {
      const { data: channelData, error: channelError } = await admin
        .from('channels')
        .upsert({
          youtube_id: playlistOwnerId,
          title: playlistOwnerTitle || 'Unknown Channel',
          thumbnail: null,
          activity_level: 'low',  // Playlist owner channel is not synced
        } as never, { onConflict: 'youtube_id' })
        .select('id')
        .single()

      if (!channelError && channelData) {
        channelDbId = (channelData as { id: string }).id
      }
    }

    // 2. Create or update user_playlists entry
    let playlistDbId: string
    if (isRefresh && existingPlaylistDbId) {
      // Update existing playlist
      playlistDbId = existingPlaylistDbId
      await admin
        .from('user_playlists')
        .update({
          title,
          thumbnail,
          description,
          channel_id: channelDbId,
          last_refreshed_at: new Date().toISOString(),
        } as never)
        .eq('id', playlistDbId)
    } else {
      // Create new playlist entry
      const { data: playlistData, error: playlistError } = await admin
        .from('user_playlists')
        .insert({
          user_id: userId,
          youtube_playlist_id: playlistId,
          title,
          thumbnail,
          description,
          channel_id: channelDbId,
          video_count: 0,
          imported_at: new Date().toISOString(),
          last_refreshed_at: new Date().toISOString(),
        } as never)
        .select('id')
        .single()

      if (playlistError || !playlistData) {
        console.error('[AddPlaylist] Failed to create playlist:', playlistError)
        throw new Error('Failed to create playlist')
      }

      playlistDbId = (playlistData as { id: string }).id
    }

    // 3. Add playlist to selected groups
    const groupPlaylists = groupIds.map((groupId: string) => ({
      group_id: groupId,
      playlist_id: playlistDbId,
    }))

    await admin
      .from('group_playlists')
      .upsert(groupPlaylists as never, { onConflict: 'group_id,playlist_id', ignoreDuplicates: true })

    // 4. Get existing video IDs for this playlist (for refresh scenario)
    let existingVideoIds = new Set<string>()
    if (isRefresh) {
      const { data: existingVideos } = await admin
        .from('videos')
        .select('youtube_id')
        .eq('user_id', userId)
        .eq('source_playlist_id', playlistDbId)

      if (existingVideos) {
        existingVideoIds = new Set(existingVideos.map((v: { youtube_id: string }) => v.youtube_id))
      }
    }

    // 5. Fetch videos from the playlist
    const { client: youtube, error: ytError } = await getYouTubeClient(userId)
    if (!youtube || ytError) {
      return NextResponse.json({
        success: false,
        partial: true,
        playlistId: playlistDbId,
        videosImported: 0,
        error: 'Playlist created but could not import videos (YouTube not connected).',
      }, { status: 207 })
    }

    console.log(`[AddPlaylist] Fetching videos from playlist ${playlistId}`)

    const result = await fetchPlaylistVideos(
      youtube,
      playlistId,
      userId,
      {
        checkQuotaMidSync: true,
        filterLiveStreams: true,
        filterScheduled: true,
        filterShorts: true,
        existingVideoIds,
      }
    )

    console.log(`[AddPlaylist] fetchPlaylistVideos result:`, {
      videosCount: result.videos.length,
      error: result.error,
      apiCalls: result.apiCalls,
      quotaExhausted: result.quotaExhausted,
    })

    // 6. Ensure all video channels exist in our channels table
    // Build a map of channelId -> channelTitle from the videos
    const channelTitleMap = new Map<string, string>()
    for (const v of result.videos) {
      if (v.channelId && v.channelId !== 'unknown' && v.channelTitle && !channelTitleMap.has(v.channelId)) {
        channelTitleMap.set(v.channelId, v.channelTitle)
      }
    }

    const uniqueChannelIds = Array.from(new Set(result.videos.map(v => v.channelId)))
    const channelIdMap = new Map<string, string>() // youtube_id -> db_id

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
        // Channel doesn't exist - create it with the actual title
        const channelTitle = channelTitleMap.get(ytChannelId) || 'Unknown Channel'
        const { data: chData, error: chError } = await admin
          .from('channels')
          .insert({
            youtube_id: ytChannelId,
            title: channelTitle,
            activity_level: 'low',
          } as never)
          .select('id')
          .single()

        if (!chError && chData) {
          channelIdMap.set(ytChannelId, (chData as { id: string }).id)
        }
      }
    }

    // 7. Save videos to database
    let videosImported = 0
    if (result.videos.length > 0) {
      const videosToUpsert = result.videos
        .filter(v => channelIdMap.has(v.channelId))
        .map((v) => ({
          youtube_id: v.videoId,
          channel_id: channelIdMap.get(v.channelId),
          user_id: userId,
          source_playlist_id: playlistDbId,
          title: v.title,
          thumbnail: v.thumbnail,
          duration: v.duration,
          duration_seconds: v.durationSeconds,
          is_short: v.isShort,
          published_at: v.publishedAt,
        }))

      if (videosToUpsert.length > 0) {
        const { error: videoError } = await admin
          .from('videos')
          .upsert(videosToUpsert as never, { onConflict: 'user_id,youtube_id' })

        if (videoError) {
          console.error('[AddPlaylist] Failed to insert videos:', videoError)
        } else {
          videosImported = videosToUpsert.length
        }
      }
    }

    // 8. Update video count on the playlist
    await admin
      .from('user_playlists')
      .update({ video_count: videosImported } as never)
      .eq('id', playlistDbId)

    return NextResponse.json({
      success: true,
      playlistId: playlistDbId,
      videosImported,
      isRefresh,
      newVideos: isRefresh ? videosImported : undefined,
    })
  } catch (error) {
    console.error('[AddPlaylist] Error:', error)
    return NextResponse.json({ error: 'Failed to add playlist' }, { status: 500 })
  } finally {
    await releaseSyncLock(userId, lockId)
  }
}
