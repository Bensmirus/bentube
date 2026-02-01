import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/auth/api-key'
import { createAdminClient } from '@/lib/supabase/admin'

// CORS headers for extension requests from YouTube
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

// Handle preflight requests
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

export async function GET(request: NextRequest) {
  try {
    // Validate API key
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

    // Fetch user's groups with channel counts
    const admin = createAdminClient()
    const { data: groupsData, error } = await admin
      .from('channel_groups')
      .select(`
        id,
        name,
        icon,
        color,
        sort_order,
        group_channels(count)
      `)
      .eq('user_id', userId)
      .order('sort_order', { ascending: true })

    if (error) {
      console.error('[Extension/Groups] Error fetching groups:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch groups' },
        { status: 500, headers: corsHeaders }
      )
    }

    type GroupRow = {
      id: string
      name: string
      icon: string | null
      color: string | null
      sort_order: number
      group_channels: { count: number }[] | null
    }

    const groups = groupsData as GroupRow[] | null

    // Transform to match expected format
    const formattedGroups = (groups || []).map((group) => ({
      id: group.id,
      name: group.name,
      icon: group.icon,
      color: group.color,
      channelCount: group.group_channels?.[0]?.count || 0,
    }))

    return NextResponse.json(
      { success: true, data: formattedGroups },
      { headers: corsHeaders }
    )
  } catch (error) {
    console.error('[Extension/Groups] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    )
  }
}
