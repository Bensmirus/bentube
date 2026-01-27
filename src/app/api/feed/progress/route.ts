import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { NextRequest, NextResponse } from 'next/server'

type ProgressUpdate = {
  video_id: string
  progress_seconds: number
  duration_seconds: number
  timestamp?: string
}

type BatchRequest = {
  updates: ProgressUpdate[]
}

type SingleRequest = {
  video_id: string
  progress_seconds: number
  duration_seconds: number
  timestamp?: string
}

/**
 * POST /api/feed/progress
 *
 * Update watch progress for one or more videos.
 * Supports both single and batch updates for efficiency.
 * Uses server timestamp for cross-device sync conflict resolution.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    const { userId, error: userError } = await getInternalUserId(supabase)
    if (userError || !userId) {
      return NextResponse.json({ error: userError || 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    // Handle batch updates
    if ('updates' in body && Array.isArray(body.updates)) {
      const { updates } = body as BatchRequest

      if (updates.length === 0) {
        return NextResponse.json({ error: 'No updates provided' }, { status: 400 })
      }

      if (updates.length > 50) {
        return NextResponse.json({ error: 'Maximum 50 updates per batch' }, { status: 400 })
      }

      // Validate all updates
      for (const update of updates) {
        if (!update.video_id || typeof update.progress_seconds !== 'number' || typeof update.duration_seconds !== 'number') {
          return NextResponse.json({ error: 'Invalid update format' }, { status: 400 })
        }
      }

      const { data, error } = await supabase.rpc('batch_update_watch_progress', {
        p_user_id: userId,
        p_updates: updates.map(u => ({
          video_id: u.video_id,
          progress_seconds: Math.floor(u.progress_seconds),
          duration_seconds: Math.floor(u.duration_seconds),
          timestamp: u.timestamp || new Date().toISOString(),
        })),
      })

      if (error) {
        console.error('Batch progress update error:', error)
        return NextResponse.json({ error: 'Failed to update progress' }, { status: 500 })
      }

      return NextResponse.json(data)
    }

    // Handle single update
    const { video_id, progress_seconds, duration_seconds, timestamp } = body as SingleRequest

    if (!video_id || typeof progress_seconds !== 'number' || typeof duration_seconds !== 'number') {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { data, error } = await supabase.rpc('update_watch_progress', {
      p_user_id: userId,
      p_video_id: video_id,
      p_progress_seconds: Math.floor(progress_seconds),
      p_duration_seconds: Math.floor(duration_seconds),
      p_client_timestamp: timestamp || new Date().toISOString(),
    })

    if (error) {
      console.error('Progress update error:', error)
      return NextResponse.json({ error: 'Failed to update progress' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Progress API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * GET /api/feed/progress?ids=video1,video2,video3
 *
 * Get watch progress for multiple videos.
 * Useful for syncing state across devices.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    const { userId, error: userError } = await getInternalUserId(supabase)
    if (userError || !userId) {
      return NextResponse.json({ error: userError || 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const idsParam = searchParams.get('ids')

    if (!idsParam) {
      return NextResponse.json({ error: 'Missing video IDs' }, { status: 400 })
    }

    const videoIds = idsParam.split(',').filter(Boolean)

    if (videoIds.length === 0) {
      return NextResponse.json({ error: 'No video IDs provided' }, { status: 400 })
    }

    if (videoIds.length > 100) {
      return NextResponse.json({ error: 'Maximum 100 video IDs per request' }, { status: 400 })
    }

    const { data, error } = await supabase.rpc('get_watch_progress', {
      p_user_id: userId,
      p_video_ids: videoIds,
    })

    if (error) {
      console.error('Get progress error:', error)
      return NextResponse.json({ error: 'Failed to get progress' }, { status: 500 })
    }

    // Transform to a map for easy client-side lookup
    const progressMap: Record<string, {
      progress: number
      progress_seconds: number
      watched: boolean
      last_position_at: string
    }> = {}

    for (const item of data || []) {
      progressMap[item.video_id] = {
        progress: item.watch_progress,
        progress_seconds: item.watch_progress_seconds,
        watched: item.watched,
        last_position_at: item.last_position_at,
      }
    }

    return NextResponse.json({ progress: progressMap })
  } catch (error) {
    console.error('Progress API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
