import { NextRequest, NextResponse } from 'next/server'

const API = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; saleId: string } }
) {
  try {
    const res = await fetch(
      `${API}/api/public/clients/${params.id}/rto-contract/${params.saleId}`,
      { cache: 'no-store' }
    )
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    return NextResponse.json({ ok: false, error: 'Backend unavailable' }, { status: 500 })
  }
}


