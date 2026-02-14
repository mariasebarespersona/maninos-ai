import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const API_URL = process.env.API_URL || 'http://localhost:8000'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ propertyId: string }> }) {
  try {
    const { propertyId } = await params
    const res = await fetch(`${API_URL}/api/moves/property/${propertyId}`, { cache: 'no-store' })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ detail: 'API connection error' }, { status: 500 })
  }
}

