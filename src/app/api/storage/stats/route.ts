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

    // Step 1: Get just channel_ids (much smaller payload than joining)
    const { data: videoChannelIds } = await admin
      .from('videos')
      .select('channel_id')
      .eq('user_id', userId)

    // Aggregate counts in memory
    const countMap = new Map<string, number>()
    for (const v of (videoChannelIds || []) as { channel_id: string }[]) {
      countMap.set(v.channel_id, (countMap.get(v.channel_id) || 0) + 1)
    }

    // Step 2: Get channel details only for channels that have videos
    const channelIds = Array.from(countMap.keys())
    let channelsBySize: { channel_id: string; title: string; thumbnail: string | null; video_count: number }[] = []

    if (channelIds.length > 0) {
      const { data: channels } = await admin
        .from('channels')
        .select('id, title, thumbnail')
        .in('id', channelIds)

      // Step 3: Merge counts with channel details and sort
      channelsBySize = ((channels || []) as { id: string; title: string; thumbnail: string | null }[])
        .map(ch => ({
          channel_id: ch.id,
          title: ch.title || 'Unknown',
          thumbnail: ch.thumbnail,
          video_count: countMap.get(ch.id) || 0
        }))
        .sort((a, b) => b.video_count - a.video_count)
    }

    // Get video counts by age (for cleanup preview)
    // Use separate Date instances to avoid mutation bugs
    const now = new Date()
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()).toISOString()
    const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString()
    const twoYearsAgo = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate()).toISOString()

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
