import { NextRequest, NextResponse } from 'next/server'

const API = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const res = await fetch(`${API}/api/public/clients/${id}/kyc-status`, { cache: 'no-store' })
    const data = await res.json()

    if (!res.ok && !('ok' in data)) {
      return NextResponse.json(
        { ok: false, error: data.detail || 'Error del servidor' },
        { status: res.status }
      )
    }

    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('Error proxying kyc-status:', error)
    return NextResponse.json({ ok: false, error: 'No se pudo conectar con el servidor' }, { status: 500 })
  }
}

