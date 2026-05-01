import { NextRequest, NextResponse } from 'next/server'

const API = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const formData = await request.formData()
    const res = await fetch(`${API}/api/evaluations/${id}/analyze-photos`, {
      method: 'POST',
      body: formData,
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error: any) {
    console.error('[analyze-photos proxy] Error:', error?.message || error)
    return NextResponse.json(
      { detail: `Error conectando con el servidor: ${error?.message || 'timeout'}` },
      { status: 502 }
    )
  }
}

export const dynamic = 'force-dynamic'
export const maxDuration = 300

