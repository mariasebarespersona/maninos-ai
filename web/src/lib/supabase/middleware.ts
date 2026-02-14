import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { CookieOptions } from '@supabase/ssr'

type CookieToSet = {
  name: string
  value: string
  options: CookieOptions
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // ─── Client Portal Routes ─────────────────────────────────
  // Protected client routes: /clientes/mi-cuenta/*
  // These require Supabase Auth (magic link login)
  const isClientProtectedRoute = pathname.startsWith('/clientes/mi-cuenta')

  if (isClientProtectedRoute && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/clientes/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  // If client is authenticated and visits login page, redirect to mi-cuenta
  if (pathname === '/clientes/login' && user) {
    // Only redirect if the user has a client record (check by email domain pattern)
    // For now, we redirect all authenticated users visiting client login
    const url = request.nextUrl.clone()
    url.pathname = '/clientes/mi-cuenta'
    return NextResponse.redirect(url)
  }

  // Public client routes (no auth required):
  // /clientes, /clientes/casas, /clientes/comprar, /clientes/auth/callback
  const isPublicClientRoute = pathname.startsWith('/clientes') && !isClientProtectedRoute && pathname !== '/clientes/login'

  // ─── Employee/Admin Portal Routes ─────────────────────────
  // Public admin routes that don't require authentication
  const publicAdminRoutes = ['/login', '/auth/callback', '/api/']
  const isPublicAdminRoute = publicAdminRoutes.some(route => 
    pathname.startsWith(route)
  ) || pathname === '/'

  // All /clientes routes are handled above, don't apply admin auth rules
  const isClientRoute = pathname.startsWith('/clientes')

  // If user is not logged in and trying to access a protected admin route
  if (!user && !isPublicAdminRoute && !isClientRoute && !isPublicClientRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(url)
  }

  // If admin user is logged in and trying to access admin login page, redirect to homes
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone()
    const redirectTo = request.nextUrl.searchParams.get('redirectTo')
    url.pathname = redirectTo || '/homes'
    url.searchParams.delete('redirectTo')
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
