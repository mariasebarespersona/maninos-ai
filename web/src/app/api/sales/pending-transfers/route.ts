import { NextResponse } from 'next/server'

const API_URL = process.env.API_URL || 'http://localhost:8000'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const res = await fetch(`${API_URL}/api/sales/pending-transfers`, {
      cache: 'no-store',
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('Error proxying to API:', error)
    return NextResponse.json({ ok: false, transfers: [] }, { status: 500 })
  }
}
