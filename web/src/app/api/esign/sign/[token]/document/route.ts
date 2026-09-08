import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// El PDF que se está firmando. Va protegido por el token de firma, así que esta
// ruta es pública a propósito: quien tiene el enlace es quien debe firmarlo.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const res = await fetch(`${API_URL}/api/esign/sign/${token}/document`, { cache: 'no-store' })
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: 'Documento no disponible' }, { status: res.status })
    }
    return new NextResponse(await res.arrayBuffer(), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        // inline: se abre en el navegador para leerlo antes de firmar, en vez
        // de descargarse a ciegas.
        'Content-Disposition': 'inline; filename="promissory-note.pdf"',
      },
    })
  } catch {
    return NextResponse.json({ ok: false, error: 'Backend unavailable' }, { status: 500 })
  }
}
