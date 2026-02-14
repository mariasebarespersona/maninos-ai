import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.API_URL || 'http://localhost:8000'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const res = await fetch(`${API_URL}/api/public/properties/${id}`, { 
      cache: 'no-store' 
    })
    const data = await res.json()
    
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('Error proxying to API:', error)
    return NextResponse.json({ ok: false, error: 'API connection error' }, { status: 500 })
  }
}


