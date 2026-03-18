import { NextResponse } from 'next/server'

const API = process.env.API_URL || 'http://localhost:8000'

export async function GET() {
  try {
    const res = await fetch(`${API}/api/moves/providers/list`, { cache: 'no-store' })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ ok: false, error: 'Backend unavailable' }, { status: 500 })
  }
}
