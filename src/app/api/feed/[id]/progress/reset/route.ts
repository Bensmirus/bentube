import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { NextResponse } from 'next/server'

// UUID v4 regex pattern
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: videoId } = await params

    // Validate video ID is a valid UUID
    if (!videoId || !UUID_REGEX.test(videoId)) {
      return NextResponse.json({ error: 'Invalid video ID' }, { status: 400 })
    }

    const supabase = await createServerSupabaseClient()
    const { userId, error } = await getInternalUserId(supabase)

    if (error || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if watch_status row exists
    const { data: existing } = await supabase
      .from('watch_status')
      .select('id')
      .eq('video_id', videoId)
      .eq('user_id', userId)
      .single()

    let dbError
    if (existing) {
      // Update only progress-related fields, preserve hidden/watch_later
      const { error: updateError } = await supabase
        .from('watch_status')
        .update({
          watch_progress: 0,
          watch_progress_seconds: 0,
          watched: false,
          last_position_at: new Date().toISOString(),
        })
        .eq('video_id', videoId)
        .eq('user_id', userId)
      dbError = updateError
    } else {
      // Insert new row with default values for hidden/watch_later
      const { error: insertError } = await supabase
        .from('watch_status')
        .insert({
          video_id: videoId,
          user_id: userId,
          watch_progress: 0,
          watch_progress_seconds: 0,
          watched: false,
          hidden: false,
          watch_later: false,
          last_position_at: new Date().toISOString(),
        })
      dbError = insertError
    }

    if (dbError) {
      console.error('Reset progress error:', dbError)
      return NextResponse.json({ error: 'Failed to reset progress' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Reset progress API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
