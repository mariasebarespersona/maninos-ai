import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
const API = process.env.API_URL || 'http://localhost:8000'

export async function GET(request: NextRequest) {
  try {
    const qs = request.nextUrl.searchParams.toString()
    const res = await fetch(`${API}/api/accounting/transactions?${qs}`, { cache: 'no-store' })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ detail: 'API error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const res = await fetch(`${API}/api/accounting/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ detail: 'API error' }, { status: 500 })
  }
}

