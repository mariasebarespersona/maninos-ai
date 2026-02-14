import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.API_URL || 'http://localhost:8000'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ propertyId: string }> }
) {
  try {
    const { propertyId } = await params
    const searchParams = request.nextUrl.searchParams
    const inspectorName = searchParams.get('inspector_name') || ''

    const url = new URL(`${API_URL}/api/documents/checklist/${propertyId}`)
    if (inspectorName) {
      url.searchParams.set('inspector_name', inspectorName)
    }

    const res = await fetch(url.toString())

    if (!res.ok) {
      const errorData = await res.json()
      return NextResponse.json(errorData, { status: res.status })
    }

    // Get the PDF blob
    const pdfBlob = await res.blob()
    
    // Get filename from Content-Disposition header
    const contentDisposition = res.headers.get('Content-Disposition')
    const filename = contentDisposition?.match(/filename=(.+)/)?.[1] || 'checklist.pdf'

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


