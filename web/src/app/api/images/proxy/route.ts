import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 })

  // Only allow Supabase storage URLs
  if (!url.includes('supabase.co/storage/')) {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 403 })
  }

  try {
    const response = await fetch(url)
    if (!response.ok) {
      return NextResponse.json({ error: 'Fetch failed' }, { status: response.status })
    }

    const buffer = await response.arrayBuffer()
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Proxy error' }, { status: 500 })
  }
}
