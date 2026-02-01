import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

/**
 * Lemon Squeezy Webhook Handler
 * Receives subscription events and updates user subscription status
 *
 * Events handled:
 * - subscription_created: New subscription started
 * - subscription_updated: Subscription renewed or changed
 * - subscription_cancelled: User cancelled (still has access until period ends)
 * - subscription_expired: Subscription ended, revoke access
 * - subscription_payment_failed: Payment failed
 * - subscription_payment_success: Payment succeeded
 */

type LemonSqueezyWebhookPayload = {
  meta: {
    event_name: string
    custom_data?: {
      user_id?: string
    }
  }
  data: {
    id: string
    attributes: {
      store_id: number
      customer_id: number
      status: string
      cancelled: boolean
      renews_at: string | null
      ends_at: string | null
      user_email: string
      user_name: string
      variant_name: string
    }
  }
}

// Verify the webhook signature from Lemon Squeezy
function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const hmac = crypto.createHmac('sha256', secret)
  const digest = hmac.update(payload).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))
}

// Map Lemon Squeezy status to our status
function mapSubscriptionStatus(lsStatus: string, cancelled: boolean): string {
  if (cancelled) return 'cancelled'

  switch (lsStatus) {
    case 'active':
      return 'active'
    case 'past_due':
      return 'past_due'
    case 'unpaid':
      return 'past_due'
    case 'cancelled':
      return 'cancelled'
    case 'expired':
      return 'expired'
    case 'on_trial':
      return 'active'
    case 'paused':
      return 'cancelled'
    default:
      return 'none'
  }
}

export async function POST(request: NextRequest) {
  try {
    const webhookSecret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET

    if (!webhookSecret) {
      console.error('LEMON_SQUEEZY_WEBHOOK_SECRET not configured')
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
    }

    // Get raw body for signature verification
    const rawBody = await request.text()
    const signature = request.headers.get('x-signature')

    if (!signature) {
      console.error('Missing webhook signature')
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
    }

    // Verify signature
    if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
      console.error('Invalid webhook signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const payload: LemonSqueezyWebhookPayload = JSON.parse(rawBody)
    const eventName = payload.meta.event_name
    const subscriptionData = payload.data.attributes

    console.log(`[Lemon Squeezy Webhook] Event: ${eventName}`, {
      email: subscriptionData.user_email,
      status: subscriptionData.status,
      cancelled: subscriptionData.cancelled,
    })

    // Only handle subscription events
    if (!eventName.startsWith('subscription_')) {
      console.log(`[Lemon Squeezy Webhook] Ignoring non-subscription event: ${eventName}`)
      return NextResponse.json({ received: true })
    }

    const admin = createAdminClient()

    // Find user by email
    const { data: userData, error: userError } = await admin
      .from('users')
      .select('id')
      .eq('email', subscriptionData.user_email.toLowerCase())
      .single()

    const user = userData as { id: string } | null

    if (userError || !user) {
      // User might not exist yet - they'll be linked on first login
      console.log(`[Lemon Squeezy Webhook] User not found for email: ${subscriptionData.user_email}`)

      // Store the subscription info anyway - we'll link it when user signs up
      // For now, just acknowledge the webhook
      return NextResponse.json({
        received: true,
        note: 'User not found, will be linked on signup'
      })
    }

    // Calculate subscription status
    const status = mapSubscriptionStatus(subscriptionData.status, subscriptionData.cancelled)

    // Determine expiration date
    const expiresAt = subscriptionData.ends_at || subscriptionData.renews_at

    // Update user subscription status
    const updateData = {
      subscription_status: status,
      subscription_plan: subscriptionData.variant_name || 'monthly',
      subscription_expires_at: expiresAt,
      lemon_squeezy_customer_id: String(subscriptionData.customer_id),
      lemon_squeezy_subscription_id: payload.data.id,
      subscription_updated_at: new Date().toISOString(),
    }

    const { error: updateError } = await admin
      .from('users')
      .update(updateData as never)
      .eq('id', user.id)

    if (updateError) {
      console.error('[Lemon Squeezy Webhook] Failed to update user:', updateError)
      return NextResponse.json({ error: 'Failed to update subscription' }, { status: 500 })
    }

    console.log(`[Lemon Squeezy Webhook] Updated user ${user.id} subscription to: ${status}`)

    return NextResponse.json({
      received: true,
      userId: user.id,
      status,
    })
  } catch (error) {
    console.error('[Lemon Squeezy Webhook] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
