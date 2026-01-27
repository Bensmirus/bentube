import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's video limit preference
    // Note: user.id is the auth UUID, users table has auth_user_id column
    const { data, error } = await supabase
      .from('users')
      .select('video_limit')
      .eq('auth_user_id', user.id)
      .single()

    if (error) {
      console.error('Failed to fetch video limit:', error)
      return NextResponse.json({ error: 'Failed to fetch video limit' }, { status: 500 })
    }

    // Return the actual value - null means "All videos", undefined defaults to 100
    const limit = data?.video_limit
    return NextResponse.json({ limit: limit === undefined ? 100 : limit })
  } catch (error) {
    console.error('Video limit GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { limit } = body

    // Validate limit
    // Valid values: null (All), 0 (New only), or positive numbers
    if (limit !== null && (typeof limit !== 'number' || limit < 0)) {
      return NextResponse.json({ error: 'Invalid limit value' }, { status: 400 })
    }

    // Update user's video limit preference
    // Note: user.id is the auth UUID, users table has auth_user_id column
    const { error } = await supabase
      .from('users')
      .update({ video_limit: limit })
      .eq('auth_user_id', user.id)

    if (error) {
      console.error('Failed to update video limit:', error)
      return NextResponse.json({ error: 'Failed to update video limit' }, { status: 500 })
    }

    return NextResponse.json({ success: true, limit })
  } catch (error) {
    console.error('Video limit PUT error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
