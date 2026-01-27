import { createBrowserClient } from '@supabase/ssr'

// Singleton instance for browser client
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let browserClient: ReturnType<typeof createBrowserClient> | null = null

/**
 * Get the singleton Supabase browser client
 * This ensures we only create one client instance per browser session,
 * which is more efficient and prevents connection pool issues.
 */
export function createClient() {
  if (browserClient) {
    return browserClient
  }

  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  return browserClient
}

/**
 * Get the existing client without creating a new one
 * Returns null if no client has been created yet
 */
export function getClient() {
  return browserClient
}

/**
 * Reset the client (useful for testing or logout)
 */
export function resetClient(): void {
  browserClient = null
}
