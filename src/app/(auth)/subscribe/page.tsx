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

const INSTAGRAM_URL = 'https://www.instagram.com/ben.ware_tools/'

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

  function handleFollowInstagram() {
    window.open(INSTAGRAM_URL, '_blank')
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

          {/* Instagram CTA */}
          <div className="pt-2 border-t border-border">
            <p className="text-sm text-muted-foreground text-center mb-3">
              Don&apos;t have a code? Follow us on Instagram and send a DM to get one!
            </p>
            <button
              onClick={handleFollowInstagram}
              className="w-full rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 py-3 px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
              </svg>
              Follow @ben.ware_tools
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
      </div>
    </div>
  )
}
