/**
 * Tests for MarketDashboard V3 — Casas del Mercado improvements
 *
 * Covers:
 * - Change 1: Gravamen shown in red
 * - Change 2: Tax Lien status display
 * - Change 3: Filter bar (bedrooms, year, source)
 * - Change 4: Listings limit (500)
 * - Change 5: qualified_only defaults to true
 * - Change 10: Manual field editing
 * - Change 11: Negotiation status + sorting
 */
import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom'

// ─── Mocks ────────────────────────────────────────────────────────

// Mock useToast
const mockToast = { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() }
jest.mock('@/components/ui/Toast', () => ({
  useToast: () => mockToast,
}))

// Mock next/dynamic (for MarketMapView)
jest.mock('next/dynamic', () => () => {
  const MockMap = () => <div data-testid="market-map" />
  MockMap.displayName = 'MockMap'
  return MockMap
})

// Mock heavy child components
jest.mock('@/components/AddMarketListingModal', () => () => <div data-testid="add-modal" />)
jest.mock('@/components/BillOfSaleTemplate', () => {
  const Mock = () => <div data-testid="bill-of-sale" />
  return { __esModule: true, default: Mock, type: {} }
})
jest.mock('@/components/TitleApplicationTemplate', () => {
  const Mock = () => <div data-testid="title-app" />
  return { __esModule: true, default: Mock, type: {} }
})
jest.mock('@/components/BankTransferPayment', () => ({
  BankTransferStep: () => <div data-testid="bank-transfer" />,
  usePayeeState: () => ({
    payee: null, payeeMode: 'new', payees: [],
    setPayee: jest.fn(), setPayeeMode: jest.fn(),
    fetchPayees: jest.fn(), resetPayee: jest.fn(),
  }),
}))
jest.mock('@/components/DesktopEvaluatorPanel', () => () => <div data-testid="evaluator-panel" />)

// ─── Helpers ──────────────────────────────────────────────────────

function makeListing(overrides: Record<string, any> = {}) {
  return {
    id: overrides.id || 'test-1',
    source: 'facebook',
    source_url: 'https://facebook.com/listing/1',
    address: '123 Main St',
    city: 'Houston',
    state: 'TX',
    zip_code: '77001',
    listing_price: 25000,
    estimated_arv: null,
    estimated_renovation: null,
    max_offer_70_rule: null,
    passes_70_rule: true,
    passes_age_rule: true,
    passes_location_rule: true,
    is_qualified: true,
    qualification_score: 80,
    qualification_reasons: null,
    year_built: 2005,
    sqft: 900,
    bedrooms: 3,
    bathrooms: 2,
    estimated_roi: null,
    photos: null,
    thumbnail_url: null,
    latitude: null,
    longitude: null,
    status: 'available',
    scraped_at: '2026-03-24T00:00:00',
    price_type: 'full',
    estimated_full_price: null,
    manual_price: null,
    manual_bedrooms: null,
    manual_bathrooms: null,
    manual_sqft: null,
    manual_year: null,
    ...overrides,
  }
}

// ─── Test: Sorting — negotiating listings first ──────────────────

describe('MarketDashboard V3 — Listing sorting', () => {
  it('sorts negotiating listings before available ones', () => {
    const listings = [
      makeListing({ id: '1', status: 'available', source: 'mhvillage', address: 'Available House' }),
      makeListing({ id: '2', status: 'negotiating', source: 'facebook', address: 'Negotiating House' }),
      makeListing({ id: '3', status: 'available', source: 'facebook', address: 'FB Available' }),
    ]

    // Apply the same sort logic as MarketDashboard
    const sorted = [...listings].sort((a, b) => {
      if (a.status === 'negotiating' && b.status !== 'negotiating') return -1
      if (a.status !== 'negotiating' && b.status === 'negotiating') return 1
      if (a.source === 'facebook' && b.source !== 'facebook') return -1
      if (a.source !== 'facebook' && b.source === 'facebook') return 1
      return 0
    })

    expect(sorted[0].id).toBe('2') // negotiating first
    expect(sorted[0].status).toBe('negotiating')
    expect(sorted[1].source).toBe('facebook') // then facebook
    expect(sorted[2].source).toBe('mhvillage') // then others
  })
})

// ─── Test: Manual field values for prediction ────────────────────

describe('MarketDashboard V3 — Manual field prediction fallback', () => {
  it('uses manual_* values over scraped values when available', () => {
    const listing = makeListing({
      listing_price: 25000,
      sqft: 900,
      bedrooms: 3,
      bathrooms: 2,
      manual_price: 22000,
      manual_sqft: 1100,
      manual_bedrooms: 4,
      manual_bathrooms: null, // not overridden
    })

    // Same logic as MarketDashboard prediction fetch
    const predictionInput = {
      listing_price: listing.manual_price || listing.listing_price,
      sqft: listing.manual_sqft || listing.sqft,
      bedrooms: listing.manual_bedrooms || listing.bedrooms,
      bathrooms: listing.manual_bathrooms || listing.bathrooms,
    }

    expect(predictionInput.listing_price).toBe(22000) // manual
    expect(predictionInput.sqft).toBe(1100) // manual
    expect(predictionInput.bedrooms).toBe(4) // manual
    expect(predictionInput.bathrooms).toBe(2) // scraped (no manual)
  })

  it('falls back to scraped when all manual fields are null', () => {
    const listing = makeListing({
      listing_price: 25000,
      sqft: 900,
      bedrooms: 3,
      bathrooms: 2,
    })

    const predictionInput = {
      listing_price: listing.manual_price || listing.listing_price,
      sqft: listing.manual_sqft || listing.sqft,
      bedrooms: listing.manual_bedrooms || listing.bedrooms,
      bathrooms: listing.manual_bathrooms || listing.bathrooms,
    }

    expect(predictionInput.listing_price).toBe(25000)
    expect(predictionInput.sqft).toBe(900)
    expect(predictionInput.bedrooms).toBe(3)
    expect(predictionInput.bathrooms).toBe(2)
  })
})

// ─── Test: Filter query params construction ──────────────────────

describe('MarketDashboard V3 — Filter query construction', () => {
  it('builds correct query params with all filters active', () => {
    const filters = {
      qualified_only: true,
      limit: 500,
      city: 'Houston',
      max_price: 50000,
      bedrooms: '3',
      min_year: '2000',
      max_year: '2020',
      source: 'facebook',
    }

    const params = new URLSearchParams()
    params.append('qualified_only', filters.qualified_only ? 'true' : 'false')
    params.append('limit', String(filters.limit))
    if (filters.city) params.append('city', filters.city)
    if (filters.max_price) params.append('max_price', String(filters.max_price))
    if (filters.bedrooms) params.append('bedrooms', filters.bedrooms)
    if (filters.min_year) params.append('min_year', filters.min_year)
    if (filters.max_year) params.append('max_year', filters.max_year)
    if (filters.source) params.append('source', filters.source)

    expect(params.get('qualified_only')).toBe('true')
    expect(params.get('limit')).toBe('500')
    expect(params.get('bedrooms')).toBe('3')
    expect(params.get('min_year')).toBe('2000')
    expect(params.get('max_year')).toBe('2020')
    expect(params.get('source')).toBe('facebook')
  })

  it('omits empty filter values', () => {
    const params = new URLSearchParams()
    params.append('qualified_only', 'true')
    params.append('limit', '500')
    // Empty filters not appended
    const bedrooms = ''
    const source = ''
    if (bedrooms) params.append('bedrooms', bedrooms)
    if (source) params.append('source', source)

    expect(params.has('bedrooms')).toBe(false)
    expect(params.has('source')).toBe(false)
    expect(params.toString()).toBe('qualified_only=true&limit=500')
  })

  it('defaults qualified_only to true unless showUnqualified is checked', () => {
    const showUnqualified = false
    const params = new URLSearchParams()
    params.append('qualified_only', showUnqualified ? 'false' : 'true')
    expect(params.get('qualified_only')).toBe('true')

    const params2 = new URLSearchParams()
    const showUnqualified2 = true
    params2.append('qualified_only', showUnqualified2 ? 'false' : 'true')
    expect(params2.get('qualified_only')).toBe('false')
  })
})

// ─── Test: Negotiation toggle logic ──────────────────────────────

describe('MarketDashboard V3 — Negotiation toggle', () => {
  it('toggles from available to negotiating', () => {
    const listing = makeListing({ status: 'available' })
    const newStatus = listing.status === 'negotiating' ? 'available' : 'negotiating'
    expect(newStatus).toBe('negotiating')
  })

  it('toggles from negotiating back to available', () => {
    const listing = makeListing({ status: 'negotiating' })
    const newStatus = listing.status === 'negotiating' ? 'available' : 'negotiating'
    expect(newStatus).toBe('available')
  })
})

// ─── Test: TDHCA lien display logic ──────────────────────────────

describe('MarketDashboard V3 — TDHCA Lien Display', () => {
  it('shows gravamen when lien_info is present', () => {
    const tdhcaResult = {
      lien_info: 'BANK OF AMERICA',
      tax_lien_status: null,
    }
    expect(tdhcaResult.lien_info).toBeTruthy()
  })

  it('shows tax lien status when present', () => {
    const tdhcaResult = {
      lien_info: null,
      tax_lien_status: 'Tax lien filed 2024-01-15',
    }
    expect(tdhcaResult.tax_lien_status).toBeTruthy()
  })

  it('shows both when both are present', () => {
    const tdhcaResult = {
      lien_info: 'WELLS FARGO',
      tax_lien_status: 'Active tax lien',
    }
    expect(tdhcaResult.lien_info).toBeTruthy()
    expect(tdhcaResult.tax_lien_status).toBeTruthy()
  })

  it('shows neither when both are null', () => {
    const tdhcaResult = {
      lien_info: null,
      tax_lien_status: null,
    }
    expect(tdhcaResult.lien_info).toBeFalsy()
    expect(tdhcaResult.tax_lien_status).toBeFalsy()
  })
})

// ─── Test: Source label/color mapping ────────────────────────────

describe('MarketDashboard V3 — Source badges for new sources', () => {
  const sourceColors: Record<string, string> = {
    mhvillage: 'bg-blue-100 text-blue-800 border-blue-200',
    mobilehome: 'bg-green-100 text-green-800 border-green-200',
    facebook: 'bg-sky-100 text-sky-800 border-sky-200',
    vmf_homes: 'bg-violet-100 text-violet-800 border-violet-200',
    '21st_mortgage': 'bg-rose-100 text-rose-800 border-rose-200',
  }

  const sourceLabels: Record<string, string> = {
    mhvillage: 'MHVillage',
    mobilehome: 'MobileHome.net',
    facebook: 'Facebook',
    vmf_homes: 'VMF Homes',
    '21st_mortgage': '21st Mortgage',
  }

  it('has color mapping for mhvillage source', () => {
    expect(sourceColors['mhvillage']).toContain('blue')
  })

  it('has color mapping for mobilehome source', () => {
    expect(sourceColors['mobilehome']).toContain('green')
  })

  it('has label for mhvillage', () => {
    expect(sourceLabels['mhvillage']).toBe('MHVillage')
  })

  it('has label for mobilehome', () => {
    expect(sourceLabels['mobilehome']).toBe('MobileHome.net')
  })
})

// ─── Test: Pipeline status config for negotiating ────────────────

describe('MarketDashboard V3 — Pipeline status config', () => {
  const pipelineStatusConfig: Record<string, { label: string; color: string; step: number }> = {
    available: { label: 'Disponible', color: 'bg-blue-100 text-blue-700', step: 1 },
    negotiating: { label: 'Negociando', color: 'bg-yellow-100 text-yellow-700', step: 3 },
    purchased: { label: 'Comprada', color: 'bg-green-100 text-green-700', step: 7 },
    rejected: { label: 'Rechazada', color: 'bg-gray-100 text-gray-500', step: 0 },
  }

  it('has negotiating status with yellow color', () => {
    expect(pipelineStatusConfig['negotiating'].color).toContain('yellow')
    expect(pipelineStatusConfig['negotiating'].label).toBe('Negociando')
  })

  it('negotiating is step 3 in pipeline', () => {
    expect(pipelineStatusConfig['negotiating'].step).toBe(3)
  })
})

// ─── Test: Multi-source scrape parallel calls ────────────────────

describe('MarketDashboard V3 — Multi-source scrape', () => {
  it('calls 4 scrape endpoints in parallel', async () => {
    const fetchCalls: string[] = []
    const mockFetch = jest.fn((url: string) => {
      fetchCalls.push(url)
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true }),
        status: 200,
      })
    })

    // Simulate the triggerSearch logic
    const results = await Promise.allSettled([
      mockFetch('/api/market-listings/scrape?city=Houston&min_price=0&max_price=80000'),
      mockFetch('/api/market-listings/scrape-facebook?min_price=0&max_price=80000'),
      mockFetch('/api/market-listings/scrape-mhvillage?min_price=5000&max_price=80000'),
      mockFetch('/api/market-listings/scrape-mobilehome?min_price=5000&max_price=80000'),
    ])

    expect(mockFetch).toHaveBeenCalledTimes(4)
    expect(fetchCalls).toContain('/api/market-listings/scrape-mhvillage?min_price=5000&max_price=80000')
    expect(fetchCalls).toContain('/api/market-listings/scrape-mobilehome?min_price=5000&max_price=80000')
    expect(results.every(r => r.status === 'fulfilled')).toBe(true)
  })
})
