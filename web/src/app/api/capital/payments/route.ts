import { NextRequest, NextResponse } from 'next/server'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const contractId = searchParams.get('contract_id')
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (contractId) params.set('contract_id', contractId)
  const qs = params.toString() ? `?${params.toString()}` : ''
  
  try {
    const res = await fetch(`${API}/api/capital/payments${qs}`, { cache: 'no-store' })
    const data = await res.json()
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json({ ok: false, error: 'Backend unavailable' }, { status: 500 })
  }
}


