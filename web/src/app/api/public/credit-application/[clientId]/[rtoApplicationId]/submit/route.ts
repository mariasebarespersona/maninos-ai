import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.API_URL || 'http://localhost:8000'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string; rtoApplicationId: string }> }
) {
  const { clientId, rtoApplicationId } = await params
  try {
    const res = await fetch(
      `${API_URL}/api/public/credit-application/${clientId}/${rtoApplicationId}/submit`,
      { method: 'POST' }
    )
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('Error proxying credit-application submit:', error)
    return NextResponse.json({ detail: 'API connection error' }, { status: 500 })
  }
}
