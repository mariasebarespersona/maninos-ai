import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

// MUST disable Next.js caching — status changes after FB connect
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/facebook/status`, {
      cache: 'no-store',
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ authenticated: false, message: 'Backend unavailable' });
  }
}

