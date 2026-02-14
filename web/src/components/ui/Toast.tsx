'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'warning' | 'info'

// Simple toast helper for use outside of React components
// Uses native browser APIs for a lightweight implementation
export const toast = {
  success: (message: string) => showToast('success', message),
  error: (message: string) => showToast('error', message),
  warning: (message: string) => showToast('warning', message),
  info: (message: string) => showToast('info', message),
}

function showToast(type: ToastType, message: string) {
  // Create toast element
  const container = getOrCreateContainer()
  const toast = document.createElement('div')
  toast.className = `toast-item toast-${type}`
  toast.innerHTML = `
    <span class="toast-icon">${getIcon(type)}</span>
    <span class="toast-message">${message}</span>
  `
  toast.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    animation: slideIn 0.3s ease;
    ${getStyles(type)}
  `
  
  container.appendChild(toast)
  
  // Auto remove after 4 seconds
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease'
    setTimeout(() => toast.remove(), 300)
  }, 4000)
}

function getOrCreateContainer() {
  let container = document.getElementById('toast-container')
  if (!container) {
    container = document.createElement('div')
    container.id = 'toast-container'
    container.style.cssText = `
      position: fixed;
      bottom: 16px;
      right: 16px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 8px;
    `
    document.body.appendChild(container)
    
    // Add animations
    const style = document.createElement('style')
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
      }
    `
    document.head.appendChild(style)
  }
  return container
}

function getIcon(type: ToastType) {
  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ',
  }
  return icons[type]
}

function getStyles(type: ToastType) {
  const styles = {
    success: 'background: #dcfce7; color: #166534; border: 1px solid #86efac;',
    error: 'background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5;',
    warning: 'background: #fef3c7; color: #92400e; border: 1px solid #fcd34d;',
    info: 'background: #dbeafe; color: #1e40af; border: 1px solid #93c5fd;',
  }
  return styles[type]
}

interface Toast {
  id: string
  type: ToastType
  message: string
  duration?: number
}

interface ToastContextType {
  toasts: Toast[]
  addToast: (type: ToastType, message: string, duration?: number) => void
  removeToast: (id: string) => void
  success: (message: string, duration?: number) => void
  error: (message: string, duration?: number) => void
  warning: (message: string, duration?: number) => void
  info: (message: string, duration?: number) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const addToast = useCallback((type: ToastType, message: string, duration = 4000) => {
    const id = Math.random().toString(36).substring(2, 9)
    setToasts((prev) => [...prev, { id, type, message, duration }])

    if (duration > 0) {
      setTimeout(() => removeToast(id), duration)
    }
  }, [removeToast])

  const success = useCallback((message: string, duration?: number) => addToast('success', message, duration), [addToast])
  const error = useCallback((message: string, duration?: number) => addToast('error', message, duration), [addToast])
  const warning = useCallback((message: string, duration?: number) => addToast('warning', message, duration), [addToast])
  const info = useCallback((message: string, duration?: number) => addToast('info', message, duration), [addToast])

  return (
    <ToastContext.Provider
      value={{ toasts, addToast, removeToast, success, error, warning, info }}
    >
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  )
}

function ToastContainer({
  toasts,
  removeToast,
}: {
  toasts: Toast[]
  removeToast: (id: string) => void
}) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  )
}

const toastConfig = {
  success: {
    icon: CheckCircle,
    bg: 'var(--success-light)',
    border: '#a7d5b8',
    text: 'var(--success)',
  },
  error: {
    icon: XCircle,
    bg: 'var(--error-light)',
    border: '#f5c6c6',
    text: 'var(--error)',
  },
  warning: {
    icon: AlertCircle,
    bg: 'var(--warning-light)',
    border: '#e8d89a',
    text: 'var(--warning)',
  },
  info: {
    icon: Info,
    bg: 'var(--info-light)',
    border: '#a8cce4',
    text: 'var(--info)',
  },
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const config = toastConfig[toast.type]
  const Icon = config.icon

  return (
    <div
      className="relative overflow-hidden rounded-md border p-4 pr-10 animate-slide-in-right"
      style={{ 
        backgroundColor: config.bg,
        borderColor: config.border,
        color: config.text,
      }}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <p className="text-sm font-medium">{toast.message}</p>
      </div>

      <button
        onClick={onClose}
        className="absolute top-3 right-3 p-1 rounded transition-colors hover:bg-black/5"
        style={{ color: config.text }}
      >
        <X className="w-4 h-4" />
      </button>

      {toast.duration && toast.duration > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-1" style={{ backgroundColor: 'rgba(0,0,0,0.05)' }}>
          <div
            className="h-full animate-progress"
            style={{
              backgroundColor: config.text,
              animationDuration: `${toast.duration}ms`,
            }}
          />
        </div>
      )}
    </div>
  )
}
