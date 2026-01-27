import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { NextResponse } from 'next/server'

export async function DELETE() {
  try {
    const supabase = await createServerSupabaseClient()
    const admin = createAdminClient()

    const { userId, error: userError } = await getInternalUserId(supabase as never)
    if (userError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // First, delete all user watch statuses (watch history, progress, etc.)
    const { error: statusError } = await admin
      .from('watch_status')
      .delete()
      .eq('user_id', userId)

    if (statusError) {
      console.error('[DeleteVideos] Failed to delete video statuses:', statusError)
      return NextResponse.json({ error: 'Failed to delete watch history' }, { status: 500 })
    }

    // Count videos before deletion for reporting
    const { count } = await admin
      .from('videos')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)

    // Delete all videos belonging to this user (simple with user_id column)
    const { error: videoError } = await admin
      .from('videos')
      .delete()
      .eq('user_id', userId)

    if (videoError) {
      console.error('[DeleteVideos] Failed to delete videos:', videoError)
      return NextResponse.json({ error: 'Failed to delete videos' }, { status: 500 })
    }

    // Get ALL user's subscribed channel IDs and reset last_fetched_at so next sync gets all videos
    // This includes channels in groups AND ungrouped subscriptions
    const { data: userSubscriptions } = await admin
      .from('user_subscriptions')
      .select('channel_id')
      .eq('user_id', userId)

    const subscriptionData = userSubscriptions as { channel_id: string }[] | null
    const channelIds = subscriptionData?.map(s => s.channel_id).filter(Boolean) || []

    if (channelIds.length > 0) {
      await admin
        .from('channels')
        .update({ last_fetched_at: null } as never)
        .in('id', channelIds)

      console.log(`[DeleteVideos] Reset last_fetched_at for ${channelIds.length} channels`)
    }

    return NextResponse.json({
      success: true,
      deletedCount: count || 0,
      message: `Deleted ${count || 0} videos`
    })
  } catch (error) {
    console.error('[DeleteVideos] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
