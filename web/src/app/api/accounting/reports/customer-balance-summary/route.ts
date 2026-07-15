import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
const API = process.env.API_URL || 'http://localhost:8000'

export async function GET(request: NextRequest) {
  try {
    const res = await fetch(`${API}/api/accounting/reports/customer-balance-summary${request.nextUrl.search || ''}`, { cache: 'no-store' })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ detail: 'API error' }, { status: 500 })
  }
}
