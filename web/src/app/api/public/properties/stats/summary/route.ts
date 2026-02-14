import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.API_URL || 'http://localhost:8000'

export async function GET() {
  try {
    const res = await fetch(`${API_URL}/api/public/properties/stats/summary`, { 
      cache: 'no-store' 
    })
    const data = await res.json()
    
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('Error proxying to API:', error)
    return NextResponse.json({ ok: false, error: 'API connection error' }, { status: 500 })
  }
}


