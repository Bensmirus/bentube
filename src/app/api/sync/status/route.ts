import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const admin = createAdminClient()

    const { userId, error: userError } = await getInternalUserId(supabase as never)
    if (userError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's YouTube connection status (using admin to access tokens)
    const { data: user } = await admin
      .from('users')
      .select('youtube_access_token, youtube_token_expires_at')
      .eq('id', userId)
      .single()

    const userData = user as { youtube_access_token: string | null; youtube_token_expires_at: string | null } | null
    const isYouTubeConnected = !!userData?.youtube_access_token
    const tokenExpiresAt = userData?.youtube_token_expires_at || null

    // Get all user's subscribed channels (not just ones in groups)
    const { data: subscriptions } = await supabase
      .from('user_subscriptions')
      .select('channel_id')
      .eq('user_id', userId)

    const subscribedChannelIds = (subscriptions || []).map(s => s.channel_id)
    const totalChannels = subscribedChannelIds.length

    // Get video count for user's channels
    let totalVideos = 0
    if (subscribedChannelIds.length > 0) {
      const { count } = await admin
        .from('videos')
        .select('id', { count: 'exact', head: true })
        .in('channel_id', subscribedChannelIds)

      totalVideos = count || 0
    }

    // Get last sync time (most recent channel fetch)
    let lastSyncAt: string | null = null
    if (subscribedChannelIds.length > 0) {
      const { data: lastSync } = await admin
        .from('channels')
        .select('last_fetched_at')
        .in('id', subscribedChannelIds)
        .not('last_fetched_at', 'is', null)
        .order('last_fetched_at', { ascending: false })
        .limit(1)
        .single()

      const syncData = lastSync as { last_fetched_at: string | null } | null
      lastSyncAt = syncData?.last_fetched_at || null
    }

    return NextResponse.json({
      isYouTubeConnected,
      tokenExpiresAt,
      totalChannels,
      totalVideos,
      lastSyncAt,
    })
  } catch (error) {
    console.error('Sync status error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
