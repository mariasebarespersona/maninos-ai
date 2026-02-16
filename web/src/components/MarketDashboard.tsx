'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { 
  Search, 
  RefreshCw, 
  MapPin, 
  Calendar, 
  Home,
  DollarSign,
  TrendingUp,
  CheckCircle,
  XCircle,
  AlertCircle,
  ExternalLink,
  ShoppingCart,
  Sparkles,
  Upload,
  FileText,
  CreditCard,
  ChevronRight,
  ChevronLeft,
  X,
  Loader2,
  Plus,
  Trash2,
  Download,
  LayoutGrid,
  Map,
  ChevronDown,
  ChevronUp,
  Target,
} from 'lucide-react';
import { useToast } from './ui/Toast';
import AddMarketListingModal from './AddMarketListingModal';
import StripePaymentForm from './StripePaymentForm';
import BillOfSaleTemplate, { type BillOfSaleData } from './BillOfSaleTemplate';
import TitleApplicationTemplate, { type TitleApplicationData } from './TitleApplicationTemplate';
import DesktopEvaluatorPanel from './DesktopEvaluatorPanel';

// Dynamic import of map component (Leaflet doesn't support SSR)
const MarketMapView = dynamic(() => import('./MarketMapView'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[500px] bg-gray-50 rounded-2xl border border-gray-200">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-gold-500 mx-auto mb-2" />
        <p className="text-sm text-gray-500">Cargando mapa...</p>
      </div>
    </div>
  ),
});

// Types
interface MarketListing {
  id: string;
  source: string;
  source_url: string;
  address: string;
  city: string;
  state: string;
  zip_code: string | null;
  listing_price: number;
  estimated_arv: number | null;
  estimated_renovation: number | null;
  max_offer_70_rule: number | null;
  passes_70_rule: boolean | null;
  passes_age_rule: boolean | null;
  passes_location_rule: boolean | null;
  is_qualified: boolean;
  qualification_score: number;
  qualification_reasons: string[] | null;
  year_built: number | null;
  sqft: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  estimated_roi: number | null;
  photos: string[] | null;
  thumbnail_url: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
  scraped_at: string | null;
}

interface MarketAnalysis {
  id: string | null;
  city: string;
  total_scraped: number;
  market_value_avg: number;
  max_offer_70_percent: number;
  max_offer_60_percent?: number;
  sources: Record<string, number>;
  scraped_at: string;
}

interface MarketStats {
  qualified_in_db: number;
  by_source: Record<string, number>;
  top_cities: { city: string; count: number }[];
  target: number;
  qualified_price_range: {
    min: number;
    max: number;
  };
  market_analysis: MarketAnalysis | null;
}

// Source badge colors
const sourceColors: Record<string, string> = {
  mhvillage: 'bg-blue-100 text-blue-800 border-blue-200',
  mobilehome: 'bg-green-100 text-green-800 border-green-200',
  mhbay: 'bg-amber-100 text-amber-800 border-amber-200',
  vmf_homes: 'bg-violet-100 text-violet-800 border-violet-200',
  '21st_mortgage': 'bg-rose-100 text-rose-800 border-rose-200',
  facebook: 'bg-sky-100 text-sky-800 border-sky-200',
  facebook_marketplace: 'bg-sky-100 text-sky-800 border-sky-200',
  whatsapp: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  instagram: 'bg-pink-100 text-pink-800 border-pink-200',
  manual: 'bg-gray-100 text-gray-800 border-gray-200',
  other: 'bg-gray-100 text-gray-800 border-gray-200',
};

// Source labels
const sourceLabels: Record<string, string> = {
  mhvillage: 'MHVillage',
  mobilehome: 'MobileHome.net',
  mhbay: 'MHBay',
  vmf_homes: 'VMF Homes',
  '21st_mortgage': '21st Mortgage',
  facebook: 'Facebook',
  facebook_marketplace: 'Facebook',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  manual: 'Manual',
  other: 'Otro',
};

// Purchase pipeline status labels & colors (Feb 2026)
const pipelineStatusConfig: Record<string, { label: string; color: string; step: number }> = {
  available:    { label: 'Disponible',       color: 'bg-blue-100 text-blue-700',     step: 1 },
  contacted:    { label: 'Contactado',       color: 'bg-cyan-100 text-cyan-700',     step: 2 },
  negotiating:  { label: 'Negociando',       color: 'bg-yellow-100 text-yellow-700', step: 3 },
  evaluating:   { label: 'Evaluando',        color: 'bg-orange-100 text-orange-700', step: 4 },
  docs_pending: { label: 'Docs Pendientes',  color: 'bg-purple-100 text-purple-700', step: 5 },
  locked:       { label: '🔒 Bloqueada',     color: 'bg-red-100 text-red-700',       step: 6 },
  purchased:    { label: 'Comprada',         color: 'bg-green-100 text-green-700',   step: 7 },
  rejected:     { label: 'Rechazada',        color: 'bg-gray-100 text-gray-500',     step: 0 },
  expired:      { label: 'Expirada',         color: 'bg-gray-100 text-gray-400',     step: 0 },
  reviewing:    { label: 'Revisando',        color: 'bg-amber-100 text-amber-700',   step: 3 },
};

// Purchase flow steps (docs FIRST, then evaluation, then payment, then confirm)
type PurchaseStep = 'documents' | 'checklist' | 'payment' | 'confirm';

// Payment methods — bank transfer is #1 (80% of cases per Abigail/Gabriel)
const PAYMENT_METHODS = [
  { id: 'transferencia', label: '🏦 Transferencia Bancaria', recommended: true, description: 'Método principal (80% de compras)' },
  { id: 'zelle', label: '💸 Zelle', recommended: false, description: 'Zelle al 832-745-9600' },
  { id: 'cheque', label: '📝 Cheque', recommended: false, description: 'Cheque certificado' },
  { id: 'efectivo', label: '💵 Efectivo', recommended: false, description: 'Solo montos pequeños' },
];

// Document types for purchase
interface PurchaseDocuments {
  billOfSale: File | null;
  title: File | null;
  titleApplication: File | null;
}

// Official Texas TDHCA Title Application form
const TDHCA_TITLE_APPLICATION_URL = 'https://www.tdhca.texas.gov/sites/default/files/mh/docs/1023-Statement-Ownership.pdf';

// Payment info
interface PaymentInfo {
  method: string;
  reference: string;
  date: string;
  amount: number;
}

// Checklist de 26 puntos para evaluar propiedades ANTES de comprar
// Basado en el checklist oficial de Maninos Capital LLC
const CHECKLIST_ITEMS = [
  // ESTRUCTURA (4 items)
  { id: 'marco_acero', category: 'Estructura', label: 'Marco de acero' },
  { id: 'suelos_subfloor', category: 'Estructura', label: 'Suelos/subfloor' },
  { id: 'techo_techumbre', category: 'Estructura', label: 'Techo/techumbre' },
  { id: 'paredes_ventanas', category: 'Estructura', label: 'Paredes/ventanas' },
  
  // INSTALACIONES (5 items)
  { id: 'regaderas_tinas', category: 'Instalaciones', label: 'Regaderas/tinas/coladeras' },
  { id: 'electricidad', category: 'Instalaciones', label: 'Electricidad' },
  { id: 'plomeria', category: 'Instalaciones', label: 'Plomería' },
  { id: 'ac', category: 'Instalaciones', label: 'A/C' },
  { id: 'gas', category: 'Instalaciones', label: 'Gas' },
  
  // DOCUMENTACIÓN (5 items)
  { id: 'titulo_limpio', category: 'Documentación', label: 'Título limpio sin adeudos' },
  { id: 'vin_revisado', category: 'Documentación', label: 'VIN revisado' },
  { id: 'docs_vendedor', category: 'Documentación', label: 'Docs vendedor' },
  { id: 'aplicacion_firmada', category: 'Documentación', label: 'Aplicación firmada vendedor/comprador' },
  { id: 'bill_of_sale', category: 'Documentación', label: 'Bill of Sale' },
  
  // FINANCIERO (4 items)
  { id: 'precio_costo_obra', category: 'Financiero', label: 'Precio compra + costo obra' },
  { id: 'reparaciones_30', category: 'Financiero', label: 'Reparaciones < 30% valor venta' },
  { id: 'comparativa_mercado', category: 'Financiero', label: 'Comparativa precios mercado' },
  { id: 'costos_extra', category: 'Financiero', label: 'Costos extra traslado/movida/alineación' },
  
  // ESPECIFICACIONES (5 items)
  { id: 'año', category: 'Especificaciones', label: 'Año' },
  { id: 'condiciones', category: 'Especificaciones', label: 'Condiciones' },
  { id: 'numero_cuartos', category: 'Especificaciones', label: 'Número cuartos' },
  { id: 'lista_reparaciones', category: 'Especificaciones', label: 'Lista reparaciones necesarias' },
  { id: 'recorrido_completo', category: 'Especificaciones', label: 'Recorrido completo' },
  
  // CIERRE (5 items)
  { id: 'deposito_inicial', category: 'Cierre', label: 'Depósito inicial' },
  { id: 'deposit_agreement', category: 'Cierre', label: 'Deposit Agreement firmado' },
  { id: 'contrato_financiamiento', category: 'Cierre', label: 'Contrato firmado si financiamiento' },
  { id: 'pago_total_contado', category: 'Cierre', label: 'Pago total si contado' },
  { id: 'entrega_sobre', category: 'Cierre', label: 'Entrega sobre con aplicación y factura firmada' },
];

// View mode type
type ViewMode = 'grid' | 'map';

export default function MarketDashboard() {
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [stats, setStats] = useState<MarketStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [cityFilter, setCityFilter] = useState('');
  const [maxPriceFilter, setMaxPriceFilter] = useState<number | ''>('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const toast = useToast();
  
  // Add listing modal
  const [showAddModal, setShowAddModal] = useState(false);
  
  // Facebook connection state
  const [fbConnected, setFbConnected] = useState(false);
  const [fbConnecting, setFbConnecting] = useState(false);
  const [showCookieImport, setShowCookieImport] = useState(false);
  const [cookieJson, setCookieJson] = useState('');

  // Purchase flow state
  const [selectedListing, setSelectedListing] = useState<MarketListing | null>(null);
  const [purchaseStep, setPurchaseStep] = useState<PurchaseStep>('checklist');
  const [processing, setProcessing] = useState(false);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [documents, setDocuments] = useState<PurchaseDocuments>({ billOfSale: null, title: null, titleApplication: null });
  const [payment, setPayment] = useState<PaymentInfo>({
    method: '',
    reference: '',
    date: new Date().toISOString().split('T')[0],
    amount: 0,
  });
  
  // TDHCA Title lookup state
  const [tdhcaSearchValue, setTdhcaSearchValue] = useState('');
  const [tdhcaSearchType, setTdhcaSearchType] = useState<'label' | 'serial'>('serial');
  const [tdhcaLoading, setTdhcaLoading] = useState(false);
  const [tdhcaResult, setTdhcaResult] = useState<any>(null);
  const [tdhcaError, setTdhcaError] = useState<string | null>(null);

  // Evaluation report state (set by DesktopEvaluatorPanel callback)
  const [evalReport, setEvalReport] = useState<any>(null);

  // Bill of Sale template state
  const [showBillOfSale, setShowBillOfSale] = useState(false);
  const [billOfSaleData, setBillOfSaleData] = useState<BillOfSaleData | null>(null);
  
  // Title Application template state
  const [showTitleApp, setShowTitleApp] = useState(false);
  const [titleAppData, setTitleAppData] = useState<TitleApplicationData | null>(null);

  // Price predictions (from historical data)
  const [predictions, setPredictions] = useState<Record<string, any>>({});
  const [predictionsLoading, setPredictionsLoading] = useState(false);
  
  // Historical summary stats
  const [historicalStats, setHistoricalStats] = useState<any>(null);
  
  // Dismiss animation state
  const [dismissingIds, setDismissingIds] = useState<Set<string>>(new Set());
  
  // Expanded prediction detail (which listing ID has its prediction panel open)
  const [expandedPrediction, setExpandedPrediction] = useState<string | null>(null);

  // Fetch listings
  const fetchListings = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.append('qualified_only', 'true');
      params.append('limit', '10');
      if (cityFilter) params.append('city', cityFilter);
      if (maxPriceFilter) params.append('max_price', String(maxPriceFilter));

      const response = await fetch(`/api/market-listings?${params}`);
      if (!response.ok) throw new Error('Failed to fetch listings');
      const data = await response.json();
      setListings(data.listings || []);
    } catch (error) {
      console.error('Error fetching listings:', error);
      toast.error('Error al cargar propiedades del mercado');
    }
  }, [cityFilter, maxPriceFilter, toast]);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch('/api/market-listings/stats');
      if (!response.ok) throw new Error('Failed to fetch stats');
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  }, []);

  // Fetch historical summary stats (for the banner)
  const fetchHistoricalStats = useCallback(async () => {
    try {
      const response = await fetch('/api/market-listings/historical-stats');
      if (response.ok) {
        const data = await response.json();
        if (data.success) setHistoricalStats(data.stats);
      }
    } catch (error) {
      console.error('Error fetching historical stats:', error);
    }
  }, []);

  // Fetch price predictions for listings
  const fetchPredictions = useCallback(async (listingsData: MarketListing[]) => {
    if (!listingsData.length) return;
    setPredictionsLoading(true);
    try {
      const predMap: Record<string, any> = {};
      const batchSize = 5;
      for (let i = 0; i < listingsData.length; i += batchSize) {
        const batch = listingsData.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map(listing =>
            fetch('/api/market-listings/predict-price', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                listing_price: listing.listing_price,
                sqft: listing.sqft,
                bedrooms: listing.bedrooms,
                bathrooms: listing.bathrooms,
                description: listing.address || '',
              }),
            }).then(r => r.json()).then(data => ({
              id: listing.id,
              prediction: data.success ? data.prediction : null,
            }))
          )
        );
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value.prediction) {
            predMap[result.value.id] = result.value.prediction;
          }
        }
      }
      setPredictions(predMap);
    } catch (error) {
      console.error('Error fetching predictions:', error);
    } finally {
      setPredictionsLoading(false);
    }
  }, []);

  // Check Facebook connection status
  const checkFbStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/facebook/status');
      if (res.ok) {
        const data = await res.json();
        setFbConnected(data.authenticated);
      }
    } catch (e) {
      console.log('FB status check failed (non-critical)');
    }
  }, []);

  // Connect Facebook - interactive login
  const connectFacebook = async () => {
    setFbConnecting(true);
    try {
      const res = await fetch('/api/facebook/connect', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setFbConnected(true);
        toast.success('✅ Facebook conectado! Ahora puedes buscar casas en Marketplace.');
      } else if (data.use_cookie_import) {
        // Server can't do interactive login — show cookie import form
        setShowCookieImport(true);
        toast.info('Usa "Importar Cookies" para conectar Facebook desde el servidor.');
      } else {
        toast.error(data.message || 'No se pudo conectar Facebook');
      }
    } catch (e) {
      toast.error('Error conectando Facebook');
    } finally {
      setFbConnecting(false);
    }
  };

  // Import Facebook cookies
  const importFbCookies = async () => {
    if (!cookieJson.trim()) {
      toast.error('Pega las cookies JSON');
      return;
    }
    try {
      const res = await fetch('/api/facebook/import-cookies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookies_json: cookieJson }),
      });
      const data = await res.json();
      if (data.success) {
        setFbConnected(true);
        setShowCookieImport(false);
        setCookieJson('');
        toast.success('✅ Cookies importadas! Facebook Marketplace activado.');
      } else {
        toast.error(data.detail || 'Cookies inválidas');
      }
    } catch (e) {
      toast.error('Error importando cookies');
    }
  };

  // Disconnect Facebook
  const disconnectFacebook = async () => {
    try {
      await fetch('/api/facebook/disconnect', { method: 'POST' });
      setFbConnected(false);
      toast.success('Facebook desconectado');
    } catch (e) {}
  };

  // Dismiss a listing (trash) — sets status to "dismissed" so it won't reappear
  const dismissListing = async (listingId: string, address: string) => {
    // Step 1: Start fade-out animation
    setDismissingIds(prev => new Set(prev).add(listingId));
    
    // Step 2: After animation completes, remove from local state + call API
    setTimeout(async () => {
    setListings(prev => prev.filter(l => l.id !== listingId));
      setDismissingIds(prev => {
        const next = new Set(prev);
        next.delete(listingId);
        return next;
      });
    
    try {
      const res = await fetch(`/api/market-listings/${listingId}/status?status=dismissed&force=true`, {
        method: 'PATCH',
      });
      if (res.ok) {
        toast.success('🗑️ Descartada. No volverá a aparecer.');
      } else {
          toast.error('Error al descartar la propiedad');
      }
    } catch (e) {
      toast.error('Error al descartar');
    }
    }, 300); // 300ms matches the CSS transition duration
  };

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchListings(), fetchStats(), checkFbStatus(), fetchHistoricalStats()]);
      setLoading(false);
    };
    loadData();
  }, [fetchListings, fetchStats, checkFbStatus, fetchHistoricalStats]);

  // Fetch predictions when listings change
  useEffect(() => {
    if (listings.length > 0) {
      fetchPredictions(listings);
    }
  }, [listings, fetchPredictions]);

  // Trigger AI search - Direct scraping endpoint
  const triggerSearch = async () => {
    setSearching(true);
    try {
      // Use direct scraping endpoint (faster, no LLM needed)
      // Scrapes MHVillage, MobileHome.net, and MHBay
      const response = await fetch('/api/market-listings/scrape', {
        method: 'POST',
      });
      
      if (!response.ok) throw new Error('Search failed');
      
      const result = await response.json();
      toast.success(
        `✓ Encontradas ${result.qualified} casas calificadas de ${result.market_analysis?.total_scraped || 0} analizadas`
      );
      
      // Refresh listings
      await fetchListings();
      await fetchStats();
      
    } catch (error) {
      console.error('Search error:', error);
      toast.error('Error al buscar propiedades');
    } finally {
      setSearching(false);
    }
  };

  // Start review process - Opens documents modal first (docs before evaluation)
  const startReview = (listing: MarketListing) => {
    setSelectedListing(listing);
    setPurchaseStep('documents');
    // Initialize checklist from saved data or empty
    setChecklist({});
    setDocuments({ billOfSale: null, title: null, titleApplication: null });
    setPayment({
      method: '',
      reference: '',
      date: new Date().toISOString().split('T')[0],
      amount: listing.listing_price,
    });
    // Initialize templates
    setShowBillOfSale(false);
    setBillOfSaleData(null);
    setShowTitleApp(false);
    setTitleAppData(null);
    // Reset TDHCA lookup
    setTdhcaSearchValue('');
    setTdhcaResult(null);
    setTdhcaError(null);
  };

  // Close modal
  const closeModal = () => {
    setSelectedListing(null);
    setPurchaseStep('documents');
    setChecklist({});
    setDocuments({ billOfSale: null, title: null, titleApplication: null });
    setPayment({ method: '', reference: '', date: '', amount: 0 });
    setTdhcaSearchValue('');
    setTdhcaResult(null);
    setTdhcaError(null);
    setShowBillOfSale(false);
    setBillOfSaleData(null);
    setShowTitleApp(false);
    setTitleAppData(null);
    setEvalReport(null);
  };

  // Navigation between steps (order: documents → checklist → payment → confirm)
  const STEP_ORDER: PurchaseStep[] = ['documents', 'checklist', 'payment', 'confirm'];
  
  // Bill of Sale is complete if either the template was filled or a file was uploaded
  const isBosComplete = !!(billOfSaleData || documents.billOfSale);
  // Title is complete if TDHCA found it or a file was uploaded
  const isTitleComplete = !!(tdhcaResult || documents.title);
  // Title application is complete if template was filled or a file was uploaded
  const isTitleAppComplete = !!(titleAppData || documents.titleApplication);
  const allDocsReady = isBosComplete && isTitleComplete && isTitleAppComplete;

  const isEvalComplete = !!evalReport;

  const goToNextStep = () => {
    if (purchaseStep === 'documents' && allDocsReady) {
      setPurchaseStep('checklist');
    } else if (purchaseStep === 'checklist' && isEvalComplete) {
      setPurchaseStep('payment');
    } else if (purchaseStep === 'payment' && payment.method && payment.reference) {
      setPurchaseStep('confirm');
    }
  };

  const goToPrevStep = () => {
    if (purchaseStep === 'checklist') setPurchaseStep('documents');
    else if (purchaseStep === 'payment') setPurchaseStep('checklist');
    else if (purchaseStep === 'confirm') setPurchaseStep('payment');
  };

  // Handle file upload
  const handleFileUpload = (type: 'billOfSale' | 'title' | 'titleApplication', file: File | null) => {
    setDocuments(prev => ({ ...prev, [type]: file }));
  };
  
  // TDHCA Title lookup
  const lookupTDHCA = async () => {
    if (!tdhcaSearchValue.trim()) return;
    setTdhcaLoading(true);
    setTdhcaError(null);
    setTdhcaResult(null);
    try {
      const res = await fetch('/api/market-listings/tdhca-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          search_value: tdhcaSearchValue.trim(),
          search_type: tdhcaSearchType,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTdhcaResult(data.data);
        // Title found via TDHCA — URL will be stored as detail_url, no fake file needed
      } else {
        setTdhcaError(data.message || 'No se encontraron resultados');
      }
    } catch (err: any) {
      setTdhcaError(`Error: ${err.message}`);
    } finally {
      setTdhcaLoading(false);
    }
  };


  // Toggle checklist item
  const toggleChecklistItem = (itemId: string) => {
    setChecklist(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  // Save checklist to database
  const saveChecklist = async () => {
    if (!selectedListing) return;
    
    setProcessing(true);
    try {
      // Save checklist to market_listings table
      const response = await fetch(`/api/market-listings/${selectedListing.id}/checklist`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklist_data: checklist }),
      });
      
      if (!response.ok) throw new Error('Failed to save checklist');
      
      toast.success('✓ Checklist guardado');
    } catch (error) {
      console.error('Error saving checklist:', error);
      toast.error('Error al guardar checklist');
    } finally {
      setProcessing(false);
    }
  };

  // Check if checklist is complete enough (at least 80%)
  const checklistProgress = () => {
    const completed = Object.values(checklist).filter(Boolean).length;
    return {
      completed,
      total: CHECKLIST_ITEMS.length,
      percentage: Math.round((completed / CHECKLIST_ITEMS.length) * 100),
      canPurchase: completed >= Math.ceil(CHECKLIST_ITEMS.length * 0.8), // 80% minimum
    };
  };

  // Upload document to Supabase Storage
  const uploadDocument = async (propertyId: string, file: File, docType: string): Promise<string | null> => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('property_id', propertyId);
      formData.append('doc_type', docType);
      
      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) throw new Error('Upload failed');
      const data = await response.json();
      return data.url;
    } catch (error) {
      console.error(`Error uploading ${docType}:`, error);
      return null;
    }
  };

  // Confirm purchase after all steps complete
  const confirmPurchase = async () => {
    if (!selectedListing) return;
    
    setProcessing(true);
    try {
      // 1. Create property in Maninos inventory — auto-fill from listing + TDHCA
      const detailNotes = [
        `Fuente: ${sourceLabels[selectedListing.source] || selectedListing.source}`,
        `URL: ${selectedListing.source_url}`,
        `Pago: ${payment.method} - Ref: ${payment.reference}`,
        selectedListing.estimated_arv ? `Valor mercado estimado: $${selectedListing.estimated_arv.toLocaleString()}` : '',
        selectedListing.qualification_score ? `Score calificación: ${selectedListing.qualification_score}/100` : '',
        tdhcaResult?.certificate_number ? `TDHCA Cert#: ${tdhcaResult.certificate_number}` : '',
        tdhcaResult?.manufacturer ? `Fabricante: ${tdhcaResult.manufacturer} ${tdhcaResult.model || ''}` : '',
        tdhcaResult?.serial_number ? `Serial#: ${tdhcaResult.serial_number}` : '',
        tdhcaResult?.label_seal ? `Label/Seal#: ${tdhcaResult.label_seal}` : '',
        tdhcaResult?.seller ? `Vendedor prev: ${tdhcaResult.seller}` : '',
        tdhcaResult?.buyer ? `Comprador prev: ${tdhcaResult.buyer}` : '',
        tdhcaResult?.county ? `Condado: ${tdhcaResult.county}` : '',
        tdhcaResult?.lien_info ? `Gravamen: ${tdhcaResult.lien_info}` : '',
      ].filter(Boolean).join('\n');
      
      // Build checklist_data from evalReport if available
      const evalChecklist: Record<string, boolean> = {};
      if (evalReport?.checklist) {
        for (const item of evalReport.checklist) {
          evalChecklist[item.id] = item.status === 'pass' || item.status === 'warning';
        }
      }

      const response = await fetch('/api/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: selectedListing.address,
          city: selectedListing.city,
          state: selectedListing.state,
          zip_code: selectedListing.zip_code || '',
          purchase_price: selectedListing.listing_price,
          year_built: tdhcaResult?.year ? parseInt(tdhcaResult.year) : selectedListing.year_built,
          sqft: tdhcaResult?.square_feet ? parseInt(tdhcaResult.square_feet) : selectedListing.sqft,
          bedrooms: selectedListing.bedrooms,
          bathrooms: selectedListing.bathrooms,
          status: 'purchased',
          photos: selectedListing.photos || [],
          thumbnail_url: selectedListing.thumbnail_url,
          checklist_data: Object.keys(evalChecklist).length > 0 ? evalChecklist : checklist,
          checklist_completed: true,
          notes: detailNotes,
        }),
      });
      
      if (!response.ok) throw new Error('Failed to create property');
      
      const property = await response.json();
      
      // 2. Upload documents and get URLs
      let billOfSaleUrl = null;
      let titleUrl = null;
      let titleApplicationUrl = null;
      
      if (documents.billOfSale) {
        billOfSaleUrl = await uploadDocument(property.id, documents.billOfSale, 'bill_of_sale_purchase');
      }
      if (documents.title) {
        titleUrl = await uploadDocument(property.id, documents.title, 'title_purchase');
      }
      if (documents.titleApplication) {
        titleApplicationUrl = await uploadDocument(property.id, documents.titleApplication, 'title_application_purchase');
      }
      
      // If TDHCA lookup found a title, use that URL as fallback
      if (!titleUrl && tdhcaResult?.detail_url) {
        titleUrl = tdhcaResult.detail_url;
      }
      // If no title application was uploaded, store the official TDHCA template URL
      if (!titleApplicationUrl) {
        titleApplicationUrl = TDHCA_TITLE_APPLICATION_URL;
      }
      
      // 3. Create title transfer record with payment info AND document URLs
      await fetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: property.id,
          transfer_type: 'purchase',
          from_name: 'Vendedor',
          to_name: 'Maninos Homes',
          payment_method: payment.method,
          payment_reference: payment.reference,
          payment_date: payment.date,
          payment_amount: payment.amount,
          // Include uploaded document URLs
          bill_of_sale_url: billOfSaleUrl,
          title_url: titleUrl,
          title_application_url: titleApplicationUrl,
        }),
      });
      
      // 3.5. Link evaluation report to property
      if (evalReport?.id) {
        await fetch(`/api/evaluations/${evalReport.id}/link`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ property_id: property.id, listing_id: selectedListing.id }),
        }).catch(() => {});
      }

      // 4. Update market listing status to purchased (critical — prevents re-showing)
      const statusRes = await fetch(`/api/market-listings/${selectedListing.id}/status?status=purchased`, {
        method: 'PATCH',
      });
      if (!statusRes.ok) {
        console.warn('Warning: Could not mark market listing as purchased, retrying...');
        // Retry once
        await fetch(`/api/market-listings/${selectedListing.id}/status?status=purchased`, {
          method: 'PATCH',
        });
      }
      
      toast.success('✓ ¡Casa comprada! Documentos guardados y agregada al inventario.');
      
      // 5. Close modal and refresh listings
      closeModal();
      await fetchListings();
      await fetchStats();
      
      // 6. Redirect to property page
      window.location.href = `/homes/properties/${property.id}`;
      
    } catch (error) {
      console.error('Error confirming purchase:', error);
      toast.error('Error al confirmar la compra');
    } finally {
      setProcessing(false);
    }
  };

  // Render qualification badge
  const QualificationBadge = ({ listing }: { listing: MarketListing }) => {
    if (listing.is_qualified) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
          <CheckCircle className="w-3 h-3" />
          Calificada
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
        <XCircle className="w-3 h-3" />
        No califica
      </span>
    );
  };

  // Render rule status
  const RuleStatus = ({ passed, label }: { passed: boolean | null; label: string }) => {
    if (passed === null) {
      return (
        <span className="flex items-center gap-1 text-xs text-gray-500">
          <AlertCircle className="w-3 h-3" />
          {label}
        </span>
      );
    }
    return (
      <span className={`flex items-center gap-1 text-xs ${passed ? 'text-green-600' : 'text-red-600'}`}>
        {passed ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
        {label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-gold-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-semibold text-navy-900">
            🏠 Casas del Mercado
          </h2>
          <p className="text-gray-600 mt-1">
            Propiedades encontradas por el agente AI que cumplen los criterios financieros
          </p>
        </div>
        
        {/* Stats badges */}
        {stats && (
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg border border-green-200">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <span className="text-sm font-medium text-green-800">
                {stats.qualified_in_db} / {stats.target} calificadas
              </span>
            </div>
            {stats.qualified_in_db < stats.target && (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-lg border border-amber-200">
                <AlertCircle className="w-5 h-5 text-amber-600" />
                <span className="text-sm font-medium text-amber-800">
                  Necesita {stats.target - stats.qualified_in_db} más
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 📊 MARKET VALUE ANALYSIS PANEL */}
      {stats?.market_analysis && (
        <div className="bg-gradient-to-r from-navy-900 to-navy-800 rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="w-6 h-6 text-gold-400" />
            <h3 className="text-lg font-semibold">Análisis de Mercado - {stats.market_analysis.city}</h3>
            <span className="text-xs bg-gold-500/20 text-gold-300 px-2 py-1 rounded-full">
              {stats.market_analysis.total_scraped} casas analizadas
            </span>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {/* Market Value */}
            <div className="space-y-1">
              <p className="text-navy-300 text-sm">Valor de Mercado (Media)</p>
              <p className="text-3xl font-bold text-white">
                ${stats.market_analysis.market_value_avg.toLocaleString()}
              </p>
            </div>
            
            {/* Max Offer 60% */}
            <div className="space-y-1">
              <p className="text-navy-300 text-sm">Máxima Oferta (60%)</p>
              <p className="text-3xl font-bold text-gold-400">
                ${(stats.market_analysis.max_offer_60_percent || stats.market_analysis.max_offer_70_percent || 0).toLocaleString()}
              </p>
            </div>
            
            {/* Price Range Filter */}
            <div className="space-y-1">
              <p className="text-navy-300 text-sm">Rango de Precio (Filtro)</p>
              <p className="text-xl font-semibold text-white">
                $5,000 - $80,000
              </p>
            </div>
            
            {/* Qualified Count */}
            <div className="space-y-1">
              <p className="text-navy-300 text-sm">Calificadas en DB</p>
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-bold text-green-400">{stats.qualified_in_db}</p>
                <p className="text-navy-300 text-sm">de {stats.market_analysis.total_scraped}</p>
              </div>
            </div>
          </div>
          
          {/* Sources breakdown */}
          <div className="mt-4 pt-4 border-t border-navy-700">
            <p className="text-navy-300 text-xs mb-2">Fuentes del último scraping:</p>
            <div className="flex gap-4 flex-wrap">
              {Object.entries(stats.market_analysis.sources || {}).filter(([source]) => source !== 'craigslist').map(([source, count]) => (
                <span key={source} className="text-sm text-navy-200">
                  <span className="text-white font-medium">{sourceLabels[source] || source}:</span> {count}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {/* No market analysis yet */}
      {stats && !stats.market_analysis && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            <p className="text-amber-800">
              No hay análisis de mercado. Haz clic en "Buscar con AI" para scrapear las 3 fuentes.
            </p>
          </div>
        </div>
      )}
      
      {/* Facebook Connection Banner */}
      {!fbConnected && (
        <div className="bg-gradient-to-r from-sky-50 to-blue-50 border border-sky-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-sky-100 rounded-lg flex items-center justify-center">
                <span className="text-xl">📘</span>
              </div>
              <div>
                <h4 className="font-semibold text-sky-900">Facebook Marketplace no conectado</h4>
                <p className="text-sm text-sky-700">
                  Conecta tu Facebook para buscar casas automáticamente en Marketplace — la fuente principal de Maninos.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={connectFacebook}
                disabled={fbConnecting}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-medium text-sm flex items-center gap-2 transition-colors"
              >
                {fbConnecting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Conectando...</>
                ) : (
                  '🔗 Conectar Facebook'
                )}
              </button>
              <button
                onClick={() => setShowCookieImport(!showCookieImport)}
                className="px-3 py-2 border border-sky-300 text-sky-700 rounded-lg text-sm hover:bg-sky-50 transition-colors"
              >
                📋 Importar Cookies
              </button>
            </div>
          </div>
          
          {/* Cookie import form */}
          {showCookieImport && (
            <div className="mt-4 border-t border-sky-200 pt-4">
              <p className="text-sm text-sky-700 mb-2">
                <strong>Opción alternativa:</strong> Exporta cookies de Facebook desde tu navegador 
                (usa extensión &quot;Cookie-Editor&quot; en Chrome) y pégalas aquí:
              </p>
              <div className="flex gap-2">
                <textarea
                  value={cookieJson}
                  onChange={(e) => setCookieJson(e.target.value)}
                  placeholder='[{"name":"c_user","value":"...","domain":".facebook.com",...}]'
                  className="flex-1 px-3 py-2 border border-sky-300 rounded-lg text-sm font-mono bg-white resize-none h-20"
                />
                <button
                  onClick={importFbCookies}
                  className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700"
                >
                  Importar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Facebook Connected indicator */}
      {fbConnected && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <span className="text-green-800 font-medium text-sm">
              Facebook Marketplace conectado ✓ — Las búsquedas incluirán casas de Facebook.
            </span>
          </div>
          <button
            onClick={disconnectFacebook}
            className="text-green-600 hover:text-red-500 text-xs underline"
          >
            Desconectar
          </button>
        </div>
      )}

      {/* Action Bar */}
      <div className="flex items-center justify-between gap-3">
        {/* View Toggle — Grid / Map (like VMF Homes) */}
        <div className="flex items-center bg-gray-100 rounded-xl p-1">
          <button
            onClick={() => setViewMode('grid')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              viewMode === 'grid'
                ? 'bg-white text-navy-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            Cuadrícula
          </button>
          <button
            onClick={() => setViewMode('map')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              viewMode === 'map'
                ? 'bg-white text-navy-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Map className="w-4 h-4" />
            Mapa
          </button>
        </div>

        <div className="flex gap-3">
        <button
          onClick={() => fetchListings()}
          className="btn-secondary flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Refrescar
        </button>
        <button
          onClick={() => setShowAddModal(true)}
          className="btn-secondary flex items-center gap-2 border-sky-300 text-sky-700 hover:bg-sky-50"
        >
          <Plus className="w-4 h-4" />
          Agregar Manual
        </button>
        <button
          onClick={triggerSearch}
          disabled={searching}
          className="btn-gold flex items-center gap-2"
        >
          {searching ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
                Buscando en {fbConnected ? 5 : 4} fuentes...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
                🔍 Buscar Casas ({fbConnected ? '5 fuentes' : '4 fuentes'})
            </>
          )}
        </button>
        </div>
      </div>

      {/* Listings — Grid View or Map View */}
      {listings.length === 0 ? (
        <div className="card p-12 text-center">
          <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-700 mb-2">
            No hay propiedades en el dashboard
          </h3>
          <p className="text-gray-500 mb-4">
            Haz clic en &quot;Buscar Casas&quot; para encontrar propiedades calificadas
          </p>
          <button
            onClick={triggerSearch}
            disabled={searching}
            className="btn-gold"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Iniciar búsqueda
          </button>
        </div>
      ) : viewMode === 'map' ? (
        /* ===== MAP VIEW (Vanderbilt-style) ===== */
        <MarketMapView
          listings={listings}
          onReviewClick={startReview}
          sourceColors={sourceColors}
          sourceLabels={sourceLabels}
        />
      ) : (
        /* ===== GRID VIEW (original cards) ===== */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {listings.map((listing) => (
            <div
              key={listing.id}
              className={`card hover:shadow-lg transition-all duration-300 overflow-hidden ${
                dismissingIds.has(listing.id) ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'
              }`}
            >
              {/* Image */}
              <div className="relative h-40 bg-gray-100">
                {listing.thumbnail_url || (listing.photos && listing.photos[0]) ? (
                  <img
                    src={listing.thumbnail_url || listing.photos![0]}
                    alt={listing.address}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Home className="w-12 h-12 text-gray-300" />
                  </div>
                )}
                
                {/* Source badge */}
                <span className={`absolute top-2 left-2 px-2 py-1 rounded text-xs font-medium border ${sourceColors[listing.source] || 'bg-gray-100 text-gray-800'}`}>
                  {sourceLabels[listing.source] || listing.source}
                </span>
                
                {/* Score badge */}
                <span className="absolute top-2 right-2 px-2 py-1 rounded text-xs font-medium bg-navy-900 text-white">
                  {listing.qualification_score}/100
                </span>
              </div>
              
              {/* Content */}
              <div className="p-4">
                {/* Price and qualification */}
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-xl font-bold text-navy-900">
                      ${listing.listing_price.toLocaleString()}
                    </p>
                    {listing.estimated_roi && (
                      <p className="text-sm text-green-600 flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" />
                        ROI: {listing.estimated_roi.toFixed(1)}%
                      </p>
                    )}
                  </div>
                  <QualificationBadge listing={listing} />
                </div>
                
                {/* Address */}
                <p className="text-sm text-gray-700 font-medium mb-1">
                  {listing.address}
                </p>
                <p className="text-xs text-gray-500 mb-3">
                  {listing.city}, {listing.state}
                </p>
                
                {/* Specs */}
                <div className="flex items-center gap-3 text-xs text-gray-600 mb-3">
                  {listing.bedrooms && (
                    <span>{listing.bedrooms} hab</span>
                  )}
                  {listing.bathrooms && (
                    <span>{listing.bathrooms} baño</span>
                  )}
                  {listing.sqft && (
                    <span>{listing.sqft} sqft</span>
                  )}
                  {listing.year_built && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {listing.year_built}
                    </span>
                  )}
                </div>
                
                {/* Rules status */}
                <div className="flex flex-wrap gap-2 mb-3">
                  <RuleStatus passed={listing.passes_70_rule} label="60%" />
                  <RuleStatus passed={listing.passes_age_rule} label="Rango" />
                  <RuleStatus passed={listing.passes_location_rule} label="Zona" />
                </div>
                
                {/* Max offer */}
                {listing.max_offer_70_rule && (
                  <p className="text-xs text-gray-500 mb-1">
                    Oferta máx (60%): ${listing.max_offer_70_rule.toLocaleString()}
                  </p>
                )}
                
                {/* Price Prediction from Historical Data — CLICKABLE */}
                {predictions[listing.id] ? (() => {
                  const pred = predictions[listing.id];
                  const isExpanded = expandedPrediction === listing.id;
                  const signalColors: Record<string, string> = {
                    excelente: 'bg-green-50 border-green-300',
                    bueno: 'bg-green-50 border-green-200',
                    negociar: 'bg-yellow-50 border-yellow-200',
                    caro: 'bg-red-50 border-red-200',
                  };
                  const borderColor = signalColors[pred.signal] || 'bg-gray-50 border-gray-200';
                  
                  return (
                    <div className={`rounded-lg mb-3 border transition-all duration-200 ${borderColor}`}>
                      {/* Clickable summary */}
                      <div
                        className="p-2.5 cursor-pointer hover:bg-black/5 transition-colors rounded-lg"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedPrediction(isExpanded ? null : listing.id);
                        }}
                      >
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Target className="w-3.5 h-3.5 text-gold-600" />
                          <span className="text-xs font-semibold text-gray-800">Predicción Histórica</span>
                          <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                            pred.confidence === 'alta' ? 'bg-green-100 text-green-700' :
                            pred.confidence === 'media' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {pred.confidence === 'alta' ? '🎯 Alta' :
                             pred.confidence === 'media' ? '📊 Media' : '📈 Baja'}
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                          )}
                        </div>
                        
                        {/* Main recommendation — BIG and clear */}
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="text-[11px] text-gray-500">Comprar por:</span>
                          <span className="text-lg font-bold text-navy-900">
                            ${pred.recommended_buy_price?.toLocaleString()}
                          </span>
                        </div>
                        
                        {/* Signal badge */}
                        <p className="text-[10px] font-medium mb-1.5">
                          {pred.signal_text}
                        </p>
                        
                        {/* Quick stats row */}
                        <div className="grid grid-cols-3 gap-1 text-[10px]">
                          <div>
                            <span className="text-gray-400 block">Venta esp.</span>
                            <span className="font-semibold text-green-700">${pred.expected_sale_price?.toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-gray-400 block">Remodel.</span>
                            <span className="font-semibold text-gray-700">${pred.expected_remodelacion?.toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-gray-400 block">Ganancia</span>
                            <span className={`font-semibold ${pred.expected_ganancia_at_listing >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                              ${pred.expected_ganancia_at_listing?.toLocaleString()}
                            </span>
                          </div>
                        </div>
                        
                        {!isExpanded && (
                          <p className="text-[10px] text-gray-400 mt-1 text-center">Toca para ver análisis detallado ▾</p>
                        )}
                      </div>
                      
                      {/* Expanded detail panel */}
                      {isExpanded && (
                        <div className="border-t border-gray-200 p-3 space-y-3 text-xs">
                          {/* General context */}
                          <p className="text-gray-600 leading-relaxed">{pred.analysis?.resumen}</p>
                          
                          {/* 1. POR QUÉ ESTE PRECIO DE COMPRA */}
                          {pred.analysis?.por_que_compra && (
                            <div className="bg-gold-50 border border-gold-200 rounded-lg p-2.5">
                              <p className="font-semibold text-gold-800 mb-1">💰 {pred.analysis.por_que_compra.titulo}</p>
                              <p className="text-gray-700 leading-relaxed mb-1.5">{pred.analysis.por_que_compra.explicacion}</p>
                              <p className="font-mono text-[11px] text-gray-500 bg-white/60 rounded px-2 py-1 mb-1">{pred.analysis.por_que_compra.calculo}</p>
                              <p className="text-gray-600 font-medium">{pred.analysis.por_que_compra.vs_lista}</p>
                            </div>
                          )}
                          
                          {/* 2. POR QUÉ ESTA VENTA ESPERADA */}
                          {pred.analysis?.por_que_venta && (
                            <div className="bg-green-50 border border-green-200 rounded-lg p-2.5">
                              <p className="font-semibold text-green-800 mb-1">📈 {pred.analysis.por_que_venta.titulo}</p>
                              <p className="text-gray-700 leading-relaxed mb-1.5">{pred.analysis.por_que_venta.explicacion}</p>
                              <div className="space-y-0.5 text-[11px] text-gray-500">
                                {pred.analysis.por_que_venta.detalle_casas?.map((line: string, i: number) => (
                                  <p key={i}>{line}</p>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* 3. POR QUÉ ESTA REMODELACIÓN */}
                          {pred.analysis?.por_que_remodelacion && (
                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2.5">
                              <p className="font-semibold text-yellow-800 mb-1">🔧 {pred.analysis.por_que_remodelacion.titulo}</p>
                              <p className="text-gray-700 leading-relaxed mb-1.5">{pred.analysis.por_que_remodelacion.explicacion}</p>
                              <div className="space-y-0.5 text-[11px] text-gray-500">
                                {pred.analysis.por_que_remodelacion.detalle_casas?.map((line: string, i: number) => (
                                  <p key={i}>{line}</p>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* 4. POR QUÉ ESTA GANANCIA */}
                          {pred.analysis?.por_que_ganancia && (
                            <div className={`rounded-lg p-2.5 border ${
                              pred.expected_ganancia_at_listing >= 0 
                                ? 'bg-blue-50 border-blue-200' 
                                : 'bg-red-50 border-red-200'
                            }`}>
                              <p className={`font-semibold mb-1 ${pred.expected_ganancia_at_listing >= 0 ? 'text-blue-800' : 'text-red-800'}`}>
                                📊 {pred.analysis.por_que_ganancia.titulo}
                              </p>
                              <p className="text-gray-700 leading-relaxed mb-1.5">{pred.analysis.por_que_ganancia.explicacion}</p>
                              <div className="grid grid-cols-1 gap-1 text-[11px] mb-1.5">
                                <div className="bg-white/60 rounded px-2 py-1">
                                  <span className="text-gray-400">Al precio de lista:</span>{' '}
                                  <span className="font-mono text-gray-600">{pred.analysis.por_que_ganancia.calculo_lista}</span>
                                </div>
                                <div className="bg-white/60 rounded px-2 py-1">
                                  <span className="text-gray-400">Al recomendado:</span>{' '}
                                  <span className="font-mono text-gray-600">{pred.analysis.por_que_ganancia.calculo_recomendado}</span>
                                </div>
                              </div>
                              <p className="text-[11px] text-gray-500">{pred.analysis.por_que_ganancia.casas_similares_ganancia}</p>
                            </div>
                          )}
                          
                          {/* Negotiation range visual */}
                          <div className="bg-white border border-gray-200 rounded-lg p-2.5">
                            <p className="font-semibold text-navy-900 mb-1.5">🤝 Rango de negociación</p>
                            <div className="flex items-center gap-2">
                              <span className="text-green-700 font-bold text-[11px]">${pred.negotiation_range?.min?.toLocaleString()}</span>
                              <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden relative">
                                {(() => {
                                  const rangeMin = pred.negotiation_range?.min || 0;
                                  const rangeMax = Math.max(pred.negotiation_range?.max || 0, listing.listing_price * 1.1);
                                  const span = rangeMax - rangeMin;
                                  const pctBuy = span > 0 ? ((pred.recommended_buy_price - rangeMin) / span) * 100 : 50;
                                  const pctListing = span > 0 ? ((listing.listing_price - rangeMin) / span) * 100 : 70;
                                  return (
                                    <>
                                      <div className="absolute inset-y-0 left-0 bg-green-300 rounded-full" style={{ width: `${Math.min(pctBuy, 100)}%` }} />
                                      <div className="absolute top-[-1px] w-2 h-4 bg-green-700 rounded-sm" style={{ left: `${Math.min(pctBuy, 98)}%` }} title={`Recomendado: $${pred.recommended_buy_price?.toLocaleString()}`} />
                                      <div className="absolute top-[-1px] w-2 h-4 bg-red-500 rounded-sm" style={{ left: `${Math.min(pctListing, 98)}%` }} title={`Lista: $${listing.listing_price?.toLocaleString()}`} />
                                    </>
                                  );
                                })()}
                              </div>
                              <span className="text-gray-500 font-bold text-[11px]">${pred.negotiation_range?.max?.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                              <span>Ideal</span>
                              <span className="flex items-center gap-3">
                                <span><span className="inline-block w-2 h-2 bg-green-700 rounded mr-0.5" /> Comprar ${pred.recommended_buy_price?.toLocaleString()}</span>
                                <span><span className="inline-block w-2 h-2 bg-red-500 rounded mr-0.5" /> Lista ${listing.listing_price?.toLocaleString()}</span>
                              </span>
                            </div>
                          </div>
                          
                          {/* Similar houses table */}
                          {pred.similar_houses && pred.similar_houses.length > 0 && (
                            <div>
                              <p className="font-semibold text-navy-900 mb-1">🏠 Casas históricas similares ({pred.similar_houses.length})</p>
                              <div className="overflow-x-auto">
                                <table className="w-full text-[10px]">
                                  <thead>
                                    <tr className="bg-gray-100 text-gray-600">
                                      <th className="py-1 px-1.5 text-left">ID</th>
                                      <th className="py-1 px-1.5 text-right">Compra</th>
                                      <th className="py-1 px-1.5 text-right">Remodel.</th>
                                      <th className="py-1 px-1.5 text-right">Venta</th>
                                      <th className="py-1 px-1.5 text-right">Ganancia</th>
                                      <th className="py-1 px-1.5 text-right">Margen</th>
                                      <th className="py-1 px-1.5 text-right">Simil.</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {pred.similar_houses.map((h: any, i: number) => (
                                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                        <td className="py-1 px-1.5 font-medium">{h.id}</td>
                                        <td className="py-1 px-1.5 text-right">${h.precio_compra?.toLocaleString()}</td>
                                        <td className="py-1 px-1.5 text-right">${h.remodelacion?.toLocaleString()}</td>
                                        <td className="py-1 px-1.5 text-right text-green-700">${h.precio_venta?.toLocaleString()}</td>
                                        <td className="py-1 px-1.5 text-right">${h.ganancia?.toLocaleString()}</td>
                                        <td className="py-1 px-1.5 text-right">{h.margen_pct?.toFixed(0)}%</td>
                                        <td className="py-1 px-1.5 text-right text-gray-400">{h.similitud}%</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                          
                          {/* Note */}
                          <p className="text-[10px] text-gray-400 text-center">{pred.analysis?.nota}</p>
                        </div>
                      )}
                    </div>
                  );
                })() : predictionsLoading ? (
                  <div className="flex items-center gap-2 text-xs text-gray-400 mb-3 p-2">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Calculando predicción...
                  </div>
                ) : null}
                
                {/* Actions */}
                <div className="flex gap-2">
                  <a
                    href={listing.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 btn-secondary text-xs py-2 flex items-center justify-center gap-1"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Ver Original
                  </a>
                  <button
                    onClick={() => startReview(listing)}
                    disabled={!listing.is_qualified}
                    className={`flex-1 text-xs py-2 flex items-center justify-center gap-1 rounded-lg font-medium transition-colors ${
                      listing.is_qualified
                        ? 'btn-gold'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    <CheckCircle className="w-3 h-3" />
                    Revisar Casa
                  </button>
                  <button
                    onClick={() => dismissListing(listing.id, listing.address)}
                    className="px-2 py-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Descartar — no volverá a aparecer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Historical Data Stats Banner */}
      {historicalStats && (
        <div className="card p-5 bg-gradient-to-r from-navy-900 to-navy-800 text-white border-0">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-gold-400" />
            <h4 className="font-semibold text-lg">Datos Históricos Maninos 2025</h4>
            <span className="ml-auto text-xs bg-white/15 px-2 py-1 rounded-full">
              {historicalStats.total_casas} casas compradas y vendidas
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Single Wide */}
            {historicalStats.single_wide && (
              <div className="bg-white/10 rounded-xl p-4">
                <p className="text-gold-300 font-semibold text-sm mb-2">🏠 Single Wide ({historicalStats.single_wide.count})</p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-navy-200">Compra:</span>
                    <span className="font-medium">${historicalStats.single_wide.compra_min.toLocaleString()} – ${historicalStats.single_wide.compra_max.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-navy-200">Venta:</span>
                    <span className="font-medium text-green-400">${historicalStats.single_wide.venta_min.toLocaleString()} – ${historicalStats.single_wide.venta_max.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-navy-200">Remodelación media:</span>
                    <span className="font-medium">${Math.round(historicalStats.single_wide.remodelacion_avg).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-navy-200">Margen medio:</span>
                    <span className="font-medium text-green-400">{historicalStats.single_wide.margen_avg.toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            )}
            {/* Double Wide */}
            {historicalStats.double_wide && (
              <div className="bg-white/10 rounded-xl p-4">
                <p className="text-gold-300 font-semibold text-sm mb-2">🏘️ Double Wide ({historicalStats.double_wide.count})</p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-navy-200">Compra:</span>
                    <span className="font-medium">${historicalStats.double_wide.compra_min.toLocaleString()} – ${historicalStats.double_wide.compra_max.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-navy-200">Venta:</span>
                    <span className="font-medium text-green-400">${historicalStats.double_wide.venta_min.toLocaleString()} – ${historicalStats.double_wide.venta_max.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-navy-200">Remodelación media:</span>
                    <span className="font-medium">${Math.round(historicalStats.double_wide.remodelacion_avg).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-navy-200">Margen medio:</span>
                    <span className="font-medium text-green-400">{historicalStats.double_wide.margen_avg.toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            )}
            {/* Breakdown: De cada $1 de venta */}
            {historicalStats.all && (
              <div className="bg-white/10 rounded-xl p-4">
                <p className="text-gold-300 font-semibold text-sm mb-3">💰 De cada $1 que vendemos</p>
                {/* Visual bar */}
                <div className="flex rounded-lg overflow-hidden h-8 mb-3">
                  <div 
                    className="bg-blue-500 flex items-center justify-center text-[10px] font-bold text-white"
                    style={{ width: `${historicalStats.all.compra_pct_venta}%` }}
                  >
                    Compra {historicalStats.all.compra_pct_venta}¢
                  </div>
                  <div 
                    className="bg-yellow-500 flex items-center justify-center text-[10px] font-bold text-gray-900"
                    style={{ width: `${historicalStats.all.remodelacion_pct_venta}%` }}
                  >
                    Remodelación {historicalStats.all.remodelacion_pct_venta}¢
                  </div>
                  <div 
                    className="bg-green-500 flex items-center justify-center text-[10px] font-bold text-white"
                    style={{ width: `${historicalStats.all.ganancia_pct_venta}%` }}
                  >
                    Ganancia {historicalStats.all.ganancia_pct_venta}¢
                  </div>
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-navy-200">🔵 Compra de la casa:</span>
                    <span className="font-medium">{historicalStats.all.compra_pct_venta}% → ${Math.round(historicalStats.all.compra_avg).toLocaleString()} promedio</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-navy-200">🟡 Remodelación:</span>
                    <span className="font-medium">{historicalStats.all.remodelacion_pct_venta}% → ${Math.round(historicalStats.all.remodelacion_avg).toLocaleString()} promedio</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-navy-200">🟢 Ganancia (sin movida/comisión):</span>
                    <span className="font-medium text-green-400">{historicalStats.all.ganancia_pct_venta}% → ${Math.round(historicalStats.all.ganancia_avg).toLocaleString()} promedio</span>
                  </div>
                </div>
                <p className="text-navy-300 text-[10px] mt-2 pt-2 border-t border-white/10">
                  ⚠️ Costos de movida y comisión NO incluidos — se calculan por separado
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Info about qualification rules */}
      <div className="card p-4 bg-blue-50 border-blue-200">
        <h4 className="font-medium text-blue-900 mb-2">📋 Reglas de Calificación (Feb 2026)</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-blue-800">
          <div>
            <strong>Regla del 60%:</strong>
            <p className="text-blue-600">Precio ≤ Valor Mercado × 60%</p>
            <p className="text-blue-500 text-xs">Renovación NO incluida ($5K-$15K aparte)</p>
          </div>
          <div>
            <strong>Rango de Precio:</strong>
            <p className="text-blue-600">$5,000 — $80,000</p>
            <p className="text-blue-500 text-xs">Casa de una sección + Casa doble</p>
          </div>
          <div>
            <strong>Zona:</strong>
            <p className="text-blue-600">200mi de Houston O Dallas</p>
            <p className="text-blue-500 text-xs">Sin filtro de año (cualquier edad)</p>
          </div>
        </div>
      </div>

      {/* Add Market Listing Modal (Screenshot / Link) */}
      <AddMarketListingModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onListingAdded={async () => {
          await fetchListings();
          await fetchStats();
        }}
      />

      {/* Purchase Flow Modal - Multi-step */}
      {selectedListing && (
        <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full mx-auto my-8 overflow-hidden" style={{ minHeight: 'min-content' }}>
            {/* Header with property info */}
            <div className="bg-gradient-to-r from-navy-900 to-navy-800 p-6 text-white">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-semibold">
                    {purchaseStep === 'documents' && 'Paso 1: Documentos'}
                    {purchaseStep === 'checklist' && 'Paso 2: Evaluación en Campo'}
                    {purchaseStep === 'payment' && 'Paso 3: Registrar Pago'}
                    {purchaseStep === 'confirm' && 'Paso 4: Confirmar Compra'}
                  </h3>
                  <p className="text-navy-200 mt-1 text-sm">
                    {purchaseStep === 'documents' && 'Completa los templates de Bill of Sale, Título y Aplicación de Título'}
                    {purchaseStep === 'checklist' && 'Evalúa la casa con la app móvil antes de continuar'}
                    {purchaseStep === 'payment' && 'Registra el pago realizado al vendedor'}
                    {purchaseStep === 'confirm' && 'Revisa y confirma la compra'}
                  </p>
                </div>
                <button onClick={closeModal} className="text-white/70 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              {/* Property summary */}
              <div className="mt-4 bg-white/10 rounded-lg p-3">
                <p className="font-medium">{selectedListing.address}</p>
                <div className="flex items-center gap-4 mt-2 text-sm">
                  <span className="text-2xl font-bold">${selectedListing.listing_price.toLocaleString()}</span>
                  <span className="text-gold-300">
                    {selectedListing.estimated_arv 
                      ? `${((selectedListing.listing_price / selectedListing.estimated_arv) * 100).toFixed(0)}% del mercado`
                      : ''
                    }
                  </span>
                </div>
                {/* Prediction summary in modal header */}
                {predictions[selectedListing.id] && (() => {
                  const modalPred = predictions[selectedListing.id];
                  return (
                    <div className="mt-3 bg-white/10 rounded-lg p-3 border border-white/20">
                      <div className="flex items-center gap-2 mb-2">
                        <Target className="w-4 h-4 text-gold-400" />
                        <span className="text-sm font-semibold text-gold-300">Predicción basada en {modalPred.similar_houses?.length || 0} casas similares</span>
                        <span className="ml-auto text-xs text-gold-300">
                          {modalPred.confidence === 'alta' ? '🎯 Alta' :
                           modalPred.confidence === 'media' ? '📊 Media' : '📈 Baja'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
                        <div className="bg-white/10 rounded-lg p-2">
                          <p className="text-[10px] text-navy-300 uppercase">Comprar por</p>
                          <p className="text-lg font-bold text-gold-300">
                            ${modalPred.recommended_buy_price?.toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-navy-300 uppercase">Máximo</p>
                          <p className="text-lg font-bold text-white">
                            ${modalPred.recommended_max_price?.toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-navy-300 uppercase">Venta Esperada</p>
                          <p className="text-lg font-bold text-green-400">
                            ${modalPred.expected_sale_price?.toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-navy-300 uppercase">Remodelación</p>
                          <p className="text-lg font-bold text-yellow-300">
                            ${modalPred.expected_remodelacion?.toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-navy-300 uppercase">Ganancia</p>
                          <p className={`text-lg font-bold ${
                            (modalPred.expected_ganancia_at_listing || 0) > 0 ? 'text-green-400' : 'text-red-400'
                          }`}>
                            ${modalPred.expected_ganancia_at_listing?.toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-navy-300 mt-2 text-center">
                        {modalPred.signal_text}
                      </p>
                    </div>
                  );
                })()}
              </div>
              
              {/* Step indicators */}
              <div className="mt-4 flex items-center justify-between">
                {STEP_ORDER.map((step, index) => (
                  <div key={step} className="flex items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      purchaseStep === step 
                        ? 'bg-gold-500 text-white' 
                        : STEP_ORDER.indexOf(purchaseStep) > index
                          ? 'bg-green-500 text-white'
                          : 'bg-white/20 text-white/60'
                    }`}>
                      {STEP_ORDER.indexOf(purchaseStep) > index ? '✓' : index + 1}
                    </div>
                    {index < 3 && (
                      <div className={`w-12 h-1 mx-1 ${
                        STEP_ORDER.indexOf(purchaseStep) > index
                          ? 'bg-green-500'
                          : 'bg-white/20'
                      }`} />
                    )}
                  </div>
                ))}
              </div>
            </div>
            
            {/* Step 1: Documents (FIRST) */}
            {purchaseStep === 'documents' && (
              <div className="p-6">
                <div className="space-y-6">
                  {/* Bill of Sale */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <FileText className="w-4 h-4 inline mr-2" />
                      Bill of Sale (Factura de Compra-Venta) *
                    </label>
                    
                    {/* Bill of Sale — Interactive Template OR Upload */}
                    {showBillOfSale ? (
                      <div className="border border-gray-200 rounded-xl overflow-hidden">
                        <BillOfSaleTemplate
                          transactionType="purchase"
                          initialData={selectedListing ? {
                            seller_name: '',
                            buyer_name: 'MANINOS HOMES',
                            buyer_address: selectedListing.address || '',
                            buyer_date: new Date().toISOString().split('T')[0],
                            manufacturer: tdhcaResult?.manufacturer || '',
                            make: tdhcaResult?.model || '',
                            date_manufactured: tdhcaResult?.year || (selectedListing.year_built?.toString() || ''),
                            bedrooms: selectedListing.bedrooms?.toString() || '',
                            baths: selectedListing.bathrooms?.toString() || '',
                            dimensions: selectedListing.sqft ? `${selectedListing.sqft} sqft` : '',
                            serial_number: tdhcaResult?.serial_number || '',
                            hud_label_number: tdhcaResult?.label_seal || '',
                            location_of_home: `${selectedListing.address || ''}, ${selectedListing.city || ''}, ${selectedListing.state || 'TX'}`,
                            total_payment: `$${selectedListing.listing_price?.toLocaleString() || ''}`,
                            is_new: false,
                            is_used: true,
                          } : undefined}
                          onSave={(file, data) => {
                            setBillOfSaleData(data);
                            handleFileUpload('billOfSale', file);
                            setShowBillOfSale(false);
                            toast.success('✓ Bill of Sale guardado como PDF');
                          }}
                          onClose={() => setShowBillOfSale(false)}
                        />
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {/* Open template button */}
                        <button
                          onClick={() => setShowBillOfSale(true)}
                          className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                            billOfSaleData
                              ? 'border-green-300 bg-green-50 hover:bg-green-100'
                              : 'border-gold-300 bg-gold-50 hover:bg-gold-100'
                          }`}
                        >
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            billOfSaleData ? 'bg-green-100' : 'bg-gold-100'
                          }`}>
                            {billOfSaleData ? (
                              <CheckCircle className="w-5 h-5 text-green-600" />
                            ) : (
                              <FileText className="w-5 h-5 text-gold-600" />
                            )}
                          </div>
                          <div className="flex-1 text-left">
                            <p className={`text-sm font-semibold ${billOfSaleData ? 'text-green-900' : 'text-gold-900'}`}>
                              {billOfSaleData ? '✓ Bill of Sale Completado' : 'Abrir Template Bill of Sale'}
                            </p>
                            <p className="text-xs text-gray-600 mt-0.5">
                              {billOfSaleData
                                ? `Vendedor: ${billOfSaleData.seller_name || '—'} | Comprador: ${billOfSaleData.buyer_name || '—'}`
                                : 'Completa el template oficial de Maninos Homes, edítalo e imprímelo'}
                            </p>
                          </div>
                          <ChevronRight className="w-5 h-5 text-gray-400" />
                        </button>

                        {/* OR upload a signed one */}
                        <div className="text-center text-xs text-gray-400 font-medium">— o sube un Bill of Sale firmado —</div>
                        <div className={`border-2 border-dashed rounded-lg p-4 text-center ${
                          documents.billOfSale ? 'border-green-300 bg-green-50' : 'border-gray-200'
                        }`}>
                          {documents.billOfSale ? (
                            <div className="flex items-center justify-center gap-3">
                              <CheckCircle className="w-5 h-5 text-green-600" />
                              <span className="text-green-700 font-medium text-sm">{documents.billOfSale.name}</span>
                              <button 
                                onClick={() => handleFileUpload('billOfSale', null)}
                                className="text-red-500 hover:text-red-700"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <label className="cursor-pointer">
                              <Upload className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                              <p className="text-xs text-gray-500">PDF, JPG, PNG (máx. 10MB)</p>
                              <input
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png"
                                className="hidden"
                                onChange={(e) => handleFileUpload('billOfSale', e.target.files?.[0] || null)}
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Title — TDHCA Lookup */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <FileText className="w-4 h-4 inline mr-2" />
                      Título de la Casa (TDHCA) *
                    </label>
                    
                    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-3">
                      <p className="text-sm font-semibold text-indigo-900 mb-3">Buscar Título en TDHCA Texas</p>
                      <p className="text-xs text-indigo-700 mb-3">Ingresa el Serial Number o Label/Seal Number de la mobile home para obtener el título automáticamente.</p>
                      
                      {/* Search type toggle */}
                      <div className="flex gap-2 mb-3">
                        <button
                          onClick={() => setTdhcaSearchType('serial')}
                          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                            tdhcaSearchType === 'serial'
                              ? 'bg-indigo-600 text-white'
                              : 'bg-white text-indigo-700 border border-indigo-300 hover:bg-indigo-100'
                          }`}
                        >
                          Serial Number
                        </button>
                        <button
                          onClick={() => setTdhcaSearchType('label')}
                          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                            tdhcaSearchType === 'label'
                              ? 'bg-indigo-600 text-white'
                              : 'bg-white text-indigo-700 border border-indigo-300 hover:bg-indigo-100'
                          }`}
                        >
                          Label/Seal Number
                        </button>
                      </div>
                      
                      {/* Search input */}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={tdhcaSearchValue}
                          onChange={(e) => setTdhcaSearchValue(e.target.value.toUpperCase())}
                          placeholder={tdhcaSearchType === 'serial' ? 'Ej: C3208' : 'Ej: TEX0012345'}
                          className="flex-1 border border-indigo-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                          onKeyDown={(e) => e.key === 'Enter' && lookupTDHCA()}
                        />
                        <button
                          onClick={lookupTDHCA}
                          disabled={tdhcaLoading || !tdhcaSearchValue.trim()}
                          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                            tdhcaLoading || !tdhcaSearchValue.trim()
                              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                              : 'bg-indigo-600 text-white hover:bg-indigo-700'
                          }`}
                        >
                          {tdhcaLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Search className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      
                      {/* Error */}
                      {tdhcaError && (
                        <p className="text-sm text-red-600 mt-2 flex items-center gap-1">
                          <AlertCircle className="w-4 h-4" />
                          {tdhcaError}
                        </p>
                      )}
                    </div>
                    
                    {/* TDHCA Results */}
                    {tdhcaResult && (
                      <div className="border-2 border-green-300 bg-green-50 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <CheckCircle className="w-5 h-5 text-green-600" />
                          <span className="text-sm font-semibold text-green-800">Título Encontrado</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {tdhcaResult.certificate_number && (
                            <div><span className="font-semibold text-gray-600">Certificado:</span> <span className="text-gray-900">{tdhcaResult.certificate_number}</span></div>
                          )}
                          {tdhcaResult.manufacturer && (
                            <div><span className="font-semibold text-gray-600">Fabricante:</span> <span className="text-gray-900">{tdhcaResult.manufacturer}</span></div>
                          )}
                          {tdhcaResult.model && (
                            <div><span className="font-semibold text-gray-600">Modelo:</span> <span className="text-gray-900">{tdhcaResult.model}</span></div>
                          )}
                          {tdhcaResult.year && (
                            <div><span className="font-semibold text-gray-600">Año:</span> <span className="text-gray-900">{tdhcaResult.year}</span></div>
                          )}
                          {tdhcaResult.serial_number && (
                            <div><span className="font-semibold text-gray-600">Serial:</span> <span className="text-gray-900">{tdhcaResult.serial_number}</span></div>
                          )}
                          {tdhcaResult.label_seal && (
                            <div><span className="font-semibold text-gray-600">Label/Seal:</span> <span className="text-gray-900">{tdhcaResult.label_seal}</span></div>
                          )}
                          {tdhcaResult.square_feet && (
                            <div><span className="font-semibold text-gray-600">Sq Ft:</span> <span className="text-gray-900">{tdhcaResult.square_feet}</span></div>
                          )}
                          {tdhcaResult.seller && (
                            <div><span className="font-semibold text-gray-600">Vendedor:</span> <span className="text-gray-900">{tdhcaResult.seller}</span></div>
                          )}
                          {tdhcaResult.buyer && (
                            <div><span className="font-semibold text-gray-600">Comprador:</span> <span className="text-gray-900">{tdhcaResult.buyer}</span></div>
                          )}
                          {tdhcaResult.county && (
                            <div><span className="font-semibold text-gray-600">Condado:</span> <span className="text-gray-900">{tdhcaResult.county}</span></div>
                          )}
                          {tdhcaResult.transfer_date && (
                            <div><span className="font-semibold text-gray-600">Fecha Transferencia:</span> <span className="text-gray-900">{tdhcaResult.transfer_date}</span></div>
                          )}
                          {tdhcaResult.lien_info && (
                            <div className="col-span-2"><span className="font-semibold text-gray-600">Gravamen:</span> <span className="text-gray-900">{tdhcaResult.lien_info}</span></div>
                          )}
                        </div>
                        
                        {/* Link to full TDHCA record */}
                        {tdhcaResult.detail_url && (
                          <a
                            href={tdhcaResult.detail_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Ver Registro Completo en TDHCA
                          </a>
                        )}
                      </div>
                    )}
                    
                    {/* Fallback: manual upload if TDHCA lookup doesn't work */}
                    {!tdhcaResult && (
                      <div className="mt-2">
                        <p className="text-xs text-gray-500 mb-2">O sube el título manualmente:</p>
                        <div className={`border-2 border-dashed rounded-lg p-4 text-center ${
                          documents.title ? 'border-green-300 bg-green-50' : 'border-gray-200'
                    }`}>
                      {documents.title ? (
                            <div className="flex items-center justify-center gap-3">
                              <CheckCircle className="w-5 h-5 text-green-600" />
                              <span className="text-green-700 font-medium text-sm">{documents.title.name}</span>
                              <button onClick={() => handleFileUpload('title', null)} className="text-red-500 hover:text-red-700">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <label className="cursor-pointer">
                              <Upload className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                              <p className="text-xs text-gray-500">PDF, JPG, PNG</p>
                              <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => handleFileUpload('title', e.target.files?.[0] || null)} />
                            </label>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Title Application (Aplicación Cambio de Título) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <FileText className="w-4 h-4 inline mr-2" />
                      Aplicación Cambio de Título (Statement of Ownership)
                    </label>
                    
                    {showTitleApp ? (
                      <div className="border border-gray-200 rounded-xl overflow-hidden">
                        <TitleApplicationTemplate
                          transactionType="purchase"
                          initialData={selectedListing ? {
                            applicant_name: 'MANINOS HOMES LLC',
                            seller_name: '',
                            manufacturer: tdhcaResult?.manufacturer || '',
                            make: tdhcaResult?.model || '',
                            year: tdhcaResult?.year || (selectedListing.year_built?.toString() || ''),
                            serial_number: tdhcaResult?.serial_number || '',
                            label_seal_number: tdhcaResult?.label_seal || '',
                            bedrooms: selectedListing.bedrooms?.toString() || '',
                            bathrooms: selectedListing.bathrooms?.toString() || '',
                            sqft: selectedListing.sqft?.toString() || '',
                            location_address: selectedListing.address || '',
                            location_city: selectedListing.city || '',
                            location_state: selectedListing.state || 'TX',
                            location_zip: selectedListing.zip_code || '',
                            location_county: tdhcaResult?.county || '',
                            sale_price: `$${selectedListing.listing_price?.toLocaleString() || ''}`,
                            sale_date: new Date().toISOString().split('T')[0],
                            is_new: false,
                            is_used: true,
                          } : undefined}
                          onSave={(file, data) => {
                            setTitleAppData(data);
                            handleFileUpload('titleApplication', file);
                            setShowTitleApp(false);
                            toast.success('✓ Aplicación de Título guardada como PDF');
                          }}
                          onClose={() => setShowTitleApp(false)}
                        />
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {/* Open template button */}
                        <button
                          onClick={() => setShowTitleApp(true)}
                          className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                            titleAppData || documents.titleApplication
                              ? 'border-green-300 bg-green-50 hover:bg-green-100'
                              : 'border-indigo-300 bg-indigo-50 hover:bg-indigo-100'
                          }`}
                        >
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            titleAppData || documents.titleApplication ? 'bg-green-100' : 'bg-indigo-100'
                          }`}>
                            {titleAppData || documents.titleApplication ? (
                              <CheckCircle className="w-5 h-5 text-green-600" />
                            ) : (
                              <FileText className="w-5 h-5 text-indigo-600" />
                            )}
                          </div>
                          <div className="flex-1 text-left">
                            <p className={`text-sm font-semibold ${
                              titleAppData || documents.titleApplication ? 'text-green-900' : 'text-indigo-900'
                            }`}>
                              {titleAppData || documents.titleApplication
                                ? '✓ Aplicación de Título Completada'
                                : 'Abrir Template Aplicación de Título'}
                            </p>
                            <p className="text-xs text-gray-600 mt-0.5">
                              {titleAppData
                                ? `Solicitante: ${titleAppData.applicant_name || '—'}`
                                : documents.titleApplication
                                  ? documents.titleApplication.name
                                  : 'Basado en TDHCA Form 1023 — Editable y descargable como PDF'}
                            </p>
                          </div>
                          <ChevronRight className="w-5 h-5 text-gray-400" />
                        </button>

                        {/* OR upload */}
                        <div className="text-center text-xs text-gray-400 font-medium">— o sube una aplicación firmada —</div>
                        <div className={`border-2 border-dashed rounded-lg p-4 text-center ${
                          documents.titleApplication ? 'border-green-300 bg-green-50' : 'border-gray-200'
                        }`}>
                          {documents.titleApplication && !titleAppData ? (
                            <div className="flex items-center justify-center gap-3">
                              <CheckCircle className="w-5 h-5 text-green-600" />
                              <span className="text-green-700 font-medium text-sm">{documents.titleApplication.name}</span>
                              <button 
                                onClick={() => handleFileUpload('titleApplication', null)}
                                className="text-red-500 hover:text-red-700"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : !titleAppData ? (
                            <label className="cursor-pointer">
                              <Upload className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                              <p className="text-xs text-gray-500">PDF, JPG, PNG (máx. 10MB)</p>
                              <input
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png"
                                className="hidden"
                                onChange={(e) => handleFileUpload('titleApplication', e.target.files?.[0] || null)}
                              />
                            </label>
                          ) : null}
                        </div>

                        {/* Link to official TDHCA form as reference */}
                        <a
                          href={TDHCA_TITLE_APPLICATION_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Ver formulario oficial TDHCA (referencia)
                        </a>
                      </div>
                    )}
                  </div>
                </div>
                
                {!allDocsReady && (
                  <p className="text-sm text-amber-600 mt-4 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    {!isBosComplete ? 'Completa el Bill of Sale (template o sube archivo)' : 
                     !isTitleComplete ? 'Busca el título en TDHCA o sube manualmente' : 
                     'Completa todos los documentos para continuar'}
                  </p>
                )}
              </div>
            )}
            
            {/* Step 2: Evaluation — Interactive or Link Existing */}
            {purchaseStep === 'checklist' && (
              <div className="p-6">
                <DesktopEvaluatorPanel
                  listingId={selectedListing?.id}
                  onReportGenerated={(report) => {
                    setEvalReport(report)
                  }}
                />
              </div>
            )}
            
            {/* Step 3: Payment */}
            {purchaseStep === 'payment' && (
              <div className="p-6">
                <div className="space-y-6">
                  {/* Payment Amount */}
                  <div className="bg-gradient-to-r from-navy-900 to-navy-800 rounded-xl p-5 text-white">
                    <p className="text-sm text-navy-200 mb-1">Monto a pagar al vendedor</p>
                    <div className="text-3xl font-bold">${payment.amount.toLocaleString()}</div>
                    <p className="text-xs text-navy-300 mt-1">Coordinado por Abigail (Tesorería)</p>
                  </div>
                  
                  {/* Payment Method */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      <CreditCard className="w-4 h-4 inline mr-2" />
                      Método de Pago *
                    </label>
                    <div className="space-y-2">
                      {PAYMENT_METHODS.map(method => (
                        <button
                          key={method.id}
                          onClick={() => setPayment(prev => ({ ...prev, method: method.id }))}
                          className={`w-full p-4 rounded-lg border-2 text-left transition-all flex items-center gap-3 ${
                            payment.method === method.id
                              ? 'border-gold-500 bg-gold-50 shadow-sm'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex-1">
                            <span className={`font-medium block ${payment.method === method.id ? 'text-gold-800' : 'text-gray-700'}`}>
                            {method.label}
                          </span>
                            <span className="text-xs text-gray-500">{method.description}</span>
                          </div>
                          {method.recommended && (
                            <span className="text-[10px] font-bold uppercase tracking-wider bg-green-100 text-green-700 px-2 py-1 rounded-full">
                              Recomendado
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {/* Bank Transfer Details */}
                  {payment.method === 'transferencia' && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-4">
                      <p className="text-sm font-semibold text-blue-900">Datos para Transferencia Bancaria</p>
                      
                      <div className="grid grid-cols-2 gap-3">
                          <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Banco del vendedor</label>
                          <input
                            type="text"
                            placeholder="Ej: Chase, Wells Fargo..."
                            className="w-full p-2.5 border border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                            onChange={(e) => setPayment(prev => ({ ...prev, reference: `BANK:${e.target.value}|${prev.reference?.split('|')[1] || ''}` }))}
                          />
                          </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Routing Number</label>
                          <input
                            type="text"
                            placeholder="9 dígitos"
                            maxLength={9}
                            className="w-full p-2.5 border border-blue-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Account Number</label>
                          <input
                            type="text"
                            placeholder="Número de cuenta"
                            className="w-full p-2.5 border border-blue-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Nombre del beneficiario</label>
                          <input
                            type="text"
                            placeholder="Nombre del vendedor"
                            className="w-full p-2.5 border border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Número de confirmación / Referencia *</label>
                        <input
                          type="text"
                          value={payment.reference}
                          onChange={(e) => setPayment(prev => ({ ...prev, reference: e.target.value }))}
                          placeholder="Ingresa el # de confirmación una vez realizada la transferencia"
                          className="w-full p-2.5 border border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      
                      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-700">
                          <strong>Recuerda:</strong> Coordinar con Abigail antes de enviar la transferencia. 
                          No se puede pagar al vendedor hasta que la aplicación de cambio de título haya sido recibida.
                        </p>
                      </div>
                    </div>
                  )}
                  
                  {/* Zelle Details */}
                  {payment.method === 'zelle' && (
                    <div className="bg-purple-50 border border-purple-200 rounded-xl p-5 space-y-3">
                      <p className="text-sm font-semibold text-purple-900">Pago por Zelle</p>
                      <div className="bg-white rounded-lg p-3 border border-purple-200">
                        <p className="text-xs text-gray-500 mb-1">Enviar Zelle a:</p>
                        <p className="text-lg font-mono font-bold text-purple-800">832-745-9600</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Número de confirmación *</label>
                        <input
                          type="text"
                          value={payment.reference}
                          onChange={(e) => setPayment(prev => ({ ...prev, reference: e.target.value }))}
                          placeholder="# de confirmación de Zelle"
                          className="w-full p-2.5 border border-purple-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                    </div>
                  )}
                  
                  {/* Other Methods */}
                  {payment.method && !['transferencia', 'zelle'].includes(payment.method) && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Referencia / Número de Transacción *
                      </label>
                      <input
                        type="text"
                        value={payment.reference}
                        onChange={(e) => setPayment(prev => ({ ...prev, reference: e.target.value }))}
                        placeholder="Ej: CHK-123456789"
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gold-500 focus:border-gold-500"
                      />
                    </div>
                  )}
                  
                  {/* Payment Date */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Fecha del Pago
                    </label>
                    <input
                      type="date"
                      value={payment.date}
                      onChange={(e) => setPayment(prev => ({ ...prev, date: e.target.value }))}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gold-500 focus:border-gold-500"
                    />
                  </div>
                </div>
                
                {(!payment.method || !payment.reference) && (
                  <p className="text-sm text-amber-600 mt-4 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    {payment.method === 'stripe' && !payment.reference 
                      ? 'Completa el pago con tarjeta para continuar'
                      : 'Completa el método y la referencia de pago'
                    }
                  </p>
                )}
              </div>
            )}
            
            {/* Step 4: Confirm */}
            {purchaseStep === 'confirm' && (
              <div className="p-6">
                <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
                  <h4 className="font-semibold text-green-800 mb-4 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5" />
                    Resumen de la Compra
                  </h4>
                  
                  <div className="space-y-4">
                    <div className="flex justify-between items-center py-2 border-b border-green-200">
                      <span className="text-green-700">Propiedad</span>
                      <span className="font-medium text-green-900">{selectedListing.address}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-green-200">
                      <span className="text-green-700">Precio de Compra</span>
                      <span className="font-bold text-green-900 text-xl">${selectedListing.listing_price.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-green-200">
                      <span className="text-green-700">Evaluación</span>
                      <span className="font-medium text-green-900">
                        {evalReport ? `${evalReport.report_number} — Score ${evalReport.score}/100 (${evalReport.recommendation})` : 'Completada en app móvil ✓'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-green-200">
                      <span className="text-green-700">Documentos</span>
                      <span className="font-medium text-green-900">
                        Bill of Sale ✓ | Título ✓ | Cambio Título ✓
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-green-700">Pago</span>
                      <span className="font-medium text-green-900">
                        {PAYMENT_METHODS.find(m => m.id === payment.method)?.label} - Ref: {payment.reference}
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Prediction detail with similar houses */}
                {predictions[selectedListing.id] && (() => {
                  const confirmPred = predictions[selectedListing.id];
                  return (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                    <h4 className="font-semibold text-blue-800 mb-3 flex items-center gap-2">
                      <Target className="w-5 h-5 text-gold-600" />
                      Análisis de Precio — Datos Históricos Reales 2025
                    </h4>
                    
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                      <div className="bg-gold-50 border border-gold-200 rounded-lg p-3 text-center shadow-sm">
                        <p className="text-[10px] text-gold-700 uppercase font-medium">Comprar por</p>
                        <p className="text-xl font-bold text-gold-800">
                          ${confirmPred.recommended_buy_price?.toLocaleString()}
                        </p>
                      </div>
                      <div className="bg-white rounded-lg p-3 text-center shadow-sm">
                        <p className="text-[10px] text-gray-500 uppercase font-medium">Máximo</p>
                        <p className="text-xl font-bold text-navy-900">
                          ${confirmPred.recommended_max_price?.toLocaleString()}
                        </p>
                      </div>
                      <div className="bg-white rounded-lg p-3 text-center shadow-sm">
                        <p className="text-[10px] text-gray-500 uppercase font-medium">Venta Esperada</p>
                        <p className="text-xl font-bold text-green-700">
                          ${confirmPred.expected_sale_price?.toLocaleString()}
                        </p>
                      </div>
                      <div className="bg-white rounded-lg p-3 text-center shadow-sm">
                        <p className="text-[10px] text-gray-500 uppercase font-medium">Remodelación</p>
                        <p className="text-xl font-bold text-yellow-600">
                          ${confirmPred.expected_remodelacion?.toLocaleString()}
                        </p>
                      </div>
                      <div className="bg-white rounded-lg p-3 text-center shadow-sm">
                        <p className="text-[10px] text-gray-500 uppercase font-medium">Ganancia</p>
                        <p className={`text-xl font-bold ${
                          (confirmPred.expected_ganancia_at_listing || 0) > 0 ? 'text-green-700' : 'text-red-600'
                        }`}>
                          ${confirmPred.expected_ganancia_at_listing?.toLocaleString()}
                        </p>
                      </div>
                    </div>
                    
                    {/* Signal + Recommendation */}
                    <div className="bg-white rounded-lg p-3 mb-3 border border-blue-200">
                      <p className="font-semibold text-sm mb-1">{confirmPred.signal_text}</p>
                      <p className="text-xs text-gray-600">{confirmPred.analysis?.recomendacion}</p>
                    </div>
                    
                    <p className="text-xs text-blue-700 mb-3">
                      Margen al precio lista: <strong>{confirmPred.margin_at_listing_price_pct?.toFixed(0)}%</strong> — 
                      Margen al precio recomendado: <strong>{confirmPred.margin_at_recommended_pct?.toFixed(0)}%</strong> —
                      Casas similares: margen promedio de {confirmPred.historical_margin_pct?.toFixed(0)}%.
                      <span className="text-blue-500"> ⚠️ Sin contar movida ni comisión.</span>
                    </p>
                    
                    {/* Similar houses table */}
                    {predictions[selectedListing.id].similar_houses?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-blue-800 mb-2">
                          Casas similares vendidas (base de la predicción):
                        </p>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-blue-100">
                                <th className="px-2 py-1.5 text-left font-semibold text-blue-800">Casa</th>
                                <th className="px-2 py-1.5 text-left font-semibold text-blue-800">Tipo</th>
                                <th className="px-2 py-1.5 text-right font-semibold text-blue-800">Compra</th>
                                <th className="px-2 py-1.5 text-right font-semibold text-blue-800">Remodelación</th>
                                <th className="px-2 py-1.5 text-right font-semibold text-blue-800">Venta</th>
                                <th className="px-2 py-1.5 text-right font-semibold text-blue-800">Margen</th>
                                <th className="px-2 py-1.5 text-right font-semibold text-blue-800">Similitud</th>
                              </tr>
                            </thead>
                            <tbody>
                              {predictions[selectedListing.id].similar_houses.map((h: any, i: number) => (
                                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-blue-50/50'}>
                                  <td className="px-2 py-1.5 font-medium text-gray-800">{h.id}</td>
                                  <td className="px-2 py-1.5 text-gray-600">
                                    {h.tipo === 'SINGLE' ? 'Single' : 'Double'}
                                    {h.cuartos && h.banos ? ` ${h.cuartos}/${h.banos}` : ''}
                                  </td>
                                  <td className="px-2 py-1.5 text-right text-gray-800">${h.precio_compra?.toLocaleString()}</td>
                                  <td className="px-2 py-1.5 text-right text-gray-600">${h.remodelacion?.toLocaleString()}</td>
                                  <td className="px-2 py-1.5 text-right text-green-700 font-medium">${h.precio_venta?.toLocaleString()}</td>
                                  <td className={`px-2 py-1.5 text-right font-medium ${
                                    (h.margen_pct || 0) >= 20 ? 'text-green-700' : 'text-yellow-600'
                                  }`}>{h.margen_pct}%</td>
                                  <td className="px-2 py-1.5 text-right">
                                    <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                                      h.similitud >= 70 ? 'bg-green-100 text-green-700' :
                                      h.similitud >= 50 ? 'bg-yellow-100 text-yellow-700' :
                                      'bg-gray-100 text-gray-600'
                                    }`}>{h.similitud}%</span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                  );
                })()}
                
                <p className="text-sm text-gray-600 text-center">
                  Al confirmar, la casa se añadirá al inventario de Maninos con todos los documentos asociados.
                </p>
              </div>
            )}
            
            {/* Actions */}
            <div className="p-6 bg-gray-50 border-t flex gap-3">
              {purchaseStep !== 'documents' && (
                <button
                  onClick={goToPrevStep}
                  className="btn-secondary flex items-center gap-2"
                  disabled={processing}
                >
                  <ChevronLeft className="w-4 h-4" />
                  Anterior
                </button>
              )}
              
              <button
                onClick={closeModal}
                className="btn-secondary"
                disabled={processing}
              >
                Cancelar
              </button>
              
              <div className="flex-1" />
              
              {purchaseStep === 'documents' && (
                <button
                  onClick={goToNextStep}
                  disabled={!allDocsReady}
                  className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-colors ${
                    allDocsReady
                      ? 'btn-gold'
                      : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  Siguiente
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
              
              {purchaseStep === 'checklist' && (
                <button
                  onClick={() => setPurchaseStep('payment')}
                  disabled={!evalReport}
                  className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-colors ${
                    evalReport
                      ? 'btn-gold'
                      : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  Siguiente
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
              
              {purchaseStep === 'payment' && (
                <button
                  onClick={goToNextStep}
                  disabled={!payment.method || !payment.reference}
                  className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-colors ${
                    payment.method && payment.reference
                      ? 'btn-gold'
                      : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  Siguiente
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
              
              {purchaseStep === 'confirm' && (
                <button
                  onClick={confirmPurchase}
                  disabled={processing}
                  className="btn-gold flex items-center gap-2 px-6 py-2"
                >
                  {processing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Procesando...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Confirmar Compra
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

