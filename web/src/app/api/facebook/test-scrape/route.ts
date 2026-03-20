import { NextResponse } from 'next/server'
const API_URL = process.env.API_URL || 'http://localhost:8000'

export async function POST() {
  try {
    const res = await fetch(`${API_URL}/api/facebook/test-scrape`, { method: 'POST' })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch { return NextResponse.json({ detail: 'API unavailable' }, { status: 500 }) }
}
