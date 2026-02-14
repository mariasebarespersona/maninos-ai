import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
const API = process.env.API_URL || 'http://localhost:8000'

export async function GET(request: NextRequest) {
  try {
    const qs = request.nextUrl.searchParams.toString()
    const res = await fetch(`${API}/api/accounting/reports/income-statement/export-csv?${qs}`, { cache: 'no-store' })
    if (!res.ok) {
      const data = await res.json()
      return NextResponse.json(data, { status: res.status })
    }
    const csvText = await res.text()
    return new NextResponse(csvText, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': res.headers.get('Content-Disposition') || 'attachment; filename="PnL_export.csv"',
      },
    })
  } catch (e) {
    return NextResponse.json({ detail: 'API error' }, { status: 500 })
  }
}

