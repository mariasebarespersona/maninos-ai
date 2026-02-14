import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
const API = process.env.API_URL || 'http://localhost:8000'

export async function GET(request: NextRequest) {
  try {
    const qs = request.nextUrl.searchParams.toString()
    const res = await fetch(`${API}/api/accounting/export/transactions?${qs}`, { cache: 'no-store' })
    const csv = await res.text()
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': res.headers.get('Content-Disposition') || 'attachment; filename=transacciones.csv',
      },
    })
  } catch (e) {
    return NextResponse.json({ detail: 'API error' }, { status: 500 })
  }
}

