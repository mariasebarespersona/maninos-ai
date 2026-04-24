import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.API_URL || 'http://localhost:8000'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const limit = request.nextUrl.searchParams.get('limit') || '10'
    const res = await fetch(
      `${API_URL}/api/transfers/title-monitor/runs?limit=${encodeURIComponent(limit)}`,
      { cache: 'no-store' }
    )
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('Error proxying title-monitor/runs:', error)
    return NextResponse.json({ detail: 'API connection error' }, { status: 500 })
  }
}
