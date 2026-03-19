import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.API_URL || 'http://localhost:8000'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string; rtoApplicationId: string }> }
) {
  const { clientId, rtoApplicationId } = await params
  try {
    const cookie = request.headers.get('cookie') || ''
    const res = await fetch(
      `${API_URL}/api/public/credit-application/${clientId}/${rtoApplicationId}`,
      { cache: 'no-store', headers: { cookie } }
    )
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('Error proxying credit-application GET:', error)
    return NextResponse.json({ detail: 'API connection error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string; rtoApplicationId: string }> }
) {
  const { clientId, rtoApplicationId } = await params
  try {
    const cookie = request.headers.get('cookie') || ''
    const body = await request.json()
    const res = await fetch(
      `${API_URL}/api/public/credit-application/${clientId}/${rtoApplicationId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', cookie },
        body: JSON.stringify(body),
      }
    )
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('Error proxying credit-application PUT:', error)
    return NextResponse.json({ detail: 'API connection error' }, { status: 500 })
  }
}
