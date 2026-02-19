import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
const API = process.env.API_URL || 'http://localhost:8000'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const res = await fetch(`${API}/api/accounting/accounts/reset-balances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    console.error('homes reset-balances proxy error', e)
    return NextResponse.json({ detail: 'API error' }, { status: 500 })
  }
}

