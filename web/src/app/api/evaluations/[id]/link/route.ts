import { NextRequest, NextResponse } from 'next/server'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json()
  const res = await fetch(`${API}/api/evaluations/${params.id}/link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return NextResponse.json(await res.json(), { status: res.status })
}

export const dynamic = 'force-dynamic'

