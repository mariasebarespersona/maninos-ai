'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { 
  LayoutDashboard,
  FileCheck,
  FileSignature,
  CreditCard,
  Landmark,
  Menu, 
  X,
  ChevronRight,
  LogOut,
  Loader2,
  AlertTriangle,
  BarChart3,
  ArrowRightLeft,
  Calculator,
  FileText,
  Users,
  BookOpen,
} from 'lucide-react'
import { useAuth } from '@/components/Auth/AuthProvider'
import { useToast } from '@/components/ui/Toast'

interface NavItem {
  name: string
  href: string
  icon: React.ElementType
  badge?: string
}

interface NavSection {
  title: string
  items: NavItem[]
}

const navigationSections: NavSection[] = [
  {
    title: 'Clientes',
    items: [
      { name: 'Clientes RTO', href: '/capital/applications', icon: FileCheck },
      { name: 'Contratos', href: '/capital/contracts', icon: FileSignature },
      { name: 'Pagos', href: '/capital/payments', icon: CreditCard },
    ],
  },
  {
    title: 'Inversionistas',
    items: [
      { name: 'Seguimiento', href: '/capital/investors', icon: Users },
      { name: 'Promissory Notes', href: '/capital/promissory-notes', icon: FileText },
    ],
  },
  {
    title: 'Reportes',
    items: [
      { name: 'Reportes', href: '/capital/reports', icon: BarChart3 },
      { name: 'Contabilidad', href: '/capital/accounting', icon: BookOpen },
      { name: 'Flujo Capital', href: '/capital/flows', icon: ArrowRightLeft },
      { name: 'Análisis', href: '/capital/analysis', icon: Calculator },
    ],
  },
]

export default function CapitalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, loading: authLoading, signOut } = useAuth()
  const toast = useToast()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  const isActive = (href: string) => {
    if (href === '/capital') return pathname === '/capital'
    return pathname.startsWith(href)
  }

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await signOut()
      toast.success('Sesión cerrada')
      router.push('/login')
    } catch (error) {
      toast.error('Error al cerrar sesión')
      console.error(error)
    } finally {
      setLoggingOut(false)
    }
  }

  const getUserInitials = () => {
    if (!user?.email) return 'MC'
    const parts = user.email.split('@')[0].split(/[._-]/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase()
    }
    return user.email.substring(0, 2).toUpperCase()
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--ivory)' }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-ink/20 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 z-50 h-full w-72
        bg-white border-r transform transition-transform duration-200
        lg:translate-x-0 
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `} style={{ borderColor: 'var(--sand)' }}>
        
        {/* Header */}
        <div className="h-20 flex items-center justify-between px-6 border-b" style={{ borderColor: 'var(--sand)' }}>
          <Link href="/capital" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" 
                 style={{ backgroundColor: 'var(--gold-700)' }}>
              <span className="text-white font-serif font-bold text-lg">MC</span>
            </div>
            <div>
              <h1 className="font-serif font-semibold text-lg" style={{ color: 'var(--ink)' }}>
                Maninos Capital
              </h1>
              <span className="text-xs" style={{ color: 'var(--ash)' }}>Rent-to-Own</span>
            </div>
          </Link>
          
          <button 
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-2 rounded-md hover:bg-sand/50 transition-colors"
            style={{ color: 'var(--slate)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Portal Switch */}
        <div className="px-4 pt-4 pb-2">
          <Link 
            href="/homes" 
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors"
            style={{ backgroundColor: 'var(--cream)', color: 'var(--slate)' }}
          >
            <span>← Portal Homes</span>
          </Link>
        </div>

        {/* Navigation — grouped by section */}
        <nav className="p-4 space-y-5">
          {navigationSections.map((section) => (
            <div key={section.title}>
              <p className="px-4 pb-1 text-[10px] font-bold uppercase tracking-widest"
                 style={{ color: 'var(--ash)' }}>
                {section.title}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon
                  const active = isActive(item.href)
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={`
                        flex items-center gap-3 px-4 py-2.5 rounded-md font-medium transition-colors
                        ${active 
                          ? 'text-gold-800' 
                          : 'text-slate hover:text-charcoal hover:bg-sand/40'
                        }
                      `}
                      style={active ? { backgroundColor: 'var(--gold-100)' } : {}}
                    >
                      <Icon className="w-5 h-5" strokeWidth={1.75} />
                      <span className="text-sm">{item.name}</span>
                      {item.badge && (
                        <span className="ml-auto badge badge-warning text-xs">{item.badge}</span>
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User section */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t" style={{ borderColor: 'var(--sand)' }}>
          {user && (
            <div className="mb-3 px-4 py-2">
              <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ash)' }}>
                Sesión activa
              </p>
              <p className="text-sm font-medium truncate mt-1" style={{ color: 'var(--charcoal)' }}>
                {user.email}
              </p>
            </div>
          )}
          
          <button 
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-md border font-medium transition-colors disabled:opacity-50"
            style={{ 
              borderColor: 'var(--stone)', 
              color: 'var(--slate)',
              backgroundColor: 'transparent'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--error-light)'
              e.currentTarget.style.borderColor = '#f5c6c6'
              e.currentTarget.style.color = 'var(--error)'
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.borderColor = 'var(--stone)'
              e.currentTarget.style.color = 'var(--slate)'
            }}
          >
            {loggingOut ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <LogOut className="w-4 h-4" />
            )}
            <span>{loggingOut ? 'Saliendo...' : 'Cerrar Sesión'}</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-72">
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur-sm border-b flex items-center px-4 lg:px-6"
                style={{ borderColor: 'var(--sand)' }}>
          {/* Mobile menu */}
          <button 
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-md mr-3 transition-colors"
            style={{ color: 'var(--slate)' }}
          >
            <Menu className="w-6 h-6" />
          </button>

          {/* Breadcrumb */}
          <div className="flex-1">
            <CapitalBreadcrumb pathname={pathname} />
          </div>

          {/* User */}
          <div className="flex items-center gap-3">
            {authLoading ? (
              <div className="w-9 h-9 rounded-md animate-pulse" style={{ backgroundColor: 'var(--sand)' }} />
            ) : (
              <>
                <div className="hidden sm:block text-right">
                  <p className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>
                    {user?.email?.split('@')[0] || 'Usuario'}
                  </p>
                </div>
                <div className="w-9 h-9 rounded-md flex items-center justify-center"
                     style={{ backgroundColor: 'var(--gold-700)' }}>
                  <span className="text-white text-sm font-semibold">{getUserInitials()}</span>
                </div>
              </>
            )}
          </div>
        </header>

        {/* Content */}
        <main className="p-4 lg:p-6 min-h-[calc(100vh-4rem)]">
          {children}
        </main>
      </div>
    </div>
  )
}

function CapitalBreadcrumb({ pathname }: { pathname: string }) {
  const segments = pathname.split('/').filter(Boolean)
  
  const labels: Record<string, string> = {
    capital: 'Dashboard',
    applications: 'Clientes RTO',
    kyc: 'Verificación KYC',
    contracts: 'Contratos',
    payments: 'Pagos',
    investors: 'Seguimiento',
    'promissory-notes': 'Promissory Notes',
    flows: 'Flujo Capital',
    analysis: 'Análisis',
    reports: 'Reportes',
    accounting: 'Contabilidad',
    new: 'Nuevo',
    review: 'Revisar',
  }

  if (segments.length <= 1) {
    return (
      <h1 className="font-serif text-xl" style={{ color: 'var(--ink)' }}>
        Panel Maninos Capital
      </h1>
    )
  }

  const lastSegment = segments[segments.length - 1]
  const isUuid = lastSegment.length > 20
  const pageTitle = isUuid ? 'Detalle' : (labels[lastSegment] || lastSegment)

  return (
    <div className="flex items-center gap-2">
      {segments.slice(0, -1).map((segment, index) => {
        const label = labels[segment] || segment
        if (segment.length > 20) return null
        
        return (
          <React.Fragment key={segment}>
            {index > 0 && <ChevronRight className="w-4 h-4" style={{ color: 'var(--ash)' }} />}
            <span className="text-sm" style={{ color: 'var(--ash)' }}>{label}</span>
          </React.Fragment>
        )
      })}
      <ChevronRight className="w-4 h-4" style={{ color: 'var(--ash)' }} />
      <span className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>{pageTitle}</span>
    </div>
  )
}

