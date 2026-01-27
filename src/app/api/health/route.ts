import { NextResponse } from 'next/server'

export const runtime = 'edge'

/**
 * Health check endpoint
 *
 * Validates that required environment variables are configured.
 * Returns 200 if all required vars are set, 503 if any are missing.
 */
export async function GET() {
  const checks: Record<string, boolean> = {}
  const optional: Record<string, boolean> = {}
  const notes: Record<string, string> = {}

  // Required: Supabase configuration
  checks.supabase_url = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)
  checks.supabase_anon_key = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  checks.supabase_service_key = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)

  // Required: Google OAuth (needed for login)
  checks.google_oauth_configured = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  )

  // Required: App configuration
  checks.app_url_configured = Boolean(process.env.NEXT_PUBLIC_APP_URL)
  checks.cron_secret_configured = Boolean(process.env.CRON_SECRET)

  // Optional: YouTube API key (not currently used - OAuth tokens used instead)
  optional.youtube_api_key = Boolean(process.env.YOUTUBE_API_KEY)
  if (!optional.youtube_api_key) {
    notes.youtube_api_key = 'Not set - OAuth tokens used instead (this is normal)'
  }

  // Optional: Monitoring
  optional.sentry_configured = Boolean(process.env.SENTRY_DSN)
  optional.discord_configured = Boolean(process.env.DISCORD_WEBHOOK_URL)

  const allRequiredHealthy = Object.values(checks).every(Boolean)
  const someOptionalConfigured = Object.values(optional).some(Boolean)

  return NextResponse.json(
    {
      status: allRequiredHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      required: checks,
      optional,
      notes,
      summary: {
        all_required_configured: allRequiredHealthy,
        optional_features_enabled: someOptionalConfigured,
      },
    },
    {
      status: allRequiredHealthy ? 200 : 503,
    }
  )
}
