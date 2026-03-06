/**
 * Tests for the Titulos/Title Monitor page
 */
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/homes/transfers',
}))

// Mock Toast
jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({
    success: jest.fn(),
    error: jest.fn(),
  }),
}))

// Mock TitleTransferCard
jest.mock('@/components/TitleTransferCard', () => {
  return function MockCard({ transfer }: any) {
    return <div data-testid="transfer-card">{transfer.id}</div>
  }
})

import TransfersPage from '@/app/homes/transfers/page'

const mockTransfers = [
  {
    id: '1',
    property_id: 'p1',
    transfer_type: 'purchase',
    status: 'pending',
    from_name: 'Seller',
    to_name: 'Maninos Homes',
    documents_checklist: {},
    property_address: '123 Main St',
    created_at: '2026-01-01',
  },
]

const mockMonitor = {
  total_monitored: 5,
  title_updated: 2,
  title_pending: 3,
  never_checked: 1,
  no_serial: 2,
  transfers: [
    {
      id: 't1',
      property_id: 'p1',
      transfer_type: 'purchase',
      to_name: 'Maninos Homes',
      status: 'pending',
      tdhca_serial: 'ABC123',
      tdhca_label: 'LBL456',
      tdhca_owner_name: 'OLD OWNER',
      title_name_updated: false,
      last_tdhca_check: '2026-02-01T00:00:00',
      next_tdhca_check: '2026-03-01T00:00:00',
      tdhca_check_count: 1,
      created_at: '2026-01-01',
    },
    {
      id: 't2',
      property_id: 'p2',
      transfer_type: 'purchase',
      to_name: 'Maninos Homes',
      status: 'completed',
      tdhca_serial: 'DEF789',
      tdhca_label: '',
      tdhca_owner_name: 'MANINOS HOMES LLC',
      title_name_updated: true,
      last_tdhca_check: '2026-02-15T00:00:00',
      next_tdhca_check: null,
      tdhca_check_count: 2,
      created_at: '2026-01-01',
    },
  ],
}

describe('TransfersPage - Title Monitor', () => {
  beforeEach(() => {
    global.fetch = jest.fn((url: string) => {
      if (url.includes('title-monitor')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockMonitor),
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockTransfers),
      })
    }) as jest.Mock
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('renders the Titulos header', async () => {
    render(<TransfersPage />)
    expect(screen.getByText('Titulos')).toBeInTheDocument()
  })

  it('shows title monitor tab by default', async () => {
    render(<TransfersPage />)
    expect(screen.getByText('Monitoreo de Titulos')).toBeInTheDocument()
  })

  it('renders monitor stats when data loads', async () => {
    render(<TransfersPage />)
    await waitFor(() => {
      expect(screen.getByText('Monitoreados')).toBeInTheDocument()
      expect(screen.getByText('Nombre Actualizado')).toBeInTheDocument()
    })
  })

  it('shows Pendientes label in stats', async () => {
    render(<TransfersPage />)
    await waitFor(() => {
      expect(screen.getByText('Pendientes')).toBeInTheDocument()
    })
  })

  it('renders the monitor table with transfers', async () => {
    render(<TransfersPage />)
    await waitFor(() => {
      expect(screen.getByText('ABC123')).toBeInTheDocument()
      expect(screen.getByText('OLD OWNER')).toBeInTheDocument()
      expect(screen.getByText('MANINOS HOMES LLC')).toBeInTheDocument()
    })
  })

  it('shows Actualizado status for matched transfers', async () => {
    render(<TransfersPage />)
    await waitFor(() => {
      expect(screen.getByText('Actualizado')).toBeInTheDocument()
    })
  })

  it('shows Pendiente status for unmatched transfers', async () => {
    render(<TransfersPage />)
    await waitFor(() => {
      expect(screen.getByText('Pendiente')).toBeInTheDocument()
    })
  })

  it('shows Verificar button only for pending transfers', async () => {
    render(<TransfersPage />)
    await waitFor(() => {
      const verifyButtons = screen.getAllByText('Verificar')
      expect(verifyButtons).toHaveLength(1) // Only 1 pending transfer
    })
  })
})
