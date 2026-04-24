import { NextResponse } from 'next/server'

const API_URL = process.env.API_URL || 'http://localhost:8000'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST() {
  try {
    const res = await fetch(`${API_URL}/api/transfers/title-monitor/trigger`, {
      method: 'POST',
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('Error proxying title-monitor/trigger:', error)
    return NextResponse.json({ detail: 'API connection error' }, { status: 500 })
  }
}
