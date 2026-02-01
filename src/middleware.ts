import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Timeout for Supabase auth checks (prevents hanging pages)
const AUTH_TIMEOUT_MS = 5000

// Routes that require authentication
const protectedRoutes = [
  '/feed',
  '/groups',
  '/shorts',
  '/watch',
  '/settings',
]

// API routes that require authentication (except auth routes)
const protectedApiRoutes = [
  '/api/feed',
  '/api/groups',
  '/api/tags',
  '/api/sync',
  '/api/notes',
  '/api/billing/checkout',
  '/api/billing/status',
  '/api/billing/portal',
  '/api/extension/api-key',
]

// Public routes that don't need auth check
const publicRoutes = [
  '/login',
  '/access-denied',
  '/subscribe',
  '/privacy',
  '/terms',
  '/auth/callback',
  '/api/auth',
  '/api/health',
  '/api/icons',
  '/api/cron',
  '/api/billing/webhook',
  '/api/billing/free-tier',
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip middleware for public routes
  if (publicRoutes.some(route => pathname.startsWith(route))) {
    return NextResponse.next()
  }

  // Check for API key authentication (for extensions)
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer bt_')) {
    // API key auth is handled in the route handlers
    // Just pass through here
    return NextResponse.next()
  }

  // Update Supabase session (refreshes tokens if needed)
  // Wrapped in timeout to prevent hanging pages when Supabase is slow
  let supabaseResponse: Awaited<ReturnType<typeof updateSession>>['supabaseResponse']
  let user: Awaited<ReturnType<typeof updateSession>>['user']

  try {
    const result = await Promise.race([
      updateSession(request),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Auth timeout')), AUTH_TIMEOUT_MS)
      )
    ])
    supabaseResponse = result.supabaseResponse
    user = result.user
  } catch (error) {
    // On timeout or error, allow the request but without auth
    // The page will handle showing login if needed
    console.error('Middleware auth error:', error)
    supabaseResponse = NextResponse.next({ request })
    user = null
  }

  // Check if route requires authentication
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route))
  const isProtectedApi = protectedApiRoutes.some(route => pathname.startsWith(route))

  if ((isProtectedRoute || isProtectedApi) && !user) {
    if (isProtectedApi) {
      return new NextResponse(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }
    // Redirect to login for page routes
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  // Access control: Check if user has access via ALLOWED_EMAILS or subscription
  // Users in ALLOWED_EMAILS get free access, others need a subscription
  if (user && (isProtectedRoute || isProtectedApi)) {
    const allowedEmails = process.env.ALLOWED_EMAILS?.split(',').map(e => e.trim().toLowerCase()) || []
    const userEmail = user.email?.toLowerCase()

    // Check if user is in the free access list
    const hasFreeAccess = userEmail && allowedEmails.includes(userEmail)

    if (!hasFreeAccess) {
      // User needs a subscription - redirect to subscribe page
      // The subscribe page will check their subscription status
      if (isProtectedApi) {
        return new NextResponse(
          JSON.stringify({ success: false, error: 'Subscription required' }),
          {
            status: 403,
            headers: { 'Content-Type': 'application/json' }
          }
        )
      }
      // Redirect to subscribe page
      const url = request.nextUrl.clone()
      url.pathname = '/subscribe'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
