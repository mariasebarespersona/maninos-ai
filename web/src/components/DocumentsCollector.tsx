'use client'

import React, { useState, useEffect } from 'react'
import { FileText, Upload, CheckCircle2, Circle, AlertCircle } from 'lucide-react'

interface Document {
  id: string;
  name: string;
  description: string;
  required: boolean;
  uploaded: boolean;
  file?: File;
}

interface DocumentsCollectorProps {
  propertyId: string;
  onComplete?: () => void;
}

const REQUIRED_DOCUMENTS: Omit<Document, 'uploaded' | 'file'>[] = [
  {
    id: 'title_status',
    name: 'Title Status Document',
    description: 'Documento del estado del título (Clean/Blue, Lien, Park-owned)',
    required: true
  },
  {
    id: 'property_listing',
    name: 'Property Listing',
    description: 'Listing de MHVillage/Zillow con precio, fotos y descripción',
    required: true
  },
  {
    id: 'property_photos',
    name: 'Property Photos',
    description: 'Fotos del exterior/interior de la mobile home',
    required: true
  }
];

export function DocumentsCollector({ propertyId, onComplete }: DocumentsCollectorProps) {
  const [documents, setDocuments] = useState<Document[]>(
    REQUIRED_DOCUMENTS.map(doc => ({ ...doc, uploaded: false }))
  );
  const [uploading, setUploading] = useState(false);

  const uploadedCount = documents.filter(d => d.uploaded).length;
  const totalCount = documents.length;
  const progress = Math.round((uploadedCount / totalCount) * 100);
  const allUploaded = uploadedCount === totalCount;

  // Load existing documents from backend
  useEffect(() => {
    const loadDocuments = async () => {
      try {
        const res = await fetch(`http://127.0.0.1:8080/api/property/${propertyId}/documents`);
        if (res.ok) {
          const data = await res.json();
          console.log('[DocumentsCollector] Loaded documents from backend:', data.documents);
          if (data.documents && data.documents.length > 0) {
            // Mark documents as uploaded based on document_type from backend
            setDocuments(prev => prev.map(doc => {
              const isUploaded = data.documents.some((d: any) => d.document_type === doc.id);
              console.log(`[DocumentsCollector] Document ${doc.id}: uploaded = ${isUploaded}`);
              return {
                ...doc,
                uploaded: isUploaded
              };
            }));
          }
        }
      } catch (e) {
        console.error('[DocumentsCollector] Failed to load documents', e);
      }
    };

    if (propertyId) {
      loadDocuments();
    }
  }, [propertyId]);

  const handleFileSelect = async (docId: string, file: File) => {
    setUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('property_id', propertyId);
      formData.append('document_type', docId);

      const res = await fetch('http://127.0.0.1:8080/upload_document', {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        // Mark document as uploaded
        setDocuments(prev => prev.map(doc => 
          doc.id === docId ? { ...doc, uploaded: true, file } : doc
        ));

        // Check if all documents are now uploaded
        const newUploadedCount = documents.filter(d => 
          d.id === docId ? true : d.uploaded
        ).length;

        if (newUploadedCount === totalCount) {
          // All documents uploaded, notify parent
          setTimeout(() => {
            onComplete?.();
          }, 500);
        }
      } else {
        alert('Failed to upload document. Please try again.');
      }
    } catch (e) {
      console.error('Upload error:', e);
      alert('Error uploading document. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden w-full">
      {/* Compact Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 text-white">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <FileText size={18} />
            <div>
              <h3 className="font-bold text-sm">📄 Documentos Iniciales</h3>
              <p className="text-blue-100 text-xs">Paso 0: Sube 3 documentos obligatorios</p>
            </div>
          </div>
          <div className="bg-white/20 px-3 py-1 rounded text-center">
            <p className="text-lg font-bold">{uploadedCount}/{totalCount}</p>
            <p className="text-xs text-blue-100">({progress}%)</p>
          </div>
        </div>
      </div>

      {/* Compact Status Badge */}
      {allUploaded && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2">
          <div className="flex items-center gap-2 text-emerald-800">
            <CheckCircle2 size={16} />
            <p className="font-semibold text-xs">✅ Todos los documentos subidos</p>
          </div>
        </div>
      )}

      {/* Compact Documents List */}
      <div className="px-4 py-3">
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Documentos Requeridos</h4>
        
        <div className="space-y-2">
          {documents.map((doc) => (
            <div 
              key={doc.id}
              className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all ${
                doc.uploaded 
                  ? 'bg-emerald-50 border-emerald-300' 
                  : 'bg-slate-50 border-slate-200 hover:border-blue-300'
              }`}
            >
              {/* Status Icon */}
              <div className="shrink-0">
                {doc.uploaded ? (
                  <CheckCircle2 size={18} className="text-emerald-600" />
                ) : (
                  <Circle size={18} className="text-slate-300" />
                )}
              </div>

              {/* Document Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h5 className="font-semibold text-slate-800 text-xs">{doc.name}</h5>
                  {doc.uploaded && (
                    <span className="bg-emerald-100 text-emerald-800 text-[10px] font-semibold px-1.5 py-0.5 rounded">
                      SUBIDO
                    </span>
                  )}
                  {doc.required && !doc.uploaded && (
                    <span className="bg-amber-100 text-amber-800 text-[10px] font-semibold px-1.5 py-0.5 rounded">
                      OBLIGATORIO
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">{doc.description}</p>
              </div>

              {/* Upload Button */}
              {!doc.uploaded && (
                <label className="shrink-0">
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleFileSelect(doc.id, file);
                      }
                    }}
                    disabled={uploading}
                  />
                  <button
                    type="button"
                    onClick={(e) => (e.currentTarget.previousElementSibling as HTMLInputElement)?.click()}
                    disabled={uploading}
                    className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    <Upload size={14} />
                    Subir
                  </button>
                </label>
              )}
            </div>
          ))}
        </div>

        {/* Compact Help Text */}
        {!allUploaded && (
          <div className="mt-3 bg-blue-50 border-l-2 border-blue-400 p-2 rounded text-xs text-blue-800">
            <p className="leading-tight">
              📄 Sube los <strong>3 documentos obligatorios</strong> para continuar. Formatos: PDF, JPG, PNG, WebP.
            </p>
          </div>
        )}

        {/* Compact Completion Message */}
        {allUploaded && (
          <div className="mt-3 bg-emerald-50 border-l-2 border-emerald-400 p-2 rounded text-xs text-emerald-800">
            <p className="leading-tight">
              ✅ <strong>Documentos completos.</strong> Puedes continuar con el 70% Rule Check (Paso 1).
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

