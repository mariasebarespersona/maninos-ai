/**
 * Tests for Notificaciones Page — Payment Orders management
 *
 * Verifies:
 * - Page header and tab rendering
 * - Fetching and displaying pending/completed payment orders
 * - Empty states
 * - Completion modal flow (open, form validation, submit)
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

// ─── Mocks ────────────────────────────────────────────────────────
const mockToast = { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() }
jest.mock('@/components/ui/Toast', () => ({
  useToast: () => mockToast,
}))

jest.mock('next/link', () => {
  return function MockLink({ children, href, ...props }: any) {
    return <a href={href} {...props}>{children}</a>
  }
})

jest.mock('@/components/Auth/AuthProvider', () => ({
  useAuth: () => ({
    user: { email: 'admin@maninos.com' },
    teamUser: { id: 'user-1', role: 'admin', name: 'Admin' },
    loading: false,
    signOut: jest.fn(),
  }),
}))

// ─── Mock Data ────────────────────────────────────────────────────
const mockPendingOrder = {
  id: 'order-1',
  property_id: 'prop-1',
  property_address: '123 Main St',
  status: 'pending',
  payee_name: 'John Seller',
  bank_name: 'Chase',
  routing_number_last4: '6789',
  account_number_last4: '4321',
  account_type: 'checking',
  amount: 45000,
  method: 'transferencia',
  reference: null,
  payment_date: null,
  notes: null,
  created_by: 'gabriel',
  completed_by: null,
  completed_at: null,
  created_at: '2026-03-01T10:00:00Z',
}

const mockCompletedOrder = {
  ...mockPendingOrder,
  id: 'order-2',
  status: 'completed',
  reference: 'CONF-12345',
  payment_date: '2026-03-02',
  completed_by: 'abigail',
  completed_at: '2026-03-02T15:00:00Z',
}

// ─── Fetch Mock ───────────────────────────────────────────────────
function createFetchMock(overrides?: {
  pending?: any[]
  completed?: any[]
}) {
  const pending = overrides?.pending ?? [mockPendingOrder]
  const completed = overrides?.completed ?? [mockCompletedOrder]

  return jest.fn((url: string, options?: RequestInit) => {
    if (typeof url === 'string' && url.includes('/api/payment-orders') && options?.method === 'PATCH') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          ok: true,
          data: { ...mockPendingOrder, status: 'completed', reference: 'CONF-12345' },
          message: 'Pago completado',
        }),
      })
    }
    if (typeof url === 'string' && url.includes('/api/payment-orders?status=pending')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true, data: pending }),
      })
    }
    if (typeof url === 'string' && url.includes('/api/payment-orders?status=completed')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true, data: completed }),
      })
    }
    if (typeof url === 'string' && url.includes('/api/accounting/bank-accounts')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          bank_accounts: [
            { id: 'ba-1', name: 'Operating Account', bank_name: 'Chase', current_balance: 100000 },
          ],
        }),
      })
    }
    // Default: return empty array/object for any other endpoint
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ ok: true, data: [], transfers: [], envelopes: [], notifications: [], unread_count: 0 }),
    })
  }) as jest.Mock
}

// ─── Import Component ─────────────────────────────────────────────
import NotificacionesPage from '@/app/homes/notificaciones/page'

// ─── Tests ────────────────────────────────────────────────────────
describe('NotificacionesPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = createFetchMock()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  // 1. Renders the page with header "Notificaciones"
  it('renders the page with header "Notificaciones"', async () => {
    render(<NotificacionesPage />)
    await waitFor(() => {
      expect(screen.getByText('Notificaciones')).toBeInTheDocument()
    })
  })

  // 2. Shows "Pendientes" and "Realizados" tabs
  it('shows "Pendientes" and "Realizados" tabs', async () => {
    render(<NotificacionesPage />)
    await waitFor(() => {
      expect(screen.getByText('Por Aprobar')).toBeInTheDocument()
      expect(screen.getByText('Realizados')).toBeInTheDocument()
    })
  })

  // 3. Default tab is "Pendientes"
  it('defaults to the "Pendientes" tab', async () => {
    render(<NotificacionesPage />)
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/payment-orders?status=pending')
      )
    })
  })

  // 4. Fetches pending orders on mount and displays them
  it('fetches pending orders on mount and displays them', async () => {
    render(<NotificacionesPage />)
    await waitFor(() => {
      expect(screen.getByText(/123 Main St/)).toBeInTheDocument()
    })
  })

  // 5. Shows property address, amount ($45,000.00), payee name on the card
  it('shows property address, amount, and payee name on the card', async () => {
    render(<NotificacionesPage />)
    await waitFor(() => {
      expect(screen.getByText(/123 Main St/)).toBeInTheDocument()
      expect(screen.getByText('$45,000.00')).toBeInTheDocument()
      expect(screen.getByText(/John Seller/)).toBeInTheDocument()
    })
  })

  // 6. Shows "Completar Pago" button on pending orders
  it('shows "Aprobar" button on pending orders for admin', async () => {
    render(<NotificacionesPage />)
    await waitFor(() => {
      expect(screen.getByText('Aprobar')).toBeInTheDocument()
    })
  })

  // 7. Shows empty state when no pending orders
  it('shows empty state when no pending orders', async () => {
    global.fetch = createFetchMock({ pending: [] })
    render(<NotificacionesPage />)
    await waitFor(() => {
      expect(screen.getByText('No hay ordenes por aprobar')).toBeInTheDocument()
    })
  })

  // 8. Switching to "Realizados" tab fetches completed orders
  it('switches to "Realizados" tab and fetches completed orders', async () => {
    render(<NotificacionesPage />)
    // Wait for initial pending fetch
    await waitFor(() => {
      expect(screen.getByText(/123 Main St/)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Realizados'))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/payment-orders?status=completed')
      )
    })
  })

  // 9. Completed orders show reference number
  it('completed orders show reference number', async () => {
    render(<NotificacionesPage />)
    await waitFor(() => {
      expect(screen.getByText(/123 Main St/)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Realizados'))

    await waitFor(() => {
      expect(screen.getByText(/CONF-12345/)).toBeInTheDocument()
    })
  })

  // 10. Clicking "Completar Pago" opens the completion modal
  // 10. Clicking "Aprobar" calls PATCH approve endpoint
  it('clicking "Aprobar" calls the approve API', async () => {
    render(<NotificacionesPage />)
    await waitFor(() => {
      expect(screen.getByText('Aprobar')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Aprobar'))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/payment-orders/order-1/approve'),
        expect.objectContaining({ method: 'PATCH' })
      )
    })
  })

  // 11. Property links are rendered when property_id exists
  it('renders property address as a clickable link when property_id exists', async () => {
    render(<NotificacionesPage />)
    await waitFor(() => {
      const link = screen.getByText(/123 Main St/)
      expect(link.closest('a')).toHaveAttribute('href', '/homes/properties/prop-1')
    })
  })
})
