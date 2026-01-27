import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    const { userId, error: userError } = await getInternalUserId(supabase)
    if (userError || !userId) {
      return NextResponse.json({ error: userError || 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const groupId = searchParams.get('groupId')
    const limit = parseInt(searchParams.get('limit') || '10')

    if (!groupId) {
      return NextResponse.json({ error: 'groupId is required' }, { status: 400 })
    }

    // Use the existing get_feed RPC but with specific params for quick play
    const { data: videos, error: feedError } = await supabase
      .rpc('get_feed', {
        p_user_id: userId,
        p_group_id: groupId,
        p_tag_ids: null,
        p_search: null,
        p_shorts_only: false,
        p_include_shorts: false,
        p_min_duration: null,
        p_max_duration: null,
        p_min_date: null,
        p_max_date: null,
        p_in_progress_only: false,
        p_watch_later_only: false,
        p_limit: limit,
        p_offset: 0,
      })

    if (feedError) {
      console.error('Quick play feed error:', feedError)
      return NextResponse.json({ error: 'Failed to fetch videos' }, { status: 500 })
    }

    return NextResponse.json({
      videos: videos || [],
      groupId,
    })
  } catch (error) {
    console.error('Quick play API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
