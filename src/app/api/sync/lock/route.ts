import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { NextResponse } from 'next/server'

// GET: Check if there's a stuck lock
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const admin = createAdminClient()

    const { userId, error: userError } = await getInternalUserId(supabase as never)
    if (userError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check for any locks
    const { data: lock } = await admin
      .from('sync_locks')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (!lock) {
      return NextResponse.json({ hasLock: false })
    }

    const lockData = lock as { id: string; locked_at: string; expires_at: string }
    const expiresAt = new Date(lockData.expires_at)
    const isExpired = expiresAt < new Date()

    return NextResponse.json({
      hasLock: true,
      isExpired,
      lockedAt: lockData.locked_at,
      expiresAt: lockData.expires_at,
    })
  } catch (error) {
    console.error('[Lock] Check error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE: Clear stuck lock
export async function DELETE() {
  try {
    const supabase = await createServerSupabaseClient()
    const admin = createAdminClient()

    const { userId, error: userError } = await getInternalUserId(supabase as never)
    if (userError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Delete any locks for this user
    const { error: deleteError } = await admin
      .from('sync_locks')
      .delete()
      .eq('user_id', userId)

    if (deleteError) {
      console.error('[Lock] Delete error:', deleteError)
      return NextResponse.json({ error: 'Failed to clear lock' }, { status: 500 })
    }

    // Also clear any stuck progress records
    await admin
      .from('sync_progress')
      .update({
        progress: {
          phase: 'error',
          message: 'Sync was manually cancelled',
          completedAt: new Date().toISOString(),
        }
      } as never)
      .eq('user_id', userId)
      .in('progress->>phase', ['starting', 'fetching_subscriptions', 'fetching_channel_details', 'syncing_videos', 'completing'])

    return NextResponse.json({ success: true, message: 'Lock cleared' })
  } catch (error) {
    console.error('[Lock] Clear error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
