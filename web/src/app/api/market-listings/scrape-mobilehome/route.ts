import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const API_URL = process.env.API_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const minPrice = url.searchParams.get('min_price') || '5000';
    const maxPrice = url.searchParams.get('max_price') || '80000';

    const res = await fetch(
      `${API_URL}/api/market-listings/scrape-mobilehome?min_price=${minPrice}&max_price=${maxPrice}`,
      { method: 'POST' }
    );
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Error proxying scrape-mobilehome:', error);
    return NextResponse.json({ success: false, mobilehome: 0, message: 'API connection error' }, { status: 500 });
  }
}
