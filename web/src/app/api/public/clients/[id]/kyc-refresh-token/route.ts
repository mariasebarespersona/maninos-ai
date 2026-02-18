import { NextRequest, NextResponse } from 'next/server'

// This route is no longer needed (Sumsub removed).
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return NextResponse.json(
    { ok: false, error: 'This endpoint has been removed.' },
    { status: 410 }
  )
}
