import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.API_URL || 'http://localhost:8000'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ propertyId: string }> }
) {
  const { propertyId } = await params
  try {
    const body = await request.json()
    const res = await fetch(`${API_URL}/api/renovation/${propertyId}/approve`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('Error proxying renovation approve:', error)
    return NextResponse.json({ detail: 'API connection error' }, { status: 500 })
  }
}
