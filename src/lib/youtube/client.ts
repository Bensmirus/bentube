import { google, youtube_v3 } from 'googleapis'
import { createAdminClient } from '@/lib/supabase/admin'

// Token refresh buffer: refresh if less than 10 minutes remaining
const TOKEN_REFRESH_BUFFER_MS = 10 * 60 * 1000

export type YouTubeClientResult = {
  client: youtube_v3.Youtube | null
  error: string | null
}

export type YouTubeClientWithRefresh = {
  client: youtube_v3.Youtube
  refreshToken: () => Promise<boolean>
  checkAndRefreshIfNeeded: () => Promise<boolean>
}

/**
 * Get authenticated YouTube client for a user
 * Automatically refreshes token if expired
 */
export async function getYouTubeClient(userId: string): Promise<YouTubeClientResult> {
  const result = await getYouTubeClientWithRefresh(userId)
  if ('error' in result && result.error) {
    return { client: null, error: result.error }
  }
  return { client: (result as YouTubeClientWithRefresh).client, error: null }
}

/**
 * Get YouTube client with refresh capability for long-running operations
 * Call checkAndRefreshIfNeeded() periodically during long syncs
 */
export async function getYouTubeClientWithRefresh(
  userId: string
): Promise<YouTubeClientWithRefresh | { client: null; error: string }> {
  const supabase = createAdminClient()

  // Create a fresh OAuth client for this user
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`
  )

  // Fetch user's tokens
  const { data: user, error } = await supabase
    .from('users')
    .select('youtube_access_token, youtube_refresh_token, youtube_token_expires_at')
    .eq('id', userId)
    .single()

  if (error || !user) {
    return { client: null, error: 'User not found' }
  }

  // Type assertion for user data
  const userData = user as {
    youtube_access_token: string | null
    youtube_refresh_token: string | null
    youtube_token_expires_at: string | null
  }

  if (!userData.youtube_access_token || !userData.youtube_refresh_token) {
    return { client: null, error: 'YouTube not connected. Please re-authenticate.' }
  }

  // Track token expiration
  let tokenExpiresAt = userData.youtube_token_expires_at
    ? new Date(userData.youtube_token_expires_at).getTime()
    : 0

  // Function to refresh token
  const refreshToken = async (): Promise<boolean> => {
    oauth2Client.setCredentials({
      refresh_token: userData.youtube_refresh_token,
    })

    try {
      const { credentials } = await oauth2Client.refreshAccessToken()

      // Update tokens in database
      await supabase
        .from('users')
        .update({
          youtube_access_token: credentials.access_token,
          youtube_token_expires_at: credentials.expiry_date
            ? new Date(credentials.expiry_date).toISOString()
            : null,
        } as never)
        .eq('id', userId)

      oauth2Client.setCredentials(credentials)
      tokenExpiresAt = credentials.expiry_date || 0

      return true
    } catch (refreshError) {
      console.error('Token refresh failed:', refreshError)
      return false
    }
  }

  // Function to check and refresh if needed
  const checkAndRefreshIfNeeded = async (): Promise<boolean> => {
    const isExpiringSoon = Date.now() > tokenExpiresAt - TOKEN_REFRESH_BUFFER_MS
    if (isExpiringSoon) {
      return refreshToken()
    }
    return true
  }

  // Initial token check
  const isExpired = Date.now() > tokenExpiresAt - TOKEN_REFRESH_BUFFER_MS

  if (isExpired) {
    const refreshed = await refreshToken()
    if (!refreshed) {
      return { client: null, error: 'Token expired. Please re-authenticate.' }
    }
  } else {
    oauth2Client.setCredentials({
      access_token: userData.youtube_access_token,
      refresh_token: userData.youtube_refresh_token,
    })
  }

  return {
    client: google.youtube({ version: 'v3', auth: oauth2Client }),
    refreshToken,
    checkAndRefreshIfNeeded,
  }
}
