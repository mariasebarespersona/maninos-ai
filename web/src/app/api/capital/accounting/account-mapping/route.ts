import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
const API = process.env.API_URL || 'http://localhost:8000'

export async function GET() {
  try {
    const res = await fetch(`${API}/api/capital/accounting/account-mapping`, { cache: 'no-store' })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    console.error('account-mapping proxy error', e)
    return NextResponse.json({ detail: 'API error' }, { status: 500 })
  }
}

