import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.API_URL || 'http://localhost:8000'

/**
 * Safely parse JSON from a response, returning null if empty/invalid.
 */
async function safeJson(res: Response): Promise<any> {
  const text = await res.text()
  if (!text || text.trim() === '') return null
  try {
    return JSON.parse(text)
  } catch {
    return { detail: text }
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const res = await fetch(`${API_URL}/api/properties/${id}`)
    const data = await safeJson(res)
    return NextResponse.json(data ?? { detail: 'Empty response from API' }, { status: res.status })
  } catch (error: any) {
    console.error('Error proxying to API:', error)
    return NextResponse.json({ detail: `API connection error: ${error.message}` }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    
    const res = await fetch(`${API_URL}/api/properties/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    
    const data = await safeJson(res)
    return NextResponse.json(data ?? { detail: 'Empty response from API' }, { status: res.status })
  } catch (error: any) {
    console.error('Error proxying PATCH to API:', error)
    return NextResponse.json({ detail: `API connection error: ${error.message}` }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const res = await fetch(`${API_URL}/api/properties/${id}`, {
      method: 'DELETE',
    })
    
    const data = await safeJson(res)
    return NextResponse.json(data ?? { ok: true }, { status: res.status })
  } catch (error: any) {
    console.error('Error proxying DELETE to API:', error)
    return NextResponse.json({ detail: `API connection error: ${error.message}` }, { status: 500 })
  }
}
