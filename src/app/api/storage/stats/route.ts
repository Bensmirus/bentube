import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { USER_VIDEO_LIMIT, USER_VIDEO_WARNING_THRESHOLD } from '@/lib/constants/limits'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const admin = createAdminClient()

    const { userId, error: userError } = await getInternalUserId(supabase as never)
    if (userError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get total video count
    const { count: totalVideos } = await admin
      .from('videos')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)

    // Get total channel count
    const { count: totalChannels } = await admin
      .from('user_subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)

    // Get video counts per channel (sorted by count descending)
    const { data: channelStats } = await admin
      .from('videos')
      .select('channel_id, channels!inner(id, title, thumbnail)')
      .eq('user_id', userId)

    interface VideoWithChannel {
      channel_id: string
      channels: { id: string; title: string; thumbnail: string | null }
    }

    const videoData = channelStats as VideoWithChannel[] | null

    // Aggregate video counts per channel
    const channelCounts: Record<string, {
      channel_id: string
      title: string
      thumbnail: string | null
      video_count: number
    }> = {}

    for (const video of videoData || []) {
      const channelId = video.channel_id
      const channel = video.channels

      if (!channelCounts[channelId]) {
        channelCounts[channelId] = {
          channel_id: channelId,
          title: channel?.title || 'Unknown',
          thumbnail: channel?.thumbnail || null,
          video_count: 0
        }
      }
      channelCounts[channelId].video_count++
    }

    // Sort by video count descending
    const channelsBySize = Object.values(channelCounts)
      .sort((a, b) => b.video_count - a.video_count)

    // Get video counts by age (for cleanup preview)
    const now = new Date()
    const sixMonthsAgo = new Date(now.setMonth(now.getMonth() - 6)).toISOString()
    const oneYearAgo = new Date(new Date().setFullYear(new Date().getFullYear() - 1)).toISOString()
    const twoYearsAgo = new Date(new Date().setFullYear(new Date().getFullYear() - 2)).toISOString()

    const { count: olderThan6Months } = await admin
      .from('videos')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .lt('published_at', sixMonthsAgo)

    const { count: olderThan1Year } = await admin
      .from('videos')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .lt('published_at', oneYearAgo)

    const { count: olderThan2Years } = await admin
      .from('videos')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .lt('published_at', twoYearsAgo)

    const videoCount = totalVideos || 0
    const usagePercent = videoCount / USER_VIDEO_LIMIT

    return NextResponse.json({
      totalVideos: videoCount,
      totalChannels: totalChannels || 0,
      limit: USER_VIDEO_LIMIT,
      usagePercent,
      isNearLimit: usagePercent >= USER_VIDEO_WARNING_THRESHOLD,
      isAtLimit: videoCount >= USER_VIDEO_LIMIT,
      channelsBySize,
      cleanup: {
        olderThan6Months: olderThan6Months || 0,
        olderThan1Year: olderThan1Year || 0,
        olderThan2Years: olderThan2Years || 0
      }
    })
  } catch (error) {
    console.error('[StorageStats] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
