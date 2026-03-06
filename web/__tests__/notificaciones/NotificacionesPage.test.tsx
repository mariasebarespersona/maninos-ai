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
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
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
      expect(screen.getByText('Pendientes')).toBeInTheDocument()
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
      expect(screen.getByText('123 Main St')).toBeInTheDocument()
    })
  })

  // 5. Shows property address, amount ($45,000.00), payee name on the card
  it('shows property address, amount, and payee name on the card', async () => {
    render(<NotificacionesPage />)
    await waitFor(() => {
      expect(screen.getByText('123 Main St')).toBeInTheDocument()
      expect(screen.getByText('$45,000.00')).toBeInTheDocument()
      expect(screen.getByText(/John Seller/)).toBeInTheDocument()
    })
  })

  // 6. Shows "Completar Pago" button on pending orders
  it('shows "Completar Pago" button on pending orders', async () => {
    render(<NotificacionesPage />)
    await waitFor(() => {
      expect(screen.getByText('Completar Pago')).toBeInTheDocument()
    })
  })

  // 7. Shows empty state when no pending orders
  it('shows empty state when no pending orders', async () => {
    global.fetch = createFetchMock({ pending: [] })
    render(<NotificacionesPage />)
    await waitFor(() => {
      expect(screen.getByText('No hay ordenes pendientes')).toBeInTheDocument()
    })
  })

  // 8. Switching to "Realizados" tab fetches completed orders
  it('switches to "Realizados" tab and fetches completed orders', async () => {
    render(<NotificacionesPage />)
    // Wait for initial pending fetch
    await waitFor(() => {
      expect(screen.getByText('123 Main St')).toBeInTheDocument()
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
      expect(screen.getByText('123 Main St')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Realizados'))

    await waitFor(() => {
      expect(screen.getByText(/CONF-12345/)).toBeInTheDocument()
    })
  })

  // 10. Clicking "Completar Pago" opens the completion modal
  it('clicking "Completar Pago" opens the completion modal', async () => {
    render(<NotificacionesPage />)
    await waitFor(() => {
      expect(screen.getByText('Completar Pago')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Completar Pago'))

    await waitFor(() => {
      // Modal title is also "Completar Pago"
      const headings = screen.getAllByText('Completar Pago')
      expect(headings.length).toBeGreaterThanOrEqual(2)
    })
  })

  // 11. Modal shows order summary (property address, payee name, amount)
  it('modal shows order summary with property address, payee name, and amount', async () => {
    render(<NotificacionesPage />)
    await waitFor(() => {
      expect(screen.getByText('Completar Pago')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Completar Pago'))

    await waitFor(() => {
      expect(screen.getByText('Propiedad')).toBeInTheDocument()
      expect(screen.getByText('Beneficiario')).toBeInTheDocument()
      expect(screen.getByText('Monto')).toBeInTheDocument()
      // Values in the modal summary
      expect(screen.getByText('John Seller')).toBeInTheDocument()
      // The amount appears in both the card and modal
      const amounts = screen.getAllByText('$45,000.00')
      expect(amounts.length).toBeGreaterThanOrEqual(2)
    })
  })

  // 12. Modal has confirmation number input, date input
  it('modal has confirmation number input and date input', async () => {
    render(<NotificacionesPage />)
    await waitFor(() => {
      expect(screen.getByText('Completar Pago')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Completar Pago'))

    await waitFor(() => {
      expect(screen.getByText('Numero de confirmacion *')).toBeInTheDocument()
      expect(screen.getByText('Fecha del pago *')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Ingresa el # de confirmacion de la transferencia')).toBeInTheDocument()
    })
  })

  // 13. Confirm button is disabled when reference is empty
  it('confirm button is disabled when reference is empty', async () => {
    render(<NotificacionesPage />)
    await waitFor(() => {
      expect(screen.getByText('Completar Pago')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Completar Pago'))

    await waitFor(() => {
      const confirmBtn = screen.getByText('Confirmar Pago Realizado')
      expect(confirmBtn).toBeDisabled()
    })
  })

  // 14. Submitting completion calls PATCH /api/payment-orders/{id}/complete
  it('submitting completion calls PATCH /api/payment-orders/{id}/complete', async () => {
    render(<NotificacionesPage />)
    await waitFor(() => {
      expect(screen.getByText('Completar Pago')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Completar Pago'))

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Ingresa el # de confirmacion de la transferencia')).toBeInTheDocument()
    })

    // Fill in the reference number
    const referenceInput = screen.getByPlaceholderText('Ingresa el # de confirmacion de la transferencia')
    fireEvent.change(referenceInput, { target: { value: 'CONF-99999' } })

    // Confirm button should now be enabled
    const confirmBtn = screen.getByText('Confirmar Pago Realizado')
    expect(confirmBtn).not.toBeDisabled()

    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/payment-orders/order-1/complete'),
        expect.objectContaining({
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('CONF-99999'),
        })
      )
    })
  })
})
