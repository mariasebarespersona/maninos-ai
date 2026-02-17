'use client';

import { useEffect, useRef, useState } from 'react';
import {
  MapPin,
  Home,
  ExternalLink,
  CheckCircle,
  ChevronRight,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

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
  price_type: string | null;
  estimated_full_price: number | null;
}

interface MarketMapViewProps {
  listings: MarketListing[];
  onReviewClick: (listing: MarketListing) => void;
  sourceColors: Record<string, string>;
  sourceLabels: Record<string, string>;
}

// ============================================
// TEXAS CITY COORDINATES (within 200mi of Houston/Dallas)
// ============================================

const TEXAS_CITY_COORDS: Record<string, [number, number]> = {
  // Houston Metro
  'houston': [29.7604, -95.3698],
  'katy': [29.7858, -95.8245],
  'sugar land': [29.6197, -95.6349],
  'pearland': [29.5636, -95.2860],
  'pasadena': [29.6911, -95.2091],
  'baytown': [29.7355, -94.9774],
  'league city': [29.5075, -95.0950],
  'missouri city': [29.6186, -95.5377],
  'conroe': [30.3119, -95.4561],
  'the woodlands': [30.1658, -95.4613],
  'spring': [30.0799, -95.4172],
  'humble': [29.9988, -95.2622],
  'cypress': [29.9691, -95.6970],
  'tomball': [30.0972, -95.6161],
  'rosenberg': [29.5572, -95.8086],
  'richmond': [29.5822, -95.7603],
  'friendswood': [29.5294, -95.2010],
  'galveston': [29.3013, -94.7977],
  'texas city': [29.3838, -94.9027],
  'la marque': [29.3686, -94.9713],
  'dickinson': [29.4614, -95.0514],
  'angleton': [29.1694, -95.4322],
  'alvin': [29.4238, -95.2441],
  'lake jackson': [29.0439, -95.4344],
  'clute': [29.0247, -95.3986],
  'freeport': [28.9542, -95.3597],
  'beaumont': [30.0802, -94.1266],
  'port arthur': [29.8990, -93.9285],
  'orange': [30.0930, -93.7366],
  'nederland': [29.9741, -94.0002],
  'lumberton': [30.2666, -94.1999],
  'vidor': [30.1316, -93.9922],
  'silsbee': [30.3491, -94.1777],
  'huntsville': [30.7235, -95.5508],
  'nacogdoches': [31.6035, -94.6555],
  'lufkin': [31.3382, -94.7291],
  'livingston': [30.7110, -94.9330],
  'cleveland': [30.3414, -95.0855],
  'dayton': [30.0466, -94.8855],
  'liberty': [30.0580, -94.7955],
  'victoria': [28.8053, -96.9853],
  'port lavaca': [28.6150, -96.6261],
  'el campo': [29.1967, -96.2697],
  'wharton': [29.3116, -96.1027],
  'bay city': [28.9828, -95.9694],
  'columbus': [29.7067, -96.5397],
  'la grange': [29.9205, -96.8767],
  'brenham': [30.1669, -96.3977],
  'college station': [30.6280, -96.3344],
  'bryan': [30.6744, -96.3700],
  
  // Dallas/Fort Worth Metro
  'dallas': [32.7767, -96.7970],
  'fort worth': [32.7555, -97.3308],
  'arlington': [32.7357, -97.1081],
  'plano': [33.0198, -96.6989],
  'irving': [32.8140, -96.9489],
  'garland': [32.9126, -96.6389],
  'grand prairie': [32.7460, -96.9978],
  'mckinney': [33.1972, -96.6397],
  'frisco': [33.1507, -96.8236],
  'denton': [33.2148, -97.1331],
  'mesquite': [32.7668, -96.5992],
  'carrollton': [32.9537, -96.8903],
  'lewisville': [33.0462, -96.9942],
  'richardson': [32.9484, -96.7297],
  'allen': [33.1032, -96.6714],
  'flower mound': [33.0146, -97.0970],
  'mansfield': [32.5632, -97.1417],
  'desoto': [32.5899, -96.8570],
  'cedar hill': [32.5885, -96.9561],
  'duncanville': [32.6518, -96.9084],
  'lancaster': [32.5921, -96.7561],
  'waxahachie': [32.3865, -96.8483],
  'corsicana': [32.0954, -96.4689],
  'ennis': [32.3293, -96.6253],
  'cleburne': [32.3476, -97.3867],
  'weatherford': [32.7593, -97.7972],
  'mineral wells': [32.8085, -98.1128],
  'stephenville': [32.2207, -98.2023],
  'tyler': [32.3513, -95.3011],
  'longview': [32.5007, -94.7405],
  'marshall': [32.5449, -94.3674],
  'kilgore': [32.3862, -94.8758],
  'texarkana': [33.4418, -94.0477],
  'paris': [33.6609, -95.5555],
  'sherman': [33.6357, -96.6089],
  'denison': [33.7557, -96.5367],
  'gainesville': [33.6259, -97.1336],
  'waco': [31.5493, -97.1467],
  'temple': [31.0982, -97.3428],
  'killeen': [31.1171, -97.7278],
  
  // San Antonio / Austin
  'san antonio': [29.4241, -98.4936],
  'austin': [30.2672, -97.7431],
  'new braunfels': [29.7030, -98.1245],
  'san marcos': [29.8833, -97.9414],
  'seguin': [29.5688, -97.9647],
  'round rock': [30.5083, -97.6789],
  'georgetown': [30.6333, -97.6781],
  'pflugerville': [30.4393, -97.6200],
  'cedar park': [30.5052, -97.8203],
  
  // Default fallback
  'texas': [31.0, -99.0],
};

// ============================================
// GET COORDINATES FOR A LISTING
// ============================================

function getListingCoords(listing: MarketListing): [number, number] {
  // Use real GPS coordinates if available (21st Mortgage, VMF Homes, etc.)
  if (listing.latitude && listing.longitude) {
    return [listing.latitude, listing.longitude];
  }
  
  const cityLower = (listing.city || '').toLowerCase().trim();
  
  // Exact match
  if (TEXAS_CITY_COORDS[cityLower]) {
    // Add small random offset so pins don't overlap exactly
    const [lat, lng] = TEXAS_CITY_COORDS[cityLower];
    const offset = () => (Math.random() - 0.5) * 0.04; // ~2-3 km spread
    return [lat + offset(), lng + offset()];
  }
  
  // Partial match
  for (const [city, coords] of Object.entries(TEXAS_CITY_COORDS)) {
    if (cityLower.includes(city) || city.includes(cityLower)) {
      const offset = () => (Math.random() - 0.5) * 0.04;
      return [coords[0] + offset(), coords[1] + offset()];
    }
  }
  
  // Try to find city in address
  const addressLower = (listing.address || '').toLowerCase();
  for (const [city, coords] of Object.entries(TEXAS_CITY_COORDS)) {
    if (addressLower.includes(city)) {
      const offset = () => (Math.random() - 0.5) * 0.04;
      return [coords[0] + offset(), coords[1] + offset()];
    }
  }
  
  // Default: center of Texas with larger random spread
  const offset = () => (Math.random() - 0.5) * 2;
  return [31.0 + offset(), -99.0 + offset()];
}

// ============================================
// SOURCE COLORS FOR MAP PINS
// ============================================

const SOURCE_PIN_COLORS: Record<string, string> = {
  mhvillage: '#3B82F6',       // blue
  mobilehome: '#22C55E',      // green
  mhbay: '#F59E0B',           // amber
  vmf_homes: '#8B5CF6',       // violet
  '21st_mortgage': '#E11D48',  // rose
  facebook: '#0EA5E9',        // sky
  facebook_marketplace: '#0EA5E9',
  manual: '#6B7280',          // gray
  other: '#6B7280',
};

// ============================================
// MAP COMPONENT (Leaflet — dynamically loaded)
// ============================================

export default function MarketMapView({ listings, onReviewClick, sourceColors, sourceLabels }: MarketMapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const listingCardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Initialize Leaflet map
  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current) return;

    let cancelled = false;

    const initMap = async () => {
      // Dynamic import of Leaflet (SSR-safe)
      const L = (await import('leaflet')).default;

      // Inject Leaflet CSS if not already present
      if (!document.querySelector('link[href*="leaflet"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
        link.crossOrigin = '';
        document.head.appendChild(link);
      }

      if (cancelled || !mapRef.current) return;

      // Create map centered on Houston–Dallas corridor
      const map = L.map(mapRef.current, {
        center: [30.5, -96.0], // Between Houston and Dallas
        zoom: 7,
        zoomControl: true,
        attributionControl: true,
      });

      // OpenStreetMap tiles (free, no API key)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map);

      leafletMapRef.current = map;
      setMapReady(true);
    };

    initMap();

    return () => {
      cancelled = true;
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, []);

  // Update markers when listings or map changes
  useEffect(() => {
    if (!mapReady || !leafletMapRef.current) return;

    const updateMarkers = async () => {
      const L = (await import('leaflet')).default;
      const map = leafletMapRef.current;

      // Clear existing markers
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];

      if (listings.length === 0) return;

      const bounds: [number, number][] = [];

      listings.forEach((listing) => {
        const [lat, lng] = getListingCoords(listing);
        bounds.push([lat, lng]);

        const pinColor = SOURCE_PIN_COLORS[listing.source] || '#6B7280';
        const isQualified = listing.is_qualified;

        // Custom HTML pin marker
        const icon = L.divIcon({
          className: 'custom-map-pin',
          html: `
            <div style="
              position: relative;
              width: 36px;
              height: 44px;
              cursor: pointer;
            ">
              <div style="
                width: 36px;
                height: 36px;
                background: ${pinColor};
                border: 3px solid ${isQualified ? '#22C55E' : '#ffffff'};
                border-radius: 50% 50% 50% 0;
                transform: rotate(-45deg);
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
              ">
                <span style="
                  transform: rotate(45deg);
                  font-size: 11px;
                  font-weight: 700;
                  color: white;
                ">$${Math.round(listing.listing_price / 1000)}K</span>
              </div>
            </div>
          `,
          iconSize: [36, 44],
          iconAnchor: [18, 44],
          popupAnchor: [0, -44],
        });

        const marker = L.marker([lat, lng], { icon }).addTo(map);

        // Popup content
        const isDP = listing.price_type === 'down_payment';
        const popupHtml = `
          <div style="min-width: 220px; font-family: system-ui, sans-serif;">
            <div style="font-weight: 700; font-size: 16px; color: ${isDP ? '#92400e' : '#1a2744'}; margin-bottom: 4px;">
              $${listing.listing_price.toLocaleString()}
              ${isDP ? '<span style="font-size:10px;padding:2px 6px;margin-left:6px;background:#fef3c7;color:#92400e;border-radius:4px;font-weight:700;text-transform:uppercase;">Enganche</span>' : ''}
            </div>
            ${isDP && listing.estimated_full_price ? `<div style="font-size:11px;color:#6b7280;margin-bottom:2px;">Precio estimado: <b>$${listing.estimated_full_price.toLocaleString()}</b></div>` : ''}
            <div style="font-size: 12px; color: #4b5563; margin-bottom: 6px;">
              ${listing.address}
            </div>
            <div style="font-size: 11px; color: #6b7280; margin-bottom: 8px;">
              ${listing.city}, ${listing.state}
              ${listing.bedrooms ? ` · ${listing.bedrooms} hab` : ''}
              ${listing.bathrooms ? ` · ${listing.bathrooms} baño` : ''}
              ${listing.sqft ? ` · ${listing.sqft} sqft` : ''}
              ${listing.year_built ? ` · ${listing.year_built}` : ''}
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
              <span style="
                font-size: 10px;
                font-weight: 600;
                padding: 2px 8px;
                border-radius: 4px;
                background: ${isQualified ? '#dcfce7' : '#fecaca'};
                color: ${isQualified ? '#166534' : '#991b1b'};
              ">${isQualified ? '✓ Calificada' : '✗ No califica'}</span>
              <span style="
                font-size: 10px;
                font-weight: 600;
                padding: 2px 8px;
                border-radius: 4px;
                background: #f3f4f6;
                color: #374151;
              ">${listing.qualification_score}/100</span>
            </div>
          </div>
        `;

        marker.bindPopup(popupHtml, {
          maxWidth: 280,
          className: 'market-map-popup',
        });

        marker.on('click', () => {
          setSelectedId(listing.id);
          // Scroll the card into view
          const cardEl = listingCardRefs.current[listing.id];
          if (cardEl) {
            cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        });

        markersRef.current.push(marker);
      });

      // Fit bounds with padding
      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
      }
    };

    updateMarkers();
  }, [listings, mapReady]);

  // Highlight marker when card is selected
  useEffect(() => {
    if (!selectedId || !leafletMapRef.current || markersRef.current.length === 0) return;
    const idx = listings.findIndex(l => l.id === selectedId);
    if (idx >= 0 && markersRef.current[idx]) {
      markersRef.current[idx].openPopup();
    }
  }, [selectedId, listings]);

  return (
    <div className="flex flex-col lg:flex-row gap-0 h-[calc(100vh-240px)] min-h-[500px] rounded-2xl overflow-hidden border border-gray-200 shadow-lg bg-white">
      {/* Map Panel (left/top) */}
      <div className="lg:w-3/5 w-full h-[350px] lg:h-full relative">
        <div ref={mapRef} className="w-full h-full" />
        
        {/* Map Legend */}
        <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-sm rounded-xl p-3 shadow-lg border border-gray-200 z-[1000]">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Fuentes</p>
          <div className="space-y-1.5">
            {Object.entries(SOURCE_PIN_COLORS)
              .filter(([key]) => !['other', 'facebook'].includes(key))
              .map(([source, color]) => (
                <div key={source} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-[11px] text-gray-700">
                    {sourceLabels[source] || source}
                  </span>
                </div>
              ))}
          </div>
          <div className="mt-2 pt-2 border-t border-gray-200 space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full border-2 border-green-500 flex-shrink-0" />
              <span className="text-[11px] text-gray-700">Calificada</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full border-2 border-white flex-shrink-0 shadow-sm" />
              <span className="text-[11px] text-gray-700">No califica</span>
            </div>
          </div>
        </div>

        {/* Listings count overlay */}
        <div className="absolute top-4 left-4 bg-navy-900/90 text-white px-4 py-2 rounded-xl shadow-lg z-[1000]">
          <span className="text-sm font-bold">{listings.length}</span>
          <span className="text-xs text-gray-300 ml-1">propiedades</span>
        </div>
      </div>

      {/* Listing Cards Panel (right/bottom) — scrollable */}
      <div className="lg:w-2/5 w-full overflow-y-auto bg-gray-50 border-l border-gray-200">
        <div className="p-3 border-b border-gray-200 bg-white sticky top-0 z-10">
          <p className="text-sm font-semibold text-gray-700">
            {listings.length} Propiedades Encontradas
          </p>
          <p className="text-xs text-gray-500">Haz clic en un pin o tarjeta para ver detalles</p>
        </div>
        
        <div className="p-3 space-y-3">
          {listings.map((listing) => (
            <div
              key={listing.id}
              ref={(el) => { listingCardRefs.current[listing.id] = el; }}
              onClick={() => {
                setSelectedId(listing.id);
                // Pan map to this listing
                if (leafletMapRef.current) {
                  const [lat, lng] = getListingCoords(listing);
                  leafletMapRef.current.panTo([lat, lng]);
                  // Open the corresponding marker popup
                  const idx = listings.findIndex(l => l.id === listing.id);
                  if (idx >= 0 && markersRef.current[idx]) {
                    markersRef.current[idx].openPopup();
                  }
                }
              }}
              className={`bg-white rounded-xl overflow-hidden border-2 transition-all duration-200 cursor-pointer hover:shadow-md ${
                selectedId === listing.id
                  ? 'border-gold-500 shadow-md ring-2 ring-gold-200'
                  : 'border-gray-100 hover:border-gray-300'
              }`}
            >
              <div className="flex">
                {/* Thumbnail */}
                <div className="w-28 h-28 flex-shrink-0 bg-gray-100 relative">
                  {listing.thumbnail_url || (listing.photos && listing.photos[0]) ? (
                    <img
                      src={listing.thumbnail_url || listing.photos![0]}
                      alt={listing.address}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Home className="w-8 h-8 text-gray-300" />
                    </div>
                  )}
                  {/* Source badge */}
                  <span
                    className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold text-white"
                    style={{ backgroundColor: SOURCE_PIN_COLORS[listing.source] || '#6B7280' }}
                  >
                    {sourceLabels[listing.source] || listing.source}
                  </span>
                </div>
                
                {/* Card Content */}
                <div className="flex-1 p-3 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5 truncate">
                      <p className={`text-base font-bold truncate ${listing.price_type === 'down_payment' ? 'text-amber-700' : 'text-navy-900'}`}>
                        ${listing.listing_price.toLocaleString()}
                      </p>
                      {listing.price_type === 'down_payment' && (
                        <span className="flex-shrink-0 px-1 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 uppercase">
                          Eng.
                        </span>
                      )}
                    </div>
                    <span className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      listing.is_qualified
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {listing.qualification_score}/100
                    </span>
                  </div>
                  
                  <p className="text-xs text-gray-700 truncate mb-0.5">{listing.address}</p>
                  <p className="text-[11px] text-gray-500 mb-2">{listing.city}, {listing.state}</p>
                  
                  <div className="flex items-center gap-2 text-[11px] text-gray-500 mb-2">
                    {listing.bedrooms && <span>{listing.bedrooms} hab</span>}
                    {listing.bathrooms && <span>· {listing.bathrooms} baño</span>}
                    {listing.sqft && <span>· {listing.sqft} sqft</span>}
                    {listing.year_built && <span>· {listing.year_built}</span>}
                  </div>
                  
                  <div className="flex gap-1.5">
                    <a
                      href={listing.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[10px] px-2 py-1 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 font-medium flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Ver
                    </a>
                    {listing.is_qualified && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onReviewClick(listing);
                        }}
                        className="text-[10px] px-2 py-1 rounded-md bg-gold-500 text-white hover:bg-gold-600 font-medium flex items-center gap-1"
                      >
                        <CheckCircle className="w-3 h-3" />
                        Revisar
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
          
          {listings.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <MapPin className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm font-medium">No hay propiedades</p>
              <p className="text-xs">Busca con AI para encontrar casas</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

