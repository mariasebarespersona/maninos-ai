import { NextRequest, NextResponse } from 'next/server'

const API = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || 'http://localhost:8000'

// Propuestas de compra de Capital: listar (GET) y guardar (POST).
export async function GET(request: NextRequest) {
  try {
    const qs = new URL(request.url).search
    const res = await fetch(`${API}/api/capital/purchase-proposals${qs}`, { cache: 'no-store' })
    return NextResponse.json(await res.json(), { status: res.status })
  } catch {
    return NextResponse.json({ ok: false, error: 'Backend unavailable' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const res = await fetch(`${API}/api/capital/purchase-proposals`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(await request.json()), cache: 'no-store',
    })
    return NextResponse.json(await res.json(), { status: res.status })
  } catch {
    return NextResponse.json({ ok: false, error: 'Backend unavailable' }, { status: 500 })
  }
}
