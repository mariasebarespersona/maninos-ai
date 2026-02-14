'use client'

import React, { forwardRef } from 'react'
import { AlertCircle, CheckCircle2 } from 'lucide-react'

interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string | null
  success?: boolean
  helperText?: string
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  prefix?: string
}

/**
 * FormInput - Input field with validation states
 * Supports error states, success states, icons, and prefixes
 */
const FormInput = forwardRef<HTMLInputElement, FormInputProps>(({
  label,
  error,
  success,
  helperText,
  leftIcon,
  rightIcon,
  prefix,
  className = '',
  required,
  id,
  ...props
}, ref) => {
  const inputId = id || props.name

  const baseInputClasses = `
    w-full px-4 py-2.5 
    bg-white border rounded-lg
    text-navy-900 placeholder:text-navy-400
    transition-all duration-200
    focus:outline-none focus:ring-2 focus:ring-offset-0
  `

  const stateClasses = error
    ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20'
    : success
    ? 'border-emerald-300 focus:border-emerald-500 focus:ring-emerald-500/20'
    : 'border-navy-200 focus:border-gold-500 focus:ring-gold-500/20'

  return (
    <div className="space-y-1.5">
      {label && (
        <label 
          htmlFor={inputId} 
          className="block text-sm font-medium text-navy-700"
        >
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <div className="relative">
        {leftIcon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400">
            {leftIcon}
          </span>
        )}

        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400">
            {prefix}
          </span>
        )}

        <input
          ref={ref}
          id={inputId}
          className={`
            ${baseInputClasses}
            ${stateClasses}
            ${leftIcon || prefix ? 'pl-10' : ''}
            ${rightIcon || error || success ? 'pr-10' : ''}
            ${className}
          `}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : undefined}
          {...props}
        />

        {/* Right side icon/status */}
        <span className="absolute right-3 top-1/2 -translate-y-1/2">
          {error ? (
            <AlertCircle className="w-5 h-5 text-red-500" />
          ) : success ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          ) : rightIcon ? (
            <span className="text-navy-400">{rightIcon}</span>
          ) : null}
        </span>
      </div>

      {/* Error or helper text */}
      {error ? (
        <p id={`${inputId}-error`} className="text-sm text-red-600 flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5" />
          {error}
        </p>
      ) : helperText ? (
        <p className="text-sm text-navy-500">{helperText}</p>
      ) : null}
    </div>
  )
})

FormInput.displayName = 'FormInput'

export default FormInput


