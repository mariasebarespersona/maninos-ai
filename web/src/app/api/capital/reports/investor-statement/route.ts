import { NextRequest, NextResponse } from 'next/server'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const body = await request.json()
    const investor_id = body.investor_id
    const month = body.month || ''
    const year = body.year || ''
    
    let url = `${API}/api/capital/reports/investor-statement?investor_id=${investor_id}`
    if (month) url += `&month=${month}`
    if (year) url += `&year=${year}`
    
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    return NextResponse.json({ ok: false, error: 'Backend unavailable' }, { status: 500 })
  }
}

