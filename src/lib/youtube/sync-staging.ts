/**
 * Sync Staging System
 * Implements all-or-nothing sync behavior with rollback support
 * Videos are staged first, then committed on success or rolled back on failure
 */

import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Stage a video for later commit
 * Returns the staging ID
 */
export async function stageVideo(
  syncId: string,
  userId: string,
  channelId: string,
  video: {
    videoId: string
    title: string
    thumbnail: string | null
    duration: string | null
    durationSeconds: number | null
    isShort: boolean
    publishedAt: string | null
  }
): Promise<string | null> {
  const admin = createAdminClient()

  const { data, error } = await admin.rpc('stage_video' as never, {
    p_sync_id: syncId,
    p_user_id: userId,
    p_channel_id: channelId,
    p_youtube_id: video.videoId,
    p_title: video.title || 'Untitled',
    p_thumbnail: video.thumbnail,
    p_duration: video.duration,
    p_duration_seconds: video.durationSeconds,
    p_is_short: video.isShort,
    p_published_at: video.publishedAt,
  } as never)

  if (error) {
    console.error('[SyncStaging] Failed to stage video:', error)
    return null
  }

  return data as string
}

/**
 * Staging error with details about partial failures
 */
export class StagingError extends Error {
  constructor(
    message: string,
    public readonly staged: number,
    public readonly total: number,
    public readonly batchNumber: number
  ) {
    super(message)
    this.name = 'StagingError'
  }
}

/**
 * Stage multiple videos in bulk (more efficient)
 * Processes in batches of 1000 to prevent memory/timeout issues with large imports
 * Throws StagingError if any batch fails (includes count of successfully staged videos)
 */
export async function stageVideos(
  syncId: string,
  userId: string,
  channelId: string,
  videos: Array<{
    videoId: string
    title: string
    thumbnail: string | null
    duration: string | null
    durationSeconds: number | null
    isShort: boolean
    publishedAt: string | null
  }>,
  sourcePlaylistId?: string
): Promise<number> {
  if (videos.length === 0) return 0

  const admin = createAdminClient()
  const BATCH_SIZE = 1000
  let totalStaged = 0

  // Sanitize text fields to remove invalid Unicode
  const sanitizeText = (text: string | null): string | null => {
    if (!text) return text
    return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
  }

  // Process videos in batches to prevent memory/timeout issues
  const totalBatches = Math.ceil(videos.length / BATCH_SIZE)
  for (let i = 0; i < videos.length; i += BATCH_SIZE) {
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1
    const batch = videos.slice(i, i + BATCH_SIZE)

    const rows = batch.map((v) => ({
      sync_id: syncId,
      user_id: userId,
      channel_id: channelId,
      youtube_id: v.videoId,
      title: sanitizeText(v.title) || 'Untitled',
      thumbnail: v.thumbnail,
      duration: v.duration,
      duration_seconds: v.durationSeconds,
      is_short: v.isShort,
      published_at: v.publishedAt,
      source_playlist_id: sourcePlaylistId || null,
    }))

    const { error } = await admin
      .from('sync_staging_videos')
      .upsert(rows as never, { onConflict: 'sync_id,youtube_id' })

    if (error) {
      const errorMsg = `Failed to stage video batch ${batchNumber}/${totalBatches}: ${error.message}`
      console.error(`[SyncStaging] ${errorMsg}`)
      // Throw error with details so caller can handle appropriately
      throw new StagingError(errorMsg, totalStaged, videos.length, batchNumber)
    }

    totalStaged += batch.length
  }

  return totalStaged
}

/**
 * Stage a video-channel association (for duplicate tracking)
 */
export async function stageVideoChannel(
  syncId: string,
  userId: string,
  youtubeId: string,
  channelId: string
): Promise<void> {
  const admin = createAdminClient()

  await admin.rpc('stage_video_channel' as never, {
    p_sync_id: syncId,
    p_user_id: userId,
    p_youtube_id: youtubeId,
    p_channel_id: channelId,
  } as never)
}

/**
 * Stage multiple video-channel associations in bulk (much faster than one-by-one)
 * Processes in batches of 1000 to prevent memory/timeout issues with large imports
 * Throws StagingError if any batch fails
 */
export async function stageVideoChannelsBulk(
  syncId: string,
  userId: string,
  channelId: string,
  youtubeIds: string[]
): Promise<number> {
  if (youtubeIds.length === 0) return 0

  const admin = createAdminClient()
  const BATCH_SIZE = 1000
  let totalStaged = 0
  const discoveredAt = new Date().toISOString()

  // Process in batches to prevent memory/timeout issues
  const totalBatches = Math.ceil(youtubeIds.length / BATCH_SIZE)
  for (let i = 0; i < youtubeIds.length; i += BATCH_SIZE) {
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1
    const batch = youtubeIds.slice(i, i + BATCH_SIZE)

    const rows = batch.map((youtubeId) => ({
      sync_id: syncId,
      user_id: userId,
      youtube_id: youtubeId,
      channel_id: channelId,
      discovered_at: discoveredAt,
    }))

    const { error } = await admin
      .from('sync_staging_video_channels')
      .upsert(rows as never, { onConflict: 'sync_id,youtube_id,channel_id' })

    if (error) {
      const errorMsg = `Failed to stage video-channel associations batch ${batchNumber}/${totalBatches}: ${error.message}`
      console.error(`[SyncStaging] ${errorMsg}`)
      throw new StagingError(errorMsg, totalStaged, youtubeIds.length, batchNumber)
    }

    totalStaged += batch.length
  }

  return totalStaged
}

/**
 * Commit all staged changes from a sync
 * This is the "all" of all-or-nothing
 */
export async function commitSync(syncId: string): Promise<{
  videosCommitted: number
  duplicatesLinked: number
} | null> {
  const admin = createAdminClient()

  const { data, error } = await admin.rpc('commit_sync' as never, {
    p_sync_id: syncId,
  } as never)

  if (error) {
    console.error('[SyncStaging] Failed to commit sync:', error)
    return null
  }

  const result = data as { videos_committed: number; duplicates_linked: number }[] | null
  if (!result || result.length === 0) {
    return { videosCommitted: 0, duplicatesLinked: 0 }
  }

  return {
    videosCommitted: result[0].videos_committed,
    duplicatesLinked: result[0].duplicates_linked,
  }
}

/**
 * Rollback all staged changes from a failed sync
 * This is the "nothing" of all-or-nothing
 */
export async function rollbackSync(syncId: string): Promise<{
  videosDiscarded: number
  associationsDiscarded: number
} | null> {
  const admin = createAdminClient()

  const { data, error } = await admin.rpc('rollback_sync' as never, {
    p_sync_id: syncId,
  } as never)

  if (error) {
    console.error('[SyncStaging] Failed to rollback sync:', error)
    return null
  }

  const result = data as { videos_discarded: number; associations_discarded: number }[] | null
  if (!result || result.length === 0) {
    return { videosDiscarded: 0, associationsDiscarded: 0 }
  }

  return {
    videosDiscarded: result[0].videos_discarded,
    associationsDiscarded: result[0].associations_discarded,
  }
}

/**
 * Pause sync for quota exhaustion
 * Returns the time when sync can resume (next quota reset)
 */
export async function pauseSyncForQuota(syncId: string): Promise<Date | null> {
  const admin = createAdminClient()

  const { data, error } = await admin.rpc('pause_sync_for_quota' as never, {
    p_sync_id: syncId,
  } as never)

  if (error) {
    console.error('[SyncStaging] Failed to pause sync:', error)
    return null
  }

  return data ? new Date(data as string) : null
}

/**
 * Get syncs that can be resumed after quota reset
 */
export async function getResumableSyncs(): Promise<
  Array<{
    syncId: string
    userId: string
    progress: Record<string, unknown>
  }>
> {
  const admin = createAdminClient()

  const { data, error } = await admin.rpc('get_resumable_syncs' as never)

  if (error) {
    console.error('[SyncStaging] Failed to get resumable syncs:', error)
    return []
  }

  return (
    (data as Array<{
      sync_id: string
      user_id: string
      progress: Record<string, unknown>
    }> | null)?.map((s) => ({
      syncId: s.sync_id,
      userId: s.user_id,
      progress: s.progress,
    })) || []
  )
}

/**
 * Get count of staged videos for a sync
 */
export async function getStagedVideoCount(syncId: string): Promise<number> {
  const admin = createAdminClient()

  const { count, error } = await admin
    .from('sync_staging_videos')
    .select('*', { count: 'exact', head: true })
    .eq('sync_id', syncId)

  if (error) {
    console.error('[SyncStaging] Failed to get staged video count:', error)
    return 0
  }

  return count || 0
}

/**
 * Check if a video is already staged in this sync
 */
export async function isVideoStaged(syncId: string, youtubeId: string): Promise<boolean> {
  const admin = createAdminClient()

  const { count, error } = await admin
    .from('sync_staging_videos')
    .select('*', { count: 'exact', head: true })
    .eq('sync_id', syncId)
    .eq('youtube_id', youtubeId)

  if (error) {
    return false
  }

  return (count || 0) > 0
}

/**
 * Clean up orphaned staged data from failed/abandoned syncs
 * Orphaned = staging data older than maxAge with no corresponding active sync lock or paused sync
 *
 * Should be called periodically (e.g., daily cron job or on app startup)
 *
 * @param maxAgeMs Maximum age of staging data before considered orphaned (default: 1 hour)
 * @returns Number of orphaned syncs cleaned up
 */
export async function cleanupOrphanedStagingData(maxAgeMs: number = 60 * 60 * 1000): Promise<{
  syncsCleanedUp: number
  videosDeleted: number
  associationsDeleted: number
}> {
  const admin = createAdminClient()
  const cutoffTime = new Date(Date.now() - maxAgeMs).toISOString()

  try {
    // Find orphaned sync IDs from staging tables
    // These are syncs that:
    // 1. Have staged data older than cutoff
    // 2. Don't have an active sync lock
    // 3. Aren't paused waiting for quota (check sync_progress for 'paused' phase)

    // Get distinct sync_ids from staging that are old
    const { data: oldStagedSyncs, error: queryError } = await admin
      .from('sync_staging_videos')
      .select('sync_id, created_at')
      .lt('created_at', cutoffTime)
      .limit(1000)

    if (queryError) {
      console.error('[SyncStaging] Failed to query old staged syncs:', queryError)
      return { syncsCleanedUp: 0, videosDeleted: 0, associationsDeleted: 0 }
    }

    if (!oldStagedSyncs || oldStagedSyncs.length === 0) {
      return { syncsCleanedUp: 0, videosDeleted: 0, associationsDeleted: 0 }
    }

    // Get unique sync IDs
    const syncIdSet = new Set((oldStagedSyncs as { sync_id: string }[]).map(s => s.sync_id))
    const syncIds = Array.from(syncIdSet)

    // Check which of these have active locks (meaning sync is still in progress)
    const { data: activeLocks } = await admin
      .from('sync_locks')
      .select('id')
      .gt('expires_at', new Date().toISOString())

    const activeLockIds = new Set((activeLocks as { id: string }[] | null)?.map(l => l.id) || [])

    // Check which are paused for quota (shouldn't be cleaned up)
    const { data: pausedSyncs } = await admin
      .from('sync_progress')
      .select('id, progress')
      .in('id', syncIds)

    const pausedSyncIds = new Set(
      (pausedSyncs as { id: string; progress: { phase?: string } }[] | null)
        ?.filter(s => s.progress?.phase === 'quota_paused')
        .map(s => s.id) || []
    )

    // Filter to only orphaned syncs (no active lock, not paused)
    const orphanedSyncIds = syncIds.filter(
      id => !activeLockIds.has(id) && !pausedSyncIds.has(id)
    )

    if (orphanedSyncIds.length === 0) {
      return { syncsCleanedUp: 0, videosDeleted: 0, associationsDeleted: 0 }
    }

    console.log(`[SyncStaging] Found ${orphanedSyncIds.length} orphaned syncs to clean up`)

    // Delete orphaned staging data
    let videosDeleted = 0
    let associationsDeleted = 0

    for (const syncId of orphanedSyncIds) {
      // Count staged videos before deleting
      const { count: videoCount } = await admin
        .from('sync_staging_videos')
        .select('*', { count: 'exact', head: true })
        .eq('sync_id', syncId)

      // Delete staged videos
      await admin
        .from('sync_staging_videos')
        .delete()
        .eq('sync_id', syncId)

      videosDeleted += videoCount || 0

      // Count staged video-channel associations before deleting
      const { count: assocCount } = await admin
        .from('sync_staging_video_channels')
        .select('*', { count: 'exact', head: true })
        .eq('sync_id', syncId)

      // Delete staged video-channel associations
      await admin
        .from('sync_staging_video_channels')
        .delete()
        .eq('sync_id', syncId)

      associationsDeleted += assocCount || 0
    }

    console.log(`[SyncStaging] Cleaned up ${orphanedSyncIds.length} orphaned syncs: ${videosDeleted} videos, ${associationsDeleted} associations`)

    return {
      syncsCleanedUp: orphanedSyncIds.length,
      videosDeleted,
      associationsDeleted,
    }
  } catch (error) {
    console.error('[SyncStaging] Failed to cleanup orphaned staging data:', error)
    return { syncsCleanedUp: 0, videosDeleted: 0, associationsDeleted: 0 }
  }
}
