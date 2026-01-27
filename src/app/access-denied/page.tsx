'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function AccessDeniedPage() {
  const router = useRouter()

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-8 text-center">
        <div>
          <h1 className="text-3xl font-bold">Beta Testing</h1>
          <p className="mt-4 text-muted-foreground">
            Ben.Tube is currently in private beta testing and not open to the public yet.
          </p>
          <p className="mt-2 text-muted-foreground">
            Check back soon for updates!
          </p>
        </div>

        <button
          onClick={handleSignOut}
          className="inline-flex h-10 w-full items-center justify-center rounded-lg border bg-card px-6 text-sm font-medium transition-colors hover:bg-muted"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
