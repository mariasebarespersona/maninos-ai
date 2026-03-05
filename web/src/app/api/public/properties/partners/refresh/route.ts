import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function POST() {
  try {
    const res = await fetch(`${API_URL}/api/public/properties/partners/refresh`, {
      method: 'POST',
      cache: 'no-store',
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('Error proxying partner refresh:', error)
    return NextResponse.json({ ok: false, error: 'API connection error' }, { status: 500 })
  }
}

