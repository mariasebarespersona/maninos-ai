import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.API_URL || 'http://localhost:8000'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contractId: string }> }
) {
  const { id, contractId } = await params
  try {
    const res = await fetch(
      `${API_URL}/api/public/clients/${id}/contract/${contractId}`,
      { cache: 'no-store' }
    )
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('Error proxying client contract:', error)
    return NextResponse.json({ detail: 'API connection error' }, { status: 500 })
  }
}
