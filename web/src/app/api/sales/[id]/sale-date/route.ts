import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.API_URL || 'http://localhost:8000'

export const dynamic = 'force-dynamic'

// Cambiar la fecha de una venta ya registrada (re-fecha lo que devengó).
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const res = await fetch(`${API_URL}/api/sales/${params.id}/sale-date`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(await request.json()),
      cache: 'no-store',
    })
    return NextResponse.json(await res.json(), { status: res.status })
  } catch {
    return NextResponse.json({ ok: false, error: 'Backend unavailable' }, { status: 500 })
  }
}
