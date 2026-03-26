import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
const API_URL = process.env.API_URL || 'http://localhost:8000';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const qs = searchParams.toString();
    const res = await fetch(`${API_URL}/api/notifications${qs ? `?${qs}` : ''}`, { cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ ok: true, notifications: [], count: 0 }, { status: 200 });
  }
}
