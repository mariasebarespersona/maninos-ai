import { NextRequest, NextResponse } from 'next/server'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const params = new URLSearchParams()
  searchParams.forEach((v, k) => params.set(k, v))
  const qs = params.toString() ? `?${params.toString()}` : ''
  const res = await fetch(`${API}/api/capital/reports/unified-summary${qs}`, { cache: 'no-store' })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}

