import { NextRequest, NextResponse } from 'next/server'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const res = await fetch(
      `${API}/api/capital/contracts/${params.id}/pdf`,
      { cache: 'no-store' }
    )

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ detail: 'Error generating PDF' }))
      return NextResponse.json(
        { ok: false, error: errorData.detail || 'Error generating PDF' },
        { status: res.status }
      )
    }

    const pdfBuffer = await res.arrayBuffer()
    const contentDisposition = res.headers.get('content-disposition') || 
      `attachment; filename="RTO_Contract_${params.id.slice(0, 8)}.pdf"`

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': contentDisposition,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: 'Backend unavailable' },
      { status: 500 }
    )
  }
}


