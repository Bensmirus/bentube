import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/auth/api-key'
import { createAdminClient } from '@/lib/supabase/admin'

// Videos of one group, for the "Mes catégories" panel injected into youtube.com
// by the BenTube userscript. Auth: personal API key (Bearer bt_...).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const dynamic = 'force-dynamic'

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json(
        { success: false, error: 'Missing authorization header' },
        { status: 401, headers: corsHeaders }
      )
    }

    const userId = await validateApiKey(authHeader)
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Invalid API key' },
        { status: 401, headers: corsHeaders }
      )
    }

    const params = request.nextUrl.searchParams
    const groupId = params.get('group_id')
    if (!groupId || !UUID_RE.test(groupId)) {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid group_id' },
        { status: 400, headers: corsHeaders }
      )
    }

    const limit = Math.min(Math.max(parseInt(params.get('limit') || '48') || 48, 1), 100)
    const offset = Math.max(parseInt(params.get('offset') || '0') || 0, 0)

    const admin = createAdminClient()

    // The group must belong to this user
    const { data: group } = await admin
      .from('channel_groups')
      .select('id')
      .eq('id', groupId)
      .eq('user_id', userId)
      .single()

    if (!group) {
      return NextResponse.json(
        { success: false, error: 'Group not found' },
        { status: 404, headers: corsHeaders }
      )
    }

    // Fetch one extra row to know if there is a next page
    const { data, error } = await admin.rpc('get_feed', {
      p_user_id: userId,
      p_group_id: groupId,
      p_limit: limit + 1,
      p_offset: offset,
    } as never)

    if (error) {
      console.error('[Extension/Feed] get_feed error:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch videos' },
        { status: 500, headers: corsHeaders }
      )
    }

    type Row = {
      youtube_id: string
      title: string
      thumbnail: string | null
      duration: string | null
      duration_seconds: number | null
      published_at: string | null
      channel_title: string | null
      channel_thumbnail: string | null
      watched: boolean
      watch_progress: number | null
    }

    const rows = (data as Row[] | null) || []
    const hasMore = rows.length > limit
    const nextOffset = offset + Math.min(rows.length, limit)

    const videos = rows
      .slice(0, limit)
      .map((v) => ({
        youtubeId: v.youtube_id,
        title: v.title,
        thumbnail: v.thumbnail,
        duration: v.duration,
        durationSeconds: v.duration_seconds,
        publishedAt: v.published_at,
        channelTitle: v.channel_title,
        channelThumbnail: v.channel_thumbnail,
        watched: v.watched,
        progress: v.watch_progress || 0,
      }))

    return NextResponse.json(
      { success: true, data: { videos, hasMore, nextOffset } },
      { headers: corsHeaders }
    )
  } catch (error) {
    console.error('[Extension/Feed] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    )
  }
}
