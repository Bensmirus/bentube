'use client'

import { createClient } from '@/lib/supabase/client'
import { Suspense } from 'react'

function LoginButton() {
  const handleLogin = async () => {
    const supabase = createClient()

    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirect=/`,
        skipBrowserRedirect: false,
        scopes: 'email profile https://www.googleapis.com/auth/youtube.readonly',
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    })
  }

  return (
    <button
      onClick={handleLogin}
      className="inline-flex h-12 w-full items-center justify-center gap-3 rounded-lg border bg-card px-6 text-sm font-medium transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24">
        <path
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          fill="#4285F4"
        />
        <path
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          fill="#34A853"
        />
        <path
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          fill="#FBBC05"
        />
        <path
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          fill="#EA4335"
        />
      </svg>
      Continue with Google
    </button>
  )
}

export default function LoginContent() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8 bg-background relative">
      {/* Grain texture overlay - matches landing page */}
      <div className="fixed inset-0 pointer-events-none grain-static opacity-[0.45] mix-blend-overlay z-50" />
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold">Ben.Tube</h1>
          <p className="mt-2 text-lg text-muted-foreground">
            A cleaner way to organize your YouTube subscriptions
          </p>
        </div>

        {/* Features */}
        <div className="space-y-3 text-sm">
          <div className="flex items-start gap-3">
            <span className="text-accent">✓</span>
            <span className="text-muted-foreground">Organize channels into topic-based groups</span>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-accent">✓</span>
            <span className="text-muted-foreground">Track watch progress across all your devices</span>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-accent">✓</span>
            <span className="text-muted-foreground">Add personal notes and tags to videos</span>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-accent">✓</span>
            <span className="text-muted-foreground">No ads, no tracking, completely private</span>
          </div>
        </div>

        <Suspense fallback={
          <div className="h-12 w-full animate-pulse rounded-lg bg-muted" />
        }>
          <LoginButton />
        </Suspense>

        <p className="text-center text-xs text-muted-foreground">
          By signing in, you agree to our{' '}
          <a href="/terms" className="text-accent hover:underline">Terms of Service</a>
          {' '}and{' '}
          <a href="/privacy" className="text-accent hover:underline">Privacy Policy</a>.
          We only read your subscription list - we never post or modify anything.
        </p>
      </div>
    </div>
  )
}
