import { NextRequest, NextResponse } from 'next/server'

const API = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || 'http://localhost:8000'

// Acta de comité (PDF) de una propuesta de compra.
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const res = await fetch(`${API}/api/capital/purchase-proposals/${params.id}/acta`, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json(await res.json().catch(() => ({ ok: false })), { status: res.status })
    return new NextResponse(await res.arrayBuffer(), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': res.headers.get('content-disposition') || 'attachment; filename="acta.pdf"',
      },
    })
  } catch {
    return NextResponse.json({ ok: false, error: 'Backend unavailable' }, { status: 500 })
  }
}
