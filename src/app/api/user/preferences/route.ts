import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { NextRequest, NextResponse } from 'next/server'

// Get user preferences
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()

    const { userId, error: userError } = await getInternalUserId(supabase)
    if (userError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()

    // Fetch video_limit (the column sync actually uses) - column may not exist if migration not applied
    const { data, error } = await admin
      .from('users')
      .select('video_limit, preferences')
      .eq('id', userId)
      .single()

    if (error) {
      // Column may not exist yet - return defaults
      if (error.message?.includes('video_limit') || error.code === '42703') {
        console.warn('[Preferences] video_limit column not found - using default')
        return NextResponse.json({
          videoImportLimit: 100, // Default
          preferences: {},
        })
      }
      console.error('[Preferences] Failed to fetch:', error)
      return NextResponse.json({ error: 'Failed to fetch preferences' }, { status: 500 })
    }

    const userData = data as { video_limit?: number | null; preferences?: Record<string, unknown> | null }

    // Important: null means "unlimited" (user chose "All videos")
    // 0 means "New only" mode
    // undefined means column doesn't exist or user never set it → use default 100
    const videoLimit = userData.video_limit === undefined ? 100 : userData.video_limit

    return NextResponse.json({
      videoImportLimit: videoLimit,
      preferences: userData.preferences || {},
    })
  } catch (error) {
    console.error('[Preferences] Unexpected error:', error)
    // Return defaults on any error to prevent page from breaking
    return NextResponse.json({
      videoImportLimit: 100,
      preferences: {},
    })
  }
}

// Update user preferences
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    const { userId, error: userError } = await getInternalUserId(supabase)
    if (userError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { videoImportLimit } = body

    // Validate videoImportLimit
    // Valid values: null (All), 0 (New only), or positive numbers
    if (videoImportLimit !== undefined && videoImportLimit !== null) {
      if (typeof videoImportLimit !== 'number' || videoImportLimit < 0) {
        return NextResponse.json({ error: 'Invalid video import limit' }, { status: 400 })
      }
    }

    const admin = createAdminClient()

    const updates: Record<string, unknown> = {}

    if (videoImportLimit !== undefined) {
      // null = unlimited, 0 = new only, number = specific limit
      updates.video_limit = videoImportLimit
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { error } = await admin
      .from('users')
      .update(updates as never)
      .eq('id', userId)

    if (error) {
      // Column may not exist yet
      if (error.message?.includes('video_limit') || error.code === '42703') {
        console.warn('[Preferences] video_limit column not found - migration needed')
        return NextResponse.json({
          error: 'Feature not available. Please run database migration 00029_add_video_limit_to_users.sql'
        }, { status: 501 })
      }
      console.error('[Preferences] Failed to update:', error)
      return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Preferences] Unexpected error:', error)
    return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 })
  }
}
