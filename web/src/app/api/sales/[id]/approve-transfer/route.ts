import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.API_URL || 'http://localhost:8000'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const url = new URL(`${API_URL}/api/sales/${id}/approve-transfer`)
    searchParams.forEach((value, key) => url.searchParams.set(key, value))

    const res = await fetch(url.toString(), { method: 'POST', cache: 'no-store' })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('Error proxying transfer approve:', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
