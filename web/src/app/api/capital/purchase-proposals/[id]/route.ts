import { NextRequest, NextResponse } from 'next/server'

const API = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || 'http://localhost:8000'

// Aprobar / rechazar (PATCH) o borrar (DELETE) una propuesta de compra.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const res = await fetch(`${API}/api/capital/purchase-proposals/${params.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(await request.json()), cache: 'no-store',
    })
    return NextResponse.json(await res.json(), { status: res.status })
  } catch {
    return NextResponse.json({ ok: false, error: 'Backend unavailable' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const res = await fetch(`${API}/api/capital/purchase-proposals/${params.id}`, { method: 'DELETE', cache: 'no-store' })
    return NextResponse.json(await res.json(), { status: res.status })
  } catch {
    return NextResponse.json({ ok: false, error: 'Backend unavailable' }, { status: 500 })
  }
}
