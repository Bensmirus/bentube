import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const redirect = searchParams.get('redirect') || '/'

  if (code) {
    const cookieStore = await cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          },
        },
      }
    )

    const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      console.error('Auth callback error:', error.message)
      return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`)
    }

    // Create or update user record in public.users table
    if (sessionData?.user) {
      const authUser = sessionData.user
      const googleId = authUser.user_metadata?.sub || authUser.id
      const email = authUser.email || ''

      // Extract YouTube tokens from provider_token if available
      const providerToken = sessionData.session?.provider_token
      const providerRefreshToken = sessionData.session?.provider_refresh_token

      // Upsert user record
      const { error: upsertError } = await supabase
        .from('users')
        .upsert(
          {
            auth_user_id: authUser.id,
            google_id: googleId,
            email: email,
            youtube_access_token: providerToken || null,
            youtube_refresh_token: providerRefreshToken || null,
            youtube_token_expires_at: sessionData.session?.expires_at
              ? new Date(sessionData.session.expires_at * 1000).toISOString()
              : null,
          },
          {
            onConflict: 'auth_user_id',
          }
        )

      if (upsertError) {
        console.error('User upsert error:', upsertError)
        // Don't fail the auth flow, just log the error
      }

      // Check if this is a first-time user (no channels imported)
      // Get the internal user ID first
      const { data: userData } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', authUser.id)
        .single()

      if (userData?.id) {
        // Check if user has any channels in any group
        const { data: groups } = await supabase.rpc('get_groups_with_channels', {
          p_user_id: userData.id,
        })

        const hasChannels = groups && groups.some((g: { channel_count: number }) => g.channel_count > 0)

        if (!hasChannels) {
          // First-time user - redirect to settings for import
          return NextResponse.redirect(`${origin}/settings`)
        }
      }
    }

    return NextResponse.redirect(`${origin}${redirect}`)
  }

  return NextResponse.redirect(`${origin}/login?error=no_code`)
}
