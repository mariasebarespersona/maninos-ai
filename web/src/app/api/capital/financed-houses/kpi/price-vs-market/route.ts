import { NextResponse } from 'next/server'

const API = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || 'http://localhost:8000'

// KPI de cartera: precio promedio ≤ 70% del valor de mercado, y veredicto por casa.
export async function GET() {
  try {
    const res = await fetch(`${API}/api/capital/financed-houses/kpi/price-vs-market`, { cache: 'no-store' })
    return NextResponse.json(await res.json(), { status: res.status })
  } catch {
    return NextResponse.json({ ok: false, error: 'Backend unavailable' }, { status: 500 })
  }
}
