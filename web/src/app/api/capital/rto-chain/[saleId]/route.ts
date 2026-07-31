import { NextRequest, NextResponse } from 'next/server'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ saleId: string }> }) {
  const { saleId } = await params
  try {
    const res = await fetch(`${API}/api/capital/rto-chain/${saleId}`, { method: 'DELETE' })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    return NextResponse.json({ ok: false, error: 'Backend unavailable' }, { status: 500 })
  }
}
