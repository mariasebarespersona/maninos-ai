import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL || 'http://localhost:8000';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  try {
    const res = await fetch(`${API_URL}/api/esign/sign/${token}`);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    return NextResponse.json({ error: 'Connection error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  try {
    const body = await request.json();
    // La IP y el navegador de QUIEN FIRMA hay que reenviarlos a mano. Sin esto
    // el backend ve la petición del propio servidor de Next y anota su IP
    // (100.64.0.16) y "node" como navegador — la misma huella para todo el
    // mundo, que es tanto como no tener ninguna. Y esa huella es media razón de
    // ser de una firma electrónica.
    const ipCliente =
      request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      '';
    const res = await fetch(`${API_URL}/api/esign/sign/${token}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(ipCliente ? { 'x-forwarded-for': ipCliente } : {}),
        'x-signer-user-agent': request.headers.get('user-agent') || '',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    return NextResponse.json({ error: 'Connection error' }, { status: 500 });
  }
}
