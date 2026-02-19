import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const BUCKET = 'kyc-documents'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params

  // Early check: service role key must be set
  if (!supabaseServiceKey || supabaseServiceKey === 'undefined') {
    console.error('[KYC Upload] SUPABASE_SERVICE_ROLE_KEY is not set!')
    return NextResponse.json(
      { ok: false, error: 'Error de configuración del servidor. Contacta soporte.' },
      { status: 500 }
    )
  }

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

    // Create Supabase client with service role key for storage access
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify bucket exists
    const { data: buckets, error: listError } = await supabase.storage.listBuckets()
    if (listError) {
      console.error('[KYC Upload] Failed to list buckets:', listError.message)
      return NextResponse.json(
        { ok: false, error: `Error de almacenamiento: ${listError.message}` },
        { status: 500 }
      )
    }

    const bucketExists = buckets?.some(b => b.name === BUCKET)
    if (!bucketExists) {
      console.log(`[KYC Upload] Bucket "${BUCKET}" not found. Attempting to create...`)
      const { error: createError } = await supabase.storage.createBucket(BUCKET, {
        public: true,
        fileSizeLimit: 10 * 1024 * 1024,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
      })
      if (createError) {
        console.error(`[KYC Upload] Failed to create bucket:`, createError.message)
        return NextResponse.json(
          { ok: false, error: `No se pudo crear almacenamiento: ${createError.message}. Pide al admin crear el bucket "kyc-documents" en Supabase Storage.` },
          { status: 500 }
        )
      }
      console.log(`[KYC Upload] Bucket "${BUCKET}" created successfully`)
    }

    const timestamp = Date.now()

    // Upload helper
    const uploadFile = async (file: File, label: string): Promise<string> => {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${clientId}/${label}_${timestamp}.${ext}`
      const buffer = Buffer.from(await file.arrayBuffer())

      console.log(`[KYC Upload] Uploading ${label} → ${BUCKET}/${path} (${file.size} bytes, ${file.type})`)

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

    // Upload files
    const idFrontUrl = await uploadFile(idFront, 'id_front')
    const selfieUrl = await uploadFile(selfie, 'selfie')
    let idBackUrl: string | null = null
    if (idBack) {
      idBackUrl = await uploadFile(idBack, 'id_back')
    }

    // Call FastAPI to save the URLs and update status
    console.log(`[KYC Upload] Files uploaded. Calling backend to save URLs...`)
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

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[KYC Upload] Backend responded ${res.status}:`, errorText)
      try {
        const errorData = JSON.parse(errorText)
        return NextResponse.json(
          { ok: false, error: errorData.detail || errorData.error || 'Error del servidor' },
          { status: res.status }
        )
      } catch {
        return NextResponse.json(
          { ok: false, error: `Error del servidor (${res.status})` },
          { status: res.status }
        )
      }
    }

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error: any) {
    console.error(`[KYC Upload] Error for client ${clientId}:`, error?.message || error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Error al subir documentos.' },
      { status: 500 }
    )
  }
}
