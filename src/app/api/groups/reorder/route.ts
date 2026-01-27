import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    // Get user's internal ID
    const { userId, error: userError } = await getInternalUserId(supabase)
    if (userError || !userId) {
      return NextResponse.json({ error: userError || 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { groupIds } = body

    if (!Array.isArray(groupIds) || groupIds.length === 0) {
      return NextResponse.json({ error: 'groupIds array is required' }, { status: 400 })
    }

    // Verify all groups belong to the user
    const { data: userGroups, error: verifyError } = await supabase
      .from('channel_groups')
      .select('id')
      .eq('user_id', userId)
      .in('id', groupIds)

    if (verifyError) {
      console.error('Verify groups error:', verifyError)
      return NextResponse.json({ error: 'Failed to verify groups' }, { status: 500 })
    }

    if (!userGroups || userGroups.length !== groupIds.length) {
      return NextResponse.json({ error: 'Some groups not found or not owned by user' }, { status: 403 })
    }

    // Update sort_order for each group
    const updates = groupIds.map((id, index) =>
      supabase
        .from('channel_groups')
        .update({ sort_order: index })
        .eq('id', id)
        .eq('user_id', userId)
    )

    const results = await Promise.all(updates)
    const hasError = results.some((r) => r.error)

    if (hasError) {
      console.error('Reorder error:', results.find((r) => r.error)?.error)
      return NextResponse.json({ error: 'Failed to reorder groups' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Reorder groups API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
