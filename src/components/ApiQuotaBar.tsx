'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

type QuotaData = {
  unitsUsed: number
  dailyLimit: number
  remaining: number
  resetAt: string
  percentUsed: number
}

/**
 * Real-time API Quota Progress Bar
 *
 * Features:
 * - Real-time updates via Supabase subscriptions
 * - Cross-device sync (no cookies/cache reliance)
 * - Visual progress indicator with color states
 * - Countdown to reset time
 */
export function ApiQuotaBar() {
  const [quota, setQuota] = useState<QuotaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const supabaseRef = useRef(createClient())

  // Fetch quota from API
  const fetchQuota = useCallback(async () => {
    try {
      const res = await fetch('/api/quota')
      if (res.ok) {
        const data = await res.json()
        setQuota(data)
      }
    } catch (error) {
      console.error('Failed to fetch quota:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  // Get user ID for real-time subscription
  useEffect(() => {
    const getUser = async () => {
      const supabase = supabaseRef.current
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Get internal user ID
      const { data: userData } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      if (userData) {
        setUserId(userData.id)
      }
    }

    getUser()
    fetchQuota()
  }, [fetchQuota])

  // Set up real-time subscription for cross-device sync
  useEffect(() => {
    if (!userId) return

    const supabase = supabaseRef.current

    // Subscribe to api_quota changes for this user
    channelRef.current = supabase
      .channel(`api_quota:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'api_quota',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newRecord = payload.new as {
            units_used: number
            daily_limit: number
            last_updated_at: string
          } | null

          if (newRecord) {
            // Calculate remaining and percent
            const remaining = newRecord.daily_limit - newRecord.units_used
            const percentUsed = Math.round(
              (newRecord.units_used / newRecord.daily_limit) * 100
            )

            setQuota((prev) => ({
              unitsUsed: newRecord.units_used,
              dailyLimit: newRecord.daily_limit,
              remaining,
              resetAt: prev?.resetAt || new Date().toISOString(),
              percentUsed,
            }))
          }
        }
      )
      .subscribe()

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [userId])

  // Calculate time until reset
  const getTimeUntilReset = useCallback(() => {
    if (!quota?.resetAt) return 'Unknown'

    const now = new Date()
    const reset = new Date(quota.resetAt)
    const diff = reset.getTime() - now.getTime()

    if (diff <= 0) return 'Resetting soon...'

    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

    if (hours > 0) {
      return `${hours}h ${minutes}m`
    }
    return `${minutes}m`
  }, [quota?.resetAt])

  // Update reset time every minute
  const [timeUntilReset, setTimeUntilReset] = useState('')

  useEffect(() => {
    const updateTime = () => setTimeUntilReset(getTimeUntilReset())
    updateTime()

    const interval = setInterval(updateTime, 60000) // Update every minute
    return () => clearInterval(interval)
  }, [getTimeUntilReset])

  if (loading) {
    return (
      <div className="bg-muted rounded-xl p-4 animate-pulse">
        <div className="h-4 bg-muted-foreground/20 rounded w-1/3 mb-3" />
        <div className="h-2 bg-muted-foreground/20 rounded" />
      </div>
    )
  }

  if (!quota) {
    return null
  }

  // Determine bar color based on usage
  const getBarColor = () => {
    if (quota.percentUsed >= 90) return 'bg-red-500'
    if (quota.percentUsed >= 70) return 'bg-amber-500'
    if (quota.percentUsed >= 50) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  // Determine status text
  const getStatusText = () => {
    if (quota.percentUsed >= 90) return 'Running low!'
    if (quota.percentUsed >= 70) return 'Getting there...'
    if (quota.percentUsed >= 50) return 'Halfway through'
    return 'Plenty left'
  }

  return (
    <div className="bg-muted rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">API Usage</span>
          <span className="text-xs text-muted-foreground">({getStatusText()})</span>
        </div>
        <div className="text-right">
          <span className="text-sm font-mono">
            {quota.unitsUsed.toLocaleString()} / {quota.dailyLimit.toLocaleString()}
          </span>
          <span className="text-xs text-muted-foreground ml-2">
            Resets in {timeUntilReset}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="relative h-2 bg-background rounded-full overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 transition-all duration-500 ease-out rounded-full ${getBarColor()}`}
          style={{ width: `${Math.min(100, quota.percentUsed)}%` }}
        />
      </div>

      {/* Additional info */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{quota.remaining.toLocaleString()} points remaining</span>
        <span>{quota.percentUsed}% used today</span>
      </div>
    </div>
  )
}
