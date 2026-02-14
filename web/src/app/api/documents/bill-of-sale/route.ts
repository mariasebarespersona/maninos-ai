import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.API_URL || 'http://localhost:8000'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const res = await fetch(`${API_URL}/api/documents/bill-of-sale`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const errorData = await res.json()
      return NextResponse.json(errorData, { status: res.status })
    }

    // Get the PDF blob
    const pdfBlob = await res.blob()
    
    // Get filename from Content-Disposition header
    const contentDisposition = res.headers.get('Content-Disposition')
    const filename = contentDisposition?.match(/filename=(.+)/)?.[1] || 'bill_of_sale.pdf'

    return new NextResponse(pdfBlob, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=${filename}`,
      },
    })
  } catch (error) {
    console.error('Error proxying to API:', error)
    return NextResponse.json({ detail: 'API connection error' }, { status: 500 })
  }
}


