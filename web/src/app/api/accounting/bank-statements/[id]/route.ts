import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
const API = process.env.API_URL || 'http://localhost:8000'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const res = await fetch(`${API}/api/accounting/bank-statements/${id}`, { cache: 'no-store' })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    console.error('bank-statements/[id] proxy error', e)
    return NextResponse.json({ detail: 'API error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const res = await fetch(`${API}/api/accounting/bank-statements/${id}`, {
      method: 'DELETE',
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    console.error('bank-statements/[id] delete proxy error', e)
    return NextResponse.json({ detail: 'API error' }, { status: 500 })
  }
}

