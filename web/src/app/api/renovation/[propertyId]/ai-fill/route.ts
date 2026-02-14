import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.API_URL || 'http://localhost:8000'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ propertyId: string }> }
) {
  const { propertyId } = await params
  try {
    // Forward the multipart form data directly
    const formData = await request.formData()
    
    const res = await fetch(`${API_URL}/api/renovation/${propertyId}/ai-fill`, {
      method: 'POST',
      body: formData,
    })
    
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('Error proxying renovation ai-fill:', error)
    return NextResponse.json({ detail: 'API connection error' }, { status: 500 })
  }
}

