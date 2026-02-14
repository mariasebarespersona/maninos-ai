import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const city = searchParams.get('city') || 'Houston';
    const minPrice = searchParams.get('min_price') || '0';
    const maxPrice = searchParams.get('max_price') || '80000';

    const response = await fetch(
      `${API_URL}/api/market-listings/scrape?city=${city}&min_price=${minPrice}&max_price=${maxPrice}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: `Backend error: ${error}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in scrape route:', error);
    return NextResponse.json(
      { error: 'Failed to scrape market listings' },
      { status: 500 }
    );
  }
}

