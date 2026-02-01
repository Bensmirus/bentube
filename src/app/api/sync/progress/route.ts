import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { getCurrentSyncProgress, isSyncInProgress } from '@/lib/youtube/sync-progress'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()

    const { userId, error: userError } = await getInternalUserId(supabase as never)
    if (userError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const progress = await getCurrentSyncProgress(userId)
    const isActive = await isSyncInProgress(userId)

    // Calculate ETA if sync is active and has enough data
    let eta: {
      estimatedSecondsRemaining: number
      estimatedCompletionTime: string
      averageChannelTimeSeconds: number
    } | null = null

    if (progress && isActive && progress.phase !== 'complete' && progress.phase !== 'error') {
      const channelsProcessed = progress.stats.channelsProcessed
      const channelsRemaining = progress.total - progress.current

      // Need at least 3 channels processed for reasonable estimate
      if (channelsProcessed >= 3 && channelsRemaining > 0) {
        const now = new Date()
        const startTime = new Date(progress.startedAt)
        const elapsedMs = now.getTime() - startTime.getTime()
        const elapsedSeconds = elapsedMs / 1000

        // Calculate average time per channel
        const avgSecondsPerChannel = elapsedSeconds / channelsProcessed

        // Cap outliers: if average is > 5 minutes per channel, cap it
        const cappedAvg = Math.min(avgSecondsPerChannel, 300) // 5 min = 300 sec

        // Estimate remaining time with 10% buffer for safety
        const estimatedRemaining = Math.ceil(cappedAvg * channelsRemaining * 1.1)

        // Calculate completion time
        const completionTime = new Date(now.getTime() + estimatedRemaining * 1000)

        eta = {
          estimatedSecondsRemaining: estimatedRemaining,
          estimatedCompletionTime: completionTime.toISOString(),
          averageChannelTimeSeconds: Math.ceil(cappedAvg),
        }
      }
    }

    return NextResponse.json({
      progress,
      isActive,
      eta,
    })
  } catch (error) {
    console.error('Sync progress error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
