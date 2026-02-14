import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.API_URL || 'http://localhost:8000'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  
  try {
    const url = new URL(`${API_URL}/api/properties`)
    if (status) url.searchParams.set('status', status)
    
    const res = await fetch(url.toString(), { cache: 'no-store' })
    const data = await res.json()
    
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('Error proxying to API:', error)
    return NextResponse.json([], { status: 200 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    console.log('[Properties POST] Sending to backend:', body)
    
    const res = await fetch(`${API_URL}/api/properties`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    
    const text = await res.text()
    console.log('[Properties POST] Backend response status:', res.status)
    console.log('[Properties POST] Backend response text:', text.substring(0, 200))
    
    // Try to parse as JSON
    let data
    try {
      data = JSON.parse(text)
    } catch {
      console.error('[Properties POST] Failed to parse JSON:', text)
      return NextResponse.json({ detail: text || 'Backend error' }, { status: res.status })
    }
    
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('[Properties POST] Error proxying to API:', error)
    return NextResponse.json({ detail: 'API connection error - backend may be down' }, { status: 500 })
  }
}
