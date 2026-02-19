import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params

  try {
    // Forward the multipart form data directly to FastAPI backend
    // The backend handles Supabase Storage upload (has the service role key)
    const formData = await request.formData()

    const res = await fetch(`${API_URL}/api/public/clients/${clientId}/kyc-upload`, {
      method: 'POST',
      body: formData,
    })

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[KYC Upload Proxy] Backend responded ${res.status}:`, errorText)
      try {
        const errorData = JSON.parse(errorText)
        return NextResponse.json(
          { ok: false, error: errorData.detail || errorData.error || 'Error del servidor' },
          { status: res.status }
        )
      } catch {
        return NextResponse.json(
          { ok: false, error: `Error del servidor (${res.status})` },
          { status: res.status }
        )
      }
    }

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error: any) {
    console.error(`[KYC Upload Proxy] Error for client ${clientId}:`, error?.message || error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Error al subir documentos.' },
      { status: 500 }
    )
  }
}
