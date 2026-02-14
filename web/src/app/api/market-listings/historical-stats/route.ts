import { NextResponse } from 'next/server';

const API_URL = process.env.API_URL || 'http://localhost:8000';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const response = await fetch(`${API_URL}/api/market-listings/historical-stats`, {
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: 'Failed to fetch historical stats', details: errorText },
        { status: response.status }
      );
    }
    
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error proxying historical stats:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}

