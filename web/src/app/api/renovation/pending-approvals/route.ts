import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const API_URL = process.env.API_URL || 'http://localhost:8000'

export async function GET(request: NextRequest) {
  try {
    const res = await fetch(`${API_URL}/api/renovation/pending-approvals`, { cache: 'no-store' })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('Error proxying renovation/pending-approvals:', error)
    return NextResponse.json({ detail: 'API connection error' }, { status: 500 })
  }
}
