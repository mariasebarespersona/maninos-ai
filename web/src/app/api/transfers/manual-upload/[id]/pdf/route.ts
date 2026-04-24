import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.API_URL || 'http://localhost:8000'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const formData = await request.formData()
    const res = await fetch(`${API_URL}/api/transfers/manual-upload/${params.id}/pdf`, {
      method: 'POST',
      body: formData,
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('Error proxying manual-upload/pdf:', error)
    return NextResponse.json({ detail: 'API connection error' }, { status: 500 })
  }
}
