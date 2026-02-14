import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.API_URL || 'http://localhost:8000'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docKey: string }> }
) {
  try {
    const { id, docKey } = await params
    
    const res = await fetch(`${API_URL}/api/transfers/${id}/document/${docKey}/file`, {
      method: 'DELETE',
    })
    
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('Error proxying delete:', error)
    return NextResponse.json({ detail: 'Delete failed' }, { status: 500 })
  }
}


