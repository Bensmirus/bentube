'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type AccountSectionProps = {
  user: {
    email?: string
    user_metadata?: {
      full_name?: string
      avatar_url?: string
    }
  }
}

export default function AccountSection({ user }: AccountSectionProps) {
  const router = useRouter()

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="space-y-8">
      {/* Profile */}
      <div className="flex items-center gap-4">
        {user.user_metadata?.avatar_url ? (
          <img
            src={user.user_metadata.avatar_url}
            alt="Profile"
            className="w-16 h-16 rounded-full"
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-2xl">
            {user.email?.charAt(0).toUpperCase() || '?'}
          </div>
        )}
        <div>
          <p className="font-medium">{user.user_metadata?.full_name || 'User'}</p>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
      </div>

      {/* Sign Out */}
      <div className="pt-4 border-t">
        <button
          onClick={handleSignOut}
          className="px-6 h-10 rounded-lg border text-sm font-medium hover:bg-muted transition-colors text-red-500 hover:text-red-600"
        >
          Sign Out
        </button>
      </div>
    </div>
  )
}
