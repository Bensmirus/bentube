import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { requestSyncCancellation, releaseSyncLock } from '@/lib/youtube/sync-progress'
import { NextResponse } from 'next/server'

/**
 * POST /api/sync/cancel
 * Request cancellation of an in-progress sync
 */
export async function POST() {
  try {
    const supabase = await createServerSupabaseClient()

    const { userId, error: userError } = await getInternalUserId(supabase)
    if (userError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Request cancellation - the sync loop will check this flag and stop
    const cancelled = await requestSyncCancellation(userId)

    if (!cancelled) {
      return NextResponse.json({ error: 'No sync in progress to cancel' }, { status: 404 })
    }

    // Also force-release the lock after a short delay to ensure cleanup
    // The sync loop should release it gracefully, but this is a fallback
    setTimeout(async () => {
      await releaseSyncLock(userId)
    }, 5000)

    return NextResponse.json({
      success: true,
      message: 'Sync cancellation requested. It will stop after the current channel completes.',
    })
  } catch (error) {
    console.error('[SyncCancel] Error:', error)
    return NextResponse.json({ error: 'Failed to cancel sync' }, { status: 500 })
  }
}
