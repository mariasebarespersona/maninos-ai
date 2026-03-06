import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || 'http://localhost:8000'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const res = await fetch(`${API_URL}/api/transfers/title-monitor`, { cache: 'no-store' })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('Error proxying title-monitor:', error)
    return NextResponse.json({ detail: 'API connection error' }, { status: 500 })
  }
}

export async function POST() {
  try {
    const res = await fetch(`${API_URL}/api/transfers/title-monitor/populate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('Error proxying title-monitor populate:', error)
    return NextResponse.json({ detail: 'API connection error' }, { status: 500 })
  }
}
