import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
const API = process.env.API_URL || 'http://localhost:8000'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ movementId: string }> }
) {
  try {
    const { movementId } = await params
    const body = await request.json()
    const res = await fetch(`${API}/api/accounting/bank-statements/movements/${movementId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    console.error('movements/[id] patch proxy error', e)
    return NextResponse.json({ detail: 'API error' }, { status: 500 })
  }
}

