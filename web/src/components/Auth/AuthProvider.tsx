'use client'

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { getSupabaseClient } from '@/lib/supabase/client'

interface TeamUser {
  id: string
  email: string
  name: string
  role: string
  is_active: boolean
}

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signOut: () => Promise<void>
  teamUser: TeamUser | null
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
  teamUser: null,
})

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [teamUser, setTeamUser] = useState<TeamUser | null>(null)

  const supabase = getSupabaseClient()

  const syncUser = useCallback(async (authUser: User) => {
    try {
      const meta = authUser.user_metadata || {}
      const res = await fetch('/api/team/users/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auth_id: authUser.id,
          email: authUser.email,
          name: meta.full_name || meta.name || authUser.email?.split('@')[0],
          role: meta.role || null,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.user) {
          setTeamUser(data.user)
        }
      }
    } catch (err) {
      console.error('Error syncing user:', err)
    }
  }, [])

  useEffect(() => {
    // Get initial session
    const getSession = async () => {
      const { data: { session }, error } = await supabase.auth.getSession()

      if (error) {
        console.error('Error getting session:', error)
      }

      setSession(session)
      setUser(session?.user ?? null)

      // Sync to custom users table
      if (session?.user) {
        await syncUser(session.user)
      }

      setLoading(false)
    }

    getSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session)
        setUser(session?.user ?? null)

        if (session?.user && event === 'SIGNED_IN') {
          await syncUser(session.user)
        }
        if (!session) {
          setTeamUser(null)
        }

        setLoading(false)
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [supabase, syncUser])

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
    setTeamUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut, teamUser }}>
      {children}
    </AuthContext.Provider>
  )
}
