import { NextRequest, NextResponse } from 'next/server'

// Sumsub check-session removed — manual KYC uses status endpoint instead.
export async function POST(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  return NextResponse.json(
    { ok: false, error: 'This endpoint has been removed. Use GET /status/{clientId} instead.' },
    { status: 410 }
  )
}
