import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const API = process.env.API_URL || 'http://localhost:8000'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const res = await fetch(`${API}/api/accounting/transfers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    const text = await res.text()
    let data: any = { detail: text }
    try { data = JSON.parse(text) } catch { /* keep text */ }
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    console.error('transfers proxy error', e)
    return NextResponse.json({ detail: `Proxy error: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 })
  }
}
