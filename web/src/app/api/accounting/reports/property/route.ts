import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
const API = process.env.API_URL || 'http://localhost:8000'

export async function GET(request: NextRequest) {
  try {
    const pid = request.nextUrl.searchParams.get('property_id')
    if (!pid) return NextResponse.json({ detail: 'property_id required' }, { status: 400 })
    const res = await fetch(`${API}/api/accounting/reports/property/${pid}`, { cache: 'no-store' })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ detail: 'API error' }, { status: 500 })
  }
}

