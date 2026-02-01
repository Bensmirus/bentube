import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * GET: Fetch current API quota status for the user
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const admin = createAdminClient()

    const { userId, error: userError } = await getInternalUserId(supabase as never)
    if (userError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get quota using the function
    const { data, error } = await admin.rpc('get_api_quota', { p_user_id: userId } as never)

    if (error) {
      console.error('Failed to get quota:', error)
      return NextResponse.json({ error: 'Failed to get quota' }, { status: 500 })
    }

    type QuotaData = {
      units_used: number
      daily_limit: number
      remaining: number
      reset_at?: string
    }

    const rawData = data as QuotaData[] | null
    const quotaData: QuotaData = rawData?.[0] || { units_used: 0, daily_limit: 10000, remaining: 10000 }

    return NextResponse.json({
      unitsUsed: quotaData.units_used,
      dailyLimit: quotaData.daily_limit,
      remaining: quotaData.remaining,
      resetAt: quotaData.reset_at,
      percentUsed: Math.round((quotaData.units_used / quotaData.daily_limit) * 100),
    })
  } catch (error) {
    console.error('Quota fetch error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
