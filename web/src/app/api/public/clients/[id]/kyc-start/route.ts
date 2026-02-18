import { NextRequest, NextResponse } from 'next/server'

// This route is no longer needed (Sumsub removed).
// Kept as a no-op to avoid 404 errors from any old client code.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return NextResponse.json(
    { ok: false, error: 'This endpoint has been replaced. Use /kyc-upload instead.' },
    { status: 410 }
  )
}
