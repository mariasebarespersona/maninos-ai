'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  X,
  Camera,
  Link2,
  Upload,
  Loader2,
  CheckCircle,
  AlertCircle,
  Image as ImageIcon,
  MapPin,
  DollarSign,
  Calendar,
  Home,
  Bed,
  Bath,
  Maximize,
  FileText,
  Sparkles,
  Edit3,
  Save,
  RotateCcw,
} from 'lucide-react';
import { useToast } from './ui/Toast';

// Extracted listing data from backend
interface ExtractedListing {
  source: string;
  source_url: string;
  address: string;
  city: string;
  state: string;
  zip_code: string | null;
  listing_price: number;
  year_built: number | null;
  sqft: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  description: string | null;
  photos: string[];
  thumbnail_url: string | null;
  confidence: number;
  extraction_method: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onListingAdded: () => void;
}

type Tab = 'screenshot' | 'link';
type Step = 'input' | 'extracting' | 'review' | 'saving';

// Module-level cache to survive Fast Refresh / component remounts
let _cachedExtracted: ExtractedListing | null = null;
let _cachedFormData: Record<string, unknown> | null = null;
let _cachedStep: Step | null = null;

export default function AddMarketListingModal({ open, onClose, onListingAdded }: Props) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<Tab>('screenshot');

  // Step state — restore from cache if available (survives Fast Refresh)
  const [step, setStep] = useState<Step>(() => {
    if (_cachedStep && _cachedStep !== 'extracting') return _cachedStep;
    return 'input';
  });

  // Screenshot state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Link state
  const [url, setUrl] = useState('');

  // Extracted data — restore from cache
  const [extracted, setExtracted] = useState<ExtractedListing | null>(_cachedExtracted);

  // Editable form fields — restore from cache
  const defaultFormData = {
    address: '',
    city: '',
    state: 'TX',
    zip_code: '',
    listing_price: 0,
    year_built: null as number | null,
    sqft: null as number | null,
    bedrooms: null as number | null,
    bathrooms: null as number | null,
    description: '',
    source: 'facebook',
    source_url: '',
  };
  const [formData, setFormData] = useState(() => {
    if (_cachedFormData) return { ...defaultFormData, ..._cachedFormData } as typeof defaultFormData;
    return defaultFormData;
  });

  // Loading states
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync step/extracted to module-level cache (survives hot reload)
  useEffect(() => {
    _cachedStep = step;
    _cachedExtracted = extracted;
    _cachedFormData = step === 'review' ? { ...formData } : null;
  }, [step, extracted, formData]);

  // Reset everything
  const resetModal = useCallback(() => {
    _cachedStep = null;
    _cachedExtracted = null;
    _cachedFormData = null;
    setActiveTab('screenshot');
    setStep('input');
    setImageFile(null);
    setImagePreview(null);
    setUrl('');
    setExtracted(null);
    setFormData({
      address: '',
      city: '',
      state: 'TX',
      zip_code: '',
      listing_price: 0,
      year_built: null,
      sqft: null,
      bedrooms: null,
      bathrooms: null,
      description: '',
      source: 'facebook',
      source_url: '',
    });
    setExtracting(false);
    setSaving(false);
    setError(null);
  }, []);

  const handleClose = () => {
    resetModal();
    onClose();
  };

  // Handle image selection
  const handleImageSelect = (file: File) => {
    setImageFile(file);
    setError(null);
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      handleImageSelect(file);
    }
  };

  // Extract from screenshot
  const extractFromImage = async () => {
    if (!imageFile) return;

    setExtracting(true);
    setStep('extracting');
    setError(null);

    try {
      const formDataUpload = new FormData();
      formDataUpload.append('image', imageFile);
      formDataUpload.append('source', 'facebook');

      const response = await fetch('/api/extract-listing/from-image', {
        method: 'POST',
        body: formDataUpload,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || errData.detail || 'Error al extraer datos de la imagen');
      }

      const data: ExtractedListing = await response.json();
      
      // Update state + module cache simultaneously
      setExtracted(data);
      populateFormFromExtracted(data);
      setStep('review');
      
      // Also cache immediately (belt & suspenders against Fast Refresh)
      _cachedExtracted = data;
      _cachedStep = 'review';
      _cachedFormData = {
        address: data.address || '',
        city: data.city || '',
        state: data.state || 'TX',
        zip_code: data.zip_code || '',
        listing_price: data.listing_price || 0,
        year_built: data.year_built,
        sqft: data.sqft,
        bedrooms: data.bedrooms,
        bathrooms: data.bathrooms,
        description: data.description || '',
        source: data.source || 'facebook',
        source_url: data.source_url || url || '',
      };
      
      toast.success(`✅ Casa encontrada (${Math.round(data.confidence * 100)}% confianza). ¡Revisa abajo y guarda!`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al procesar la imagen';
      setError(message);
      setStep('input');
      toast.error(`❌ ${message}`);
    } finally {
      setExtracting(false);
    }
  };

  // Extract from URL
  const extractFromURL = async () => {
    if (!url.trim()) return;

    setExtracting(true);
    setStep('extracting');
    setError(null);

    try {
      const response = await fetch('/api/extract-listing/from-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errorMsg = errData.error || errData.detail || 'Error al extraer datos de la URL';
        // If it's a Facebook URL, suggest screenshot instead
        if (url.includes('facebook.com') || url.includes('fb.com')) {
          throw new Error(`${errorMsg}. Facebook bloquea el acceso automático — usa la opción de Screenshot.`);
        }
        throw new Error(errorMsg);
      }

      const data: ExtractedListing = await response.json();
      setExtracted(data);
      populateFormFromExtracted(data);
      setStep('review');
      
      // Cache against Fast Refresh
      _cachedExtracted = data;
      _cachedStep = 'review';
      _cachedFormData = {
        address: data.address || '',
        city: data.city || '',
        state: data.state || 'TX',
        zip_code: data.zip_code || '',
        listing_price: data.listing_price || 0,
        year_built: data.year_built,
        sqft: data.sqft,
        bedrooms: data.bedrooms,
        bathrooms: data.bathrooms,
        description: data.description || '',
        source: data.source || 'facebook',
        source_url: data.source_url || url || '',
      };
      
      toast.success(`✅ Casa encontrada (${Math.round(data.confidence * 100)}% confianza). ¡Revisa abajo y guarda!`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al procesar la URL';
      const isFacebookUrl = url.includes('facebook.com') || url.includes('fb.com');
      
      if (isFacebookUrl) {
        // Auto-switch to screenshot tab with clear message
        setError('Facebook bloqueó el acceso automático. Toma un screenshot de la publicación y súbelo aquí →');
        setStep('input');
        setActiveTab('screenshot');
        toast.error('⚠️ Facebook bloqueó el link — usa Screenshot');
      } else {
        setError(message);
        setStep('input');
        toast.error(`❌ ${message}`);
      }
    } finally {
      setExtracting(false);
    }
  };

  // Populate form from extracted data
  const populateFormFromExtracted = (data: ExtractedListing) => {
    setFormData({
      address: data.address || '',
      city: data.city || '',
      state: data.state || 'TX',
      zip_code: data.zip_code || '',
      listing_price: data.listing_price || 0,
      year_built: data.year_built,
      sqft: data.sqft,
      bedrooms: data.bedrooms,
      bathrooms: data.bathrooms,
      description: data.description || '',
      source: data.source || 'facebook',
      source_url: data.source_url || url || '',
    });
  };

  // Save to market_listings
  const saveToMarket = async () => {
    // Validate minimum data
    if (!formData.listing_price || formData.listing_price <= 0) {
      toast.error('El precio es obligatorio');
      return;
    }
    if (!formData.city) {
      toast.error('La ciudad es obligatoria');
      return;
    }

    setSaving(true);
    setStep('saving');

    try {
      const payload = {
        source: formData.source,
        source_url: formData.source_url || url || `manual-${Date.now()}`,
        address: formData.address || `Propiedad en ${formData.city}, TX`,
        city: formData.city,
        state: formData.state,
        zip_code: formData.zip_code || null,
        listing_price: formData.listing_price,
        year_built: formData.year_built,
        sqft: formData.sqft,
        bedrooms: formData.bedrooms,
        bathrooms: formData.bathrooms,
        photos: [],
        thumbnail_url: null,
      };

      const response = await fetch('/api/market-listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || errData.details || 'Error al guardar');
      }

      toast.success('¡Casa agregada al dashboard! Las reglas de calificación se aplicaron automáticamente.');
      onListingAdded();
      handleClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al guardar';
      setError(message);
      setStep('review');
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full my-8 flex flex-col max-h-[90vh]">
        {/* Header - Fixed */}
        <div className={`p-6 text-white flex-shrink-0 ${
          step === 'review' 
            ? 'bg-gradient-to-r from-green-700 to-green-600' 
            : 'bg-gradient-to-r from-navy-900 to-navy-800'
        }`}>
          <div className="flex justify-between items-start">
            <div>
              {step === 'review' ? (
                <>
                  <h3 className="text-xl font-semibold flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-200" />
                    ¡Casa encontrada! Revisa y guarda
                  </h3>
                  <p className="text-green-100 mt-1 text-sm">
                    Verifica los datos extraídos, edita lo que sea necesario, y haz clic en <strong>Guardar en Dashboard</strong>
                  </p>
                </>
              ) : (
                <>
                  <h3 className="text-xl font-semibold flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-gold-400" />
                    Agregar Casa del Mercado
                  </h3>
                  <p className="text-navy-200 mt-1 text-sm">
                    Sube un screenshot o pega un link de Facebook Marketplace
                  </p>
                </>
              )}
            </div>
            <button onClick={handleClose} className="text-white/70 hover:text-white">
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Tabs */}
          {step === 'input' && (
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => { setActiveTab('screenshot'); setError(null); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'screenshot'
                    ? 'bg-gold-500 text-white'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
              >
                <Camera className="w-4 h-4" />
                Screenshot
              </button>
              <button
                onClick={() => { setActiveTab('link'); setError(null); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'link'
                    ? 'bg-gold-500 text-white'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
              >
                <Link2 className="w-4 h-4" />
                Pegar Link
              </button>
            </div>
          )}
        </div>

        {/* Content - Scrollable */}
        <div className="p-6 overflow-y-auto flex-1 min-h-0">
          {/* Error message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* === STEP: INPUT === */}
          {step === 'input' && (
            <>
              {/* Screenshot Tab */}
              {activeTab === 'screenshot' && (
                <div className="space-y-4">
                  <div
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                    className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
                      imagePreview
                        ? 'border-green-300 bg-green-50'
                        : 'border-gray-300 hover:border-gold-400 hover:bg-gold-50/30'
                    }`}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {imagePreview ? (
                      <div className="space-y-3">
                        <img
                          src={imagePreview}
                          alt="Preview"
                          className="max-h-48 mx-auto rounded-lg shadow-md"
                        />
                        <div className="flex items-center justify-center gap-2 text-green-700">
                          <CheckCircle className="w-5 h-5" />
                          <span className="font-medium">{imageFile?.name}</span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setImageFile(null);
                            setImagePreview(null);
                          }}
                          className="text-sm text-red-500 hover:text-red-700 flex items-center gap-1 mx-auto"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Cambiar imagen
                        </button>
                      </div>
                    ) : (
                      <>
                        <ImageIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-700 font-medium mb-1">
                          Arrastra un screenshot aquí o haz clic para seleccionar
                        </p>
                        <p className="text-xs text-gray-400">
                          JPG, PNG, WebP (máx. 20MB)
                        </p>
                      </>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageSelect(file);
                      }}
                    />
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-sm text-blue-800">
                      <strong>💡 Tip:</strong> Toma un screenshot de la publicación de Facebook Marketplace 
                      donde se vea el precio, dirección y detalles de la casa. La AI extraerá toda la información automáticamente.
                    </p>
                  </div>
                </div>
              )}

              {/* Link Tab */}
              {activeTab === 'link' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      URL del listing
                    </label>
                    <div className="relative">
                      <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="url"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://www.facebook.com/marketplace/item/..."
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gold-500 focus:border-gold-500 text-sm"
                      />
                    </div>
                  </div>

                  {/* Facebook-specific warning */}
                  {(url.includes('facebook.com') || url.includes('fb.com')) ? (
                    <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
                      <p className="text-sm text-red-800 font-semibold mb-2">
                        ⚠️ Link de Facebook detectado
                      </p>
                      <p className="text-sm text-red-700 mb-3">
                        Facebook bloquea frecuentemente el acceso automático. Puede que no funcione.
                      </p>
                      <button
                        onClick={() => { setActiveTab('screenshot'); setError(null); }}
                        className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors flex items-center gap-2"
                      >
                        <Camera className="w-4 h-4" />
                        Usar Screenshot (más fiable)
                      </button>
                    </div>
                  ) : (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <p className="text-sm text-amber-800">
                        <strong>💡 Tip:</strong> Pega el link directo de la publicación. 
                        Si es de Facebook, considera usar <strong>Screenshot</strong> que es más fiable.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* === STEP: EXTRACTING === */}
          {step === 'extracting' && (
            <div className="py-12 text-center">
              <Loader2 className="w-12 h-12 animate-spin text-gold-500 mx-auto mb-4" />
              <h4 className="text-lg font-semibold text-navy-900 mb-2">
                {activeTab === 'screenshot' ? 'Analizando imagen con AI...' : 'Extrayendo datos de la URL...'}
              </h4>
              <p className="text-gray-500 text-sm">
                {activeTab === 'screenshot'
                  ? 'GPT-4 Vision está leyendo los datos de la propiedad'
                  : 'Navegando a la página y extrayendo información. Esto puede tardar ~15 segundos.'}
              </p>
              {activeTab === 'link' && (
                <p className="text-xs text-amber-500 mt-3">
                  Si es un link de Facebook y falla, usa la opción de Screenshot
                </p>
              )}
            </div>
          )}

          {/* === STEP: REVIEW === */}
          {step === 'review' && (
            <div className="space-y-4">
              {/* Confidence indicator */}
              {extracted && (
                <div className={`p-3 rounded-lg border flex items-center gap-3 ${
                  extracted.confidence >= 0.7
                    ? 'bg-green-50 border-green-200'
                    : extracted.confidence >= 0.4
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-red-50 border-red-200'
                }`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                    extracted.confidence >= 0.7
                      ? 'bg-green-500 text-white'
                      : extracted.confidence >= 0.4
                        ? 'bg-amber-500 text-white'
                        : 'bg-red-500 text-white'
                  }`}>
                    {Math.round(extracted.confidence * 100)}%
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {extracted.confidence >= 0.7
                        ? '✅ Alta confianza — Verifica los datos'
                        : extracted.confidence >= 0.4
                          ? '⚠️ Media confianza — Revisa y corrige'
                          : '🔴 Baja confianza — Completa los datos manualmente'}
                    </p>
                    <p className="text-xs text-gray-500">
                      Método: {extracted.extraction_method === 'gpt4_vision' ? 'GPT-4 Vision' : 
                               extracted.extraction_method === 'playwright_direct' ? 'Extracción directa' : 
                               'GPT-4 Vision (fallback)'}
                    </p>
                  </div>
                </div>
              )}

              {/* Editable Form */}
              <div className="grid grid-cols-2 gap-4">
                {/* Price - Prominent */}
                <div className="col-span-2 bg-navy-50 border-2 border-navy-200 rounded-xl p-4">
                  <label className="flex items-center gap-1 text-sm font-semibold text-navy-800 mb-2">
                    <DollarSign className="w-4 h-4" />
                    Precio de la Casa *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-2xl font-bold text-navy-400">$</span>
                    <input
                      type="number"
                      value={formData.listing_price || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, listing_price: Number(e.target.value) }))}
                      placeholder="35000"
                      className="w-full pl-10 p-3 border-2 border-navy-300 rounded-lg focus:ring-2 focus:ring-gold-500 focus:border-gold-500 text-2xl font-bold text-navy-900"
                    />
                  </div>
                </div>

                {/* Address */}
                <div className="col-span-2">
                  <label className="flex items-center gap-1 text-sm font-medium text-gray-700 mb-1">
                    <MapPin className="w-4 h-4" />
                    Dirección
                  </label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                    placeholder="123 Main St"
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gold-500 focus:border-gold-500"
                  />
                </div>

                {/* City */}
                <div>
                  <label className="flex items-center gap-1 text-sm font-medium text-gray-700 mb-1">
                    <Home className="w-4 h-4" />
                    Ciudad *
                  </label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                    placeholder="Houston"
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gold-500 focus:border-gold-500"
                  />
                </div>

                {/* State */}
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Estado</label>
                  <input
                    type="text"
                    value={formData.state}
                    onChange={(e) => setFormData(prev => ({ ...prev, state: e.target.value }))}
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gold-500 focus:border-gold-500"
                  />
                </div>

                {/* ZIP */}
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">ZIP Code</label>
                  <input
                    type="text"
                    value={formData.zip_code}
                    onChange={(e) => setFormData(prev => ({ ...prev, zip_code: e.target.value }))}
                    placeholder="77001"
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gold-500 focus:border-gold-500"
                  />
                </div>

                {/* Year */}
                <div>
                  <label className="flex items-center gap-1 text-sm font-medium text-gray-700 mb-1">
                    <Calendar className="w-4 h-4" />
                    Año
                  </label>
                  <input
                    type="number"
                    value={formData.year_built ?? ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, year_built: e.target.value ? Number(e.target.value) : null }))}
                    placeholder="2005"
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gold-500 focus:border-gold-500"
                  />
                </div>

                {/* Sqft */}
                <div>
                  <label className="flex items-center gap-1 text-sm font-medium text-gray-700 mb-1">
                    <Maximize className="w-4 h-4" />
                    Sqft
                  </label>
                  <input
                    type="number"
                    value={formData.sqft ?? ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, sqft: e.target.value ? Number(e.target.value) : null }))}
                    placeholder="1200"
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gold-500 focus:border-gold-500"
                  />
                </div>

                {/* Bedrooms */}
                <div>
                  <label className="flex items-center gap-1 text-sm font-medium text-gray-700 mb-1">
                    <Bed className="w-4 h-4" />
                    Habitaciones
                  </label>
                  <input
                    type="number"
                    value={formData.bedrooms ?? ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, bedrooms: e.target.value ? Number(e.target.value) : null }))}
                    placeholder="3"
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gold-500 focus:border-gold-500"
                  />
                </div>

                {/* Bathrooms */}
                <div>
                  <label className="flex items-center gap-1 text-sm font-medium text-gray-700 mb-1">
                    <Bath className="w-4 h-4" />
                    Baños
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={formData.bathrooms ?? ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, bathrooms: e.target.value ? Number(e.target.value) : null }))}
                    placeholder="2"
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gold-500 focus:border-gold-500"
                  />
                </div>

                {/* Description */}
                <div className="col-span-2">
                  <label className="flex items-center gap-1 text-sm font-medium text-gray-700 mb-1">
                    <FileText className="w-4 h-4" />
                    Descripción
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Descripción de la propiedad..."
                    rows={2}
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gold-500 focus:border-gold-500 resize-none"
                  />
                </div>

                {/* Source URL (hidden in screenshot mode, shown in link mode) */}
                {activeTab === 'link' && (
                  <div className="col-span-2">
                    <label className="flex items-center gap-1 text-sm font-medium text-gray-700 mb-1">
                      <Link2 className="w-4 h-4" />
                      URL original
                    </label>
                    <input
                      type="url"
                      value={formData.source_url || url}
                      onChange={(e) => setFormData(prev => ({ ...prev, source_url: e.target.value }))}
                      className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gold-500 focus:border-gold-500 text-sm text-gray-500"
                    />
                  </div>
                )}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800 flex items-center gap-2">
                  <Edit3 className="w-4 h-4 flex-shrink-0" />
                  <span>Puedes editar cualquier campo antes de guardar. Las <strong>reglas de calificación</strong> (60%, rango $0-$80K, zona 200mi) se aplicarán automáticamente.</span>
                </p>
              </div>
            </div>
          )}

          {/* === STEP: SAVING === */}
          {step === 'saving' && (
            <div className="py-12 text-center">
              <Loader2 className="w-12 h-12 animate-spin text-gold-500 mx-auto mb-4" />
              <h4 className="text-lg font-semibold text-navy-900 mb-2">Guardando en el dashboard...</h4>
              <p className="text-gray-500 text-sm">Aplicando reglas de calificación</p>
            </div>
          )}
        </div>

        {/* Footer Actions - Always visible */}
        <div className="p-6 bg-gray-50 border-t flex gap-3 flex-shrink-0">
          <button
            onClick={handleClose}
            className="btn-secondary"
            disabled={extracting || saving}
          >
            Cancelar
          </button>

          <div className="flex-1" />

          {/* Input step: Extract button */}
          {step === 'input' && activeTab === 'screenshot' && (
            <button
              onClick={extractFromImage}
              disabled={!imageFile}
              className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-colors ${
                imageFile
                  ? 'btn-gold'
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              Extraer con AI
            </button>
          )}

          {step === 'input' && activeTab === 'link' && (
            <button
              onClick={extractFromURL}
              disabled={!url.trim()}
              className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-colors ${
                url.trim()
                  ? 'btn-gold'
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              Extraer datos
            </button>
          )}

          {/* Review step: Back + Save */}
          {step === 'review' && (
            <>
              <button
                onClick={() => { setStep('input'); setError(null); }}
                className="btn-secondary flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Volver
              </button>
              <button
                onClick={saveToMarket}
                disabled={saving}
                className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2 px-8 py-3 rounded-lg font-semibold text-base transition-colors shadow-lg"
              >
                <Save className="w-5 h-5" />
                Guardar en Dashboard
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

