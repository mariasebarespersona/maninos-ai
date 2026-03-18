import { NextRequest, NextResponse } from 'next/server'

const API = process.env.API_URL || 'http://localhost:8000'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const params = searchParams.toString()
    const res = await fetch(`${API}/api/moves/providers/sms-url?${params}`, { cache: 'no-store' })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ ok: false, error: 'Backend unavailable' }, { status: 500 })
  }
}
