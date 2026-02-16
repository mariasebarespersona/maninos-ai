import { NextRequest, NextResponse } from 'next/server'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const params = new URLSearchParams()
    if (searchParams.get('period')) params.set('period', searchParams.get('period')!)
    if (searchParams.get('year')) params.set('year', searchParams.get('year')!)
    if (searchParams.get('month')) params.set('month', searchParams.get('month')!)
    const qs = params.toString() ? `?${params.toString()}` : ''
    const res = await fetch(`${API}/api/capital/accounting/dashboard${qs}`, { cache: 'no-store' })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    return NextResponse.json({ ok: false, error: 'Backend unavailable' }, { status: 500 })
  }
}

