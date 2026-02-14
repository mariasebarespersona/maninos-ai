import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/facebook/connect`, {
      method: 'POST',
      cache: 'no-store',
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { success: false, message: 'Backend unavailable' },
      { status: 500 }
    );
  }
}

