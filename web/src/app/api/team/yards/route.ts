import { NextResponse } from 'next/server'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// Las CLASES contables (patios): Houston, Conroe. Se usan para etiquetar
// facturas y asientos y poder separar los estados financieros por patio.
export async function GET() {
  try {
    const res = await fetch(`${API}/api/team/yards`, { cache: 'no-store' })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ ok: false, yards: [] }, { status: 500 })
  }
}
