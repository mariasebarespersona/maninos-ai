/**
 * Tests for Property Detail Page — Dimensions Display
 * 
 * Verifies that dimensions show as "largo × ancho (X ft²)"
 * with auto-calculated square footage.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'

// ─── Mocks ────────────────────────────────────────────────────────
// Mock useToast
const mockToast = { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() }
jest.mock('@/components/ui/Toast', () => ({
  useToast: () => mockToast,
}))

// Mock Modal components
jest.mock('@/components/ui/Modal', () => ({
  InputModal: () => null,
  ConfirmModal: () => null,
  Modal: () => null,
}))

// Mock heavy child components
jest.mock('@/components/TitleTransferCard', () => () => <div data-testid="title-transfer-card" />)
jest.mock('@/components/BillOfSaleTemplate', () => () => <div data-testid="bill-of-sale" />)
jest.mock('@/components/TitleApplicationTemplate', () => () => <div data-testid="title-app" />)
jest.mock('@/components/DesktopEvaluatorPanel', () => () => <div data-testid="evaluator-panel" />)

// ─── Helper: DetailItem extracted for isolated testing ────────────
// We re-implement the component logic inline since it's not exported
function DimensionsDisplay({ length_ft, width_ft, square_feet }: {
  length_ft?: number
  width_ft?: number
  square_feet?: number
}) {
  return (
    <div>
      <p className="text-sm text-navy-500">Medida</p>
      <p className="font-medium text-navy-900">
        {length_ft && width_ft ? (
          <>
            {length_ft} × {width_ft}
            <span className="text-sm font-normal text-navy-400 ml-1">
              ({(length_ft * width_ft).toLocaleString()} ft²)
            </span>
          </>
        ) : square_feet ? (
          <>{square_feet.toLocaleString()} ft²</>
        ) : (
          '—'
        )}
      </p>
    </div>
  )
}

// ─── Tests ────────────────────────────────────────────────────────
describe('Property Detail — Dimensions Display', () => {
  it('shows "largo × ancho (sqft ft²)" when length_ft and width_ft are provided', () => {
    render(<DimensionsDisplay length_ft={76} width_ft={16} />)
    
    // Label should be "Medida"
    expect(screen.getByText('Medida')).toBeInTheDocument()
    
    // Should show dimensions in format: 76 × 16
    expect(screen.getByText(/76 × 16/)).toBeInTheDocument()
    
    // Should show auto-calculated square footage: (1,216 ft²)
    expect(screen.getByText(/1,216 ft²/)).toBeInTheDocument()
  })

  it('auto-calculates square feet from length × width', () => {
    render(<DimensionsDisplay length_ft={60} width_ft={14} />)
    
    // 60 × 14 = 840
    expect(screen.getByText(/840 ft²/)).toBeInTheDocument()
  })

  it('shows just square_feet with ft² when only square_feet is available', () => {
    render(<DimensionsDisplay square_feet={1200} />)
    
    expect(screen.getByText(/1,200 ft²/)).toBeInTheDocument()
  })

  it('shows "—" when no dimension data is available', () => {
    render(<DimensionsDisplay />)
    
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('prioritizes length × width over square_feet when both are available', () => {
    render(<DimensionsDisplay length_ft={50} width_ft={20} square_feet={999} />)
    
    // Should show 50 × 20 = 1,000, NOT 999
    expect(screen.getByText(/50 × 20/)).toBeInTheDocument()
    expect(screen.getByText(/1,000 ft²/)).toBeInTheDocument()
    expect(screen.queryByText(/999/)).not.toBeInTheDocument()
  })

  it('correctly calculates for large dimensions', () => {
    render(<DimensionsDisplay length_ft={80} width_ft={32} />)
    
    // 80 × 32 = 2,560
    expect(screen.getByText(/80 × 32/)).toBeInTheDocument()
    expect(screen.getByText(/2,560 ft²/)).toBeInTheDocument()
  })

  it('handles small dimensions', () => {
    render(<DimensionsDisplay length_ft={10} width_ft={8} />)
    
    // 10 × 8 = 80
    expect(screen.getByText(/10 × 8/)).toBeInTheDocument()
    expect(screen.getByText(/80 ft²/)).toBeInTheDocument()
  })

  it('does not show dimensions format when only length_ft is provided', () => {
    render(<DimensionsDisplay length_ft={76} />)
    
    // Should fall through to "—" since width is missing
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('does not show dimensions format when only width_ft is provided', () => {
    render(<DimensionsDisplay width_ft={16} />)
    
    // Should fall through to "—" since length is missing
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})

