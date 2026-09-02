import { NextRequest, NextResponse } from 'next/server'

const API = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || 'http://localhost:8000'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const res = await fetch(
      `${API}/api/capital/financed-houses/${params.id}/valuation`,
      { cache: 'no-store' }
    )
    return NextResponse.json(await res.json(), { status: res.status })
  } catch {
    return NextResponse.json({ ok: false, error: 'Backend unavailable' }, { status: 500 })
  }
}
