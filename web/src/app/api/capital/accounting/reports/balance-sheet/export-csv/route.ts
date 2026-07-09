import { NextRequest, NextResponse } from 'next/server'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : ''
    const res = await fetch(`${API}/api/capital/accounting/reports/balance-sheet/export-csv${qs}`, { cache: 'no-store' })
    return new Response(res.body, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('Content-Type') || 'text/csv',
        'Content-Disposition': res.headers.get('Content-Disposition') || 'attachment; filename=balance_general_capital.csv',
      },
    })
  } catch {
    return NextResponse.json({ ok: false, error: 'Backend unavailable' }, { status: 500 })
  }
}
