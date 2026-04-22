import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes — AI classification can take 2+ min
const API = process.env.API_URL || 'http://localhost:8000'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const res = await fetch(`${API}/api/accounting/bank-statements/${id}/classify`, {
      method: 'POST',
      signal: AbortSignal.timeout(280000), // 280s timeout
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    console.error('bank-statements classify proxy error', e)
    return NextResponse.json({ detail: 'API timeout o error — la clasificación puede tardar. Reintenta.' }, { status: 500 })
  }
}

