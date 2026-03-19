import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.API_URL || 'http://localhost:8000'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params
  try {
    const cookie = request.headers.get('cookie') || ''
    const res = await fetch(
      `${API_URL}/api/public/clients/${clientId}/rto-application`,
      { cache: 'no-store', headers: { cookie } }
    )
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('Error proxying rto-application:', error)
    return NextResponse.json({ detail: 'API connection error' }, { status: 500 })
  }
}
