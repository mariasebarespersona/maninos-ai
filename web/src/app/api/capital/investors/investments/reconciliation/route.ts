import { NextResponse } from 'next/server'

const API = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || 'http://localhost:8000'

// Conciliación de inversiones (principal vs. 23900), solo lectura.
export async function GET() {
  try {
    const res = await fetch(`${API}/api/capital/investors/investments/reconciliation`, { cache: 'no-store' })
    return NextResponse.json(await res.json(), { status: res.status })
  } catch {
    return NextResponse.json({ ok: false, error: 'Backend unavailable' }, { status: 500 })
  }
}
