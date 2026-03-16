import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; installmentId: string }> }
) {
  try {
    const { id, installmentId } = await params
    const body = await request.json()
    const res = await fetch(`${API}/api/capital/contracts/${id}/down-payment/installments/${installmentId}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    console.error('installment pay proxy error', e)
    return NextResponse.json({ detail: 'API error' }, { status: 500 })
  }
}
