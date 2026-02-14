import { NextRequest, NextResponse } from 'next/server'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams.toString()
  const res = await fetch(`${API}/api/evaluations${params ? `?${params}` : ''}`, { cache: 'no-store' })
  return NextResponse.json(await res.json(), { status: res.status })
}

export async function POST() {
  const res = await fetch(`${API}/api/evaluations`, { method: 'POST' })
  return NextResponse.json(await res.json(), { status: res.status })
}

export const dynamic = 'force-dynamic'

