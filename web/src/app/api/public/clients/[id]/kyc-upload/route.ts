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

    // Ensure the bucket exists (auto-create if missing)
    const { data: buckets } = await supabase.storage.listBuckets()
    const bucketExists = buckets?.some(b => b.name === BUCKET)
    if (!bucketExists) {
      const { error: createError } = await supabase.storage.createBucket(BUCKET, {
        public: true,
        fileSizeLimit: 10 * 1024 * 1024, // 10MB
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
      })
      if (createError) {
        console.error(`Failed to create bucket ${BUCKET}:`, createError)
        return NextResponse.json(
          { ok: false, error: `Error configurando almacenamiento: ${createError.message}` },
          { status: 500 }
        )
      }
      console.log(`Created storage bucket: ${BUCKET}`)
    }

    const timestamp = Date.now()

    // Upload helper
    const uploadFile = async (file: File, label: string): Promise<string> => {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${clientId}/${label}_${timestamp}.${ext}`
      const buffer = Buffer.from(await file.arrayBuffer())

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, buffer, {
          contentType: file.type,
          upsert: true,
        })

      if (uploadError) {
        throw new Error(`Error subiendo ${label}: ${uploadError.message}`)
      }

      const { data: urlData } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(path)

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
    const data = await res.json()

    return NextResponse.json(data, { status: res.status })
  } catch (error: any) {
    console.error(`Error uploading KYC docs for client ${clientId}:`, error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Error al subir documentos.' },
      { status: 500 }
    )
  }
}
