'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

type UserContextType = {
  user: User | null
  internalUserId: string | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

const UserContext = createContext<UserContextType | undefined>(undefined)

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [internalUserId, setInternalUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchUser = async () => {
    try {
      const supabase = createClient()

      // Get session - this reads from local storage/cookies, very fast
      const { data: { session } } = await supabase.auth.getSession()

      if (!session?.user) {
        setUser(null)
        setInternalUserId(null)
        setLoading(false)
        return
      }

      setUser(session.user)

      // Fetch internal user ID from database
      const { data: userData } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', session.user.id)
        .single()

      if (userData) {
        setInternalUserId(userData.id)
      }

      setLoading(false)
    } catch (err) {
      console.error('Error fetching user:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch user')
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUser()

    // Subscribe to auth state changes
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT') {
          setUser(null)
          setInternalUserId(null)
        } else if (event === 'SIGNED_IN' && session?.user) {
          setUser(session.user)
          // Fetch internal ID
          const { data: userData } = await supabase
            .from('users')
            .select('id')
            .eq('auth_user_id', session.user.id)
            .single()
          if (userData) {
            setInternalUserId(userData.id)
          }
        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
          setUser(session.user)
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  return (
    <UserContext.Provider value={{ user, internalUserId, loading, error, refresh: fetchUser }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  const context = useContext(UserContext)
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider')
  }
  return context
}
