import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.API_URL || 'http://localhost:8000'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contractId: string }> }
) {
  const { id, contractId } = await params
  try {
    const body = await request.json()
    const res = await fetch(
      `${API_URL}/api/public/clients/${id}/sign-contract/${contractId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    )
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('Error proxying sign-contract:', error)
    return NextResponse.json({ detail: 'API connection error' }, { status: 500 })
  }
}
