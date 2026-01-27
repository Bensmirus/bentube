import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    // Get user's internal ID (creates record if needed)
    const { userId, error: userError } = await getInternalUserId(supabase)
    if (userError || !userId) {
      return NextResponse.json({ error: userError || 'Unauthorized' }, { status: 401 })
    }

    // Parse query params
    const searchParams = request.nextUrl.searchParams
    const groupId = searchParams.get('group_id') || null
    const search = searchParams.get('search') || null
    const tagIdsParam = searchParams.get('tag_ids')
    const tagIds = tagIdsParam ? tagIdsParam.split(',').filter(Boolean) : null
    const shortsOnly = searchParams.get('shorts_only') === 'true'
    const includeShorts = searchParams.get('include_shorts') === 'true'
    const minDuration = searchParams.get('min_duration') ? parseInt(searchParams.get('min_duration')!) : null
    const maxDuration = searchParams.get('max_duration') ? parseInt(searchParams.get('max_duration')!) : null
    const minDate = searchParams.get('min_date') || null
    const maxDate = searchParams.get('max_date') || null
    const channelIdsParam = searchParams.get('channel_ids')
    const channelIds = channelIdsParam ? channelIdsParam.split(',').filter(Boolean) : null
    const inProgressOnly = searchParams.get('in_progress') === 'true'
    const watchLaterOnly = searchParams.get('watch_later') === 'true'
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Call the get_feed function
    const { data: videos, error: feedError } = await supabase
      .rpc('get_feed', {
        p_user_id: userId,
        p_group_id: groupId,
        p_tag_ids: tagIds,
        p_search: search,
        p_shorts_only: shortsOnly,
        p_include_shorts: includeShorts,
        p_min_duration: minDuration,
        p_max_duration: maxDuration,
        p_min_date: minDate,
        p_max_date: maxDate,
        p_channel_ids: channelIds,
        p_in_progress_only: inProgressOnly,
        p_watch_later_only: watchLaterOnly,
        p_limit: limit,
        p_offset: offset,
      })

    if (feedError) {
      console.error('Feed error:', feedError)
      return NextResponse.json({ error: 'Failed to fetch feed' }, { status: 500 })
    }

    // For pagination, we estimate if there are more videos based on returned count
    // This avoids the expensive count query - if we got 'limit' videos, there might be more
    const hasMore = (videos?.length || 0) === limit
    const estimatedTotal = hasMore ? offset + limit + 1 : offset + (videos?.length || 0)

    return NextResponse.json({
      videos: videos || [],
      total: estimatedTotal,
      hasMore,
      limit,
      offset,
    })
  } catch (error) {
    console.error('Feed API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
