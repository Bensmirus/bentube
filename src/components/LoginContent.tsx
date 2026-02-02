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
      className="inline-flex h-14 w-full items-center justify-center gap-3 rounded-xl border bg-card px-6 font-medium transition-all hover:bg-muted hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
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

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex gap-4 p-4 rounded-xl bg-card/50 border">
      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
        {icon}
      </div>
      <div>
        <h3 className="font-semibold text-sm">{title}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  )
}

export default function LoginContent() {
  return (
    <div className="min-h-screen bg-background relative overflow-y-auto">
      {/* Grain texture overlay */}
      <div className="fixed inset-0 pointer-events-none grain-static opacity-[0.35] mix-blend-overlay z-50" />

      <div className="relative z-10 flex flex-col items-center px-6 py-12 md:py-20">
        {/* Hero Section */}
        <div className="text-center max-w-lg">
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight">
            Ben.<span className="text-accent">Tube</span>
          </h1>
          <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
            A personal video library for research, learning, and content curation.
            Organize your YouTube without the distractions.
          </p>
        </div>

        {/* Login Button */}
        <div className="w-full max-w-sm mt-10">
          <Suspense fallback={
            <div className="h-14 w-full animate-pulse rounded-xl bg-muted" />
          }>
            <LoginButton />
          </Suspense>
        </div>

        {/* Features Grid */}
        <div className="w-full max-w-2xl mt-16">
          <h2 className="text-center text-sm font-medium text-muted-foreground uppercase tracking-wider mb-6">
            Why Ben.Tube?
          </h2>

          <div className="grid gap-3 md:grid-cols-2">
            <FeatureCard
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                </svg>
              }
              title="Topic-Based Groups"
              description="Organize channels into folders like Tech, Music, or Learning"
            />

            <FeatureCard
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
              title="Watch Progress Sync"
              description="Resume exactly where you left off, on any device"
            />

            <FeatureCard
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.75V16.5L12 14.25 7.5 16.5V3.75m9 0H18A2.25 2.25 0 0120.25 6v12A2.25 2.25 0 0118 20.25H6A2.25 2.25 0 013.75 18V6A2.25 2.25 0 016 3.75h1.5m9 0h-9" />
                </svg>
              }
              title="Notes & Tags"
              description="Add personal notes and custom tags to any video"
            />

            <FeatureCard
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                </svg>
              }
              title="Works Everywhere"
              description="Desktop, tablet, or phone — same great experience"
            />

            <FeatureCard
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                </svg>
              }
              title="Completely Private"
              description="No tracking, no ads, no social features. Just you and your videos"
            />

            <FeatureCard
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                </svg>
              }
              title="One-Way Sync"
              description="Import from YouTube. We never write back or affect your account"
            />
          </div>
        </div>

        {/* What it's NOT */}
        <div className="w-full max-w-md mt-16 text-center">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium">This is NOT</span> a social platform, recommendation engine, or YouTube replacement.
            It&apos;s your personal, distraction-free video library.
          </p>
        </div>

        {/* Footer */}
        <div className="mt-16 text-center">
          <p className="text-xs text-muted-foreground">
            By signing in, you agree to our{' '}
            <a href="/terms" className="text-accent hover:underline">Terms of Service</a>
            {' '}and{' '}
            <a href="/privacy" className="text-accent hover:underline">Privacy Policy</a>.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            We only read your subscriptions — we never post or modify anything.
          </p>
        </div>
      </div>
    </div>
  )
}
