'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import FeedContent from '@/components/FeedContent'

export default function FeedPage() {
  const router = useRouter()
  const [authState, setAuthState] = useState<'loading' | 'authenticated' | 'unauthenticated' | 'error'>('loading')
  const [retryCount, setRetryCount] = useState(0)

  const checkSession = useCallback(async () => {
    // Dev bypass: skip auth check on localhost
    if (process.env.NODE_ENV === 'development') {
      setAuthState('authenticated')
      return
    }
    setAuthState('loading')
    try {
      const supabase = createClient()

      // Add timeout to prevent infinite loading (8 seconds max)
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Session check timeout')), 8000)
      })

      const { data: { session }, error } = await Promise.race([
        supabase.auth.getSession(),
        timeoutPromise,
      ])

      if (error) {
        console.error('Session check error:', error)
        setAuthState('error')
        return
      }

      if (!session) {
        setAuthState('unauthenticated')
        router.push('/login')
      } else {
        setAuthState('authenticated')
      }
    } catch (err) {
      console.error('Session check failed:', err)
      setAuthState('error')
    }
  }, [router])

  useEffect(() => {
    checkSession()
  }, [checkSession, retryCount])

  if (authState === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Checking session...</p>
        </div>
      </div>
    )
  }

  if (authState === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-4">Connection error. Please check your internet.</p>
          <button
            onClick={() => setRetryCount(c => c + 1)}
            className="px-4 py-2 bg-accent text-accent-foreground rounded-md hover:bg-accent/90 transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (authState === 'unauthenticated') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Redirecting to login...</p>
      </div>
    )
  }

  return <FeedContent />
}
