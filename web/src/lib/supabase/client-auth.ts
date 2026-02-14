/**
 * Client Portal Auth Helpers
 * Uses Supabase Auth with Magic Link for client authentication.
 * Target users: 40+, not tech-savvy → no passwords, just email magic link.
 */

import { getSupabaseClient } from './client'

/**
 * Send a magic link to the client's email.
 * When they click it, they'll be redirected to the callback URL.
 */
export async function signInWithMagicLink(email: string, redirectTo?: string) {
  const supabase = getSupabaseClient()
  
  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo || `${window.location.origin}/clientes/auth/callback`,
    },
  })
  
  return { data, error }
}

/**
 * Get the current authenticated user.
 */
export async function getClientUser() {
  const supabase = getSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  
  if (error || !user) return null
  return user
}

/**
 * Get the current auth session.
 */
export async function getClientSession() {
  const supabase = getSupabaseClient()
  const { data: { session }, error } = await supabase.auth.getSession()
  
  if (error || !session) return null
  return session
}

/**
 * Sign out the client.
 */
export async function signOutClient() {
  const supabase = getSupabaseClient()
  await supabase.auth.signOut()
}

/**
 * Listen for auth state changes.
 */
export function onAuthStateChange(callback: (event: string, session: any) => void) {
  const supabase = getSupabaseClient()
  return supabase.auth.onAuthStateChange(callback)
}


