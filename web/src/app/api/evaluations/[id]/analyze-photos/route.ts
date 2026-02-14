import { NextRequest, NextResponse } from 'next/server'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const formData = await request.formData()
  const res = await fetch(`${API}/api/evaluations/${params.id}/analyze-photos`, {
    method: 'POST',
    body: formData,
  })
  return NextResponse.json(await res.json(), { status: res.status })
}

export const dynamic = 'force-dynamic'

