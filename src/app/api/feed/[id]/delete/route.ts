import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { NextRequest, NextResponse } from 'next/server'

/**
 * DELETE /api/feed/[id]/delete
 * Moves a video to trash (can be restored later)
 * Video won't be re-imported during sync while in trash
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: videoId } = await params
    const supabase = await createServerSupabaseClient()
    const admin = createAdminClient()

    // Get user's internal ID
    const { userId, error: userError } = await getInternalUserId(supabase as never)
    if (userError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the video details before deleting (for trash metadata)
    const { data: videoData, error: fetchError } = await admin
      .from('videos')
      .select('youtube_id, title, thumbnail, channel_id')
      .eq('id', videoId)
      .eq('user_id', userId)
      .single()

    if (fetchError || !videoData) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 })
    }

    const video = videoData as {
      youtube_id: string
      title: string
      thumbnail: string | null
      channel_id: string | null
    }

    // Get channel title if we have a channel_id
    let channelTitle: string | null = null
    if (video.channel_id) {
      const { data: channel } = await admin
        .from('channels')
        .select('title')
        .eq('id', video.channel_id)
        .single()
      channelTitle = (channel as { title: string } | null)?.title || null
    }

    // Move to video_trash table (prevents re-import, allows restore)
    const { error: trashError } = await admin
      .from('video_trash')
      .upsert(
        {
          user_id: userId,
          youtube_id: video.youtube_id,
          video_title: video.title,
          video_thumbnail: video.thumbnail,
          channel_id: video.channel_id,
          channel_title: channelTitle,
          deleted_at: new Date().toISOString(),
          permanently_blocked: false,
        } as never,
        { onConflict: 'user_id,youtube_id' }
      )

    if (trashError) {
      console.error('[DeleteVideo] Failed to move to trash:', trashError)
      return NextResponse.json({ error: 'Failed to delete video' }, { status: 500 })
    }

    // Delete any watch status for this video
    await admin
      .from('watch_status')
      .delete()
      .eq('video_id', videoId)
      .eq('user_id', userId)

    // Delete any tags for this video
    await admin
      .from('video_tags')
      .delete()
      .eq('video_id', videoId)
      .eq('user_id', userId)

    // Delete any notes for this video
    await admin
      .from('video_notes')
      .delete()
      .eq('video_id', videoId)
      .eq('user_id', userId)

    // Delete the video
    const { error: deleteError } = await admin
      .from('videos')
      .delete()
      .eq('id', videoId)
      .eq('user_id', userId)

    if (deleteError) {
      console.error('[DeleteVideo] Failed to delete video:', deleteError)
      return NextResponse.json({ error: 'Failed to delete video' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Video moved to trash (can be restored later)'
    })
  } catch (error) {
    console.error('[DeleteVideo] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
