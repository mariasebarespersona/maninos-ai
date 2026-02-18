import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Generic Auth Callback Route Handler (server-side)
 * 
 * Supabase email links (verification, magic link, recovery) redirect here.
 * We exchange the code for a session, then determine which portal the user
 * belongs to and redirect accordingly:
 * 
 *   - Employee (exists in `users` table) → /homes (or `next` param)
 *   - Client (no `users` record)         → /clientes/mi-cuenta
 *   - Password recovery                  → /auth/update-password (employees)
 *                                           /clientes/crear-contrasena (clients)
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const type = searchParams.get('type')
  const next = searchParams.get('next') ?? ''

  if (code) {
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      // Get the authenticated user
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        // Check if this user is an employee (has a record in the `users` table)
        const { data: employeeRecord } = await supabase
          .from('users')
          .select('id, role')
          .eq('email', user.email)
          .maybeSingle()

        const isEmployee = !!employeeRecord

        // If `next` param already points to /clientes/*, respect it
        if (next.startsWith('/clientes')) {
          return NextResponse.redirect(`${origin}${next}`)
        }

        if (type === 'recovery') {
          // Password recovery: redirect to the correct portal's password page
          if (isEmployee) {
            return NextResponse.redirect(`${origin}/auth/update-password`)
          } else {
            return NextResponse.redirect(`${origin}/clientes/crear-contrasena`)
          }
        }

        // Normal login/verification redirect
        if (isEmployee) {
          // Employee → Homes portal (or wherever `next` points)
          const destination = next || '/homes'
          return NextResponse.redirect(`${origin}${destination}`)
        } else {
          // Client → Client portal dashboard
          return NextResponse.redirect(`${origin}/clientes/mi-cuenta`)
        }
      }

      // User is null after exchange (shouldn't happen, but handle gracefully)
      const destination = next || '/'
      return NextResponse.redirect(`${origin}${destination}`)
    }

    console.error('Auth callback - code exchange error:', error)
  }

  // If no code or exchange failed, redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
