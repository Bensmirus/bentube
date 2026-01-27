import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { NextRequest, NextResponse } from 'next/server'

/**
 * DELETE /api/feed/delete-multiple
 * Moves multiple videos to trash at once
 * Accepts: { videoIds: string[] }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { videoIds } = body as { videoIds: string[] }

    if (!videoIds || !Array.isArray(videoIds) || videoIds.length === 0) {
      return NextResponse.json({ error: 'videoIds array is required' }, { status: 400 })
    }

    const supabase = await createServerSupabaseClient()
    const admin = createAdminClient()

    // Get user's internal ID
    const { userId, error: userError } = await getInternalUserId(supabase as never)
    if (userError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get all videos that belong to this user
    const { data: videosData, error: fetchError } = await admin
      .from('videos')
      .select('id, youtube_id, title, thumbnail, channel_id')
      .in('id', videoIds)
      .eq('user_id', userId)

    if (fetchError) {
      console.error('[DeleteMultiple] Failed to fetch videos:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch videos' }, { status: 500 })
    }

    if (!videosData || videosData.length === 0) {
      return NextResponse.json({ error: 'No videos found' }, { status: 404 })
    }

    const videos = videosData as Array<{
      id: string
      youtube_id: string
      title: string
      thumbnail: string | null
      channel_id: string | null
    }>

    // Get unique channel IDs to fetch channel titles
    const channelIds = Array.from(new Set(videos.map(v => v.channel_id).filter(Boolean))) as string[]
    const channelTitles: Record<string, string> = {}

    if (channelIds.length > 0) {
      const { data: channels } = await admin
        .from('channels')
        .select('id, title')
        .in('id', channelIds)

      if (channels) {
        for (const ch of channels as Array<{ id: string; title: string }>) {
          channelTitles[ch.id] = ch.title
        }
      }
    }

    // Prepare trash records
    const trashRecords = videos.map(video => ({
      user_id: userId,
      youtube_id: video.youtube_id,
      video_title: video.title,
      video_thumbnail: video.thumbnail,
      channel_id: video.channel_id,
      channel_title: video.channel_id ? channelTitles[video.channel_id] || null : null,
      deleted_at: new Date().toISOString(),
      permanently_blocked: false,
    }))

    // Move all to video_trash table
    const { error: trashError } = await admin
      .from('video_trash')
      .upsert(trashRecords as never[], { onConflict: 'user_id,youtube_id' })

    if (trashError) {
      console.error('[DeleteMultiple] Failed to move to trash:', trashError)
      return NextResponse.json({ error: 'Failed to delete videos' }, { status: 500 })
    }

    const videoIdsToDelete = videos.map(v => v.id)

    // Delete watch status for all videos
    await admin
      .from('watch_status')
      .delete()
      .in('video_id', videoIdsToDelete)
      .eq('user_id', userId)

    // Delete tags for all videos
    await admin
      .from('video_tags')
      .delete()
      .in('video_id', videoIdsToDelete)
      .eq('user_id', userId)

    // Delete notes for all videos
    await admin
      .from('video_notes')
      .delete()
      .in('video_id', videoIdsToDelete)
      .eq('user_id', userId)

    // Delete the videos
    const { error: deleteError } = await admin
      .from('videos')
      .delete()
      .in('id', videoIdsToDelete)
      .eq('user_id', userId)

    if (deleteError) {
      console.error('[DeleteMultiple] Failed to delete videos:', deleteError)
      return NextResponse.json({ error: 'Failed to delete videos' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      deletedCount: videos.length,
      message: `${videos.length} video${videos.length === 1 ? '' : 's'} moved to trash`
    })
  } catch (error) {
    console.error('[DeleteMultiple] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
