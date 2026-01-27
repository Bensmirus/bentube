import { createAdminClient } from '@/lib/supabase/admin'
import { validateCronAuth } from '@/lib/youtube/cron-handler'
import { cleanupOrphanedStagingData } from '@/lib/youtube/sync-staging'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const authResult = validateCronAuth(authHeader, process.env.CRON_SECRET)

  if (!authResult.valid) {
    const status = authResult.rateLimited ? 429 : 401
    const error = authResult.rateLimited ? 'Too many failed attempts' : 'Unauthorized'
    return NextResponse.json({ error }, { status })
  }

  const admin = createAdminClient()

  // With user-scoped videos, cleanup is simpler:
  // 1. Delete hidden videos older than 24 hours (soft-deleted when channel removed from groups)
  // 2. Clean up orphaned watch_status entries
  // 3. Clean up channels not used by any user

  // Clean up hidden videos older than 24 hours
  // (Videos are hidden when their channel is removed from all of a user's groups)
  let hiddenVideosDeleted = 0
  const { data: deletedHidden, error: hiddenError } = await admin
    .from('videos')
    .delete()
    .not('hidden_at', 'is', null)
    .lt('hidden_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .select('id')

  if (!hiddenError && deletedHidden) {
    hiddenVideosDeleted = (deletedHidden as { id: string }[]).length
  }

  // Clean up watch_status entries for videos that no longer exist
  // (Should be handled by FK cascade, but clean up any orphans just in case)
  const { data: allVideoIds } = await admin.from('videos').select('id')
  const videoData = allVideoIds as { id: string }[] | null

  let orphanedWatchStatusDeleted = 0
  if (videoData && videoData.length > 0) {
    const videoIdList = videoData.map((v) => v.id).join(',')
    const { data: deletedStatus } = await admin
      .from('watch_status')
      .delete()
      .not('video_id', 'in', `(${videoIdList})`)
      .select('id')

    orphanedWatchStatusDeleted = (deletedStatus as { id: string }[] | null)?.length || 0
  }

  // Clean up channels not used by any user's groups
  const { data: activeChannels } = await admin.from('group_channels').select('channel_id')
  const channelsData = activeChannels as { channel_id: string }[] | null
  const activeChannelIds = channelsData?.map((c) => c.channel_id) || []
  const uniqueActiveIds = Array.from(new Set(activeChannelIds))

  let orphanedChannelsDeleted = 0
  if (uniqueActiveIds.length > 0) {
    const { data: deletedChannels } = await admin
      .from('channels')
      .delete()
      .not('id', 'in', `(${uniqueActiveIds.join(',')})`)
      .select('id')

    orphanedChannelsDeleted = (deletedChannels as { id: string }[] | null)?.length || 0
  }

  // Clean up abandoned syncs (>2 hours old with no updates)
  // This clears staging tables for syncs that crashed mid-way
  let abandonedSyncsCleared = 0
  let stagedVideosDiscarded = 0
  let stagedAssociationsDiscarded = 0
  try {
    const { data: cleanupResult, error: cleanupError } = await admin.rpc(
      'cleanup_abandoned_syncs' as never,
      { p_hours: 2 } as never
    )

    if (!cleanupError && cleanupResult) {
      const result = cleanupResult as { syncs_cleaned: number; videos_discarded: number }[] | null
      if (result && result.length > 0) {
        abandonedSyncsCleared = result[0].syncs_cleaned
        stagedVideosDiscarded = result[0].videos_discarded
      }
    } else if (cleanupError) {
      // RPC may not exist - use TypeScript fallback
      console.warn('[Cleanup] cleanup_abandoned_syncs RPC failed, using fallback:', cleanupError.message)
      const fallbackResult = await cleanupOrphanedStagingData(2 * 60 * 60 * 1000) // 2 hours
      abandonedSyncsCleared = fallbackResult.syncsCleanedUp
      stagedVideosDiscarded = fallbackResult.videosDeleted
      stagedAssociationsDiscarded = fallbackResult.associationsDeleted
    }
  } catch (err) {
    // RPC may not exist if migration not applied - use TypeScript fallback
    console.warn('[Cleanup] cleanup_abandoned_syncs RPC not available, using fallback:', err)
    const fallbackResult = await cleanupOrphanedStagingData(2 * 60 * 60 * 1000) // 2 hours
    abandonedSyncsCleared = fallbackResult.syncsCleanedUp
    stagedVideosDiscarded = fallbackResult.videosDeleted
    stagedAssociationsDiscarded = fallbackResult.associationsDeleted
  }

  // Clean up expired sync locks (>30 min old)
  let expiredLocksCleared = 0
  const { data: deletedLocks } = await admin
    .from('sync_locks')
    .delete()
    .lt('expires_at', new Date().toISOString())
    .select('id')

  expiredLocksCleared = (deletedLocks as { id: string }[] | null)?.length || 0

  return NextResponse.json({
    success: true,
    hiddenVideosDeleted,
    orphanedWatchStatusDeleted,
    orphanedChannelsDeleted,
    abandonedSyncsCleared,
    stagedVideosDiscarded,
    stagedAssociationsDiscarded,
    expiredLocksCleared,
  })
}
