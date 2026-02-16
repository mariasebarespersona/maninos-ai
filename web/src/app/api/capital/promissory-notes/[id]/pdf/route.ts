import { NextRequest, NextResponse } from 'next/server'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const res = await fetch(
      `${API}/api/capital/promissory-notes/${params.id}/pdf`,
      { cache: 'no-store' }
    )
    
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Error' }))
      return NextResponse.json(data, { status: res.status })
    }
    
    const blob = await res.blob()
    const buffer = Buffer.from(await blob.arrayBuffer())
    
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': res.headers.get('Content-Disposition') || 'attachment; filename="promissory_note.pdf"',
      },
    })
  } catch (error) {
    return NextResponse.json({ ok: false, error: 'Backend unavailable' }, { status: 500 })
  }
}

