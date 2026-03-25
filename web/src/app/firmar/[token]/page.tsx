'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle, FileText, Loader2, AlertCircle, Pen } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

// Signature fonts for "typed" signatures
const SIGNATURE_FONTS = [
  { name: 'Cursive', style: 'font-family: "Dancing Script", cursive; font-size: 28px;' },
  { name: 'Formal', style: 'font-family: "Great Vibes", cursive; font-size: 32px;' },
  { name: 'Simple', style: 'font-family: "Caveat", cursive; font-size: 26px;' },
];

export default function SigningPage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [sigData, setSigData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Signature state
  const [sigType, setSigType] = useState<'typed' | 'drawn'>('typed');
  const [typedName, setTypedName] = useState('');
  const [selectedFont, setSelectedFont] = useState(0);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [signed, setSigned] = useState(false);

  // Canvas for drawn signature
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/esign/sign/${token}`);
        if (!res.ok) throw new Error('Enlace inválido o expirado');
        const data = await res.json();
        setSigData(data);
        if (data.already_signed) setSigned(true);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [token]);

  // Canvas drawing handlers
  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1a2744';
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDraw = () => setIsDrawing(false);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const submitSignature = async () => {
    if (!consent) return;
    setSubmitting(true);

    try {
      let value = '';
      if (sigType === 'typed') {
        value = typedName;
      } else {
        value = canvasRef.current?.toDataURL('image/png') || '';
      }

      if (!value) {
        setError('Escribe tu nombre o dibuja tu firma');
        setSubmitting(false);
        return;
      }

      const res = await fetch(`/api/esign/sign/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: sigType,
          value,
          font: sigType === 'typed' ? SIGNATURE_FONTS[selectedFont].name : undefined,
          consent: true,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Error al firmar');
      }

      setSigned(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error && !sigData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Enlace inválido</h1>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (signed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Documento Firmado</h1>
          <p className="text-gray-500 mb-4">Tu firma ha sido registrada correctamente.</p>
          <p className="text-sm text-gray-400">Recibirás una copia del documento firmado por email.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#1a2744] to-[#2d3a5c] rounded-t-2xl p-6 text-white text-center">
          <h1 className="text-2xl font-bold">Maninos Homes</h1>
          <p className="text-[#c9a96e] mt-1">Firma Electrónica</p>
        </div>

        {/* Document info */}
        <div className="bg-white p-6 border-x border-gray-200">
          <div className="flex items-center gap-3 mb-4">
            <FileText className="w-6 h-6 text-[#c9a96e]" />
            <div>
              <p className="font-semibold text-gray-900">{sigData?.envelope_name || 'Documento'}</p>
              <p className="text-sm text-gray-500">
                Firmante: <strong>{sigData?.signer_name}</strong> ({sigData?.signer_role?.replace('_', ' ')})
              </p>
            </div>
          </div>

          {/* PDF viewer placeholder */}
          {sigData?.unsigned_pdf_url && (
            <div className="border border-gray-200 rounded-lg p-4 mb-6 bg-gray-50">
              <a
                href={sigData.unsigned_pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-2"
              >
                <FileText className="w-4 h-4" />
                Ver documento completo (PDF)
              </a>
            </div>
          )}

          {/* Signature area */}
          <div className="border-t border-gray-200 pt-6">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Pen className="w-5 h-5 text-[#c9a96e]" />
              Tu Firma
            </h3>

            {/* Type selector */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setSigType('typed')}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                  sigType === 'typed'
                    ? 'bg-[#1a2744] text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Escribir nombre
              </button>
              <button
                onClick={() => setSigType('drawn')}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                  sigType === 'drawn'
                    ? 'bg-[#1a2744] text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Dibujar firma
              </button>
            </div>

            {sigType === 'typed' ? (
              <div>
                <input
                  type="text"
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  placeholder="Escribe tu nombre completo"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-lg mb-3"
                />
                {typedName && (
                  <div className="border border-gray-200 rounded-lg p-4 bg-white mb-3">
                    <p className="text-xs text-gray-400 mb-2">Vista previa:</p>
                    <div className="flex gap-4">
                      {SIGNATURE_FONTS.map((font, i) => (
                        <button
                          key={i}
                          onClick={() => setSelectedFont(i)}
                          className={`flex-1 p-3 rounded-lg border-2 transition-colors ${
                            selectedFont === i ? 'border-[#c9a96e] bg-amber-50' : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <span style={{ fontFamily: font.name === 'Cursive' ? '"Dancing Script", cursive' : font.name === 'Formal' ? '"Great Vibes", cursive' : '"Caveat", cursive', fontSize: '20px' }}>
                            {typedName}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div className="border-2 border-dashed border-gray-300 rounded-lg bg-white mb-2">
                  <canvas
                    ref={canvasRef}
                    width={600}
                    height={200}
                    className="w-full cursor-crosshair touch-none"
                    onMouseDown={startDraw}
                    onMouseMove={draw}
                    onMouseUp={stopDraw}
                    onMouseLeave={stopDraw}
                    onTouchStart={startDraw}
                    onTouchMove={draw}
                    onTouchEnd={stopDraw}
                  />
                </div>
                <button onClick={clearCanvas} className="text-sm text-red-500 hover:text-red-700">
                  Borrar y volver a dibujar
                </button>
              </div>
            )}

            {/* Consent */}
            <label className="flex items-start gap-3 mt-6 cursor-pointer">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1 rounded border-gray-300"
              />
              <span className="text-sm text-gray-600">
                Acepto que mi firma electrónica tiene la misma validez legal que una firma manuscrita,
                de acuerdo con la Ley de Transacciones Electrónicas Uniformes de Texas (UETA) y la Ley Federal ESIGN.
              </span>
            </label>

            {error && (
              <p className="text-red-500 text-sm mt-3">{error}</p>
            )}
          </div>
        </div>

        {/* Submit */}
        <div className="bg-white rounded-b-2xl p-6 border-x border-b border-gray-200">
          <button
            onClick={submitSignature}
            disabled={!consent || submitting || (!typedName && sigType === 'typed')}
            className="w-full py-4 bg-[#c9a96e] hover:bg-[#b89a5f] disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold text-lg rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {submitting ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Firmando...</>
            ) : (
              <><Pen className="w-5 h-5" /> Firmar Documento</>
            )}
          </button>
        </div>
      </div>

      {/* Google Fonts for signature styles */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;700&family=Great+Vibes&family=Caveat:wght@400;700&display=swap" rel="stylesheet" />
    </div>
  );
}
