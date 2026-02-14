import { NextRequest, NextResponse } from 'next/server'
const API = process.env.API_URL || 'http://localhost:8000'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json()
    const res = await fetch(`${API}/api/accounting/transactions/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ detail: 'API error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const res = await fetch(`${API}/api/accounting/transactions/${params.id}`, { method: 'DELETE' })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ detail: 'API error' }, { status: 500 })
  }
}

