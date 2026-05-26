import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
// The upload triggers PDF/OCR text extraction + GPT-5 parsing of the
// movements, which routinely takes 15–30s. Default Vercel function
// timeout is 10s — that's where "Error al subir archivo" comes from.
export const maxDuration = 120
const API = process.env.API_URL || 'http://localhost:8000'

export async function GET(request: NextRequest) {
  try {
    const qs = request.nextUrl.searchParams.toString()
    const res = await fetch(`${API}/api/accounting/bank-statements?${qs}`, { cache: 'no-store' })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    console.error('bank-statements proxy error', e)
    return NextResponse.json({ detail: 'API error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // Forward the multipart body untouched so the upstream FastAPI
    // parser sees the original boundary. Re-encoding via formData()
    // sometimes corrupts the boundary for binary PDFs.
    const contentType = request.headers.get('content-type') || ''
    const buf = await request.arrayBuffer()
    const res = await fetch(`${API}/api/accounting/bank-statements`, {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: Buffer.from(buf),
      // @ts-expect-error — duplex is required in modern node fetch when streaming bodies
      duplex: 'half',
      cache: 'no-store',
    })
    const text = await res.text()
    let data: any = { detail: text }
    try { data = JSON.parse(text) } catch { /* keep text */ }
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    console.error('bank-statements upload proxy error', e)
    return NextResponse.json({ detail: `Proxy error: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 })
  }
}

