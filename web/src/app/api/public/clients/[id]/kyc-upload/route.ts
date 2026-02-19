import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const BUCKET = 'kyc-documents'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params

  try {
    const formData = await request.formData()
    const idFront = formData.get('id_front') as File | null
    const idBack = formData.get('id_back') as File | null
    const selfie = formData.get('selfie') as File | null
    const idType = (formData.get('id_type') as string) || 'drivers_license'

    if (!idFront || !selfie) {
      return NextResponse.json(
        { ok: false, error: 'Se requiere foto del ID (frente) y selfie.' },
        { status: 400 }
      )
    }

    // Validate file types
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
    for (const [name, file] of [['id_front', idFront], ['selfie', selfie], ['id_back', idBack]] as const) {
      if (file && !allowedTypes.includes(file.type)) {
        return NextResponse.json(
          { ok: false, error: `Archivo ${name}: tipo no permitido (${file.type}). Usa JPG, PNG o WebP.` },
          { status: 400 }
        )
      }
      if (file && file.size > 10 * 1024 * 1024) {
        return NextResponse.json(
          { ok: false, error: `Archivo ${name}: demasiado grande (máx 10MB).` },
          { status: 400 }
        )
      }
    }

    // Use anon key (available in Vercel as NEXT_PUBLIC_SUPABASE_ANON_KEY)
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const timestamp = Date.now()

    // Upload helper
    const uploadFile = async (file: File, label: string): Promise<string> => {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${clientId}/${label}_${timestamp}.${ext}`
      const buffer = Buffer.from(await file.arrayBuffer())

      console.log(`[KYC Upload] Uploading ${label} → ${BUCKET}/${path} (${file.size} bytes)`)

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, buffer, {
          contentType: file.type,
          upsert: true,
        })

      if (uploadError) {
        console.error(`[KYC Upload] Upload failed for ${label}:`, uploadError.message)
        throw new Error(`Error subiendo ${label}: ${uploadError.message}`)
      }

      const { data: urlData } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(path)

      console.log(`[KYC Upload] ${label} uploaded OK → ${urlData.publicUrl}`)
      return urlData.publicUrl
    }

    // Upload files to Supabase Storage
    const idFrontUrl = await uploadFile(idFront, 'id_front')
    const selfieUrl = await uploadFile(selfie, 'selfie')
    let idBackUrl: string | null = null
    if (idBack) {
      idBackUrl = await uploadFile(idBack, 'id_back')
    }

    // Call FastAPI to save the URLs and update client KYC status
    console.log(`[KYC Upload] Files uploaded. Saving to client record via backend...`)
    const res = await fetch(`${API_URL}/api/public/clients/${clientId}/kyc-submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id_front_url: idFrontUrl,
        id_back_url: idBackUrl,
        selfie_url: selfieUrl,
        id_type: idType,
      }),
    })

    const responseText = await res.text()
    console.log(`[KYC Upload] Backend responded ${res.status}: ${responseText.substring(0, 300)}`)

    try {
      const data = JSON.parse(responseText)
      return NextResponse.json(data, { status: res.status })
    } catch {
      return NextResponse.json(
        { ok: false, error: `Error del servidor (${res.status})` },
        { status: res.status }
      )
    }
  } catch (error: any) {
    console.error(`[KYC Upload] Error for client ${clientId}:`, error?.message || error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Error al subir documentos.' },
      { status: 500 }
    )
  }
}
