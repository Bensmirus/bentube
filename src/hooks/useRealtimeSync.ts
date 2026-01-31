'use client'

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

/**
 * Real-time sync hook for cross-device synchronization
 *
 * Subscribes to database changes and invalidates React Query caches
 * so that all devices see the same data without manual refresh.
 *
 * Listens to:
 * - videos table: deletions, insertions, updates
 * - watch_status table: watch later, hidden status changes
 * - channel_groups table: group changes
 */
export function useRealtimeSync(userId: string | null) {
  const queryClient = useQueryClient()
  const channelRef = useRef<RealtimeChannel | null>(null)
  const supabaseRef = useRef(createClient())

  useEffect(() => {
    if (!userId) return

    const supabase = supabaseRef.current

    // Create a single channel for all subscriptions
    channelRef.current = supabase
      .channel(`realtime_sync:${userId}`)
      // Listen to videos table changes (for this user)
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'videos',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          console.log('[RealtimeSync] Videos change:', payload.eventType)

          // Invalidate feed queries to refetch from database
          queryClient.invalidateQueries({ queryKey: ['infiniteFeed'] })
          queryClient.invalidateQueries({ queryKey: ['feed'] })
          queryClient.invalidateQueries({ queryKey: ['inProgressCount'] })
          queryClient.invalidateQueries({ queryKey: ['watchLaterCount'] })
          queryClient.invalidateQueries({ queryKey: ['shortsCount'] })
        }
      )
      // Listen to watch_status changes (for watch later, hidden, etc.)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'watch_status',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          console.log('[RealtimeSync] Watch status change:', payload.eventType)

          // Invalidate relevant queries
          queryClient.invalidateQueries({ queryKey: ['infiniteFeed'] })
          queryClient.invalidateQueries({ queryKey: ['watchLaterCount'] })
          queryClient.invalidateQueries({ queryKey: ['inProgressCount'] })
        }
      )
      // Listen to channel_groups changes
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'channel_groups',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          console.log('[RealtimeSync] Channel groups change:', payload.eventType)

          // Invalidate groups and feed
          queryClient.invalidateQueries({ queryKey: ['groups'] })
          queryClient.invalidateQueries({ queryKey: ['infiniteFeed'] })
        }
      )
      .subscribe((status) => {
        console.log('[RealtimeSync] Subscription status:', status)
      })

    return () => {
      if (channelRef.current) {
        console.log('[RealtimeSync] Unsubscribing')
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [userId, queryClient])
}
