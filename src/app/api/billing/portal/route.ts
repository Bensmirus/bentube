import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

/**
 * POST: Get the Lemon Squeezy customer portal URL
 * Allows users to manage their subscription, update payment, or cancel
 */
export async function POST() {
  try {
    const apiKey = process.env.LEMON_SQUEEZY_API_KEY

    if (!apiKey) {
      console.error('Lemon Squeezy not configured')
      return NextResponse.json(
        { error: 'Billing not configured' },
        { status: 500 }
      )
    }

    const supabase = await createServerSupabaseClient()
    const admin = createAdminClient()

    const { userId, error: userError } = await getInternalUserId(supabase as never)
    if (userError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's Lemon Squeezy customer ID
    const { data: userData, error: fetchError } = await admin
      .from('users')
      .select('lemon_squeezy_customer_id')
      .eq('id', userId)
      .single()

    const user = userData as { lemon_squeezy_customer_id: string | null } | null

    if (fetchError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (!user.lemon_squeezy_customer_id) {
      return NextResponse.json(
        { error: 'No subscription found' },
        { status: 404 }
      )
    }

    // Get customer portal URL from Lemon Squeezy
    const response = await fetch(
      `https://api.lemonsqueezy.com/v1/customers/${user.lemon_squeezy_customer_id}`,
      {
        headers: {
          'Accept': 'application/vnd.api+json',
          'Authorization': `Bearer ${apiKey}`,
        },
      }
    )

    if (!response.ok) {
      const errorData = await response.text()
      console.error('Lemon Squeezy customer fetch error:', errorData)
      return NextResponse.json(
        { error: 'Failed to get portal URL' },
        { status: 500 }
      )
    }

    const customerData = await response.json()
    const portalUrl = customerData.data.attributes.urls.customer_portal

    return NextResponse.json({ url: portalUrl })
  } catch (error) {
    console.error('Portal error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
