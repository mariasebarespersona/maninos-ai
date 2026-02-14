import { NextResponse } from 'next/server'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const endpoint = searchParams.get('endpoint') || 'summary'
  
  try {
    const res = await fetch(`${API}/api/capital/dashboard/${endpoint}`, {
      cache: 'no-store',
    })
    const data = await res.json()
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json({ ok: false, error: 'Backend unavailable' }, { status: 500 })
  }
}


