'use client'

import { useEffect, useRef, ReactNode } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

export function Modal({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg'
  }

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 animate-fade-in" 
           style={{ backgroundColor: 'rgba(26, 25, 23, 0.5)' }} />
      
      {/* Modal */}
      <div 
        ref={modalRef}
        className={`relative bg-white rounded-lg w-full ${sizeClasses[size]} animate-scale-in`}
        style={{ boxShadow: 'var(--shadow-lg)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b"
             style={{ borderColor: 'var(--sand)' }}>
          <h3 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>{title}</h3>
          <button
            onClick={onClose}
            className="p-2 rounded-md transition-colors"
            style={{ color: 'var(--ash)' }}
          >
            <X size={20} />
          </button>
        </div>
        
        {/* Content */}
        <div className="px-6 py-5">
          {children}
        </div>
      </div>
    </div>
  )
}

// Input Modal
interface InputModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (value: string) => void
  title: string
  label: string
  placeholder?: string
  defaultValue?: string
  type?: 'text' | 'number' | 'email'
  helpText?: string
  confirmText?: string
  cancelText?: string
  required?: boolean
  min?: number
  max?: number
}

export function InputModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  label,
  placeholder = '',
  defaultValue = '',
  type = 'text',
  helpText,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  required = true,
  min,
  max
}: InputModalProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (inputRef.current) {
      onConfirm(inputRef.current.value)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <form onSubmit={handleSubmit}>
        <div className="space-y-4">
          <div>
            <label className="label">
              {label}
              {required && <span style={{ color: 'var(--error)' }}> *</span>}
            </label>
            <input
              ref={inputRef}
              type={type}
              defaultValue={defaultValue}
              placeholder={placeholder}
              min={min}
              max={max}
              className="input"
              required={required}
            />
            {helpText && (
              <p className="help-text">{helpText}</p>
            )}
          </div>
          
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1"
            >
              {cancelText}
            </button>
            <button
              type="submit"
              className="btn-primary flex-1"
            >
              {confirmText}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

// Select Modal
interface SelectOption {
  value: string
  label: string
  description?: string
}

interface SelectModalProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (value: string) => void
  title: string
  options: SelectOption[]
  helpText?: string
}

export function SelectModal({
  isOpen,
  onClose,
  onSelect,
  title,
  options,
  helpText
}: SelectModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="space-y-2">
        {helpText && (
          <p className="text-sm mb-4" style={{ color: 'var(--slate)' }}>{helpText}</p>
        )}
        
        {options.map((option) => (
          <button
            key={option.value}
            onClick={() => onSelect(option.value)}
            className="w-full text-left px-4 py-3 rounded-md border transition-colors"
            style={{ borderColor: 'var(--sand)' }}
          >
            <div className="font-medium" style={{ color: 'var(--charcoal)' }}>
              {option.label}
            </div>
            {option.description && (
              <div className="text-sm mt-0.5" style={{ color: 'var(--ash)' }}>
                {option.description}
              </div>
            )}
          </button>
        ))}
        
        <button
          onClick={onClose}
          className="w-full px-4 py-3 rounded-md mt-2 transition-colors"
          style={{ color: 'var(--ash)' }}
        >
          Cancelar
        </button>
      </div>
    </Modal>
  )
}

// Confirm Modal
interface ConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string | ReactNode
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'danger'
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  variant = 'default'
}: ConfirmModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="space-y-5">
        <div style={{ color: 'var(--slate)' }}>
          {message}
        </div>
        
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="btn-secondary flex-1"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 ${variant === 'danger' ? 'btn-danger' : 'btn-primary'}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  )
}
