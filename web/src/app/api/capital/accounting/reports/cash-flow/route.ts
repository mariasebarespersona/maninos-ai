import { NextRequest, NextResponse } from 'next/server'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const params = new URLSearchParams()
    if (searchParams.get('start_date')) params.set('start_date', searchParams.get('start_date')!)
    if (searchParams.get('end_date')) params.set('end_date', searchParams.get('end_date')!)
    const qs = params.toString() ? `?${params.toString()}` : ''
    const res = await fetch(`${API}/api/capital/accounting/reports/cash-flow${qs}`, { cache: 'no-store' })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    return NextResponse.json({ ok: false, error: 'Backend unavailable' }, { status: 500 })
  }
}

