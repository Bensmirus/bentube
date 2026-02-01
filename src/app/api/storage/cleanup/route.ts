import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { NextRequest, NextResponse } from 'next/server'

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const admin = createAdminClient()

    const { userId, error: userError } = await getInternalUserId(supabase as never)
    if (userError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { type, channelId, olderThanMonths } = body

    if (type === 'channel' && channelId) {
      // Delete videos from a specific channel (optionally filtered by date)
      let query = admin
        .from('videos')
        .select('id')
        .eq('user_id', userId)
        .eq('channel_id', channelId)

      // If olderThanMonths is provided, only delete old videos
      let cutoffIso: string | null = null
      if (olderThanMonths && olderThanMonths > 0) {
        const cutoffDate = new Date()
        cutoffDate.setMonth(cutoffDate.getMonth() - olderThanMonths)
        cutoffIso = cutoffDate.toISOString()
        query = query.lt('published_at', cutoffIso)
      }

      const { data: videoIds } = await query
      const videoData = videoIds as { id: string }[] | null

      if (videoData && videoData.length > 0) {
        const ids = videoData.map(v => v.id)

        await admin
          .from('watch_status')
          .delete()
          .eq('user_id', userId)
          .in('video_id', ids)
      }

      // Delete the videos with same filters
      let deleteQuery = admin
        .from('videos')
        .delete()
        .eq('user_id', userId)
        .eq('channel_id', channelId)

      if (cutoffIso) {
        deleteQuery = deleteQuery.lt('published_at', cutoffIso)
      }

      const { error: deleteError } = await deleteQuery

      if (deleteError) {
        console.error('[Cleanup] Failed to delete channel videos:', deleteError)
        return NextResponse.json({ error: 'Failed to delete videos' }, { status: 500 })
      }

      const deletedCount = videoData?.length || 0
      return NextResponse.json({
        success: true,
        deletedCount,
        message: cutoffIso
          ? `Deleted ${deletedCount} videos older than ${olderThanMonths} months from channel`
          : `Deleted ${deletedCount} videos from channel`
      })

    } else if (type === 'date' && olderThanMonths) {
      // Delete videos older than X months
      const cutoffDate = new Date()
      cutoffDate.setMonth(cutoffDate.getMonth() - olderThanMonths)
      const cutoffIso = cutoffDate.toISOString()

      // Get video IDs first for watch_status cleanup
      const { data: dateVideoIds } = await admin
        .from('videos')
        .select('id')
        .eq('user_id', userId)
        .lt('published_at', cutoffIso)

      const dateVideoData = dateVideoIds as { id: string }[] | null

      if (dateVideoData && dateVideoData.length > 0) {
        const ids = dateVideoData.map(v => v.id)

        // Delete watch_status entries
        await admin
          .from('watch_status')
          .delete()
          .eq('user_id', userId)
          .in('video_id', ids)
      }

      // Delete the videos
      const { error: deleteError } = await admin
        .from('videos')
        .delete()
        .eq('user_id', userId)
        .lt('published_at', cutoffIso)

      if (deleteError) {
        console.error('[Cleanup] Failed to delete old videos:', deleteError)
        return NextResponse.json({ error: 'Failed to delete videos' }, { status: 500 })
      }

      const deletedCount = dateVideoData?.length || 0
      return NextResponse.json({
        success: true,
        deletedCount,
        message: `Deleted ${deletedCount} videos older than ${olderThanMonths} months`
      })

    } else {
      return NextResponse.json({ error: 'Invalid cleanup parameters' }, { status: 400 })
    }

  } catch (error) {
    console.error('[Cleanup] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
