import { NextRequest, NextResponse } from 'next/server'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function GET(_request: NextRequest, { params }: { params: { reportNumber: string } }) {
  const res = await fetch(`${API}/api/evaluations/by-number/${params.reportNumber}`, { cache: 'no-store' })
  return NextResponse.json(await res.json(), { status: res.status })
}

export const dynamic = 'force-dynamic'

