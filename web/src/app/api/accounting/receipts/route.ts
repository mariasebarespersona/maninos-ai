import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
const API = process.env.API_URL || 'http://localhost:8000'

export async function GET() {
  try {
    const res = await fetch(`${API}/api/accounting/receipts`, { cache: 'no-store' })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    console.error('receipts proxy error', e)
    return NextResponse.json({ detail: 'API error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const res = await fetch(`${API}/api/accounting/receipts`, {
      method: 'POST',
      body: formData,
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    console.error('receipts upload proxy error', e)
    return NextResponse.json({ detail: 'API error' }, { status: 500 })
  }
}
