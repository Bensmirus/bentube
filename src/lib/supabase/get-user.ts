import type { SupabaseClient } from '@supabase/supabase-js'

// Simple in-memory cache for user IDs (persists for the duration of the request)
const userIdCache = new Map<string, string>()

/**
 * Get the internal user ID, creating a user record if needed
 * Optimized to use getSession() which is faster than getUser()
 */
export async function getInternalUserId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>
): Promise<{ userId: string | null; error: string | null }> {
  // Use getSession() - it reads from cookies without making a network request
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()

  if (sessionError || !session?.user) {
    return { userId: null, error: 'Unauthorized' }
  }

  const authUserId = session.user.id

  // Check in-memory cache first
  const cachedUserId = userIdCache.get(authUserId)
  if (cachedUserId) {
    return { userId: cachedUserId, error: null }
  }

  // Try to get existing user record
  const { data: existingUser, error: selectError } = await supabase
    .from('users')
    .select('id')
    .eq('auth_user_id', authUserId)
    .single()

  if (existingUser) {
    // Cache the result
    userIdCache.set(authUserId, existingUser.id)
    return { userId: existingUser.id, error: null }
  }

  // User doesn't exist, create one
  if (selectError?.code === 'PGRST116') { // "No rows returned" error
    const googleId = session.user.user_metadata?.sub || authUserId
    const email = session.user.email || ''

    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({
        auth_user_id: authUserId,
        google_id: googleId,
        email: email,
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('Failed to create user record:', insertError)

      // Check if user was created by another concurrent request
      const { data: retryUser } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', authUserId)
        .single()

      if (retryUser) {
        userIdCache.set(authUserId, retryUser.id)
        return { userId: retryUser.id, error: null }
      }

      return { userId: null, error: `Failed to create user record: ${insertError.message}` }
    }

    // Cache the new user ID
    userIdCache.set(authUserId, newUser.id)
    return { userId: newUser.id, error: null }
  }

  // Some other error
  console.error('Failed to get user:', selectError)
  return { userId: null, error: 'Failed to get user' }
}
