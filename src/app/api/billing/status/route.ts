import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

/**
 * GET: Get the current user's subscription status
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const admin = createAdminClient()

    const { userId, error: userError } = await getInternalUserId(supabase as never)
    if (userError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user subscription data
    const { data: userData, error: fetchError } = await admin
      .from('users')
      .select('email, subscription_status, subscription_plan, subscription_expires_at, lemon_squeezy_customer_id, is_free_tier')
      .eq('id', userId)
      .single()

    type UserData = {
      email: string | null
      subscription_status: string | null
      subscription_plan: string | null
      subscription_expires_at: string | null
      lemon_squeezy_customer_id: string | null
      is_free_tier: boolean | null
    }

    const user = userData as UserData | null

    if (fetchError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Check if user is in the allowed emails list (free access)
    const allowedEmails = process.env.ALLOWED_EMAILS?.split(',').map(e => e.trim().toLowerCase()) || []
    const isAllowedEmail = allowedEmails.includes(user.email?.toLowerCase() || '')

    // Check if user has free tier access (claimed a free spot)
    const isFreeTier = user.is_free_tier === true

    // Combined free access (either allowed email or free tier)
    const isFreeAccess = isAllowedEmail || isFreeTier

    // Determine if user has active access
    const hasActiveSubscription = user.subscription_status === 'active' ||
      (user.subscription_status === 'cancelled' && user.subscription_expires_at && new Date(user.subscription_expires_at) > new Date())

    const hasAccess = isFreeAccess || hasActiveSubscription

    return NextResponse.json({
      hasAccess,
      isFreeAccess,
      isFreeTier,
      subscription: {
        status: user.subscription_status || 'none',
        plan: user.subscription_plan,
        expiresAt: user.subscription_expires_at,
        hasCustomerId: !!user.lemon_squeezy_customer_id,
      },
    })
  } catch (error) {
    console.error('Subscription status error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
