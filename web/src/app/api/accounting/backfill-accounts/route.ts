import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
const API = process.env.API_URL || 'http://localhost:8000'

export async function POST(request: NextRequest) {
  try {
    const res = await fetch(`${API}/api/accounting/backfill-accounts`, {
      method: 'POST',
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    console.error('homes backfill-accounts proxy error', e)
    return NextResponse.json({ detail: 'API error' }, { status: 500 })
  }
}

