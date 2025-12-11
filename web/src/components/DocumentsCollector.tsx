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
          if (data.documents && data.documents.length > 0) {
            // Mark documents as uploaded based on backend data
            setDocuments(prev => prev.map(doc => ({
              ...doc,
              uploaded: data.documents.some((d: any) => 
                d.document_name?.toLowerCase().includes(doc.id.replace('_', ''))
              )
            })));
          }
        }
      } catch (e) {
        console.error('Failed to load documents', e);
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
    <div className="bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden my-4 w-full">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6 text-white">
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileText size={24} />
              <h3 className="font-bold text-xl">Documentos Iniciales</h3>
            </div>
            <p className="text-blue-100 text-sm">Paso 0: Recopilación de documentos obligatorios</p>
          </div>
          <div className="bg-white/20 px-4 py-2 rounded-lg">
            <p className="text-xs text-blue-100">Progress</p>
            <p className="text-2xl font-bold">{uploadedCount}/{totalCount}</p>
            <p className="text-xs text-blue-100">({progress}%)</p>
          </div>
        </div>
      </div>

      {/* Status Badge */}
      {allUploaded && (
        <div className="bg-emerald-50 border-b border-emerald-200 p-4">
          <div className="flex items-center gap-2 text-emerald-800">
            <CheckCircle2 size={20} />
            <p className="font-semibold text-sm">✅ FASE OBLIGATORIA COMPLETADA - Todos los documentos subidos</p>
          </div>
        </div>
      )}

      {/* Documents List */}
      <div className="p-6">
        <h4 className="text-sm font-bold text-slate-600 uppercase tracking-wide mb-4">Documentos Requeridos</h4>
        
        <div className="space-y-3">
          {documents.map((doc) => (
            <div 
              key={doc.id}
              className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${
                doc.uploaded 
                  ? 'bg-emerald-50 border-emerald-300' 
                  : 'bg-slate-50 border-slate-200 hover:border-blue-300'
              }`}
            >
              {/* Status Icon */}
              <div className="shrink-0">
                {doc.uploaded ? (
                  <CheckCircle2 size={24} className="text-emerald-600" />
                ) : (
                  <Circle size={24} className="text-slate-300" />
                )}
              </div>

              {/* Document Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h5 className="font-bold text-slate-800 text-sm">{doc.name}</h5>
                  {doc.required && !doc.uploaded && (
                    <span className="bg-amber-100 text-amber-800 text-xs font-semibold px-2 py-0.5 rounded">
                      OBLIGATORIO
                    </span>
                  )}
                  {doc.uploaded && (
                    <span className="bg-emerald-100 text-emerald-800 text-xs font-semibold px-2 py-0.5 rounded">
                      SUBIDO
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1">{doc.description}</p>
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
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <Upload size={16} />
                    Subir
                  </button>
                </label>
              )}
            </div>
          ))}
        </div>

        {/* Help Text */}
        {!allUploaded && (
          <div className="mt-6 bg-blue-50 border-l-4 border-blue-400 p-4 rounded">
            <div className="flex items-start gap-3">
              <AlertCircle className="text-blue-600 shrink-0 mt-0.5" size={20} />
              <div>
                <h4 className="font-bold text-blue-900 text-sm mb-1">ℹ️ Información</h4>
                <p className="text-xs text-blue-800 leading-relaxed">
                  Sube los <strong>3 documentos obligatorios</strong> para continuar con el análisis de la propiedad. 
                  Formatos aceptados: PDF, JPG, PNG, WebP.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Completion Message */}
        {allUploaded && (
          <div className="mt-6 bg-emerald-50 border-l-4 border-emerald-400 p-4 rounded">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="text-emerald-600 shrink-0 mt-0.5" size={20} />
              <div>
                <h4 className="font-bold text-emerald-900 text-sm mb-1">✅ Documentos Completos</h4>
                <p className="text-xs text-emerald-800 leading-relaxed">
                  Todos los documentos han sido subidos correctamente. 
                  Ahora puedes continuar con el <strong>70% Rule Check</strong> (Paso 1).
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

