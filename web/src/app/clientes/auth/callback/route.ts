import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Client Portal Auth Callback Route Handler (server-side)
 * 
 * Supabase email links for the CLIENT portal redirect here.
 * We exchange the code for a session server-side, set the auth cookies,
 * and redirect the user to their client dashboard.
 * 
 * This MUST be a Route Handler (not a page) because the PKCE code exchange
 * requires server-side execution to properly set httpOnly cookies.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const type = searchParams.get('type')
  const next = searchParams.get('next') || '/clientes/mi-cuenta'
  
  if (code) {
    const cookieStore = await cookies()
    
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {
              // The `setAll` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing sessions.
            }
          },
        },
      }
    )
    
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      // Password recovery → redirect to client password reset page
      if (type === 'recovery') {
        const forwardedHost = request.headers.get('x-forwarded-host')
        const dest = '/clientes/crear-contrasena'
        if (forwardedHost) {
          return NextResponse.redirect(`https://${forwardedHost}${dest}`)
        }
        return NextResponse.redirect(`${origin}${dest}`)
      }

      // Success — redirect to the client dashboard (or wherever 'next' points)
      // Ensure we always stay in the client portal
      const destination = next.startsWith('/clientes') ? next : '/clientes/mi-cuenta'
      
      const forwardedHost = request.headers.get('x-forwarded-host')
      const isLocalEnv = process.env.NODE_ENV === 'development'
      
      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${destination}`)
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${destination}`)
      } else {
        return NextResponse.redirect(`${origin}${destination}`)
      }
    }
    
    console.error('Client auth callback - code exchange error:', error)
  }
  
  // If no code or exchange failed, redirect to CLIENT login with error
  return NextResponse.redirect(
    `${origin}/clientes/login?error=auth_callback_failed`
  )
}
