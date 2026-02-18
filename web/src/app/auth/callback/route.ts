import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Homes/Capital Auth Callback Route Handler (server-side)
 * 
 * This callback is used by the HOMES/CAPITAL portal.
 * Supabase email links for employees redirect here.
 * We exchange the code for a session and redirect to /homes.
 * 
 * Clients use /clientes/auth/callback instead.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const type = searchParams.get('type')
  const next = searchParams.get('next') ?? '/homes'

  if (code) {
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      // Password recovery → update password page (Homes)
      if (type === 'recovery') {
        return NextResponse.redirect(`${origin}/auth/update-password`)
      }
      // Always redirect to Homes portal (this is the Homes callback)
      return NextResponse.redirect(`${origin}${next}`)
    }

    console.error('Homes auth callback - code exchange error:', error)
  }

  // Error → Homes login
  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
