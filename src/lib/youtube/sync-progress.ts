/**
 * Sync Progress Tracking
 * Real-time progress updates for subscription and video syncing
 * Includes distributed locking to prevent concurrent syncs
 */

import { createAdminClient } from '@/lib/supabase/admin'

// Lock timeout: 30 minutes max for any sync operation
const SYNC_LOCK_TIMEOUT_MS = 30 * 60 * 1000
// Stale detection: if no update in 5 minutes, consider crashed
const SYNC_STALE_TIMEOUT_MS = 5 * 60 * 1000

export type SyncPhase =
  | 'idle'
  | 'starting'
  | 'fetching_subscriptions'
  | 'fetching_channel_details'
  | 'syncing_videos'
  | 'syncing_playlists'
  | 'completing'
  | 'complete'
  | 'error'

export type SyncProgressData = {
  phase: SyncPhase
  message: string
  current: number
  total: number
  currentItem?: string
  errors: SyncError[]
  startedAt: string
  updatedAt: string
  completedAt?: string
  stats: {
    channelsProcessed: number
    channelsFailed: number
    videosAdded: number
    quotaUsed: number
  }
  // Track processed channel IDs for quota resume
  processedChannelIds?: string[]
  // Track the channel IDs that were queued for this sync (for resume)
  queuedChannelIds?: string[]
}

export type SyncError = {
  channelId?: string
  channelName?: string
  errorCode: string
  message: string
  timestamp: string
}

const DEFAULT_PROGRESS: SyncProgressData = {
  phase: 'idle',
  message: '',
  current: 0,
  total: 0,
  errors: [],
  startedAt: '',
  updatedAt: '',
  stats: {
    channelsProcessed: 0,
    channelsFailed: 0,
    videosAdded: 0,
    quotaUsed: 0,
  },
}

/**
 * Sync progress tracker that persists to database for real-time updates
 */
export class SyncProgressTracker {
  private userId: string
  private syncId: string
  private progress: SyncProgressData
  private admin = createAdminClient()

  constructor(userId: string, syncId?: string) {
    this.userId = userId
    this.syncId = syncId || crypto.randomUUID()
    this.progress = {
      ...DEFAULT_PROGRESS,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  }

  getSyncId(): string {
    return this.syncId
  }

  getProgress(): SyncProgressData {
    return { ...this.progress }
  }

  /**
   * Start a new sync operation
   */
  async start(total: number = 0): Promise<void> {
    this.progress = {
      ...DEFAULT_PROGRESS,
      phase: 'starting',
      message: 'Starting sync...',
      total,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await this.persist()
  }

  /**
   * Update the current phase
   */
  async setPhase(phase: SyncPhase, message: string): Promise<void> {
    this.progress.phase = phase
    this.progress.message = message
    this.progress.updatedAt = new Date().toISOString()
    await this.persist()
  }

  /**
   * Update progress on current item
   * Validates that current doesn't exceed total to prevent display bugs
   */
  async updateProgress(current: number, currentItem?: string, message?: string): Promise<void> {
    // Validate current doesn't exceed total
    if (this.progress.total > 0 && current > this.progress.total) {
      console.warn(`[SyncProgress] Current (${current}) exceeds total (${this.progress.total}), capping to total`)
      current = this.progress.total
    }
    // Validate current is not negative
    if (current < 0) {
      console.warn(`[SyncProgress] Current (${current}) is negative, setting to 0`)
      current = 0
    }
    this.progress.current = current
    if (currentItem !== undefined) {
      this.progress.currentItem = currentItem
    }
    if (message) {
      this.progress.message = message
    }
    this.progress.updatedAt = new Date().toISOString()
    await this.persist()
  }

  /**
   * Set the total number of items
   */
  async setTotal(total: number): Promise<void> {
    this.progress.total = total
    this.progress.updatedAt = new Date().toISOString()
    await this.persist()
  }

  /**
   * Set the list of channel IDs queued for this sync (for resume tracking)
   */
  async setQueuedChannels(channelIds: string[]): Promise<void> {
    this.progress.queuedChannelIds = channelIds
    this.progress.processedChannelIds = []
    this.progress.updatedAt = new Date().toISOString()
    await this.persist()
  }

  /**
   * Get the list of channel IDs that still need to be processed (for resume)
   */
  getRemainingChannelIds(): string[] {
    if (!this.progress.queuedChannelIds) return []
    const processed = new Set(this.progress.processedChannelIds || [])
    return this.progress.queuedChannelIds.filter(id => !processed.has(id))
  }

  /**
   * Record a channel being processed
   * Auto-updates current to match total processed + failed (ensures accuracy)
   * Tracks channel ID for quota resume functionality
   */
  async channelProcessed(videosAdded: number, channelId?: string): Promise<void> {
    this.progress.stats.channelsProcessed++
    this.progress.stats.videosAdded += videosAdded
    // Track processed channel ID for resume
    if (channelId) {
      if (!this.progress.processedChannelIds) {
        this.progress.processedChannelIds = []
      }
      this.progress.processedChannelIds.push(channelId)
    }
    // Auto-calculate current based on actual counts (prevents desync)
    this.progress.current = this.progress.stats.channelsProcessed + this.progress.stats.channelsFailed
    // Cap at total to prevent overflow display
    if (this.progress.total > 0 && this.progress.current > this.progress.total) {
      this.progress.current = this.progress.total
    }
    this.progress.updatedAt = new Date().toISOString()
    await this.persist()
  }

  /**
   * Record a channel failure
   * Auto-updates current to match total processed + failed (ensures accuracy)
   */
  async channelFailed(error: SyncError): Promise<void> {
    this.progress.stats.channelsFailed++
    this.progress.errors.push(error)
    // Auto-calculate current based on actual counts (prevents desync)
    this.progress.current = this.progress.stats.channelsProcessed + this.progress.stats.channelsFailed
    // Cap at total to prevent overflow display
    if (this.progress.total > 0 && this.progress.current > this.progress.total) {
      this.progress.current = this.progress.total
    }
    this.progress.updatedAt = new Date().toISOString()
    await this.persist()
  }

  /**
   * Track quota usage
   * Doesn't persist immediately (will be saved with next progress update)
   * but updates updatedAt to ensure next persist includes quota
   */
  addQuotaUsage(units: number): void {
    this.progress.stats.quotaUsed += units
    // Update timestamp so next persist includes this data
    this.progress.updatedAt = new Date().toISOString()
    // Don't persist every quota update - too frequent
    // Quota will be persisted with next channelProcessed/updateProgress call
  }

  /**
   * Complete the sync
   */
  async complete(message?: string): Promise<void> {
    this.progress.phase = 'complete'
    this.progress.message = message || 'Sync completed successfully'
    this.progress.completedAt = new Date().toISOString()
    this.progress.updatedAt = new Date().toISOString()
    await this.persist()
  }

  /**
   * Mark as error
   */
  async error(message: string): Promise<void> {
    this.progress.phase = 'error'
    this.progress.message = message
    this.progress.completedAt = new Date().toISOString()
    this.progress.updatedAt = new Date().toISOString()
    await this.persist()
  }

  /**
   * Persist progress to database
   */
  private async persist(): Promise<void> {
    try {
      await this.admin
        .from('sync_progress')
        .upsert(
          {
            id: this.syncId,
            user_id: this.userId,
            progress: this.progress,
            updated_at: new Date().toISOString(),
          } as never,
          { onConflict: 'id' }
        )
    } catch (error) {
      console.error('Failed to persist sync progress:', error)
      // Don't throw - progress tracking shouldn't break the sync
    }
  }
}

/**
 * Get current sync progress for a user
 */
export async function getCurrentSyncProgress(userId: string): Promise<SyncProgressData | null> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('sync_progress')
    .select('progress')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) {
    return null
  }

  return (data as { progress: SyncProgressData }).progress
}

/**
 * Check if a sync is currently in progress for a user
 * Uses distributed lock table for accurate detection
 */
export async function isSyncInProgress(userId: string): Promise<boolean> {
  const admin = createAdminClient()

  // First check the lock table
  const { data: lock } = await admin
    .from('sync_locks')
    .select('locked_at, expires_at')
    .eq('user_id', userId)
    .single()

  if (lock) {
    const lockData = lock as { locked_at: string; expires_at: string }
    const expiresAt = new Date(lockData.expires_at)

    // Lock exists and hasn't expired
    if (expiresAt > new Date()) {
      return true
    }

    // Lock expired - clean it up
    await admin.from('sync_locks').delete().eq('user_id', userId)
  }

  // Fallback: check progress table for stale detection
  const progress = await getCurrentSyncProgress(userId)
  if (!progress) return false

  const activePhases: SyncPhase[] = [
    'starting',
    'fetching_subscriptions',
    'fetching_channel_details',
    'syncing_videos',
    'completing',
  ]

  // Check if it's stale (>5 minutes since last update = probably crashed)
  const updatedAt = new Date(progress.updatedAt)
  const staleCutoff = new Date(Date.now() - SYNC_STALE_TIMEOUT_MS)

  if (updatedAt < staleCutoff) {
    return false
  }

  return activePhases.includes(progress.phase)
}

/**
 * Acquire a sync lock for a user
 * Returns lock ID if acquired, null if already locked
 */
export async function acquireSyncLock(userId: string): Promise<string | null> {
  const admin = createAdminClient()
  const lockId = crypto.randomUUID()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + SYNC_LOCK_TIMEOUT_MS)

  // First, clean up any expired locks
  await admin
    .from('sync_locks')
    .delete()
    .eq('user_id', userId)
    .lt('expires_at', now.toISOString())

  // Try to acquire lock using upsert with conflict check
  const { error } = await admin
    .from('sync_locks')
    .insert({
      id: lockId,
      user_id: userId,
      locked_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    } as never)

  if (error) {
    // Lock already exists (unique constraint on user_id)
    if (error.code === '23505') {
      return null
    }
    console.error('Failed to acquire sync lock:', error)
    return null
  }

  return lockId
}

/**
 * Release a sync lock
 */
export async function releaseSyncLock(userId: string, lockId?: string): Promise<void> {
  const admin = createAdminClient()

  let query = admin.from('sync_locks').delete().eq('user_id', userId)

  if (lockId) {
    query = query.eq('id', lockId)
  }

  await query
}

/**
 * Extend a sync lock (heartbeat to prevent timeout)
 */
export async function extendSyncLock(userId: string, lockId: string): Promise<boolean> {
  const admin = createAdminClient()
  const expiresAt = new Date(Date.now() + SYNC_LOCK_TIMEOUT_MS)

  const { error } = await admin
    .from('sync_locks')
    .update({ expires_at: expiresAt.toISOString() } as never)
    .eq('user_id', userId)
    .eq('id', lockId)

  return !error
}

/**
 * Request cancellation of an in-progress sync
 * Sets the cancelled flag which the sync loop checks periodically
 */
export async function requestSyncCancellation(userId: string): Promise<boolean> {
  const admin = createAdminClient()

  try {
    const { error } = await admin
      .from('sync_locks')
      .update({ cancelled: true } as never)
      .eq('user_id', userId)

    if (error) {
      // Column may not exist if migration not applied
      if (error.message?.includes('cancelled') || error.code === '42703') {
        console.warn('[SyncProgress] cancelled column not found - migration needed')
        // Fall back to just deleting the lock directly
        await admin.from('sync_locks').delete().eq('user_id', userId)
        return true
      }
      console.error('Failed to request sync cancellation:', error)
      return false
    }

    return true
  } catch (err) {
    console.error('Sync cancellation error:', err)
    return false
  }
}

/**
 * Check if sync has been cancelled
 * Should be called periodically during sync to allow early termination
 */
export async function isSyncCancelled(userId: string, lockId: string): Promise<boolean> {
  const admin = createAdminClient()

  try {
    const { data, error } = await admin
      .from('sync_locks')
      .select('cancelled')
      .eq('user_id', userId)
      .eq('id', lockId)
      .single()

    if (error) {
      // Column may not exist if migration not applied - just check if lock exists
      if (error.message?.includes('cancelled') || error.code === '42703') {
        const { data: lockExists } = await admin
          .from('sync_locks')
          .select('id')
          .eq('user_id', userId)
          .eq('id', lockId)
          .single()
        // If lock doesn't exist, treat as cancelled
        return !lockExists
      }
      // Other error - treat as cancelled to be safe
      return true
    }

    if (!data) {
      return true
    }

    return (data as { cancelled?: boolean }).cancelled === true
  } catch {
    return true
  }
}

/**
 * Clean up old sync progress records
 */
export async function cleanupOldSyncProgress(userId: string): Promise<void> {
  const admin = createAdminClient()

  // Keep only last 10 sync records per user
  const { data: recentSyncs } = await admin
    .from('sync_progress')
    .select('id')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(10)

  if (!recentSyncs || recentSyncs.length < 10) {
    return
  }

  const keepIds = (recentSyncs as { id: string }[]).map((s) => s.id)

  await admin
    .from('sync_progress')
    .delete()
    .eq('user_id', userId)
    .not('id', 'in', `(${keepIds.join(',')})`)
}
