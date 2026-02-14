import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.API_URL || 'http://localhost:8000'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ propertyId: string }> }
) {
  const { propertyId } = await params
  try {
    const res = await fetch(
      `${API_URL}/api/renovation/${propertyId}/historical-comparison`,
      { cache: 'no-store' }
    )
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('Error proxying renovation historical-comparison:', error)
    return NextResponse.json({ detail: 'API connection error' }, { status: 500 })
  }
}

