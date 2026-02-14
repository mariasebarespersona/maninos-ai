import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.API_URL || 'http://localhost:8000'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ propertyId: string }> }
) {
  try {
    const { propertyId } = await params
    const res = await fetch(`${API_URL}/api/transfers/property/${propertyId}`, { 
      cache: 'no-store' 
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('Error proxying to API:', error)
    return NextResponse.json({ detail: 'API connection error' }, { status: 500 })
  }
}


