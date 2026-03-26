import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const API_URL = process.env.API_URL || 'http://localhost:8000'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const res = await fetch(`${API_URL}/api/properties/${id}/post-renovation-price`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    return NextResponse.json({ detail: 'API connection error' }, { status: 500 })
  }
}
