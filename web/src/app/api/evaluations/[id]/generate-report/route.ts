import { NextRequest, NextResponse } from 'next/server'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const res = await fetch(`${API}/api/evaluations/${params.id}/generate-report`, { method: 'POST' })
  return NextResponse.json(await res.json(), { status: res.status })
}

export const dynamic = 'force-dynamic'

