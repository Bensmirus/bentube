import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

const ADMIN_EMAIL = 'bensmir.hbs@gmail.com'

async function isAdmin(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  return user?.email === ADMIN_EMAIL
}

/**
 * GET: List all free access emails (admin only)
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()

    if (!await isAdmin(supabase)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const admin = createAdminClient()

    const { data, error } = await admin
      .from('free_access_emails')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to fetch free access emails:', error)
      return NextResponse.json({ error: 'Failed to fetch emails' }, { status: 500 })
    }

    return NextResponse.json({ emails: data })
  } catch (error) {
    console.error('Free access emails fetch error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST: Add a free access email (admin only)
 * Also sets is_free_tier = true on the user if they already exist
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()

    if (!await isAdmin(supabase)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const body = await request.json()
    const { email, label } = body as { email?: string; label?: string }

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
    }

    const normalizedEmail = email.trim().toLowerCase()
    const admin = createAdminClient()

    // Insert into free_access_emails
    const { data, error } = await admin
      .from('free_access_emails')
      .insert({
        email: normalizedEmail,
        label: label || null,
      } as never)
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Email already has free access' }, { status: 409 })
      }
      console.error('Failed to add free access email:', error)
      return NextResponse.json({ error: 'Failed to add email' }, { status: 500 })
    }

    // If the user already exists, set is_free_tier = true
    await admin
      .from('users')
      .update({ is_free_tier: true } as never)
      .eq('email', normalizedEmail)

    return NextResponse.json({ email: data })
  } catch (error) {
    console.error('Free access email creation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE: Remove a free access email (admin only)
 * Also sets is_free_tier = false on the user if they exist
 */
export async function DELETE(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()

    if (!await isAdmin(supabase)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'ID required' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Get the email before deleting (to update user record)
    const { data: emailRecord } = await admin
      .from('free_access_emails')
      .select('email')
      .eq('id', id)
      .single()

    const emailValue = (emailRecord as { email: string } | null)?.email

    const { error } = await admin
      .from('free_access_emails')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Failed to remove free access email:', error)
      return NextResponse.json({ error: 'Failed to remove email' }, { status: 500 })
    }

    // If the user exists, set is_free_tier = false
    if (emailValue) {
      await admin
        .from('users')
        .update({ is_free_tier: false } as never)
        .eq('email', emailValue)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Free access email removal error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
