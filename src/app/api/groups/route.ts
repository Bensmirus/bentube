import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()

    // Get user's internal ID (creates record if needed)
    const { userId, error: userError } = await getInternalUserId(supabase)
    if (userError || !userId) {
      return NextResponse.json({ error: userError || 'Unauthorized' }, { status: 401 })
    }

    // Call the get_groups_with_channels function
    const { data: groups, error: groupsError } = await supabase
      .rpc('get_groups_with_channels', {
        p_user_id: userId,
      })

    if (groupsError) {
      console.error('Groups error:', groupsError)
      return NextResponse.json({ error: 'Failed to fetch groups' }, { status: 500 })
    }

    return NextResponse.json({ groups: groups || [] })
  } catch (error) {
    console.error('Groups API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    // Get user's internal ID (creates record if needed)
    const { userId, error: userError } = await getInternalUserId(supabase)
    if (userError || !userId) {
      return NextResponse.json({ error: userError || 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, color = '#3B82F6', icon = '📁' } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    // Get max sort_order
    const { data: maxOrder } = await supabase
      .from('channel_groups')
      .select('sort_order')
      .eq('user_id', userId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .single()

    const sortOrder = (maxOrder?.sort_order ?? -1) + 1

    // Create the group
    const { data: group, error: createError } = await supabase
      .from('channel_groups')
      .insert({
        user_id: userId,
        name: name.trim(),
        color,
        icon,
        sort_order: sortOrder,
      })
      .select()
      .single()

    if (createError) {
      console.error('Create group error:', createError)
      return NextResponse.json({ error: 'Failed to create group' }, { status: 500 })
    }

    return NextResponse.json({ group }, { status: 201 })
  } catch (error) {
    console.error('Create group API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
