import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Mobile user-agent patterns
const MOBILE_UA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile/i

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  
  // Auto-redirect mobile devices visiting "/" to "/mobile"
  if (pathname === '/') {
    const ua = request.headers.get('user-agent') || ''
    if (MOBILE_UA.test(ua)) {
      const url = request.nextUrl.clone()
      url.pathname = '/mobile'
      return NextResponse.redirect(url)
    }
  }
  
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder assets
     * - sw.js (service worker)
     * - manifest.json (PWA manifest)
     */
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.json|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}


