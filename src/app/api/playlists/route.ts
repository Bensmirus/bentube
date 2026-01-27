import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { NextResponse } from 'next/server'

// Get all playlists for the current user
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()

    const { userId, error: userError } = await getInternalUserId(supabase)
    if (userError || !userId) {
      return NextResponse.json({ error: userError || 'Unauthorized' }, { status: 401 })
    }

    const { data: playlists, error } = await supabase
      .from('user_playlists')
      .select(`
        id,
        youtube_playlist_id,
        title,
        thumbnail,
        video_count,
        imported_at,
        last_refreshed_at
      `)
      .eq('user_id', userId)
      .order('title', { ascending: true })

    if (error) {
      console.error('Fetch playlists error:', error)
      return NextResponse.json({ error: 'Failed to fetch playlists' }, { status: 500 })
    }

    return NextResponse.json({ playlists: playlists || [] })
  } catch (error) {
    console.error('Get playlists API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
