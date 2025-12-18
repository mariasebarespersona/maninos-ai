import { NextRequest, NextResponse } from "next/server";

// Minimal proxy to Python backend.
// Prefer BACKEND_URL; otherwise use NEXT_PUBLIC_API_URL or BACKEND_HOST
const BACKEND_URL = (() => {
  // Server-side env vars (preferred)
  if (process.env.BACKEND_URL) return process.env.BACKEND_URL;
  
  // Fallback to public env var (works for both client and server)
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  
  // Legacy: build from BACKEND_HOST
  const host = process.env.BACKEND_HOST;
  if (host) return `https://${host}`;
  
  // Local development fallback
  return "http://127.0.0.1:8080";
})();

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const text = String(form.get("text") || "");
    const sessionId = String(form.get("session_id") || "web-ui");
    const propertyId = String(form.get("property_id") || "");
    const files = form.getAll("files");
    const audioFile = form.get("audio") as File | null;

    const fwd = new FormData();
    fwd.append("text", text);
    fwd.append("session_id", sessionId);
    if (propertyId) fwd.append("property_id", propertyId);
    
    // Handle audio file
    if (audioFile) {
      fwd.append("audio", audioFile, audioFile.name);
    }
    
    // Handle regular files
    for (const f of files) {
      if (f instanceof File) {
        fwd.append("files", f, f.name);
      }
    }

    // Expect your Python backend to expose a /ui_chat endpoint that accepts multipart/form-data
    const resp = await fetch(`${BACKEND_URL}/ui_chat`, { method: "POST", body: fwd });
    const textResp = await resp.text();
    let data: any = {};
    try { data = JSON.parse(textResp); } catch { /* leave as text */ }
    if (!resp.ok) {
      return NextResponse.json({ error: data?.detail || textResp || `HTTP ${resp.status}` }, { status: resp.status });
    }
    if (typeof data === "string") {
      return NextResponse.json({ answer: data });
    }
    return NextResponse.json({
      answer: data?.answer ?? data?.content ?? "(sin respuesta)",
      property_id: data?.property_id,
      property_name: data?.property_name, // Include property name from backend
      transcript: data?.transcript,
      audio_response: data?.audio_response, // For voice responses
      show_documents: data?.show_documents, // CRITICAL: Include show_documents flag for DocumentFramework UI
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}