import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

// --- Mocks ---

const mockPathname = '/homes'
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn(), back: jest.fn() }),
  usePathname: () => mockPathname,
}))

const mockToast = { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() }
jest.mock('@/components/ui/Toast', () => ({ useToast: () => mockToast }))

jest.mock('@/components/Auth/AuthProvider', () => ({
  useAuth: () => ({ user: { email: 'test@maninos.com' }, loading: false, signOut: jest.fn() }),
}))

jest.mock('@/components/AIChatWidget', () => {
  return function MockAIChatWidget() { return null }
})

// --- Helpers ---

function mockFetchWithPending(pending: number) {
  global.fetch = jest.fn().mockImplementation((url: string) => {
    if (url.includes('/api/payment-orders/stats')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true, data: { pending, completed: 5 } }),
      })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  }) as jest.Mock
}

// --- Import component under test ---
import HomesLayout from '@/app/homes/layout'

// --- Tests ---

describe('SidebarBadge - Notificaciones pending order badge', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('renders "Notificaciones" in the sidebar navigation', () => {
    mockFetchWithPending(0)
    render(<HomesLayout><div>child</div></HomesLayout>)

    expect(screen.getByText('Notificaciones')).toBeInTheDocument()
  })

  it('Notificaciones link points to /homes/notificaciones', () => {
    mockFetchWithPending(0)
    render(<HomesLayout><div>child</div></HomesLayout>)

    const link = screen.getByText('Notificaciones').closest('a')
    expect(link).toHaveAttribute('href', '/homes/notificaciones')
  })

  it('shows pending badge when stats returns count > 0', async () => {
    mockFetchWithPending(3)
    render(<HomesLayout><div>child</div></HomesLayout>)

    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument()
    })
  })

  it('does NOT show badge when pending count is 0', async () => {
    mockFetchWithPending(0)
    render(<HomesLayout><div>child</div></HomesLayout>)

    // Wait for fetch to resolve
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled()
    })

    // No badge should be rendered — there should be no small numeric element
    const notifLink = screen.getByText('Notificaciones').closest('a')
    const badge = notifLink?.querySelector('.bg-red-500')
    expect(badge).toBeNull()
  })

  it('shows "9+" when pending count exceeds 9', async () => {
    mockFetchWithPending(15)
    render(<HomesLayout><div>child</div></HomesLayout>)

    await waitFor(() => {
      expect(screen.getByText('9+')).toBeInTheDocument()
    })
  })
})
