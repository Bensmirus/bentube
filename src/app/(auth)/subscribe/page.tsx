'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type SubscriptionStatus = {
  hasAccess: boolean
  isFreeAccess: boolean
  subscription: {
    status: string
    plan: string | null
    expiresAt: string | null
  }
}

type FreeTierStatus = {
  maxSpots: number
  usedSpots: number
  remainingSpots: number
  available: boolean
  instagramUrl: string
}

export default function SubscribePage() {
  const router = useRouter()
  const [status, setStatus] = useState<SubscriptionStatus | null>(null)
  const [freeTier, setFreeTier] = useState<FreeTierStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [redeemLoading, setRedeemLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inviteCode, setInviteCode] = useState('')

  useEffect(() => {
    checkSubscription()
    checkFreeTier()
  }, [])

  async function checkSubscription() {
    try {
      const res = await fetch('/api/billing/status')
      if (res.ok) {
        const data = await res.json()
        setStatus(data)

        // If user has access, redirect to feed
        if (data.hasAccess) {
          router.replace('/feed')
          return
        }
      } else if (res.status === 401) {
        // Not logged in, redirect to login
        router.replace('/login?redirect=/subscribe')
        return
      }
    } catch (err) {
      console.error('Failed to check subscription:', err)
    }
    setLoading(false)
  }

  async function checkFreeTier() {
    try {
      const res = await fetch('/api/billing/free-tier')
      if (res.ok) {
        const data = await res.json()
        setFreeTier(data)
      }
    } catch (err) {
      console.error('Failed to check free tier:', err)
    }
  }

  async function handleSubscribe() {
    setCheckoutLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/billing/checkout', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        // Redirect to Lemon Squeezy checkout
        window.location.href = data.url
      } else {
        const errorData = await res.json()
        setError(errorData.error || 'Failed to start checkout')
      }
    } catch (err) {
      setError('Something went wrong. Please try again.')
      console.error('Checkout error:', err)
    }
    setCheckoutLoading(false)
  }

  async function handleRedeemCode() {
    if (!inviteCode.trim()) {
      setError('Please enter an invite code')
      return
    }

    setRedeemLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/billing/redeem-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: inviteCode.trim() }),
      })
      const data = await res.json()

      if (res.ok) {
        // Success - redirect to feed
        router.replace('/feed')
      } else {
        setError(data.error || 'Invalid code')
      }
    } catch (err) {
      setError('Something went wrong. Please try again.')
      console.error('Redeem error:', err)
    }
    setRedeemLoading(false)
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Subscribe to Ben.Tube</h1>
          <p className="mt-2 text-muted-foreground">
            Get access to organize your YouTube subscriptions
          </p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-500/10 p-3 text-center text-sm text-red-500">
            {error}
          </div>
        )}

        {/* Free Tier Card with Invite Code */}
        <div className="rounded-2xl border-2 border-green-500/50 bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-bold text-green-500">Free Tier</div>
              <div className="text-xs text-muted-foreground">Invite only</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">$0</div>
              <div className="text-xs text-muted-foreground">forever</div>
            </div>
          </div>

          {/* Spots Counter */}
          {freeTier && (
            <div className="flex items-center gap-2 rounded-lg bg-green-500/10 p-3">
              <span className="text-green-500 font-medium">
                {freeTier.remainingSpots} of {freeTier.maxSpots}
              </span>
              <span className="text-sm text-muted-foreground">spots remaining</span>
            </div>
          )}

          {/* Invite Code Input */}
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-muted-foreground mb-1">
                Have an invite code?
              </label>
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="BENTUBE-XXXX-XXXX"
                className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <button
              onClick={handleRedeemCode}
              disabled={redeemLoading || !inviteCode.trim()}
              className="w-full rounded-xl bg-green-500 py-3 px-4 text-sm font-medium text-white transition-colors hover:bg-green-600 disabled:opacity-50"
            >
              {redeemLoading ? 'Redeeming...' : 'Claim Free Access'}
            </button>
          </div>

        </div>

        {/* Divider */}
        <div className="flex items-center gap-4">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Premium Card */}
        <div className="rounded-2xl border bg-card p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-bold">Premium</div>
              <div className="text-xs text-muted-foreground">Full access</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">
                $5<span className="text-sm font-normal text-muted-foreground">/mo</span>
              </div>
              <div className="text-xs text-muted-foreground">Cancel anytime</div>
            </div>
          </div>

          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              Organize channels into groups
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              Track watch progress across devices
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              Import your YouTube subscriptions
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              No ads, no tracking
            </li>
          </ul>

          <button
            onClick={handleSubscribe}
            disabled={checkoutLoading}
            className="w-full rounded-xl bg-accent py-3 px-4 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
          >
            {checkoutLoading ? 'Loading...' : 'Subscribe Now'}
          </button>

          {status?.subscription.status === 'cancelled' && status.subscription.expiresAt && (
            <p className="text-center text-sm text-muted-foreground">
              Your subscription was cancelled. It expires on{' '}
              {new Date(status.subscription.expiresAt).toLocaleDateString()}.
            </p>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Secure payment via Lemon Squeezy. You can cancel anytime from your account settings.
        </p>

        {/* Contact */}
        <div className="text-center pt-2">
          <p className="text-xs text-muted-foreground mb-1">Questions or feedback?</p>
          <a
            href="mailto:ben.ware.tools@gmail.com"
            className="text-xs text-accent hover:underline"
          >
            ben.ware.tools@gmail.com
          </a>
        </div>
      </div>
    </div>
  )
}
