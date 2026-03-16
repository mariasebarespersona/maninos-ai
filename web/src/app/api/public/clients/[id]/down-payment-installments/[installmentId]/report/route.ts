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
    const token = request.cookies.get('client_token')?.value || request.headers.get('authorization')?.replace('Bearer ', '')
    const res = await fetch(`${API}/api/public/clients/${id}/down-payment-installments/${installmentId}/report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    console.error('dp installment report proxy error', e)
    return NextResponse.json({ detail: 'API error' }, { status: 500 })
  }
}
