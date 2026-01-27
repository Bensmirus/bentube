'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

type Alert = {
  id: string
  alertType: string
  severity: 'info' | 'warning' | 'error' | 'critical'
  title: string
  message: string
  data: Record<string, unknown>
  createdAt: string
}

type AlertsResponse = {
  alerts: Alert[]
  counts: {
    total_unacknowledged: number
    critical_count: number
    error_count: number
    warning_count: number
    info_count: number
  }
}

export function AlertsSection() {
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery<AlertsResponse>({
    queryKey: ['alerts'],
    queryFn: async () => {
      const res = await fetch('/api/alerts')
      if (!res.ok) throw new Error('Failed to fetch alerts')
      return res.json()
    },
    staleTime: 30000, // 30 seconds
  })

  const dismissMutation = useMutation({
    mutationFn: async (alertIds: string[]) => {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertIds }),
      })
      if (!res.ok) throw new Error('Failed to dismiss alerts')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
    },
  })

  const dismissAllMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
      if (!res.ok) throw new Error('Failed to dismiss all alerts')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
    },
  })

  // Format relative time
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  // Get severity styling
  const getSeverityStyles = (severity: Alert['severity']) => {
    switch (severity) {
      case 'critical':
        return {
          bg: 'bg-red-100 dark:bg-red-900/30',
          border: 'border-red-300 dark:border-red-800',
          icon: 'text-red-600 dark:text-red-400',
          badge: 'bg-red-600 text-white',
        }
      case 'error':
        return {
          bg: 'bg-red-50 dark:bg-red-900/20',
          border: 'border-red-200 dark:border-red-900',
          icon: 'text-red-500 dark:text-red-400',
          badge: 'bg-red-500 text-white',
        }
      case 'warning':
        return {
          bg: 'bg-amber-50 dark:bg-amber-900/20',
          border: 'border-amber-200 dark:border-amber-900',
          icon: 'text-amber-500 dark:text-amber-400',
          badge: 'bg-amber-500 text-white',
        }
      default:
        return {
          bg: 'bg-blue-50 dark:bg-blue-900/20',
          border: 'border-blue-200 dark:border-blue-900',
          icon: 'text-blue-500 dark:text-blue-400',
          badge: 'bg-blue-500 text-white',
        }
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-4 bg-muted animate-pulse rounded w-24" />
        <div className="h-20 bg-muted animate-pulse rounded-xl" />
      </div>
    )
  }

  if (error || !data) {
    return null
  }

  const { alerts, counts } = data

  if (alerts.length === 0) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-medium">Notifications</h3>
        <div className="text-sm text-muted-foreground bg-muted/50 rounded-xl p-4 text-center">
          No notifications
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-2">
          Notifications
          {counts.total_unacknowledged > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-primary text-primary-foreground rounded-full">
              {counts.total_unacknowledged}
            </span>
          )}
        </h3>
        {alerts.length > 1 && (
          <button
            onClick={() => dismissAllMutation.mutate()}
            disabled={dismissAllMutation.isPending}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {dismissAllMutation.isPending ? 'Dismissing...' : 'Dismiss all'}
          </button>
        )}
      </div>

      <div className="space-y-2">
        {alerts.slice(0, 5).map((alert) => {
          const styles = getSeverityStyles(alert.severity)
          return (
            <div
              key={alert.id}
              className={`rounded-xl p-3 border ${styles.bg} ${styles.border}`}
            >
              <div className="flex items-start gap-3">
                {/* Icon */}
                <div className={`flex-shrink-0 mt-0.5 ${styles.icon}`}>
                  {alert.severity === 'critical' || alert.severity === 'error' ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : alert.severity === 'warning' ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{alert.title}</span>
                    <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${styles.badge}`}>
                      {alert.severity}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{alert.message}</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    {formatTime(alert.createdAt)}
                  </p>
                </div>

                {/* Dismiss button */}
                <button
                  onClick={() => dismissMutation.mutate([alert.id])}
                  disabled={dismissMutation.isPending}
                  className="flex-shrink-0 p-1 text-muted-foreground/60 hover:text-foreground transition-colors rounded-lg hover:bg-background/50"
                  aria-label="Dismiss"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )
        })}

        {alerts.length > 5 && (
          <p className="text-xs text-muted-foreground text-center py-2">
            +{alerts.length - 5} more notifications
          </p>
        )}
      </div>
    </div>
  )
}
