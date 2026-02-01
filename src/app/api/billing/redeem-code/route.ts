import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

/**
 * POST: Redeem an invite code for free tier access
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const admin = createAdminClient()

    const { userId, error: userError } = await getInternalUserId(supabase as never)
    if (userError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { code } = body as { code?: string }

    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: 'Code is required' }, { status: 400 })
    }

    // Clean and uppercase the code
    const cleanCode = code.trim().toUpperCase()

    // Check if user already has free tier or active subscription
    type UserData = {
      is_free_tier: boolean | null
      subscription_status: string | null
    }

    const { data: userDataRaw, error: fetchError } = await admin
      .from('users')
      .select('is_free_tier, subscription_status')
      .eq('id', userId)
      .single()

    const userData = userDataRaw as UserData | null

    if (fetchError || !userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (userData.is_free_tier) {
      return NextResponse.json({ error: 'You already have free tier access' }, { status: 400 })
    }

    if (userData.subscription_status === 'active') {
      return NextResponse.json({ error: 'You already have a subscription' }, { status: 400 })
    }

    // Find the invite code
    type InviteCodeRow = {
      id: string
      code: string
      expires_at: string | null
    }

    const { data: inviteCodeData, error: codeError } = await admin
      .from('invite_codes')
      .select('*')
      .eq('code', cleanCode)
      .eq('is_active', true)
      .is('used_by', null)
      .single()

    const inviteCode = inviteCodeData as InviteCodeRow | null

    if (codeError || !inviteCode) {
      return NextResponse.json({ error: 'Invalid or already used code' }, { status: 400 })
    }

    // Check if code is expired
    if (inviteCode.expires_at && new Date(inviteCode.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This code has expired' }, { status: 400 })
    }

    // Mark the code as used
    const { error: updateCodeError } = await admin
      .from('invite_codes')
      .update({
        used_by: userId,
        used_at: new Date().toISOString(),
      } as never)
      .eq('id', inviteCode.id)

    if (updateCodeError) {
      console.error('Failed to update invite code:', updateCodeError)
      return NextResponse.json({ error: 'Failed to redeem code' }, { status: 500 })
    }

    // Grant free tier access to the user
    const { error: updateUserError } = await admin
      .from('users')
      .update({
        is_free_tier: true,
        free_tier_claimed_at: new Date().toISOString(),
      } as never)
      .eq('id', userId)

    if (updateUserError) {
      console.error('Failed to grant free tier:', updateUserError)
      // Try to rollback the code update
      await admin
        .from('invite_codes')
        .update({ used_by: null, used_at: null } as never)
        .eq('id', inviteCode.id)
      return NextResponse.json({ error: 'Failed to grant access' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Free tier access granted!',
    })
  } catch (error) {
    console.error('Code redemption error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
