import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.API_URL || 'http://localhost:8000'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const res = await fetch(`${API_URL}/api/materials/renovation-items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('Error proxying to API:', error)
    return NextResponse.json({ detail: 'API connection error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const itemId = searchParams.get('id')
    
    if (!itemId) {
      return NextResponse.json({ detail: 'Item ID required' }, { status: 400 })
    }

    const body = await request.json()
    const res = await fetch(`${API_URL}/api/materials/renovation-items/${itemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('Error proxying to API:', error)
    return NextResponse.json({ detail: 'API connection error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const itemId = searchParams.get('id')
    
    if (!itemId) {
      return NextResponse.json({ detail: 'Item ID required' }, { status: 400 })
    }

    const res = await fetch(`${API_URL}/api/materials/renovation-items/${itemId}`, {
      method: 'DELETE',
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('Error proxying to API:', error)
    return NextResponse.json({ detail: 'API connection error' }, { status: 500 })
  }
}


