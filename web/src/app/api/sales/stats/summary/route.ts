import { NextResponse } from 'next/server'

const API_URL = process.env.API_URL || 'http://localhost:8000'

export const dynamic = 'force-dynamic'

export async function GET() {
  console.log('[Sales Stats] Fetching from:', `${API_URL}/api/sales/stats/summary`)
  try {
    const res = await fetch(`${API_URL}/api/sales/stats/summary`, {
      cache: 'no-store',
    })
    const data = await res.json()
    console.log('[Sales Stats] Response:', data)
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('[Sales Stats] Error:', error)
    return NextResponse.json({ 
      total_sales: 0, total_revenue: 0, pending: 0, paid: 0, 
      completed: 0, cancelled: 0, contado: 0, rto: 0,
      sold_before_renovation: 0, sold_after_renovation: 0
    }, { status: 200 })
  }
}

