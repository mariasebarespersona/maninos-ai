import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const propertyId = formData.get('property_id') as string;
    const docType = formData.get('doc_type') as string;

    if (!file || !propertyId || !docType) {
      return NextResponse.json(
        { error: 'Missing required fields: file, property_id, doc_type' },
        { status: 400 }
      );
    }

    // Create Supabase client with service role key for storage access
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Generate unique filename
    const timestamp = Date.now();
    const ext = file.name.split('.').pop();
    const filename = `${propertyId}/${docType}_${timestamp}.${ext}`;

    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('transaction-documents')
      .upload(filename, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload file', details: uploadError.message },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('transaction-documents')
      .getPublicUrl(filename);

    // Also save to documents table
    const { error: dbError } = await supabase
      .from('documents')
      .insert({
        property_id: propertyId,
        document_type: docType,
        filename: file.name,
        storage_path: filename,
        url: urlData.publicUrl,
        file_size: file.size,
        mime_type: file.type,
      });

    if (dbError) {
      console.error('DB error:', dbError);
      // Don't fail the request if DB insert fails, the file is already uploaded
    }

    return NextResponse.json({
      success: true,
      url: urlData.publicUrl,
      path: filename,
    });
  } catch (error) {
    console.error('Error uploading document:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}

