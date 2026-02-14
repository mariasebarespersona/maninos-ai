'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getClientUser, signOutClient } from '@/lib/supabase/client-auth'

interface Client {
  id: string
  name: string
  email: string
  phone: string
  terreno: string
  status: string
}

interface UseClientAuthReturn {
  client: Client | null
  loading: boolean
  error: string | null
  signOut: () => Promise<void>
}

/**
 * Hook for client authentication in the Client Portal.
 * Uses Supabase Auth to get the authenticated user's email,
 * then looks up the client record from the backend.
 * Redirects to login if not authenticated.
 */
export function useClientAuth(redirectIfUnauthenticated = true): UseClientAuthReturn {
  const router = useRouter()
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadClient = async () => {
      try {
        // Step 1: Get authenticated user from Supabase Auth
        const user = await getClientUser()
        
        if (!user) {
          if (redirectIfUnauthenticated) {
            router.push('/clientes/login')
          }
          setLoading(false)
          return
        }
        
        const email = user.email
        if (!email) {
          setError('No se encontró tu correo electrónico')
          setLoading(false)
          return
        }
        
        // Step 2: Look up client record in our database by email
        const res = await fetch(`/api/public/clients/lookup?email=${encodeURIComponent(email)}`)
        const data = await res.json()
        
        if (data.ok && data.client) {
          setClient(data.client)
        } else {
          // User is authenticated but has no client record
          // This could happen if they signed up via magic link but never purchased
          setError('No encontramos una cuenta de cliente asociada a este correo.')
        }
      } catch (err) {
        console.error('Error loading client auth:', err)
        setError('Error al cargar tu información')
      } finally {
        setLoading(false)
      }
    }
    
    loadClient()
  }, [router, redirectIfUnauthenticated])

  const handleSignOut = async () => {
    await signOutClient()
    router.push('/clientes')
  }

  return {
    client,
    loading,
    error,
    signOut: handleSignOut,
  }
}


