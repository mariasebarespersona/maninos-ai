import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
const API_URL = process.env.API_URL || 'http://localhost:8000';

export async function GET() {
  try {
    const res = await fetch(`${API_URL}/api/notifications/unread-count`, { cache: 'no-store' });
    return NextResponse.json(await res.json());
  } catch { return NextResponse.json({ ok: true, count: 0 }); }
}
