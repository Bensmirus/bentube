/**
 * Resume Paused Syncs Cron Job
 * Runs daily at 8am UTC (after quota reset at midnight Pacific)
 * Resumes syncs that were paused due to quota exhaustion
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { validateCronAuth } from '@/lib/youtube/cron-handler'
import { getResumableSyncs } from '@/lib/youtube/sync-staging'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const authResult = validateCronAuth(authHeader, process.env.CRON_SECRET)

  if (!authResult.valid) {
    const status = authResult.rateLimited ? 429 : 401
    const error = authResult.rateLimited ? 'Too many failed attempts' : 'Unauthorized'
    return NextResponse.json({ error }, { status })
  }

  const admin = createAdminClient()

  try {
    // Find syncs that were paused for quota and can now resume
    const resumableSyncs = await getResumableSyncs()

    if (resumableSyncs.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No paused syncs to resume',
        syncsResumed: 0,
      })
    }

    let syncsResumed = 0
    const errors: string[] = []

    for (const sync of resumableSyncs) {
      try {
        // Create an alert to notify user their sync can resume
        await admin.rpc('create_sync_alert' as never, {
          p_user_id: sync.userId,
          p_alert_type: 'info',
          p_severity: 'info',
          p_title: 'Sync ready to resume',
          p_message: 'Your sync was paused yesterday due to quota limits. You can now resume syncing by clicking "Sync Now" in Settings.',
          p_data: { sync_id: sync.syncId },
        } as never)

        // Clear the paused state so manual sync can proceed
        await admin
          .from('sync_progress')
          .update({
            paused_for_quota: false,
            resume_after: null,
          } as never)
          .eq('id', sync.syncId)

        syncsResumed++
      } catch (error) {
        console.error(`[ResumePausedSyncs] Error resuming sync ${sync.syncId}:`, error)
        errors.push(sync.syncId)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Notified ${syncsResumed} users about resumable syncs`,
      syncsResumed,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error('[ResumePausedSyncs] Unexpected error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
