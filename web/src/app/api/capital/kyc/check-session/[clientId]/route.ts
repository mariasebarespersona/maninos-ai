import { NextRequest, NextResponse } from 'next/server'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function POST(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  try {
    const res = await fetch(`${API}/api/capital/kyc/check-session/${params.clientId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    return NextResponse.json({ ok: false, error: 'Backend unavailable' }, { status: 500 })
  }
}


