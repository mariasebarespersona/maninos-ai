import { NextRequest, NextResponse } from 'next/server'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const res = await fetch(`${API}/api/evaluations/${params.id}`, { cache: 'no-store' })
  return NextResponse.json(await res.json(), { status: res.status })
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json()
  const res = await fetch(`${API}/api/evaluations/${params.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return NextResponse.json(await res.json(), { status: res.status })
}

export const dynamic = 'force-dynamic'

