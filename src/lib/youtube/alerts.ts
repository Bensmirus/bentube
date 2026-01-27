/**
 * Sync Alerts System
 * Creates alerts based on sync results and optionally sends Discord notifications
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { CronResult } from './cron-handler'

export type AlertType =
  | 'high_failure_rate'
  | 'channel_died'
  | 'quota_warning'
  | 'quota_exhausted'
  | 'sync_error'

export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical'

export type Alert = {
  id: string
  alertType: AlertType
  severity: AlertSeverity
  title: string
  message: string
  data: Record<string, unknown>
  createdAt: string
}

// Thresholds for alerts
const FAILURE_RATE_WARNING = 0.1 // 10% failures = warning
const FAILURE_RATE_ERROR = 0.2 // 20% failures = error
const FAILURE_RATE_CRITICAL = 0.5 // 50% failures = critical

/**
 * Analyze cron results and create alerts for notable events
 */
export async function checkAndCreateAlerts(
  cronResult: CronResult,
  syncType: string
): Promise<string[]> {
  const alertIds: string[] = []
  const admin = createAdminClient()

  // Skip if nothing was processed
  if (cronResult.channelsProcessed === 0 && cronResult.channelsFailed === 0) {
    return alertIds
  }

  const totalProcessed = cronResult.channelsProcessed + cronResult.channelsFailed
  const failureRate = totalProcessed > 0 ? cronResult.channelsFailed / totalProcessed : 0

  // Check for high failure rate
  if (failureRate >= FAILURE_RATE_CRITICAL) {
    const alertId = await createAlert(admin, {
      alertType: 'high_failure_rate',
      severity: 'critical',
      title: `Critical: ${Math.round(failureRate * 100)}% of channels failed`,
      message: `${cronResult.channelsFailed} out of ${totalProcessed} channels failed during ${syncType} sync. This may indicate a system-wide issue.`,
      data: {
        syncType,
        failureRate,
        channelsFailed: cronResult.channelsFailed,
        channelsProcessed: cronResult.channelsProcessed,
        errors: cronResult.errors.slice(0, 10), // Include first 10 errors
      },
    })
    if (alertId) alertIds.push(alertId)
  } else if (failureRate >= FAILURE_RATE_ERROR) {
    const alertId = await createAlert(admin, {
      alertType: 'high_failure_rate',
      severity: 'error',
      title: `High failure rate: ${Math.round(failureRate * 100)}% of channels failed`,
      message: `${cronResult.channelsFailed} out of ${totalProcessed} channels failed during ${syncType} sync.`,
      data: {
        syncType,
        failureRate,
        channelsFailed: cronResult.channelsFailed,
        channelsProcessed: cronResult.channelsProcessed,
        errors: cronResult.errors.slice(0, 5),
      },
    })
    if (alertId) alertIds.push(alertId)
  } else if (failureRate >= FAILURE_RATE_WARNING && cronResult.channelsFailed >= 3) {
    const alertId = await createAlert(admin, {
      alertType: 'high_failure_rate',
      severity: 'warning',
      title: `${cronResult.channelsFailed} channels failed during sync`,
      message: `${Math.round(failureRate * 100)}% failure rate during ${syncType} sync.`,
      data: {
        syncType,
        failureRate,
        channelsFailed: cronResult.channelsFailed,
        channelsProcessed: cronResult.channelsProcessed,
      },
    })
    if (alertId) alertIds.push(alertId)
  }

  // Check for channels that became "dead" (need to query database for this)
  if (cronResult.errors.length > 0) {
    const newlyDeadChannels = await checkForNewlyDeadChannels(
      admin,
      cronResult.errors.map((e) => e.channelId)
    )

    for (const channel of newlyDeadChannels) {
      const alertId = await createAlert(admin, {
        alertType: 'channel_died',
        severity: 'warning',
        title: `Channel marked as dead: ${channel.title || channel.youtubeId}`,
        message: `Channel has failed 10+ consecutive times and will no longer be synced automatically.`,
        data: {
          channelId: channel.id,
          youtubeId: channel.youtubeId,
          channelTitle: channel.title,
          consecutiveFailures: channel.consecutiveFailures,
          lastError: channel.lastError,
        },
      })
      if (alertId) alertIds.push(alertId)
    }
  }

  // Send Discord notification if webhook is configured
  if (alertIds.length > 0 && process.env.DISCORD_WEBHOOK_URL) {
    await sendDiscordSummary(cronResult, syncType, alertIds.length)
  }

  return alertIds
}

/**
 * Create an alert in the database
 */
async function createAlert(
  admin: ReturnType<typeof createAdminClient>,
  alert: {
    alertType: AlertType
    severity: AlertSeverity
    title: string
    message: string
    data: Record<string, unknown>
  }
): Promise<string | null> {
  try {
    const { data, error } = await admin.rpc('create_sync_alert', {
      p_alert_type: alert.alertType,
      p_severity: alert.severity,
      p_title: alert.title,
      p_message: alert.message,
      p_data: alert.data,
    } as never)

    if (error) {
      console.error('[Alerts] Failed to create alert:', error)
      return null
    }

    return data as string
  } catch (error) {
    console.error('[Alerts] Error creating alert:', error)
    return null
  }
}

/**
 * Check if any channels just became "dead" (crossed the 10 failure threshold)
 */
async function checkForNewlyDeadChannels(
  admin: ReturnType<typeof createAdminClient>,
  channelIds: string[]
): Promise<
  {
    id: string
    youtubeId: string
    title: string | null
    consecutiveFailures: number
    lastError: string | null
  }[]
> {
  if (channelIds.length === 0) return []

  const { data: channels, error } = await admin
    .from('channels')
    .select('id, youtube_id, title, consecutive_failures, last_failure_reason')
    .in('id', channelIds)
    .eq('health_status', 'dead')
    .eq('consecutive_failures', 10) // Exactly 10 = just became dead

  if (error || !channels) return []

  return (channels as {
    id: string
    youtube_id: string
    title: string | null
    consecutive_failures: number
    last_failure_reason: string | null
  }[]).map((c) => ({
    id: c.id,
    youtubeId: c.youtube_id,
    title: c.title,
    consecutiveFailures: c.consecutive_failures,
    lastError: c.last_failure_reason,
  }))
}

/**
 * Send a Discord webhook notification
 */
async function sendDiscordSummary(
  cronResult: CronResult,
  syncType: string,
  alertCount: number
): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL
  if (!webhookUrl) return

  try {
    const totalProcessed = cronResult.channelsProcessed + cronResult.channelsFailed
    const failureRate = totalProcessed > 0 ? cronResult.channelsFailed / totalProcessed : 0

    // Choose color based on severity
    let color = 0x00ff00 // Green
    if (failureRate >= FAILURE_RATE_CRITICAL) {
      color = 0xff0000 // Red
    } else if (failureRate >= FAILURE_RATE_ERROR) {
      color = 0xff8c00 // Orange
    } else if (failureRate >= FAILURE_RATE_WARNING) {
      color = 0xffff00 // Yellow
    }

    const embed = {
      title: `🔔 Ben.Tube Sync Alert`,
      description: `**${alertCount}** alert(s) generated during **${syncType}** sync`,
      color,
      fields: [
        {
          name: 'Channels Processed',
          value: String(cronResult.channelsProcessed),
          inline: true,
        },
        {
          name: 'Channels Failed',
          value: String(cronResult.channelsFailed),
          inline: true,
        },
        {
          name: 'Failure Rate',
          value: `${Math.round(failureRate * 100)}%`,
          inline: true,
        },
        {
          name: 'Videos Added',
          value: String(cronResult.videosAdded),
          inline: true,
        },
        {
          name: 'Quota Used',
          value: String(cronResult.quotaUsed),
          inline: true,
        },
        {
          name: 'Duration',
          value: `${Math.round(cronResult.durationMs / 1000)}s`,
          inline: true,
        },
      ],
      timestamp: new Date().toISOString(),
    }

    // Add error summary if there are errors
    if (cronResult.errors.length > 0) {
      const errorSummary = cronResult.errors
        .slice(0, 5)
        .map((e) => `• ${e.youtubeId}: ${e.error}`)
        .join('\n')

      embed.fields.push({
        name: `Errors (${cronResult.errors.length} total)`,
        value: errorSummary.substring(0, 1024), // Discord field limit
        inline: false,
      })
    }

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    })
  } catch (error) {
    console.error('[Alerts] Failed to send Discord notification:', error)
  }
}

/**
 * Send a simple Discord notification
 */
export async function sendDiscordAlert(
  title: string,
  message: string,
  severity: AlertSeverity = 'info'
): Promise<boolean> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL
  if (!webhookUrl) return false

  try {
    const colors: Record<AlertSeverity, number> = {
      info: 0x0099ff,
      warning: 0xffff00,
      error: 0xff8c00,
      critical: 0xff0000,
    }

    const emojis: Record<AlertSeverity, string> = {
      info: 'ℹ️',
      warning: '⚠️',
      error: '🔥',
      critical: '🚨',
    }

    const embed = {
      title: `${emojis[severity]} ${title}`,
      description: message,
      color: colors[severity],
      timestamp: new Date().toISOString(),
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    })

    return response.ok
  } catch (error) {
    console.error('[Alerts] Failed to send Discord alert:', error)
    return false
  }
}
