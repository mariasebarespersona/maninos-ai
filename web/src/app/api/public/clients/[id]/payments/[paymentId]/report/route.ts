import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  try {
    const { id: clientId, paymentId } = await params
    const body = await request.json()

    const res = await fetch(
      `${API_URL}/api/public/clients/${clientId}/payments/${paymentId}/report`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
      }
    )

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('Error proxying payment report:', error)
    return NextResponse.json(
      { ok: false, error: 'Error de conexión con el servidor' },
      { status: 500 }
    )
  }
}

