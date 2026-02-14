import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.API_URL || 'http://localhost:8000'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const url = new URL(`${API_URL}/api/sales/commissions/report`)
    searchParams.forEach((value, key) => {
      url.searchParams.set(key, value)
    })

    const res = await fetch(url.toString(), { cache: 'no-store' })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('Error proxying commission report:', error)
    return NextResponse.json(
      { month: 0, year: 0, total_sales: 0, total_commission: 0, employees: [] },
      { status: 500 }
    )
  }
}

