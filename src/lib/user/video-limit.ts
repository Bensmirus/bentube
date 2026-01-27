import { createAdminClient } from '@/lib/supabase/admin'

const DEFAULT_VIDEO_LIMIT = 100

/**
 * Get user's video import limit setting
 * @returns:
 *   - 0 = "New only" mode (only videos since last sync, nothing for new channels)
 *   - null = "All" (unlimited)
 *   - positive number = fetch up to that many videos
 */
export async function getUserVideoImportLimit(userId: string): Promise<number | null> {
  const admin = createAdminClient()

  try {
    const { data, error } = await admin
      .from('users')
      .select('video_limit')
      .eq('id', userId)
      .single()

    if (error) {
      // Column may not exist if migration not applied
      if (error.message?.includes('video_limit') || error.code === '42703') {
        console.warn('[VideoLimit] video_limit column not found - using default')
        return DEFAULT_VIDEO_LIMIT
      }
      console.error('[VideoLimit] Failed to fetch user setting:', error)
      return DEFAULT_VIDEO_LIMIT
    }

    if (!data) {
      return DEFAULT_VIDEO_LIMIT
    }

    const userData = data as { video_limit?: number | null }
    // Important: null means "unlimited" (user chose "All videos")
    // undefined means column doesn't exist or user never set it
    if (userData.video_limit === undefined) {
      return DEFAULT_VIDEO_LIMIT
    }
    // Return null for unlimited, or the actual number
    return userData.video_limit
  } catch (err) {
    console.error('[VideoLimit] Unexpected error:', err)
    return DEFAULT_VIDEO_LIMIT
  }
}

/**
 * Video limit mode for sync operations
 */
export type VideoLimitMode = {
  mode: 'new_only' | 'limited' | 'unlimited'
  limit: number // 0 for new_only, specific number for limited, 50000 for unlimited
}

/**
 * Get effective video limit with mode information
 * Used by sync operations to determine how many videos to fetch
 */
export async function getEffectiveVideoLimit(userId: string): Promise<VideoLimitMode> {
  const limit = await getUserVideoImportLimit(userId)

  if (limit === 0) {
    // "New only" mode - only videos since last sync
    return { mode: 'new_only', limit: 0 }
  }

  if (limit === null) {
    // "All" mode - unlimited (use large number for API)
    return { mode: 'unlimited', limit: 50000 }
  }

  // Specific limit
  return { mode: 'limited', limit }
}
