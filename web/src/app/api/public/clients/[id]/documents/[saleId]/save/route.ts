import { NextRequest, NextResponse } from "next/server";
import { getAuthHeaders } from "@/lib/api-auth";

const API_URL =
  process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; saleId: string }> }
) {
  try {
    const { id, saleId } = await params;
    const authHeaders = await getAuthHeaders();
    const formData = await request.formData();

    const res = await fetch(
      `${API_URL}/api/public/clients/${id}/documents/${saleId}/save`,
      {
        method: "POST",
        headers: { ...authHeaders },
        body: formData,
      }
    );

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("Error proxying document save to API:", error);
    return NextResponse.json(
      { detail: "No se pudo conectar con el servidor" },
      { status: 500 }
    );
  }
}
