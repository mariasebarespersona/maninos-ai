import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.API_URL || 'http://localhost:8000'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docKey: string }> }
) {
  try {
    const { id, docKey } = await params
    
    // Get the form data from the request
    const formData = await request.formData()
    
    // Forward to FastAPI
    const res = await fetch(`${API_URL}/api/transfers/${id}/document/${docKey}/upload`, {
      method: 'POST',
      body: formData,
    })
    
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('Error proxying upload:', error)
    return NextResponse.json({ detail: 'Upload failed' }, { status: 500 })
  }
}


