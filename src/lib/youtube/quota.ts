import { createAdminClient } from '@/lib/supabase/admin'

/**
 * YouTube API Quota Costs (units per operation)
 * Based on: https://developers.google.com/youtube/v3/determine_quota_cost
 */
export const QUOTA_COSTS = {
  // Read operations
  'subscriptions.list': 1,
  'channels.list': 1,
  'playlistItems.list': 1,
  'videos.list': 1,
  // The costs are per request, not per item in the response
}

export const DAILY_QUOTA_LIMIT = 10000
export const QUOTA_WARNING_THRESHOLD = 0.9 // Warn at 90% usage
export const QUOTA_CRITICAL_THRESHOLD = 0.95 // Block non-essential at 95%

export type QuotaStatus = {
  unitsUsed: number
  dailyLimit: number
  remaining: number
  resetAt: string
  percentUsed: number
  isWarning: boolean
  isCritical: boolean
  isExhausted: boolean
}

/**
 * Get current quota status for a user
 * Use this to check before starting operations
 */
export async function getQuotaStatus(userId: string): Promise<QuotaStatus> {
  try {
    const admin = createAdminClient()

    const { data, error } = await admin.rpc('get_api_quota', {
      p_user_id: userId,
    } as never)

    if (error) {
      console.error('Failed to get quota status:', error)
      // Return safe defaults - assume quota available
      return {
        unitsUsed: 0,
        dailyLimit: DAILY_QUOTA_LIMIT,
        remaining: DAILY_QUOTA_LIMIT,
        resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        percentUsed: 0,
        isWarning: false,
        isCritical: false,
        isExhausted: false,
      }
    }

    type QuotaResult = { units_used: number; daily_limit: number; remaining: number; reset_at: string }
    const results = data as QuotaResult[] | null
    const result = results?.[0]

    const unitsUsed = result?.units_used ?? 0
    const dailyLimit = result?.daily_limit ?? DAILY_QUOTA_LIMIT
    const remaining = result?.remaining ?? DAILY_QUOTA_LIMIT
    const percentUsed = dailyLimit > 0 ? unitsUsed / dailyLimit : 0

    return {
      unitsUsed,
      dailyLimit,
      remaining,
      resetAt: result?.reset_at ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      percentUsed,
      isWarning: percentUsed >= QUOTA_WARNING_THRESHOLD,
      isCritical: percentUsed >= QUOTA_CRITICAL_THRESHOLD,
      isExhausted: remaining <= 0,
    }
  } catch (error) {
    console.error('Quota status error:', error)
    // Return safe defaults
    return {
      unitsUsed: 0,
      dailyLimit: DAILY_QUOTA_LIMIT,
      remaining: DAILY_QUOTA_LIMIT,
      resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      percentUsed: 0,
      isWarning: false,
      isCritical: false,
      isExhausted: false,
    }
  }
}

/**
 * Check if there's enough quota for an operation
 * @param userId - User ID
 * @param estimatedUnits - Estimated units needed
 * @param allowCritical - Allow operation even in critical zone (for essential ops)
 */
export async function checkQuotaAvailable(
  userId: string,
  estimatedUnits: number,
  allowCritical: boolean = false
): Promise<{ allowed: boolean; status: QuotaStatus; reason?: string }> {
  const status = await getQuotaStatus(userId)

  if (status.isExhausted) {
    return {
      allowed: false,
      status,
      reason: `Daily quota exhausted (${status.unitsUsed}/${status.dailyLimit} units used). Resets at ${new Date(status.resetAt).toLocaleTimeString()}.`,
    }
  }

  if (status.remaining < estimatedUnits) {
    return {
      allowed: false,
      status,
      reason: `Not enough quota remaining. Need ~${estimatedUnits} units, only ${status.remaining} available.`,
    }
  }

  if (status.isCritical && !allowCritical) {
    return {
      allowed: false,
      status,
      reason: `Quota critically low (${Math.round(status.percentUsed * 100)}% used). Saving remaining quota for essential operations.`,
    }
  }

  return { allowed: true, status }
}

/**
 * Estimate quota needed for a sync operation
 * More accurate estimation based on actual operation patterns
 */
export function estimateQuotaNeeded(params: {
  channelCount?: number
  subscriptionCount?: number
  subscriptionSync?: boolean
  videosPerChannel?: number
  fullSync?: boolean
}): number {
  let estimate = 0

  // Subscription sync: 1 unit per 50 subscriptions
  if (params.subscriptionSync) {
    const subCount = params.subscriptionCount ?? 200
    const subscriptionPages = Math.ceil(subCount / 50)
    estimate += subscriptionPages

    // Channel details: 1 unit per 50 channels
    const channelDetailBatches = Math.ceil(subCount / 50)
    estimate += channelDetailBatches
  }

  // Video sync: 1 unit for playlist + 1 unit per 50 videos
  if (params.channelCount) {
    const videosPerChannel = params.videosPerChannel ?? (params.fullSync ? 50 : 10)
    const videoBatches = Math.ceil(videosPerChannel / 50)

    for (let i = 0; i < params.channelCount; i++) {
      // 1 for playlist items request
      estimate += 1
      // 1 per batch of up to 50 video details
      estimate += videoBatches
    }
  }

  // Add 10% buffer for retries and edge cases
  return Math.ceil(estimate * 1.1)
}

/**
 * Calculate more precise quota estimate based on historical data
 */
export async function estimateQuotaFromHistory(
  userId: string,
  operationType: 'subscription_sync' | 'video_sync' | 'full_sync'
): Promise<{ estimate: number; confidence: 'low' | 'medium' | 'high' }> {
  try {
    const admin = createAdminClient()

    // Get recent sync history for this user
    const { data } = await admin
      .from('sync_history')
      .select('quota_used, channels_synced, videos_added, sync_type')
      .eq('user_id', userId)
      .eq('success', true)
      .order('completed_at', { ascending: false })
      .limit(5)

    if (!data || data.length === 0) {
      // No history, use default estimates
      return {
        estimate: operationType === 'subscription_sync' ? 10 : operationType === 'video_sync' ? 100 : 150,
        confidence: 'low',
      }
    }

    type SyncHistoryRow = {
      quota_used: number | null
      channels_synced: number | null
      videos_added: number | null
      sync_type: string | null
    }

    // Calculate average quota per operation
    const relevantSyncs = (data as SyncHistoryRow[]).filter(
      (s) =>
        s.quota_used &&
        s.quota_used > 0 &&
        (operationType === 'full_sync' ||
          s.sync_type === operationType ||
          (operationType === 'video_sync' && s.channels_synced))
    )

    if (relevantSyncs.length === 0) {
      return {
        estimate: operationType === 'subscription_sync' ? 10 : 100,
        confidence: 'low',
      }
    }

    const avgQuota = relevantSyncs.reduce((sum, s) => sum + (s.quota_used || 0), 0) / relevantSyncs.length

    // Add 20% buffer
    const estimate = Math.ceil(avgQuota * 1.2)

    return {
      estimate,
      confidence: relevantSyncs.length >= 3 ? 'high' : 'medium',
    }
  } catch (error) {
    console.error('Failed to estimate quota from history:', error)
    return {
      estimate: operationType === 'subscription_sync' ? 10 : 100,
      confidence: 'low',
    }
  }
}

/**
 * Track API quota usage for a user
 * This increments the daily usage counter in the database
 */
export async function trackQuotaUsage(
  userId: string,
  operation: keyof typeof QUOTA_COSTS,
  requestCount: number = 1
): Promise<{ success: boolean; unitsUsed?: number; remaining?: number }> {
  const units = QUOTA_COSTS[operation] * requestCount

  try {
    const admin = createAdminClient()

    const { data, error } = await admin.rpc('increment_api_quota', {
      p_user_id: userId,
      p_units: units,
    } as never)

    if (error) {
      console.error('Failed to track quota:', error)
      return { success: false }
    }

    type QuotaResult = { units_used: number; remaining: number }
    const results = data as QuotaResult[] | null
    const result = results?.[0]
    return {
      success: true,
      unitsUsed: result?.units_used,
      remaining: result?.remaining,
    }
  } catch (error) {
    console.error('Quota tracking error:', error)
    return { success: false }
  }
}

/**
 * Batch track multiple operations at once
 */
export async function trackQuotaBatch(
  userId: string,
  operations: { operation: keyof typeof QUOTA_COSTS; count: number }[]
): Promise<{ success: boolean; totalUnits: number }> {
  const totalUnits = operations.reduce(
    (sum, op) => sum + QUOTA_COSTS[op.operation] * op.count,
    0
  )

  try {
    const admin = createAdminClient()

    const { error } = await admin.rpc('increment_api_quota', {
      p_user_id: userId,
      p_units: totalUnits,
    } as never)

    if (error) {
      console.error('Failed to track batch quota:', error)
      return { success: false, totalUnits }
    }

    return { success: true, totalUnits }
  } catch (error) {
    console.error('Batch quota tracking error:', error)
    return { success: false, totalUnits }
  }
}
