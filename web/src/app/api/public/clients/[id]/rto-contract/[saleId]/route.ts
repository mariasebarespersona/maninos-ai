import { NextRequest, NextResponse } from 'next/server'

const API = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; saleId: string }> }
) {
  try {
    const { id, saleId } = await params
    const res = await fetch(
      `${API}/api/public/clients/${id}/rto-contract/${saleId}`,
      { cache: 'no-store' }
    )
    const data = await res.json()

    // Normalize FastAPI errors
    if (!res.ok && !('ok' in data)) {
      return NextResponse.json(
        { ok: false, error: data.detail || 'Error del servidor' },
        { status: res.status }
      )
    }

    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('Error proxying rto-contract:', error)
    return NextResponse.json({ ok: false, error: 'No se pudo conectar con el servidor' }, { status: 500 })
  }
}


