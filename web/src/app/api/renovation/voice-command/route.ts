import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const API_URL = process.env.API_URL || 'http://localhost:8000'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const res = await fetch(`${API_URL}/api/renovation/voice-command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('Error proxying renovation/voice-command:', error)
    return NextResponse.json({ detail: 'API connection error' }, { status: 500 })
  }
}
