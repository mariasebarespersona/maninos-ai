import { NextRequest, NextResponse } from 'next/server'

// This route is no longer needed (Sumsub removed).
// KYC status is checked via GET /kyc-status instead.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return NextResponse.json(
    { ok: false, error: 'This endpoint has been replaced. Use GET /kyc-status instead.' },
    { status: 410 }
  )
}
