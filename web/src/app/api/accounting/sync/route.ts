import { NextRequest, NextResponse } from 'next/server'
const API = process.env.API_URL || 'http://localhost:8000'

export async function POST() {
  try {
    const res = await fetch(`${API}/api/accounting/sync`, { method: 'POST' })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ detail: 'API error' }, { status: 500 })
  }
}

