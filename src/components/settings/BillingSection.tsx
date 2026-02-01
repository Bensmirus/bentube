'use client'

import { useEffect, useState } from 'react'

type SubscriptionStatus = {
  hasAccess: boolean
  isFreeAccess: boolean
  subscription: {
    status: string
    plan: string | null
    expiresAt: string | null
    hasCustomerId: boolean
  }
}

export default function BillingSection() {
  const [status, setStatus] = useState<SubscriptionStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [portalLoading, setPortalLoading] = useState(false)

  useEffect(() => {
    fetchStatus()
  }, [])

  async function fetchStatus() {
    try {
      const res = await fetch('/api/billing/status')
      if (res.ok) {
        const data = await res.json()
        setStatus(data)
      }
    } catch (err) {
      console.error('Failed to fetch subscription status:', err)
    }
    setLoading(false)
  }

  async function handleManageSubscription() {
    setPortalLoading(true)
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        window.open(data.url, '_blank')
      }
    } catch (err) {
      console.error('Failed to open portal:', err)
    }
    setPortalLoading(false)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    )
  }

  // Free access (ALLOWED_EMAILS)
  if (status?.isFreeAccess) {
    return (
      <div className="text-center py-12">
        <p className="text-4xl mb-4">✨</p>
        <h3 className="text-lg font-medium mb-2">Free Access</h3>
        <p className="text-sm text-muted-foreground">
          You have free access to Ben.Tube. No subscription needed.
        </p>
      </div>
    )
  }

  // Active subscription
  if (status?.subscription.status === 'active') {
    return (
      <div className="space-y-6">
        <div className="text-center py-8">
          <p className="text-4xl mb-4">✅</p>
          <h3 className="text-lg font-medium mb-2">Active Subscription</h3>
          <p className="text-sm text-muted-foreground">
            Plan: {status.subscription.plan || 'Monthly'}
          </p>
          {status.subscription.expiresAt && (
            <p className="text-sm text-muted-foreground mt-1">
              Renews on {new Date(status.subscription.expiresAt).toLocaleDateString()}
            </p>
          )}
        </div>

        {status.subscription.hasCustomerId && (
          <div className="flex justify-center">
            <button
              onClick={handleManageSubscription}
              disabled={portalLoading}
              className="px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors hover:bg-muted disabled:opacity-50"
            >
              {portalLoading ? 'Loading...' : 'Manage Subscription'}
            </button>
          </div>
        )}
      </div>
    )
  }

  // Cancelled but still has access
  if (status?.subscription.status === 'cancelled' && status.subscription.expiresAt) {
    const expiresAt = new Date(status.subscription.expiresAt)
    const hasAccess = expiresAt > new Date()

    return (
      <div className="space-y-6">
        <div className="text-center py-8">
          <p className="text-4xl mb-4">{hasAccess ? '⏳' : '❌'}</p>
          <h3 className="text-lg font-medium mb-2">
            {hasAccess ? 'Subscription Cancelled' : 'Subscription Expired'}
          </h3>
          <p className="text-sm text-muted-foreground">
            {hasAccess
              ? `You have access until ${expiresAt.toLocaleDateString()}`
              : 'Your subscription has expired'}
          </p>
        </div>

        <div className="flex justify-center">
          <button
            onClick={handleManageSubscription}
            disabled={portalLoading}
            className="px-4 py-2.5 rounded-xl text-sm font-medium bg-accent text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
          >
            {portalLoading ? 'Loading...' : 'Resubscribe'}
          </button>
        </div>
      </div>
    )
  }

  // No subscription
  return (
    <div className="space-y-6">
      <div className="text-center py-8">
        <p className="text-4xl mb-4">💳</p>
        <h3 className="text-lg font-medium mb-2">No Active Subscription</h3>
        <p className="text-sm text-muted-foreground">
          Subscribe to get full access to Ben.Tube
        </p>
      </div>

      <div className="flex justify-center">
        <a
          href="/subscribe"
          className="px-4 py-2.5 rounded-xl text-sm font-medium bg-accent text-white transition-colors hover:bg-accent/90"
        >
          Subscribe Now
        </a>
      </div>
    </div>
  )
}
