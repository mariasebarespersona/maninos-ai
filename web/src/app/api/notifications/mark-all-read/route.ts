import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
const API_URL = process.env.API_URL || 'http://localhost:8000';

export async function POST() {
  try {
    const res = await fetch(`${API_URL}/api/notifications/mark-all-read`, { method: 'POST' });
    return NextResponse.json(await res.json());
  } catch { return NextResponse.json({ ok: true, marked: 0 }); }
}
