import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
const API = process.env.API_URL || 'http://localhost:8000'

export async function GET(request: NextRequest) {
  try {
    const qs = request.nextUrl.searchParams.toString()
    const res = await fetch(`${API}/api/accounting/bank-statements?${qs}`, { cache: 'no-store' })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    console.error('bank-statements proxy error', e)
    return NextResponse.json({ detail: 'API error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const res = await fetch(`${API}/api/accounting/bank-statements/upload`, {
      method: 'POST',
      body: formData,
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    console.error('bank-statements upload proxy error', e)
    return NextResponse.json({ detail: 'API error' }, { status: 500 })
  }
}

