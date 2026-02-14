import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function POST(request: NextRequest) {
  try {
    // Voice endpoint expects FormData with audio file
    const formData = await request.formData()
    
    const res = await fetch(`${BACKEND_URL}/api/ai/voice`, {
      method: 'POST',
      body: formData,
      cache: 'no-store',
    })
    
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('[API Proxy] /api/ai/voice error:', error)
    return NextResponse.json(
      { error: 'Backend connection error' },
      { status: 500 }
    )
  }
}

