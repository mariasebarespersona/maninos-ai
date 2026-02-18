import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.API_URL || 'http://localhost:8000'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const url = new URL(`${API_URL}/api/public/properties/partners`)
    
    // Forward all query params
    searchParams.forEach((value, key) => {
      url.searchParams.set(key, value)
    })
    
    const res = await fetch(url.toString(), { cache: 'no-store' })
    const data = await res.json()
    
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('Error proxying to API:', error)
    return NextResponse.json({ ok: false, error: 'API connection error', properties: [] }, { status: 500 })
  }
}

