import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { getUnhealthyChannels, reviveDeadChannels } from '@/lib/youtube/channel-health'
import { NextRequest, NextResponse } from 'next/server'

// GET: Get unhealthy channels for the user
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()

    const { userId, error: userError } = await getInternalUserId(supabase as never)
    if (userError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const unhealthyChannels = await getUnhealthyChannels(userId)

    return NextResponse.json({
      unhealthyChannels,
      count: unhealthyChannels.length,
    })
  } catch (error) {
    console.error('Channel health error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST: Revive dead channels (reset their health status)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const admin = createAdminClient()

    const { userId, error: userError } = await getInternalUserId(supabase as never)
    if (userError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const channelIds = body.channelIds as string[] | undefined

    if (!channelIds || !Array.isArray(channelIds) || channelIds.length === 0) {
      return NextResponse.json({ error: 'channelIds array required' }, { status: 400 })
    }

    // Verify user owns these channels
    const { data: userChannels } = await admin
      .from('user_subscriptions')
      .select('channel_id')
      .eq('user_id', userId)
      .in('channel_id', channelIds)

    const validChannelIds = (userChannels as { channel_id: string }[] | null)?.map((c) => c.channel_id) || []

    if (validChannelIds.length === 0) {
      return NextResponse.json({ error: 'No valid channels found' }, { status: 400 })
    }

    const revivedCount = await reviveDeadChannels(validChannelIds)

    return NextResponse.json({
      success: true,
      revivedCount,
    })
  } catch (error) {
    console.error('Channel revive error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
