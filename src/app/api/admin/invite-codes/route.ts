import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

const ADMIN_EMAIL = 'bensmir.hbs@gmail.com'

/**
 * Check if the current user is an admin
 */
async function isAdmin(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  return user?.email === ADMIN_EMAIL
}

/**
 * Generate a unique invite code
 */
function generateCode(label?: string): string {
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()

  if (label) {
    // Clean the label to use in code
    const cleanLabel = label
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .substring(0, 10)
    return `BENTUBE-${cleanLabel}-${random}`
  }

  return `BENTUBE-${timestamp}-${random}`
}

/**
 * GET: List all invite codes (admin only)
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()

    if (!await isAdmin(supabase)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const admin = createAdminClient()

    type InviteCodeRow = {
      id: string
      code: string
      label: string | null
      created_at: string
      expires_at: string | null
      used_by: string | null
      used_at: string | null
      is_active: boolean
    }

    const { data, error } = await admin
      .from('invite_codes')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to fetch invite codes:', error)
      return NextResponse.json({ error: 'Failed to fetch codes' }, { status: 500 })
    }

    const codes = data as InviteCodeRow[] | null

    // Get user emails for used codes
    const usedByIds = codes?.filter(c => c.used_by).map(c => c.used_by as string) || []
    let userEmails: Record<string, string> = {}

    if (usedByIds.length > 0) {
      const { data: users } = await admin
        .from('users')
        .select('id, email')
        .in('id', usedByIds)

      type UserRow = { id: string; email: string }
      if (users) {
        userEmails = Object.fromEntries((users as UserRow[]).map(u => [u.id, u.email]))
      }
    }

    // Transform to include user email
    const transformedCodes = codes?.map(code => ({
      id: code.id,
      code: code.code,
      label: code.label,
      created_at: code.created_at,
      expires_at: code.expires_at,
      used_by: code.used_by,
      used_at: code.used_at,
      is_active: code.is_active,
      used_by_email: code.used_by ? userEmails[code.used_by] || null : null,
    }))

    return NextResponse.json({ codes: transformedCodes })
  } catch (error) {
    console.error('Invite codes fetch error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST: Create a new invite code (admin only)
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()

    if (!await isAdmin(supabase)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const body = await request.json()
    const { label, expiresInDays } = body as { label?: string; expiresInDays?: number }

    const admin = createAdminClient()
    const code = generateCode(label)

    // Calculate expiration date if specified
    let expiresAt = null
    if (expiresInDays && expiresInDays > 0) {
      const expDate = new Date()
      expDate.setDate(expDate.getDate() + expiresInDays)
      expiresAt = expDate.toISOString()
    }

    const { data, error } = await admin
      .from('invite_codes')
      .insert({
        code,
        label: label || null,
        expires_at: expiresAt,
      } as never)
      .select()
      .single()

    if (error) {
      console.error('Failed to create invite code:', error)
      return NextResponse.json({ error: 'Failed to create code' }, { status: 500 })
    }

    return NextResponse.json({ code: data })
  } catch (error) {
    console.error('Invite code creation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE: Deactivate an invite code (admin only)
 */
export async function DELETE(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()

    if (!await isAdmin(supabase)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const codeId = searchParams.get('id')

    if (!codeId) {
      return NextResponse.json({ error: 'Code ID required' }, { status: 400 })
    }

    const admin = createAdminClient()

    const { error } = await admin
      .from('invite_codes')
      .update({ is_active: false } as never)
      .eq('id', codeId)

    if (error) {
      console.error('Failed to deactivate invite code:', error)
      return NextResponse.json({ error: 'Failed to deactivate code' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Invite code deactivation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
