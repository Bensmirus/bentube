import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { generateApiKey, hasApiKey, saveApiKeyHash, revokeApiKey } from '@/lib/auth/api-key'

// GET: Check if user has an API key
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { userId, error: userError } = await getInternalUserId(supabase)

    if (userError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const hasKey = await hasApiKey(userId)
    return NextResponse.json({ hasApiKey: hasKey })
  } catch (error) {
    console.error('[Extension/ApiKey] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST: Generate a new API key
export async function POST() {
  try {
    const supabase = await createServerSupabaseClient()
    const { userId, error: userError } = await getInternalUserId(supabase)

    if (userError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Generate new key
    const { plaintext, hash } = generateApiKey()

    // Save hash to database (replaces any existing key)
    const saved = await saveApiKeyHash(userId, hash)
    if (!saved) {
      return NextResponse.json({ error: 'Failed to save API key' }, { status: 500 })
    }

    // Return plaintext key (only time it's shown!)
    return NextResponse.json({
      success: true,
      apiKey: plaintext,
      message: 'Save this key now - it will not be shown again!',
    })
  } catch (error) {
    console.error('[Extension/ApiKey] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE: Revoke the API key
export async function DELETE() {
  try {
    const supabase = await createServerSupabaseClient()
    const { userId, error: userError } = await getInternalUserId(supabase)

    if (userError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const revoked = await revokeApiKey(userId)
    if (!revoked) {
      return NextResponse.json({ error: 'Failed to revoke API key' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'API key revoked' })
  } catch (error) {
    console.error('[Extension/ApiKey] DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
