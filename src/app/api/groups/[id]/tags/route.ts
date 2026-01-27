import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/groups/[id]/tags - Get all tags for a group
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: groupId } = await params
    const supabase = await createServerSupabaseClient()

    // Get user's internal ID
    const { userId, error: userError } = await getInternalUserId(supabase)
    if (userError || !userId) {
      return NextResponse.json({ error: userError || 'Unauthorized' }, { status: 401 })
    }

    // Get all tags for this group
    const { data: tags, error } = await supabase
      .from('tags')
      .select('*')
      .eq('user_id', userId)
      .eq('group_id', groupId)
      .order('name')

    if (error) {
      console.error('Failed to fetch tags:', error)
      return NextResponse.json({ error: 'Failed to fetch tags' }, { status: 500 })
    }

    return NextResponse.json({ tags: tags || [] })
  } catch (error) {
    console.error('Tags API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
