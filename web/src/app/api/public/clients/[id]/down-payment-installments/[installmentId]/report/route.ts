import { NextRequest, NextResponse } from 'next/server'
import { getAuthHeaders } from '@/lib/api-auth'

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; installmentId: string }> }
) {
  try {
    const { id, installmentId } = await params
    const body = await request.json()
    const authHeaders = await getAuthHeaders()

    const res = await fetch(
      `${API_URL}/api/public/clients/${id}/down-payment-installments/${installmentId}/report`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(body),
        cache: 'no-store',
      }
    )

    const data = await res.json()

    if (!res.ok && !('ok' in data)) {
      return NextResponse.json(
        { ok: false, error: data.detail || 'Error del servidor' },
        { status: res.status }
      )
    }

    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('Error proxying dp installment report:', error)
    return NextResponse.json(
      { ok: false, error: 'No se pudo conectar con el servidor' },
      { status: 500 }
    )
  }
}
