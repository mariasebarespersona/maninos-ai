import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ installmentId: string }> }
) {
  try {
    const { installmentId } = await params
    const res = await fetch(`${API}/api/capital/payments/down-payment/${installmentId}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    console.error('dp confirm proxy error', e)
    return NextResponse.json({ detail: 'API error' }, { status: 500 })
  }
}
