/**
 * Helper to extract Supabase auth token from the incoming request
 * and build headers for proxying to the Python backend.
 *
 * The Supabase SSR client stores the session in cookies. We reconstruct
 * the session server-side and forward the access_token as a Bearer header.
 */

import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * Get Authorization headers to forward to the backend API.
 * Returns an object with the Authorization header if the user is authenticated,
 * or an empty object if not (let the backend decide whether to reject).
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (session?.access_token) {
      return { Authorization: `Bearer ${session.access_token}` }
    }
  } catch (e) {
    console.warn('[api-auth] Could not extract auth token:', e)
  }
  return {}
}
