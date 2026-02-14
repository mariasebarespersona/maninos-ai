'use client'

import { useState, useCallback } from 'react'

/**
 * Validation rules for form fields
 */
export interface ValidationRule {
  required?: boolean
  minLength?: number
  maxLength?: number
  min?: number
  max?: number
  pattern?: RegExp
  custom?: (value: any) => string | null
  message?: string
}

export interface ValidationSchema {
  [field: string]: ValidationRule
}

export interface ValidationErrors {
  [field: string]: string | null
}

/**
 * Custom hook for form validation
 */
export function useFormValidation<T extends Record<string, any>>(schema: ValidationSchema) {
  const [errors, setErrors] = useState<ValidationErrors>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  const validateField = useCallback((name: string, value: any): string | null => {
    const rules = schema[name]
    if (!rules) return null

    // Required
    if (rules.required && (value === '' || value === null || value === undefined)) {
      return rules.message || 'Este campo es obligatorio'
    }

    // Skip other validations if empty and not required
    if (!value && !rules.required) return null

    // MinLength
    if (rules.minLength && typeof value === 'string' && value.length < rules.minLength) {
      return rules.message || `Mínimo ${rules.minLength} caracteres`
    }

    // MaxLength
    if (rules.maxLength && typeof value === 'string' && value.length > rules.maxLength) {
      return rules.message || `Máximo ${rules.maxLength} caracteres`
    }

    // Min (for numbers)
    if (rules.min !== undefined && Number(value) < rules.min) {
      return rules.message || `El valor mínimo es ${rules.min}`
    }

    // Max (for numbers)
    if (rules.max !== undefined && Number(value) > rules.max) {
      return rules.message || `El valor máximo es ${rules.max}`
    }

    // Pattern (regex)
    if (rules.pattern && !rules.pattern.test(String(value))) {
      return rules.message || 'Formato inválido'
    }

    // Custom validation
    if (rules.custom) {
      return rules.custom(value)
    }

    return null
  }, [schema])

  const validate = useCallback((data: T): boolean => {
    const newErrors: ValidationErrors = {}
    let isValid = true

    Object.keys(schema).forEach(field => {
      const error = validateField(field, data[field])
      if (error) {
        newErrors[field] = error
        isValid = false
      } else {
        newErrors[field] = null
      }
    })

    setErrors(newErrors)
    return isValid
  }, [schema, validateField])

  const validateSingle = useCallback((name: string, value: any) => {
    const error = validateField(name, value)
    setErrors(prev => ({ ...prev, [name]: error }))
    return error === null
  }, [validateField])

  const markTouched = useCallback((name: string) => {
    setTouched(prev => ({ ...prev, [name]: true }))
  }, [])

  const clearErrors = useCallback(() => {
    setErrors({})
    setTouched({})
  }, [])

  const getFieldError = useCallback((name: string): string | null => {
    return touched[name] ? errors[name] : null
  }, [errors, touched])

  return {
    errors,
    touched,
    validate,
    validateSingle,
    markTouched,
    clearErrors,
    getFieldError,
  }
}

/**
 * Common validation patterns
 */
export const patterns = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  phone: /^[\d\s\-+()]+$/,
  zipCode: /^\d{5}(-\d{4})?$/,
  ssn: /^\d{3}-?\d{2}-?\d{4}$/,
  currency: /^\d+(\.\d{1,2})?$/,
}

/**
 * Common validation schemas
 */
export const commonSchemas = {
  property: {
    address: { required: true, minLength: 5, message: 'La dirección es obligatoria (mínimo 5 caracteres)' },
    city: { minLength: 2 },
    state: { minLength: 2 },
    zip_code: { minLength: 3, maxLength: 15 }, // Accepts any postal code format
    year: { min: 1900, max: 2030, message: 'Año inválido (1900-2030)' },
    bedrooms: { min: 0, max: 20 },
    bathrooms: { min: 0, max: 20 },
    purchase_price: { min: 0 },
    sale_price: { min: 0 },
  },
  client: {
    full_name: { required: true, minLength: 3, message: 'El nombre es obligatorio (mínimo 3 caracteres)' },
    email: { pattern: patterns.email, message: 'Email inválido' },
    phone: { pattern: patterns.phone, message: 'Teléfono inválido' },
  },
  sale: {
    property_id: { required: true, message: 'Selecciona una propiedad' },
    client_id: { required: true, message: 'Selecciona un cliente' },
    final_price: { required: true, min: 1, message: 'El precio debe ser mayor a 0' },
  },
}

