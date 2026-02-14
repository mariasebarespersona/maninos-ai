import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const type = url.searchParams.get('type') || 'all'
    
    const endpoint = type === 'all' 
      ? '/api/portal-links/sync-all'
      : `/api/portal-links/sync/${type}`
    
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      cache: 'no-store',
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}


