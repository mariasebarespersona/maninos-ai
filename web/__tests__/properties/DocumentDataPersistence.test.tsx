/**
 * Tests for Document Data Persistence (Issue 2)
 *
 * Verifies that Bill of Sale and Title Application form data
 * is saved to property.document_data and loaded back correctly
 * when templates are reopened.
 */
import '@testing-library/jest-dom'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import React from 'react'

// -------------------------------------------------------------------
// Mock next/navigation
// -------------------------------------------------------------------
const mockPush = jest.fn()
const mockBack = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: mockBack,
  }),
  useParams: () => ({ id: 'prop-test-doc' }),
  useSearchParams: () => ({
    get: jest.fn(() => null),
  }),
}))

// -------------------------------------------------------------------
// Mock next/link
// -------------------------------------------------------------------
jest.mock('next/link', () => {
  return ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>{children}</a>
  )
})

// -------------------------------------------------------------------
// Mock Toast
// -------------------------------------------------------------------
const mockToast = {
  success: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
}
jest.mock('@/components/ui/Toast', () => ({
  useToast: () => mockToast,
}))

// -------------------------------------------------------------------
// Mock Modal
// -------------------------------------------------------------------
jest.mock('@/components/ui/Modal', () => ({
  InputModal: () => null,
  ConfirmModal: () => null,
}))

// -------------------------------------------------------------------
// Mock TitleTransferCard
// -------------------------------------------------------------------
jest.mock('@/components/TitleTransferCard', () => {
  return () => <div data-testid="mock-title-transfer-card" />
})

// -------------------------------------------------------------------
// Mock DesktopEvaluatorPanel
// -------------------------------------------------------------------
jest.mock('@/components/DesktopEvaluatorPanel', () => {
  return ({ propertyId }: any) => (
    <div data-testid="mock-desktop-evaluator">Evaluator for {propertyId}</div>
  )
})

// -------------------------------------------------------------------
// Track BillOfSaleTemplate props (especially initialData)
// -------------------------------------------------------------------
let lastBosInitialData: any = null
jest.mock('@/components/BillOfSaleTemplate', () => {
  const MockBOS = ({ transactionType, initialData, onSave, onClose }: any) => {
    lastBosInitialData = initialData
    return (
      <div data-testid="mock-bos-template">
        <span data-testid="bos-tx-type">{transactionType}</span>
        <span data-testid="bos-seller">{initialData?.seller_name || 'empty'}</span>
        <button
          data-testid="bos-save-btn"
          onClick={() =>
            onSave(
              new File(['pdf'], 'bos.pdf', { type: 'application/pdf' }),
              { seller_name: 'John Doe', buyer_name: 'MANINOS HOMES', total_payment: '$30,000' }
            )
          }
        >
          Save BOS
        </button>
        <button data-testid="bos-close-btn" onClick={onClose}>Close BOS</button>
      </div>
    )
  }
  MockBOS.displayName = 'MockBOS'
  return MockBOS
})

// -------------------------------------------------------------------
// Track TitleApplicationTemplate props
// -------------------------------------------------------------------
let lastTitleAppInitialData: any = null
jest.mock('@/components/TitleApplicationTemplate', () => {
  const MockTitleApp = ({ transactionType, initialData, onSave, onClose }: any) => {
    lastTitleAppInitialData = initialData
    return (
      <div data-testid="mock-title-app-template">
        <span data-testid="title-app-tx-type">{transactionType}</span>
        <span data-testid="title-app-seller">{initialData?.seller_name || 'empty'}</span>
        <button
          data-testid="title-app-save-btn"
          onClick={() =>
            onSave(
              new File(['pdf'], 'title.pdf', { type: 'application/pdf' }),
              { seller_name: 'Jane Seller', applicant_name: 'MANINOS HOMES LLC' }
            )
          }
        >
          Save Title App
        </button>
        <button data-testid="title-app-close-btn" onClick={onClose}>Close Title App</button>
      </div>
    )
  }
  MockTitleApp.displayName = 'MockTitleApp'
  return MockTitleApp
})

// -------------------------------------------------------------------
// Property fixture WITH saved document_data
// -------------------------------------------------------------------
const PROPERTY_WITH_DOC_DATA = {
  id: 'prop-test-doc',
  address: '100 Test Blvd',
  city: 'Houston',
  state: 'Texas',
  zip_code: '77001',
  hud_number: 'HUD-123',
  year: 2020,
  status: 'purchased',
  is_renovated: false,
  purchase_price: 30000,
  sale_price: null,
  bedrooms: 3,
  bathrooms: 2,
  square_feet: 1216,
  length_ft: 76,
  width_ft: 16,
  property_code: 'A1',
  photos: [],
  checklist_completed: false,
  checklist_data: {},
  document_data: {
    bos_purchase: {
      seller_name: 'Saved Seller',
      buyer_name: 'MANINOS HOMES',
      total_payment: '$30,000',
      manufacturer: 'Clayton',
    },
    title_app_purchase: {
      seller_name: 'Saved Title Seller',
      applicant_name: 'MANINOS HOMES LLC',
      year: '2020',
    },
  },
  created_at: '2026-03-01T00:00:00+00:00',
  updated_at: '2026-03-01T00:00:00+00:00',
}

const PROPERTY_WITHOUT_DOC_DATA = {
  ...PROPERTY_WITH_DOC_DATA,
  document_data: {},
}

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------
let fetchMockResponses: Record<string, any> = {}

function setupFetchMock(property: any) {
  fetchMockResponses = {}
  global.fetch = jest.fn((url: string, options?: any) => {
    const urlStr = typeof url === 'string' ? url : url.toString()

    // GET property
    if (urlStr.includes('/api/properties/prop-test-doc') && (!options || options.method === undefined || options.method === 'GET')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(property),
      } as Response)
    }

    // PATCH property (save document_data)
    if (urlStr.includes('/api/properties/prop-test-doc') && options?.method === 'PATCH') {
      const body = JSON.parse(options.body)
      // Return updated property with the patched document_data
      const updated = { ...property, document_data: { ...property.document_data, ...body.document_data } }
      fetchMockResponses['patch'] = body
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(updated),
      } as Response)
    }

    // Transfers
    if (urlStr.includes('/api/transfers')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      } as Response)
    }

    // Moves
    if (urlStr.includes('/api/moves')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]),
      } as Response)
    }

    // Evaluations
    if (urlStr.includes('/api/evaluations')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ evaluations: [] }),
      } as Response)
    }

    // Default
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    } as Response)
  }) as jest.Mock
}

// -------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------

import PropertyDetailPage from '@/app/homes/properties/[id]/page'

describe('Document Data Persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    lastBosInitialData = null
    lastTitleAppInitialData = null
  })

  // ---------------------------------------------------------------
  // TEST 1: Saved BOS data loaded as initialData
  // ---------------------------------------------------------------
  it('loads saved BOS data into template when reopening', async () => {
    setupFetchMock(PROPERTY_WITH_DOC_DATA)
    render(<PropertyDetailPage />)

    // Wait for property to load
    await waitFor(() => {
      expect(screen.getByText('100 Test Blvd')).toBeInTheDocument()
    })

    // Click Bill of Sale (Compra) button
    const bosBtn = screen.getByText('Bill of Sale (Compra)')
    fireEvent.click(bosBtn)

    // BOS template should be open with saved data
    await waitFor(() => {
      expect(screen.getByTestId('mock-bos-template')).toBeInTheDocument()
    })

    // The saved data should override defaults
    expect(lastBosInitialData).toBeTruthy()
    expect(lastBosInitialData.seller_name).toBe('Saved Seller')
    expect(lastBosInitialData.manufacturer).toBe('Clayton')
    // buyer_name should come from saved data too
    expect(lastBosInitialData.buyer_name).toBe('MANINOS HOMES')
  })

  // ---------------------------------------------------------------
  // TEST 2: Saved Title App data loaded as initialData
  // ---------------------------------------------------------------
  it('loads saved Title Application data into template when reopening', async () => {
    setupFetchMock(PROPERTY_WITH_DOC_DATA)
    render(<PropertyDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('100 Test Blvd')).toBeInTheDocument()
    })

    // Click Aplicación Título (Compra) button
    const titleBtn = screen.getByText('Aplicación Título (Compra)')
    fireEvent.click(titleBtn)

    await waitFor(() => {
      expect(screen.getByTestId('mock-title-app-template')).toBeInTheDocument()
    })

    expect(lastTitleAppInitialData).toBeTruthy()
    expect(lastTitleAppInitialData.seller_name).toBe('Saved Title Seller')
    expect(lastTitleAppInitialData.year).toBe('2020')
  })

  // ---------------------------------------------------------------
  // TEST 3: No saved data → template shows property defaults
  // ---------------------------------------------------------------
  it('shows property defaults when no document_data saved', async () => {
    setupFetchMock(PROPERTY_WITHOUT_DOC_DATA)
    render(<PropertyDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('100 Test Blvd')).toBeInTheDocument()
    })

    const bosBtn = screen.getByText('Bill of Sale (Compra)')
    fireEvent.click(bosBtn)

    await waitFor(() => {
      expect(screen.getByTestId('mock-bos-template')).toBeInTheDocument()
    })

    // Without saved data, seller_name should be empty (purchase mode)
    expect(lastBosInitialData.seller_name).toBe('')
    expect(lastBosInitialData.buyer_name).toBe('MANINOS HOMES')
    // Property data should still be present
    expect(lastBosInitialData.bedrooms).toBe('3')
  })

  // ---------------------------------------------------------------
  // TEST 4: Saving BOS triggers PATCH with document_data
  // ---------------------------------------------------------------
  it('saves BOS data to property via PATCH when clicking save', async () => {
    setupFetchMock(PROPERTY_WITHOUT_DOC_DATA)
    render(<PropertyDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('100 Test Blvd')).toBeInTheDocument()
    })

    // Open BOS template
    fireEvent.click(screen.getByText('Bill of Sale (Compra)'))

    await waitFor(() => {
      expect(screen.getByTestId('bos-save-btn')).toBeInTheDocument()
    })

    // Click save in the BOS template
    fireEvent.click(screen.getByTestId('bos-save-btn'))

    // Should call PATCH with document_data
    await waitFor(() => {
      expect(fetchMockResponses['patch']).toBeTruthy()
    })

    const patchBody = fetchMockResponses['patch']
    expect(patchBody.document_data).toBeTruthy()
    expect(patchBody.document_data.bos_purchase).toBeTruthy()
    expect(patchBody.document_data.bos_purchase.seller_name).toBe('John Doe')
    expect(patchBody.document_data.bos_purchase.buyer_name).toBe('MANINOS HOMES')
  })

  // ---------------------------------------------------------------
  // TEST 5: Green checkmark shown when document data exists
  // ---------------------------------------------------------------
  it('shows green checkmark on document buttons when data is saved', async () => {
    setupFetchMock(PROPERTY_WITH_DOC_DATA)
    render(<PropertyDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('100 Test Blvd')).toBeInTheDocument()
    })

    // The Bill of Sale (Compra) button should have green styling (document_data.bos_purchase exists)
    const bosBtn = screen.getByText('Bill of Sale (Compra)').closest('button')!
    expect(bosBtn.className).toContain('green')

    // The Aplicación Título (Compra) should also be green
    const titleBtn = screen.getByText('Aplicación Título (Compra)').closest('button')!
    expect(titleBtn.className).toContain('green')

    // Sale buttons should NOT be green (no saved data)
    const bosSaleBtn = screen.getByText('Bill of Sale (Venta)').closest('button')!
    expect(bosSaleBtn.className).not.toContain('green')
  })

  // ---------------------------------------------------------------
  // TEST 6: Dimensions display (largo × ancho)
  // ---------------------------------------------------------------
  it('displays dimensions as "largo × ancho (ft²)" when length_ft and width_ft are set', async () => {
    setupFetchMock(PROPERTY_WITH_DOC_DATA)
    render(<PropertyDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('100 Test Blvd')).toBeInTheDocument()
    })

    // Should show "76 × 16" with ft² in parentheses
    // Use a combined regex to avoid matching "16" in SVG attributes etc.
    expect(screen.getByText(/76\s*×\s*16/)).toBeInTheDocument()
    expect(screen.getByText(/1,216 ft²/)).toBeInTheDocument()
  })

  // ---------------------------------------------------------------
  // TEST 7: Dimensions fallback (only square_feet)
  // ---------------------------------------------------------------
  it('displays only square_feet when length_ft and width_ft are not set', async () => {
    const propNoLW = {
      ...PROPERTY_WITHOUT_DOC_DATA,
      length_ft: null,
      width_ft: null,
      square_feet: 1500,
    }
    setupFetchMock(propNoLW)
    render(<PropertyDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('100 Test Blvd')).toBeInTheDocument()
    })

    expect(screen.getByText(/1,500 ft²/)).toBeInTheDocument()
  })
})

