import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Get all user's subscribed channels
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()

    const { userId, error: userError } = await getInternalUserId(supabase)
    if (userError || !userId) {
      return NextResponse.json({ error: userError || 'Unauthorized' }, { status: 401 })
    }

    // Get all channels the user is subscribed to
    const { data: subscriptions, error } = await supabase
      .from('user_subscriptions')
      .select(`
        channel_id,
        channels (
          id,
          youtube_id,
          title,
          thumbnail
        )
      `)
      .eq('user_id', userId)
      .order('subscribed_at', { ascending: false })

    if (error) {
      console.error('Fetch channels error:', error)
      return NextResponse.json({ error: 'Failed to fetch channels' }, { status: 500 })
    }

    const channels = (subscriptions || [])
      .map(sub => sub.channels)
      .filter(Boolean)

    return NextResponse.json({ channels })
  } catch (error) {
    console.error('Channels API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
