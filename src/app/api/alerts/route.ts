import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { NextRequest, NextResponse } from 'next/server'

type AlertRow = {
  id: string
  alert_type: string
  severity: string
  title: string
  message: string
  data: Record<string, unknown>
  created_at: string
}

/**
 * GET: Fetch unacknowledged alerts
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const admin = createAdminClient()

    const { userId, error: userError } = await getInternalUserId(supabase as never)
    if (userError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get unacknowledged alerts
    const { data: alerts, error } = await admin.rpc('get_unacknowledged_alerts', {
      p_limit: 50,
    } as never)

    if (error) {
      console.error('Failed to get alerts:', error)
      return NextResponse.json({ error: 'Failed to get alerts' }, { status: 500 })
    }

    // Get alert counts
    const { data: counts, error: countsError } = await admin.rpc('get_alert_counts')

    if (countsError) {
      console.error('Failed to get alert counts:', countsError)
    }

    const alertRows = alerts as AlertRow[] | null
    const countData = (counts as {
      total_unacknowledged: number
      critical_count: number
      error_count: number
      warning_count: number
      info_count: number
    }[] | null)?.[0]

    return NextResponse.json({
      alerts: (alertRows || []).map((a) => ({
        id: a.id,
        alertType: a.alert_type,
        severity: a.severity,
        title: a.title,
        message: a.message,
        data: a.data,
        createdAt: a.created_at,
      })),
      counts: countData || {
        total_unacknowledged: 0,
        critical_count: 0,
        error_count: 0,
        warning_count: 0,
        info_count: 0,
      },
    })
  } catch (error) {
    console.error('Alerts fetch error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST: Acknowledge alerts
 * Body: { alertIds: string[] } or { all: true }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const admin = createAdminClient()

    const { userId, error: userError } = await getInternalUserId(supabase as never)
    if (userError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    let acknowledged = 0

    if (body.all === true) {
      // Acknowledge all alerts
      const { data, error } = await admin.rpc('acknowledge_all_alerts')
      if (error) {
        console.error('Failed to acknowledge all alerts:', error)
        return NextResponse.json({ error: 'Failed to acknowledge alerts' }, { status: 500 })
      }
      acknowledged = data as number
    } else if (Array.isArray(body.alertIds) && body.alertIds.length > 0) {
      // Acknowledge specific alerts
      const { data, error } = await admin.rpc('acknowledge_alerts', {
        p_alert_ids: body.alertIds,
      } as never)
      if (error) {
        console.error('Failed to acknowledge alerts:', error)
        return NextResponse.json({ error: 'Failed to acknowledge alerts' }, { status: 500 })
      }
      acknowledged = data as number
    } else {
      return NextResponse.json(
        { error: 'Must provide alertIds array or all: true' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      acknowledged,
    })
  } catch (error) {
    console.error('Alert acknowledge error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
