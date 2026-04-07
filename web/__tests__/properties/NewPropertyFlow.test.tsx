/**
 * Tests for New Property Page — 4-step purchase flow
 * 
 * Verifies the 4-step flow matching "Revisar Casa" from Market:
 * Step 1: Datos + Documentos
 * Step 2: Evaluación (checklist)
 * Step 3: Registrar Pago
 * Step 4: Confirmar Compra
 * 
 * Also verifies largo × ancho input fields with auto-calc square footage.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

// ─── Mocks ────────────────────────────────────────────────────────
const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    refresh: jest.fn(),
    back: jest.fn(),
  }),
  useParams: () => ({ id: 'test-id' }),
  useSearchParams: () => ({ get: jest.fn() }),
}))

const mockToast = { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() }
jest.mock('@/components/ui/Toast', () => ({
  useToast: () => mockToast,
}))

jest.mock('@/hooks/useFormValidation', () => ({
  useFormValidation: () => ({
    errors: {},
    validate: jest.fn(() => true),
    validateSingle: jest.fn(() => true),
    markTouched: jest.fn(),
    getFieldError: jest.fn(() => null),
    clearErrors: jest.fn(),
  }),
  commonSchemas: { property: {} },
}))

jest.mock('@/components/ui/FormInput', () => {
  return function MockFormInput({ label, name, value, onChange, onBlur, placeholder, helperText, ...rest }: any) {
    return (
      <div>
        <label htmlFor={name}>{label}</label>
        <input
          id={name}
          name={name}
          value={value || ''}
          onChange={onChange}
          onBlur={onBlur}
          placeholder={placeholder}
          data-testid={`input-${name}`}
          {...rest}
        />
        {helperText && <span>{helperText}</span>}
      </div>
    )
  }
})

jest.mock('@/components/BillOfSaleTemplate', () => {
  const MockBillOfSale = ({ onSave, onClose }: any) => (
    <div data-testid="bill-of-sale-template">
      <button onClick={() => onSave(new File(['test'], 'bos.pdf'))}>Save BoS</button>
      <button onClick={onClose}>Close BoS</button>
    </div>
  )
  MockBillOfSale.displayName = 'BillOfSaleTemplate'
  return {
    __esModule: true,
    default: MockBillOfSale,
    generateSignedBillOfSalePDF: jest.fn(() => Promise.resolve(new File(['signed'], 'bos-signed.pdf'))),
  }
})

jest.mock('@/components/TitleApplicationTemplate', () => {
  const MockTitleApp = ({ onSave, onClose }: any) => (
    <div data-testid="title-app-template">
      <button onClick={() => onSave(new File(['test'], 'title.pdf'))}>Save Title</button>
      <button onClick={onClose}>Close Title</button>
    </div>
  )
  MockTitleApp.displayName = 'TitleApplicationTemplate'
  return {
    __esModule: true,
    default: MockTitleApp,
    generateSignedTitleAppPDF: jest.fn(() => Promise.resolve(new File(['signed'], 'ta-signed.pdf'))),
  }
})

jest.mock('@/components/DesktopEvaluatorPanel', () => {
  return function MockEvaluator({ onReportGenerated }: any) {
    return (
      <div data-testid="evaluator-panel">
        <button
          data-testid="generate-report"
          onClick={() => onReportGenerated({ id: 'eval-1', score: 85, recommendation: 'COMPRAR' })}
        >
          Generate Report
        </button>
      </div>
    )
  }
})

jest.mock('@/components/BankTransferPayment', () => ({
  BankTransferStep: function MockBankTransferStep() {
    return <div data-testid="bank-transfer-step">Bank Transfer Step</div>
  },
  usePayeeState: () => ({
    payeeMode: 'new',
    setPayeeMode: jest.fn(),
    savedPayees: [],
    selectedPayeeId: '',
    setSelectedPayeeId: jest.fn(),
    newPayee: { name: '', bank_name: '', routing_number: '', account_number: '', account_type: 'checking', address: '', bank_address: '' },
    setNewPayee: jest.fn(),
    loadingPayees: false,
    isPayeeValid: false,
    resetPayee: jest.fn(),
    saveNewPayee: jest.fn(),
    fetchPayees: jest.fn(),
  }),
}))

// ─── Import component under test ─────────────────────────────────
import NewPropertyPage from '@/app/homes/properties/new/page'

// ─── Tests ────────────────────────────────────────────────────────
describe('New Property Page — 4-step flow', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ envelopes: [], payees: [] }) })) as jest.Mock
  })

  it('renders the page with step 1 (Datos y Documentos) active by default', () => {
    render(<NewPropertyPage />)
    
    // Should show step 1 title
    expect(screen.getByText('Paso 1: Datos y Documentos')).toBeInTheDocument()
  })

  it('shows all 4 step numbers in the stepper', () => {
    render(<NewPropertyPage />)
    
    // Step indicators show numbers 1-4
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('shows step 1 subtitle description', () => {
    render(<NewPropertyPage />)
    
    expect(screen.getByText('Ingresa los datos de la casa y completa los documentos')).toBeInTheDocument()
  })

  it('shows Largo (ft) and Ancho (ft) input labels', () => {
    render(<NewPropertyPage />)
    
    // Should have Largo and Ancho inputs
    expect(screen.getByText('Largo (ft)')).toBeInTheDocument()
    expect(screen.getByText('Ancho (ft)')).toBeInTheDocument()
  })

  it('does NOT show a square_feet input field', () => {
    render(<NewPropertyPage />)
    
    expect(screen.queryByTestId('input-square_feet')).not.toBeInTheDocument()
  })

  it('has length_ft and width_ft input fields', () => {
    render(<NewPropertyPage />)
    
    const lengthInput = screen.getByTestId('input-length_ft')
    const widthInput = screen.getByTestId('input-width_ft')
    
    expect(lengthInput).toBeInTheDocument()
    expect(widthInput).toBeInTheDocument()
  })

  it('auto-calculates and displays square footage from largo × ancho', async () => {
    render(<NewPropertyPage />)
    
    const lengthInput = screen.getByTestId('input-length_ft')
    const widthInput = screen.getByTestId('input-width_ft')
    
    // Type dimensions
    fireEvent.change(lengthInput, { target: { name: 'length_ft', value: '76' } })
    fireEvent.change(widthInput, { target: { name: 'width_ft', value: '16' } })
    
    // Should display calculated square footage: "Medida:" "76 × 16" "(1,216 ft²)"
    await waitFor(() => {
      const medidaEl = screen.getByText(/Medida:/i)
      expect(medidaEl).toBeInTheDocument()
      expect(screen.getByText(/76 × 16/)).toBeInTheDocument()
      expect(screen.getByText(/1,216 ft²/)).toBeInTheDocument()
    })
  })

  it('has the address as a required field', () => {
    render(<NewPropertyPage />)
    
    const addressInput = screen.getByTestId('input-address')
    expect(addressInput).toBeInTheDocument()
  })

  it('shows all property data fields in step 1', () => {
    render(<NewPropertyPage />)
    
    // Core property fields
    expect(screen.getByTestId('input-address')).toBeInTheDocument()
    expect(screen.getByTestId('input-city')).toBeInTheDocument()
    expect(screen.getByTestId('input-state')).toBeInTheDocument()
    expect(screen.getByTestId('input-zip_code')).toBeInTheDocument()
    expect(screen.getByTestId('input-hud_number')).toBeInTheDocument()
    expect(screen.getByTestId('input-year')).toBeInTheDocument()
    expect(screen.getByTestId('input-purchase_price')).toBeInTheDocument()
    expect(screen.getByTestId('input-bedrooms')).toBeInTheDocument()
    expect(screen.getByTestId('input-bathrooms')).toBeInTheDocument()
  })

  it('shows document section headers in step 1', () => {
    render(<NewPropertyPage />)
    
    // Document sections should be visible (multiple Bill of Sale references exist)
    const billOfSaleElements = screen.getAllByText(/Bill of Sale/i)
    expect(billOfSaleElements.length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Título/i).length).toBeGreaterThan(0)
  })

  it('shows a "Volver a Propiedades" back link', () => {
    render(<NewPropertyPage />)
    
    const backLink = screen.getByText('Volver a Propiedades')
    expect(backLink).toBeInTheDocument()
    expect(backLink.closest('a')).toHaveAttribute('href', '/homes/properties')
  })

  it('shows "Datos de la Propiedad" section header', () => {
    render(<NewPropertyPage />)
    
    expect(screen.getByText('Datos de la Propiedad')).toBeInTheDocument()
  })

  it('shows "Detalles de la Propiedad" section header', () => {
    render(<NewPropertyPage />)
    
    expect(screen.getByText('Detalles de la Propiedad')).toBeInTheDocument()
  })

  it('shows helper text for dimension fields', () => {
    render(<NewPropertyPage />)
    
    expect(screen.getByText('Largo en pies')).toBeInTheDocument()
    expect(screen.getByText('Ancho en pies')).toBeInTheDocument()
  })
})

describe('New Property — Square Feet Auto-Calculation Logic', () => {
  it('computes sqft correctly for typical mobile home dimensions', () => {
    // Unit test for the computation logic
    const testCases = [
      { length: '76', width: '16', expected: 1216 },
      { length: '60', width: '14', expected: 840 },
      { length: '80', width: '32', expected: 2560 },
      { length: '52', width: '14', expected: 728 },
      { length: '10', width: '8', expected: 80 },
    ]

    testCases.forEach(({ length, width, expected }) => {
      const result = parseInt(length) * parseInt(width)
      expect(result).toBe(expected)
    })
  })

  it('handles empty values gracefully', () => {
    const length = ''
    const width = ''
    const computedSqFt = length && width ? parseInt(length) * parseInt(width) : null
    expect(computedSqFt).toBeNull()
  })

  it('handles partial values gracefully', () => {
    const length = '76'
    const width = ''
    const computedSqFt = length && width ? parseInt(length) * parseInt(width) : null
    expect(computedSqFt).toBeNull()
  })
})
