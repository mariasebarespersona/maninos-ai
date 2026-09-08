import { NextRequest, NextResponse } from 'next/server'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// La exportación calcula la ficha completa de cada inversionista, así que tarda
// unos segundos. El límite por defecto de Vercel la cortaría a mitad y el
// usuario se bajaría un CSV truncado sin enterarse.
export const maxDuration = 60

export async function GET(request: NextRequest) {
  try {
    const status = request.nextUrl.searchParams.get('status')
    const res = await fetch(
      `${API}/api/capital/investors/export-csv${status ? `?status=${encodeURIComponent(status)}` : ''}`,
      { cache: 'no-store' }
    )
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: 'No se pudo generar la exportación' },
        { status: res.status }
      )
    }
    // Se reenvía el CSV tal cual, con su cabecera de descarga, para que el
    // navegador lo baje como fichero en vez de mostrarlo.
    return new NextResponse(await res.text(), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition':
          res.headers.get('content-disposition') ||
          'attachment; filename="seguimiento_inversionistas.csv"',
      },
    })
  } catch (error) {
    return NextResponse.json({ ok: false, error: 'Backend unavailable' }, { status: 500 })
  }
}
