import { NextRequest, NextResponse } from 'next/server'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const res = await fetch(`${API}/api/capital/reports/${params.id}/pdf`, { cache: 'no-store' })
    if (!res.ok) {
      const err = await res.json()
      return NextResponse.json(err, { status: res.status })
    }
    const blob = await res.blob()
    const headers = new Headers()
    headers.set('Content-Type', 'application/pdf')
    headers.set('Content-Disposition', res.headers.get('Content-Disposition') || `attachment; filename=Report.pdf`)
    return new NextResponse(blob, { status: 200, headers })
  } catch (error) {
    return NextResponse.json({ ok: false, error: 'Backend unavailable' }, { status: 500 })
  }
}


