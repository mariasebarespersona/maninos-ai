import { NextRequest, NextResponse } from 'next/server'

const API = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || 'http://localhost:8000'

// Evaluar precio vs. mercado de una casa financiada (GET), y su valor de
// mercado manual: guardar (PUT) o quitar (DELETE).
async function forward(method: string, id: string, body?: string) {
  try {
    const res = await fetch(`${API}/api/capital/financed-houses/${id}/price-evaluation`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body,
      cache: 'no-store',
    })
    return NextResponse.json(await res.json(), { status: res.status })
  } catch {
    return NextResponse.json({ ok: false, error: 'Backend unavailable' }, { status: 500 })
  }
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  return forward('GET', params.id)
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  return forward('PUT', params.id, JSON.stringify(await request.json()))
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  return forward('DELETE', params.id)
}
