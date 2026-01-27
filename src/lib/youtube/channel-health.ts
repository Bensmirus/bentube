/**
 * Channel Health Tracking
 * Monitors channel status and automatically adjusts activity levels
 */

import { createAdminClient } from '@/lib/supabase/admin'

export type ChannelHealthStatus = 'healthy' | 'warning' | 'unhealthy' | 'dead'

export type ChannelHealth = {
  channelId: string
  youtubeId: string
  status: ChannelHealthStatus
  consecutiveFailures: number
  lastSuccessAt: string | null
  lastFailureAt: string | null
  lastFailureReason: string | null
}

export type ActivityLevel = 'high' | 'medium' | 'low'

/**
 * Record a successful channel fetch
 */
export async function recordChannelSuccess(channelId: string): Promise<void> {
  const admin = createAdminClient()

  await admin
    .from('channels')
    .update({
      consecutive_failures: 0,
      last_success_at: new Date().toISOString(),
      health_status: 'healthy',
    } as never)
    .eq('id', channelId)
}

/**
 * Record a channel fetch failure
 */
export async function recordChannelFailure(
  channelId: string,
  reason: string
): Promise<{ shouldRetry: boolean; isUnhealthy: boolean }> {
  const admin = createAdminClient()

  // Get current failure count
  const { data: channel } = await admin
    .from('channels')
    .select('consecutive_failures, health_status')
    .eq('id', channelId)
    .single()

  const channelData = channel as { consecutive_failures: number; health_status: string } | null
  const currentFailures = channelData?.consecutive_failures ?? 0
  const newFailures = currentFailures + 1

  // Determine new health status
  let newStatus: ChannelHealthStatus = 'healthy'
  if (newFailures >= 10) {
    newStatus = 'dead' // Mark as dead after 10 consecutive failures
  } else if (newFailures >= 5) {
    newStatus = 'unhealthy'
  } else if (newFailures >= 2) {
    newStatus = 'warning'
  }

  await admin
    .from('channels')
    .update({
      consecutive_failures: newFailures,
      last_failure_at: new Date().toISOString(),
      last_failure_reason: reason,
      health_status: newStatus,
    } as never)
    .eq('id', channelId)

  return {
    shouldRetry: newFailures < 3,
    isUnhealthy: newStatus === 'unhealthy' || newStatus === 'dead',
  }
}

/**
 * Get unhealthy channels for a user (for display in UI)
 */
export async function getUnhealthyChannels(userId: string): Promise<ChannelHealth[]> {
  const admin = createAdminClient()

  const { data: channels, error } = await admin
    .from('channels')
    .select(`
      id,
      youtube_id,
      title,
      health_status,
      consecutive_failures,
      last_success_at,
      last_failure_at,
      last_failure_reason,
      user_subscriptions!inner(user_id)
    `)
    .eq('user_subscriptions.user_id', userId)
    .in('health_status', ['warning', 'unhealthy', 'dead'])

  if (error || !channels) {
    return []
  }

  return (channels as {
    id: string
    youtube_id: string
    health_status: ChannelHealthStatus
    consecutive_failures: number
    last_success_at: string | null
    last_failure_at: string | null
    last_failure_reason: string | null
  }[]).map((ch) => ({
    channelId: ch.id,
    youtubeId: ch.youtube_id,
    status: ch.health_status,
    consecutiveFailures: ch.consecutive_failures,
    lastSuccessAt: ch.last_success_at,
    lastFailureAt: ch.last_failure_at,
    lastFailureReason: ch.last_failure_reason,
  }))
}

/**
 * Calculate activity level based on upload frequency
 */
export function calculateActivityLevel(
  videosInLastWeek: number,
  videosInLastMonth: number
): ActivityLevel {
  // High: Multiple uploads per week (2+ per week = 8+ per month)
  if (videosInLastWeek >= 2 || videosInLastMonth >= 8) {
    return 'high'
  }

  // Medium: Regular uploads (1-2 per week = 4-8 per month)
  if (videosInLastWeek >= 1 || videosInLastMonth >= 4) {
    return 'medium'
  }

  // Low: Infrequent uploads
  return 'low'
}

/**
 * Update channel activity levels based on recent upload frequency
 * Should be called periodically (e.g., weekly)
 *
 * Optimized: Uses bulk queries instead of N+1 queries per channel
 */
export async function updateChannelActivityLevels(): Promise<{
  updated: number
  highToMedium: number
  mediumToLow: number
  lowToMedium: number
  mediumToHigh: number
}> {
  const admin = createAdminClient()

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  // Get all healthy channels
  const { data: channels } = await admin
    .from('channels')
    .select('id, activity_level')
    .eq('health_status', 'healthy')

  if (!channels || channels.length === 0) {
    return { updated: 0, highToMedium: 0, mediumToLow: 0, lowToMedium: 0, mediumToHigh: 0 }
  }

  const channelIds = (channels as { id: string; activity_level: ActivityLevel }[]).map(c => c.id)

  // Fetch all videos published in the last month in a single query
  // This replaces 2*N queries with 1 query
  const { data: recentVideos } = await admin
    .from('videos')
    .select('channel_id, published_at')
    .in('channel_id', channelIds)
    .gte('published_at', oneMonthAgo)

  // Count videos per channel for week and month
  const weekCounts = new Map<string, number>()
  const monthCounts = new Map<string, number>()

  // Initialize all channels with 0 counts
  for (const channelId of channelIds) {
    weekCounts.set(channelId, 0)
    monthCounts.set(channelId, 0)
  }

  // Count videos
  if (recentVideos) {
    for (const video of recentVideos as { channel_id: string; published_at: string }[]) {
      const channelId = video.channel_id
      const publishedAt = video.published_at

      // Count for month (all videos in query are from last month)
      monthCounts.set(channelId, (monthCounts.get(channelId) || 0) + 1)

      // Count for week
      if (publishedAt >= oneWeekAgo) {
        weekCounts.set(channelId, (weekCounts.get(channelId) || 0) + 1)
      }
    }
  }

  const stats = { updated: 0, highToMedium: 0, mediumToLow: 0, lowToMedium: 0, mediumToHigh: 0 }

  // Batch updates by new activity level
  const updatesToHigh: string[] = []
  const updatesToMedium: string[] = []
  const updatesToLow: string[] = []

  for (const channel of channels as { id: string; activity_level: ActivityLevel }[]) {
    const weekCount = weekCounts.get(channel.id) || 0
    const monthCount = monthCounts.get(channel.id) || 0
    const newLevel = calculateActivityLevel(weekCount, monthCount)
    const oldLevel = channel.activity_level

    if (newLevel !== oldLevel) {
      stats.updated++

      // Track transitions
      if (oldLevel === 'high' && newLevel === 'medium') stats.highToMedium++
      if (oldLevel === 'medium' && newLevel === 'low') stats.mediumToLow++
      if (oldLevel === 'low' && newLevel === 'medium') stats.lowToMedium++
      if (oldLevel === 'medium' && newLevel === 'high') stats.mediumToHigh++

      // Batch by target level
      if (newLevel === 'high') updatesToHigh.push(channel.id)
      else if (newLevel === 'medium') updatesToMedium.push(channel.id)
      else updatesToLow.push(channel.id)
    }
  }

  // Perform batch updates (3 queries max instead of N queries)
  if (updatesToHigh.length > 0) {
    await admin
      .from('channels')
      .update({ activity_level: 'high' } as never)
      .in('id', updatesToHigh)
  }

  if (updatesToMedium.length > 0) {
    await admin
      .from('channels')
      .update({ activity_level: 'medium' } as never)
      .in('id', updatesToMedium)
  }

  if (updatesToLow.length > 0) {
    await admin
      .from('channels')
      .update({ activity_level: 'low' } as never)
      .in('id', updatesToLow)
  }

  return stats
}

/**
 * Revive dead channels by resetting their status
 * Useful for manual recovery or after fixing token issues
 */
export async function reviveDeadChannels(channelIds: string[]): Promise<number> {
  if (channelIds.length === 0) return 0

  const admin = createAdminClient()

  const { data } = await admin
    .from('channels')
    .update({
      health_status: 'healthy',
      consecutive_failures: 0,
      last_failure_reason: null,
    } as never)
    .in('id', channelIds)
    .select('id')

  return (data as { id: string }[] | null)?.length ?? 0
}

/**
 * Get channels that should be skipped during sync
 * (dead channels or those with too many recent failures)
 */
export async function getSkippableChannelIds(channelIds: string[]): Promise<Set<string>> {
  if (channelIds.length === 0) return new Set()

  const admin = createAdminClient()

  const { data: deadChannels } = await admin
    .from('channels')
    .select('id')
    .in('id', channelIds)
    .eq('health_status', 'dead')

  return new Set((deadChannels as { id: string }[] | null)?.map((c) => c.id) ?? [])
}
