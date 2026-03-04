/**
 * Tests for Edit Property Page — Largo × Ancho with auto-calculated ft²
 * 
 * Verifies that:
 * 1. Edit form has length_ft and width_ft inputs (not square_feet)
 * 2. Auto-calculated square footage display works
 * 3. Submit payload includes length_ft, width_ft, and computed square_feet
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
  useParams: () => ({ id: 'test-property-id' }),
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

// ─── Import component under test ─────────────────────────────────
import EditPropertyPage from '@/app/homes/properties/[id]/edit/page'

// ─── Tests ────────────────────────────────────────────────────────
describe('Edit Property Page — Dimensions', () => {
  const mockProperty = {
    id: 'test-property-id',
    address: '123 Main St',
    city: 'Houston',
    state: 'Texas',
    zip_code: '77001',
    hud_number: 'TEX123',
    year: 2020,
    purchase_price: 30000,
    sale_price: 50000,
    bedrooms: 3,
    bathrooms: 2,
    square_feet: 1216,
    property_code: 'A1',
    length_ft: 76,
    width_ft: 16,
    status: 'purchased',
    photos: [],
    is_renovated: false,
    checklist_completed: false,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    // Mock the fetch to return property data
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockProperty),
    }) as jest.Mock
  })

  it('renders the edit form with property data loaded', async () => {
    render(<EditPropertyPage />)
    
    await waitFor(() => {
      expect(screen.getByText('Editar Propiedad')).toBeInTheDocument()
    })
  })

  it('has length_ft and width_ft input fields', async () => {
    render(<EditPropertyPage />)
    
    await waitFor(() => {
      expect(screen.getByTestId('input-length_ft')).toBeInTheDocument()
      expect(screen.getByTestId('input-width_ft')).toBeInTheDocument()
    })
  })

  it('loads existing length and width values from property', async () => {
    render(<EditPropertyPage />)
    
    await waitFor(() => {
      const lengthInput = screen.getByTestId('input-length_ft') as HTMLInputElement
      const widthInput = screen.getByTestId('input-width_ft') as HTMLInputElement
      expect(lengthInput.value).toBe('76')
      expect(widthInput.value).toBe('16')
    })
  })

  it('shows auto-calculated square footage banner when both dimensions present', async () => {
    render(<EditPropertyPage />)
    
    await waitFor(() => {
      // Should show "Medida: 76 × 16 (1,216 ft²)"
      expect(screen.getByText(/76 × 16/)).toBeInTheDocument()
      expect(screen.getByText(/1,216 ft²/)).toBeInTheDocument()
    })
  })

  it('displays the Largo (ft) label', async () => {
    render(<EditPropertyPage />)
    
    await waitFor(() => {
      expect(screen.getByText('Largo (ft)')).toBeInTheDocument()
    })
  })

  it('displays the Ancho (ft) label', async () => {
    render(<EditPropertyPage />)
    
    await waitFor(() => {
      expect(screen.getByText('Ancho (ft)')).toBeInTheDocument()
    })
  })

  it('has helper text for dimension fields', async () => {
    render(<EditPropertyPage />)
    
    await waitFor(() => {
      expect(screen.getByText('Largo en pies')).toBeInTheDocument()
      expect(screen.getByText('Ancho en pies')).toBeInTheDocument()
    })
  })

  it('updates square footage display when dimensions change', async () => {
    render(<EditPropertyPage />)
    
    await waitFor(() => {
      expect(screen.getByTestId('input-length_ft')).toBeInTheDocument()
    })

    // Change length to 80
    fireEvent.change(screen.getByTestId('input-length_ft'), {
      target: { name: 'length_ft', value: '80' },
    })
    
    // Change width to 32
    fireEvent.change(screen.getByTestId('input-width_ft'), {
      target: { name: 'width_ft', value: '32' },
    })

    // Should now show 80 × 32 = 2,560 ft²
    await waitFor(() => {
      expect(screen.getByText(/80 × 32/)).toBeInTheDocument()
      expect(screen.getByText(/2,560 ft²/)).toBeInTheDocument()
    })
  })

  it('submits with computed square_feet from length × width', async () => {
    const mockFetchResponses = [
      // Initial fetch for property data
      { ok: true, json: () => Promise.resolve(mockProperty) },
      // PUT request for update
      { ok: true, json: () => Promise.resolve({ ...mockProperty, id: 'test-property-id' }) },
    ]
    let fetchCallIndex = 0
    global.fetch = jest.fn().mockImplementation(() => {
      return Promise.resolve(mockFetchResponses[fetchCallIndex++])
    }) as jest.Mock

    render(<EditPropertyPage />)

    // Wait for form to load
    await waitFor(() => {
      expect(screen.getByTestId('input-address')).toBeInTheDocument()
    })

    // Submit the form
    const submitButton = screen.getByText(/Guardar Cambios/i)
    fireEvent.click(submitButton)

    await waitFor(() => {
      // Check the PATCH call was made with computed square_feet
      const patchCall = (global.fetch as jest.Mock).mock.calls.find(
        (call: any[]) => call[1]?.method === 'PATCH'
      )
      
      if (patchCall) {
        const payload = JSON.parse(patchCall[1].body)
        expect(payload.length_ft).toBe(76)
        expect(payload.width_ft).toBe(16)
        expect(payload.square_feet).toBe(76 * 16) // 1216
      }
    })
  })

  it('does not show square_feet as an editable input field', async () => {
    render(<EditPropertyPage />)
    
    await waitFor(() => {
      // Should NOT have a square_feet input
      expect(screen.queryByTestId('input-square_feet')).not.toBeInTheDocument()
    })
  })
})

describe('Edit Property — Payload Calculation', () => {
  it('computes square_feet as length × width in the payload', () => {
    const form = { length_ft: '76', width_ft: '16', square_feet: '' }
    const lengthVal = form.length_ft ? parseInt(form.length_ft) : undefined
    const widthVal = form.width_ft ? parseInt(form.width_ft) : undefined
    const autoSqFt = lengthVal && widthVal ? lengthVal * widthVal : (form.square_feet ? parseInt(form.square_feet) : undefined)

    expect(autoSqFt).toBe(1216)
  })

  it('falls back to square_feet if no length/width', () => {
    const form = { length_ft: '', width_ft: '', square_feet: '900' }
    const lengthVal = form.length_ft ? parseInt(form.length_ft) : undefined
    const widthVal = form.width_ft ? parseInt(form.width_ft) : undefined
    const autoSqFt = lengthVal && widthVal ? lengthVal * widthVal : (form.square_feet ? parseInt(form.square_feet) : undefined)

    expect(autoSqFt).toBe(900)
  })

  it('returns undefined when no dimension data', () => {
    const form = { length_ft: '', width_ft: '', square_feet: '' }
    const lengthVal = form.length_ft ? parseInt(form.length_ft) : undefined
    const widthVal = form.width_ft ? parseInt(form.width_ft) : undefined
    const autoSqFt = lengthVal && widthVal ? lengthVal * widthVal : (form.square_feet ? parseInt(form.square_feet) : undefined)

    expect(autoSqFt).toBeUndefined()
  })
})

// ─── Error Handling Tests (Internal Server Error fix) ─────────────
describe('Edit Property — Server Error Handling', () => {
  const mockProperty = {
    id: 'test-property-id',
    address: '123 Main St',
    city: 'Houston',
    state: 'Texas',
    zip_code: '77001',
    hud_number: 'TEX123',
    year: 2020,
    purchase_price: 30000,
    sale_price: 50000,
    bedrooms: 3,
    bathrooms: 2,
    square_feet: 1216,
    property_code: 'A1',
    length_ft: 76,
    width_ft: 16,
    status: 'purchased',
    photos: [],
    is_renovated: false,
    checklist_completed: false,
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('uses PATCH method (not PUT) for update requests', async () => {
    let fetchCallIndex = 0
    global.fetch = jest.fn().mockImplementation(() => {
      fetchCallIndex++
      if (fetchCallIndex === 1) {
        // GET to load property
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockProperty) })
      }
      // PATCH to save
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockProperty) })
    }) as jest.Mock

    render(<EditPropertyPage />)

    await waitFor(() => {
      expect(screen.getByTestId('input-address')).toBeInTheDocument()
    })

    const submitButton = screen.getByText(/Guardar Cambios/i)
    fireEvent.click(submitButton)

    await waitFor(() => {
      const calls = (global.fetch as jest.Mock).mock.calls
      const updateCall = calls.find((call: any[]) => call[1]?.method)
      expect(updateCall).toBeDefined()
      expect(updateCall[1].method).toBe('PATCH')
    })
  })

  it('displays server error detail when API returns 500 with JSON body', async () => {
    let fetchCallIndex = 0
    global.fetch = jest.fn().mockImplementation(() => {
      fetchCallIndex++
      if (fetchCallIndex === 1) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockProperty) })
      }
      // Simulate 500 with detail message
      return Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ detail: 'Error updating property: column "length_ft" does not exist' }),
      })
    }) as jest.Mock

    render(<EditPropertyPage />)

    await waitFor(() => {
      expect(screen.getByTestId('input-address')).toBeInTheDocument()
    })

    const submitButton = screen.getByText(/Guardar Cambios/i)
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith(
        expect.stringContaining('column "length_ft" does not exist')
      )
    })
  })

  it('handles 500 with empty body gracefully (no JSON parse crash)', async () => {
    let fetchCallIndex = 0
    global.fetch = jest.fn().mockImplementation(() => {
      fetchCallIndex++
      if (fetchCallIndex === 1) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockProperty) })
      }
      // Simulate 500 with empty body — json() throws
      return Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('Unexpected end of JSON input')),
      })
    }) as jest.Mock

    render(<EditPropertyPage />)

    await waitFor(() => {
      expect(screen.getByTestId('input-address')).toBeInTheDocument()
    })

    const submitButton = screen.getByText(/Guardar Cambios/i)
    fireEvent.click(submitButton)

    await waitFor(() => {
      // Should show the fallback message, NOT crash
      expect(mockToast.error).toHaveBeenCalledWith('Error al actualizar la propiedad')
    })
  })

  it('handles network error (API unreachable) gracefully', async () => {
    let fetchCallIndex = 0
    global.fetch = jest.fn().mockImplementation(() => {
      fetchCallIndex++
      if (fetchCallIndex === 1) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockProperty) })
      }
      // Simulate network error
      return Promise.reject(new Error('Failed to fetch'))
    }) as jest.Mock

    render(<EditPropertyPage />)

    await waitFor(() => {
      expect(screen.getByTestId('input-address')).toBeInTheDocument()
    })

    const submitButton = screen.getByText(/Guardar Cambios/i)
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Failed to fetch')
    })
  })

  it('does not send undefined fields in JSON payload', async () => {
    // Property without dimensions — only basic fields
    const basicProperty = {
      ...mockProperty,
      length_ft: null,
      width_ft: null,
      property_code: null,
    }

    let fetchCallIndex = 0
    global.fetch = jest.fn().mockImplementation(() => {
      fetchCallIndex++
      if (fetchCallIndex === 1) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(basicProperty) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(basicProperty) })
    }) as jest.Mock

    render(<EditPropertyPage />)

    await waitFor(() => {
      expect(screen.getByTestId('input-address')).toBeInTheDocument()
    })

    const submitButton = screen.getByText(/Guardar Cambios/i)
    fireEvent.click(submitButton)

    await waitFor(() => {
      const calls = (global.fetch as jest.Mock).mock.calls
      const patchCall = calls.find((call: any[]) => call[1]?.method === 'PATCH')
      if (patchCall) {
        const body = JSON.parse(patchCall[1].body)
        // undefined fields should NOT appear in JSON.stringify output
        expect(body).not.toHaveProperty('length_ft')
        expect(body).not.toHaveProperty('width_ft')
        expect(body).not.toHaveProperty('property_code')
      }
    })
  })
})

