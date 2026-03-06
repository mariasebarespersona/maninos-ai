import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const API = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || 'http://localhost:8000'

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const city = searchParams.get('city') || 'Houston'
    const min_price = searchParams.get('min_price') || '5000'
    const max_price = searchParams.get('max_price') || '80000'

    const params = new URLSearchParams({ city, min_price, max_price })
    const res = await fetch(`${API}/api/market-listings/scrape?${params}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    console.error('scrape proxy error', e)
    return NextResponse.json({ success: false, error: 'API error' }, { status: 500 })
  }
}
