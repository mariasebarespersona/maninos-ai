import { NextRequest, NextResponse } from 'next/server'

const API = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || 'http://localhost:8000'

// Buscar casas de la app para ligarlas a una propuesta de compra.
export async function GET(request: NextRequest) {
  try {
    const qs = new URL(request.url).search
    const res = await fetch(`${API}/api/capital/purchase-proposals/properties-search${qs}`, { cache: 'no-store' })
    return NextResponse.json(await res.json(), { status: res.status })
  } catch {
    return NextResponse.json({ ok: false, error: 'Backend unavailable' }, { status: 500 })
  }
}
