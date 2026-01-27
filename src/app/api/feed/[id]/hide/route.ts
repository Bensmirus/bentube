import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: videoId } = await params
    const supabase = await createServerSupabaseClient()

    // Get user's internal ID (creates record if needed)
    const { userId, error: userError } = await getInternalUserId(supabase)
    if (userError || !userId) {
      return NextResponse.json({ error: userError || 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { hidden } = body

    if (typeof hidden !== 'boolean') {
      return NextResponse.json({ error: 'hidden must be a boolean' }, { status: 400 })
    }

    // Upsert watch status
    const { data, error } = await supabase
      .from('watch_status')
      .upsert(
        {
          user_id: userId,
          video_id: videoId,
          hidden,
        },
        {
          onConflict: 'user_id,video_id',
        }
      )
      .select()
      .single()

    if (error) {
      console.error('Hide error:', error)
      return NextResponse.json({ error: 'Failed to update hidden status' }, { status: 500 })
    }

    return NextResponse.json({ status: data })
  } catch (error) {
    console.error('Hide API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
