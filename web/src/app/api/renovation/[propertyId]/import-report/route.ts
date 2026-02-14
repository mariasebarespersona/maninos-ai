import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function POST(
  request: NextRequest,
  { params }: { params: { propertyId: string } }
) {
  try {
    const reportId = request.nextUrl.searchParams.get('report_id')
    if (!reportId) {
      return NextResponse.json({ error: 'report_id is required' }, { status: 400 })
    }

    const res = await fetch(
      `${API_URL}/api/renovation/${params.propertyId}/import-report?report_id=${reportId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }
    )

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('Error importing evaluation report:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

