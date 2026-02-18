/**
 * Client Portal Auth Helpers
 * Uses Supabase Auth with Email + Password for client authentication.
 * Also supports magic link as fallback and password reset flow.
 */

import { getSupabaseClient } from './client'

/**
 * Get the app's base URL, resolving correctly on both local dev and Vercel.
 * Priority: NEXT_PUBLIC_APP_URL > NEXT_PUBLIC_VERCEL_URL > window.location.origin
 */
function getAppBaseUrl(): string {
  // 1. Explicit app URL (set in Vercel env vars)
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
  }
  // 2. Vercel auto-provided URL (always available on Vercel deployments)
  if (process.env.NEXT_PUBLIC_VERCEL_URL) {
    return `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
  }
  // 3. Fall back to window origin (works on any deployment)
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  return 'http://localhost:3000'
}

/**
 * Sign in with email + password.
 */
export async function signInWithPassword(email: string, password: string) {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  return { data, error }
}

/**
 * Sign up with email + password (creates Supabase auth user).
 * The user will receive a confirmation email.
 */
export async function signUpWithPassword(email: string, password: string) {
  const supabase = getSupabaseClient()
  const baseUrl = getAppBaseUrl()
  
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${baseUrl}/clientes/auth/callback?next=/clientes/mi-cuenta`,
    },
  })
  return { data, error }
}

/**
 * Send a password reset email.
 * The user clicks the link → redirected to set a new password.
 */
export async function sendPasswordResetEmail(email: string) {
  const supabase = getSupabaseClient()
  const baseUrl = getAppBaseUrl()
  
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${baseUrl}/clientes/auth/callback?next=/clientes/crear-contrasena`,
  })
  return { data, error }
}

/**
 * Update password (used after reset link click).
 */
export async function updatePassword(newPassword: string) {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.auth.updateUser({
    password: newPassword,
  })
  return { data, error }
}

/**
 * Send a magic link to the client's email (fallback method).
 * When they click it, they'll be redirected to the callback URL.
 */
export async function signInWithMagicLink(email: string, redirectTo?: string) {
  const supabase = getSupabaseClient()
  
  const baseUrl = getAppBaseUrl()
  
  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo || `${baseUrl}/clientes/auth/callback`,
    },
  })
  
  return { data, error }
}

export { getAppBaseUrl }

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


