import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

const MAX_FREE_TIER_SPOTS = 10
const INSTAGRAM_URL = 'https://www.instagram.com/ben.ware_tools/'

/**
 * GET: Check free tier availability
 * Returns the number of spots remaining and Instagram URL
 */
export async function GET() {
  try {
    const admin = createAdminClient()

    // Count current free tier users
    const { count, error } = await admin
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('is_free_tier', true)

    if (error) {
      console.error('Failed to count free tier users:', error)
      return NextResponse.json({ error: 'Failed to check availability' }, { status: 500 })
    }

    const usedSpots = count || 0
    const remainingSpots = Math.max(0, MAX_FREE_TIER_SPOTS - usedSpots)

    return NextResponse.json({
      maxSpots: MAX_FREE_TIER_SPOTS,
      usedSpots,
      remainingSpots,
      available: remainingSpots > 0,
      instagramUrl: INSTAGRAM_URL,
    })
  } catch (error) {
    console.error('Free tier check error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST: Claim a free tier spot
 * User must confirm they followed Instagram
 */
export async function POST() {
  try {
    const supabase = await createServerSupabaseClient()
    const admin = createAdminClient()

    const { userId, error: userError } = await getInternalUserId(supabase as never)
    if (userError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user already has free tier or subscription
    const { data: userData, error: fetchError } = await admin
      .from('users')
      .select('is_free_tier, subscription_status')
      .eq('id', userId)
      .single()

    type UserData = {
      is_free_tier: boolean | null
      subscription_status: string | null
    }

    const user = userData as UserData | null

    if (fetchError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Check if user already has access
    if (user.is_free_tier) {
      return NextResponse.json({ error: 'You already have free tier access' }, { status: 400 })
    }

    if (user.subscription_status === 'active') {
      return NextResponse.json({ error: 'You already have a subscription' }, { status: 400 })
    }

    // Count current free tier users to check availability
    const { count, error: countError } = await admin
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('is_free_tier', true)

    if (countError) {
      console.error('Failed to count free tier users:', countError)
      return NextResponse.json({ error: 'Failed to check availability' }, { status: 500 })
    }

    const usedSpots = count || 0
    if (usedSpots >= MAX_FREE_TIER_SPOTS) {
      return NextResponse.json({
        error: 'No free spots remaining',
        remainingSpots: 0
      }, { status: 400 })
    }

    // Claim the free tier spot
    const { error: updateError } = await admin
      .from('users')
      .update({
        is_free_tier: true,
        free_tier_claimed_at: new Date().toISOString(),
      } as never)
      .eq('id', userId)

    if (updateError) {
      console.error('Failed to claim free tier:', updateError)
      return NextResponse.json({ error: 'Failed to claim free spot' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Free tier access granted!',
      remainingSpots: MAX_FREE_TIER_SPOTS - usedSpots - 1,
    })
  } catch (error) {
    console.error('Free tier claim error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
