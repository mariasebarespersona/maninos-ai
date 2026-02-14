import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.API_URL || 'http://localhost:8000'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  
  try {
    const url = new URL(`${API_URL}/api/clients`)
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
    
    const res = await fetch(`${API_URL}/api/clients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('Error proxying to API:', error)
    return NextResponse.json({ detail: 'API connection error' }, { status: 500 })
  }
}
