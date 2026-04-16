'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { 
  Home, 
  Building2, 
  Users, 
  DollarSign, 
  Menu, 
  X,
  ChevronRight,
  LogOut,
  Loader2,
  FileText,
  Search,
  Award,
  Calculator,
  Bell,
  BarChart3
} from 'lucide-react'
import { useAuth } from '@/components/Auth/AuthProvider'
import { useToast } from '@/components/ui/Toast'
import AIChatWidget from '@/components/AIChatWidget'
import TourProvider from '@/components/tour/TourProvider'

interface NavItem {
  name: string
  href: string
  icon: React.ElementType
}

const allNavigation: NavItem[] = [
  { name: 'Inicio', href: '/homes', icon: Home },
  { name: 'Casas del Mercado', href: '/homes/market', icon: Search },
  { name: 'Propiedades', href: '/homes/properties', icon: Building2 },
  { name: 'Clientes', href: '/homes/clients', icon: Users },
  { name: 'Ventas', href: '/homes/sales', icon: DollarSign },
  { name: 'Comisiones', href: '/homes/commissions', icon: Award },
  { name: 'Titulos', href: '/homes/transfers', icon: FileText },
  { name: 'Notificaciones', href: '/homes/notificaciones', icon: Bell },
  { name: 'Contabilidad', href: '/homes/accounting', icon: Calculator },
  { name: 'Resumen de Casas', href: '/homes/resumen-financiero', icon: BarChart3 },
]

// Nav visibility per role
const ROLE_ALLOWED_HREFS: Record<string, string[]> = {
  treasury: ['/homes', '/homes/commissions', '/homes/notificaciones', '/homes/accounting'],
  operations: ['/homes', '/homes/market', '/homes/properties', '/homes/clients', '/homes/sales', '/homes/transfers'],
  yard_manager: ['/homes', '/homes/market', '/homes/properties'],
}

// Extra nav access by email (additive — merged with role-based access)
const EMAIL_EXTRA_HREFS: Record<string, string[]> = {
  'aldair': ['/homes/commissions'],
  'aruiz': ['/homes/properties', '/homes/accounting'],
}

function getNavForRole(role?: string, email?: string): NavItem[] {
  let allowed: string[] | null = null
  if (role && ROLE_ALLOWED_HREFS[role]) {
    allowed = [...ROLE_ALLOWED_HREFS[role]]
  }
  // Merge email-based extras
  if (email) {
    const prefix = email.split('@')[0].toLowerCase()
    for (const [key, hrefs] of Object.entries(EMAIL_EXTRA_HREFS)) {
      if (prefix.startsWith(key)) {
        if (allowed) {
          for (const h of hrefs) { if (!allowed.includes(h)) allowed.push(h) }
        }
        // If no role restriction (admin), they already see everything
      }
    }
  }
  if (allowed) {
    return allNavigation.filter(item => allowed!.includes(item.href))
  }
  // admin etc → everything
  return allNavigation
}

export default function HomesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, loading: authLoading, signOut, teamUser } = useAuth()
  const toast = useToast()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [pendingNotifCount, setPendingNotifCount] = useState(0)

  useEffect(() => {
    // Count only what's visible in the 4 tabs: pending orders + pending transfers + pending renovations
    Promise.all([
      fetch('/api/sales/pending-transfers').then(r => r.json()).catch(() => ({})),
      fetch('/api/payment-orders?status=pending').then(r => r.json()).catch(() => ({})),
      fetch('/api/renovation/pending-approvals').then(r => r.json()).catch(() => ({})),
    ]).then(([transfersData, ordersData, renoData]) => {
      const transfers = transfersData.transfers || []
      const transferCount = Array.isArray(transfers) ? transfers.length : 0
      const orders = ordersData.data || []
      const orderCount = Array.isArray(orders) ? orders.length : 0
      const renoCount = renoData.count || 0
      setPendingNotifCount(transferCount + orderCount + renoCount)
    }).catch(() => {})
  }, [pathname])

  const isActive = (href: string) => {
    if (href === '/homes') return pathname === '/homes'
    return pathname.startsWith(href)
  }

  // Redirect if user navigates to a restricted page
  useEffect(() => {
    if (!teamUser?.role || pathname === '/homes') return
    const roleAllowed = ROLE_ALLOWED_HREFS[teamUser.role]
    if (!roleAllowed) return // no restrictions for this role (admin)
    // Merge email-based extras into allowed list
    const allowed = [...roleAllowed]
    if (user?.email) {
      const prefix = user.email.split('@')[0].toLowerCase()
      for (const [key, hrefs] of Object.entries(EMAIL_EXTRA_HREFS)) {
        if (prefix.startsWith(key)) {
          for (const h of hrefs) { if (!allowed.includes(h)) allowed.push(h) }
        }
      }
    }
    const isAllowed = allowed.some(href => href === '/homes' ? pathname === '/homes' : pathname.startsWith(href))
    if (!isAllowed) {
      router.replace('/homes')
    }
  }, [pathname, teamUser?.role, user?.email, router])

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
    if (!user?.email) return 'MH'
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
          <Link href="/homes" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" 
                 style={{ backgroundColor: 'var(--navy-800)' }}>
              <span className="text-white font-serif font-bold text-lg">M</span>
            </div>
            <div>
              <h1 className="font-serif font-semibold text-lg" style={{ color: 'var(--ink)' }}>
                Maninos Homes
              </h1>
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

        {/* Navigation */}
        <nav className="p-4 space-y-1">
          {getNavForRole(teamUser?.role, user?.email).map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`
                  flex items-center gap-3 px-4 py-3 rounded-md font-medium transition-colors
                  ${active 
                    ? 'text-navy-800' 
                    : 'text-slate hover:text-charcoal hover:bg-sand/40'
                  }
                `}
                style={active ? { backgroundColor: 'var(--navy-50)' } : {}}
              >
                <Icon className="w-5 h-5" strokeWidth={1.75} />
                <span className="text-base flex-1">{item.name}</span>
                {item.name === 'Notificaciones' && pendingNotifCount > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {pendingNotifCount > 9 ? '9+' : pendingNotifCount}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* User section */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t" style={{ borderColor: 'var(--sand)' }}>
          {user && (
            <div className="mb-3 px-4 py-2">
              <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ash)' }}>
                Sesión activa
              </p>
              <p className="text-sm font-medium truncate mt-1" style={{ color: 'var(--charcoal)' }}>
                {teamUser?.name || user.email}
              </p>
              {teamUser?.role && (
                <p className="text-xs mt-0.5 capitalize" style={{ color: 'var(--ash)' }}>
                  {teamUser.role === 'operations' ? 'Operaciones' :
                   teamUser.role === 'treasury' ? 'Tesorería' :
                   teamUser.role === 'yard_manager' ? 'Enc. Yard' :
                   teamUser.role === 'admin' ? 'Admin' : teamUser.role}
                </p>
              )}
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
            <Breadcrumb pathname={pathname} />
          </div>

          {/* Notifications bell */}
          {pendingNotifCount > 0 && (
            <Link href="/homes/notificaciones" className="relative p-2 rounded-md hover:bg-sand/50 transition-colors mr-2">
              <Bell className="w-5 h-5" style={{ color: 'var(--slate)' }} />
              <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {pendingNotifCount > 9 ? '9+' : pendingNotifCount}
              </span>
            </Link>
          )}

          {/* User */}
          <div className="flex items-center gap-3">
            {authLoading ? (
              <div className="w-9 h-9 rounded-md animate-pulse" style={{ backgroundColor: 'var(--sand)' }} />
            ) : (
              <>
                <div className="hidden sm:block text-right">
                  <p className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>
                    {teamUser?.name || user?.email?.split('@')[0] || 'Usuario'}
                  </p>
                </div>
                <div className="w-9 h-9 rounded-md flex items-center justify-center"
                     style={{ backgroundColor: 'var(--navy-800)' }}>
                  <span className="text-white text-sm font-semibold">{getUserInitials()}</span>
                </div>
              </>
            )}
          </div>
        </header>

        {/* Content — extra bottom padding for floating chat widget */}
        <main className="p-4 lg:p-6 min-h-[calc(100vh-4rem)] pb-24">
          {children}
        </main>
      </div>

      {/* AI Chat Widget */}
      <AIChatWidget />
      <TourProvider portal="homes" />
    </div>
  )
}

function Breadcrumb({ pathname }: { pathname: string }) {
  const segments = pathname.split('/').filter(Boolean)
  
  const labels: Record<string, string> = {
    homes: 'Inicio',
    market: 'Casas del Mercado',
    properties: 'Propiedades',
    clients: 'Clientes',
    sales: 'Ventas',
    commissions: 'Comisiones',
    transfers: 'Titulos',
    new: 'Nuevo',
    edit: 'Editar',
    renovate: 'Renovar',
    notificaciones: 'Notificaciones',
    accounting: 'Contabilidad',
  }

  if (segments.length <= 1) {
    return (
      <h1 className="font-serif text-xl" style={{ color: 'var(--ink)' }}>
        Panel Principal
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
