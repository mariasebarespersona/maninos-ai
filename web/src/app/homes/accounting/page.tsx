'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  DollarSign, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
  Building2, CreditCard, RefreshCw, Plus, Search, Filter, ChevronDown,
  ChevronRight, Calendar, Download, Loader2, Landmark, BarChart3,
  PieChart, Wallet, Receipt, Home, Users, Hammer, Truck, Award,
  Settings, Eye, X, Check, AlertCircle, FileText, Repeat, Banknote,
  CircleDollarSign, ArrowRightLeft, MapPin, Clock, ChevronLeft,
  MoreHorizontal, Scale, BookOpen, ClipboardCheck, History,
  ShieldCheck, Upload, FileUp, Brain, CheckCircle2, SkipForward,
  ChevronUp, Sparkles, ImageIcon, Trash2
} from 'lucide-react'

// ── Types ──
interface DashboardData {
  period: { type: string; start_date: string; end_date: string; year: number; month: number }
  summary: {
    total_income: number; total_expenses: number; net_profit: number; margin_percent: number
    sales_by_type: { contado: number; rto: number }
    total_purchases: number; total_renovations: number; total_commissions: number
    manual_income: number; manual_expense: number
    accounts_receivable: number; accounts_receivable_overdue: number
    accounts_payable: number; accounts_payable_overdue: number
    total_bank_balance: number
  }
  cash_flow: { month: string; label: string; income: number; expense: number; net: number }[]
  bank_accounts: BankAccount[]
  yard_breakdown: YardBreakdown[]
  property_pnl: PropertyPnl[]
  recent_transactions: Transaction[]
  totals: { properties_count: number; sales_count: number; renovations_count: number; transactions_count: number }
}

interface Transaction {
  id: string; transaction_number: string; transaction_date: string; transaction_type: string
  amount: number; is_income: boolean; description: string; counterparty_name?: string
  counterparty_type?: string; payment_method?: string; payment_reference?: string
  status: string; property_id?: string; yard_id?: string; notes?: string
  accounting_accounts?: { code: string; name: string; category: string }
  bank_accounts?: { name: string; bank_name: string }
}

interface BankAccount {
  id: string; name: string; bank_name?: string; account_number_last4?: string
  account_type: string; current_balance: number; is_primary: boolean
  zelle_email?: string; zelle_phone?: string; routing_number?: string
}

interface YardBreakdown {
  yard_id: string; name: string; city: string; income: number; expense: number; houses: number; profit: number
}

interface PropertyPnl {
  property_id: string; address: string; city: string; status: string
  purchase_price: number; renovation_cost: number; total_cost: number
  sale_price: number; profit: number; margin: number
}

interface AccountInfo {
  id: string; code: string; name: string; account_type: string; category: string; is_system: boolean
}

interface Invoice {
  id: string; invoice_number: string; direction: string; issue_date: string
  due_date?: string; counterparty_name: string; total_amount: number
  amount_paid: number; balance_due: number; status: string; description?: string
}

// ── Helpers ──
const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
const fmtFull = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

const TYPE_LABELS: Record<string, string> = {
  sale_cash: 'Venta Contado', sale_rto_capital: 'Venta Capital (RTO)',
  deposit_received: 'Depósito Recibido', other_income: 'Otros Ingresos',
  purchase_house: 'Compra de Casa', renovation: 'Renovación',
  moving_transport: 'Transporte / Movida', commission: 'Comisión',
  operating_expense: 'Gasto Operativo', other_expense: 'Otros Gastos',
  bank_transfer: 'Transferencia Bancaria', adjustment: 'Ajuste',
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  sale_cash: DollarSign, sale_rto_capital: Building2, deposit_received: Banknote,
  other_income: CircleDollarSign, purchase_house: Home, renovation: Hammer,
  moving_transport: Truck, commission: Award, operating_expense: Settings,
  other_expense: Receipt, bank_transfer: ArrowRightLeft, adjustment: FileText,
}

const PAYMENT_LABELS: Record<string, string> = {
  bank_transfer: 'Transferencia', zelle: 'Zelle', cash: 'Efectivo', check: 'Cheque', stripe: 'Stripe', wire: 'Wire',
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700', confirmed: 'bg-emerald-100 text-emerald-700',
  reconciled: 'bg-blue-100 text-blue-700', voided: 'bg-red-100 text-red-700',
  draft: 'bg-gray-100 text-gray-600', sent: 'bg-blue-100 text-blue-700',
  partial: 'bg-amber-100 text-amber-700', paid: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-red-100 text-red-700',
}

const MONTH_NAMES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const PERIOD_LABELS: Record<string, string> = { month: 'Mensual', quarter: 'Trimestral', year: 'Anual', all: 'Todo' }

type TabId = 'overview' | 'transactions' | 'invoices' | 'statements' | 'chart' | 'properties' | 'banks' | 'budget' | 'reconciliation' | 'recurring' | 'audit' | 'estado_cuenta'

// ── Main Component ──
export default function AccountingPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [accounts, setAccounts] = useState<AccountInfo[]>([])
  const [period, setPeriod] = useState('month')
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedYard, setSelectedYard] = useState<string>('')
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [txnLoading, setTxnLoading] = useState(false)
  const [txnPage, setTxnPage] = useState(1)
  const [txnSearch, setTxnSearch] = useState('')
  const [txnTypeFilter, setTxnTypeFilter] = useState('')
  const [txnFlowFilter, setTxnFlowFilter] = useState<'' | 'income' | 'expense'>('')
  const [showNewTxnModal, setShowNewTxnModal] = useState(false)
  const [showNewBankModal, setShowNewBankModal] = useState(false)
  const [showNewRecurringModal, setShowNewRecurringModal] = useState(false)
  const [showNewInvoiceModal, setShowNewInvoiceModal] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const fetchDashboard = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ period, year: String(selectedYear), month: String(selectedMonth) })
      if (selectedYard) params.set('yard_id', selectedYard)
      const res = await fetch(`/api/accounting/dashboard?${params}`)
      if (res.ok) setDashboard(await res.json())
    } catch (e) { console.error('Dashboard fetch error', e) }
    finally { setLoading(false) }
  }, [period, selectedYear, selectedMonth, selectedYard])

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/accounting/accounts')
      if (res.ok) { const data = await res.json(); setAccounts(data.accounts || []) }
    } catch (e) { /* ignore */ }
  }, [])

  const fetchTransactions = useCallback(async () => {
    setTxnLoading(true)
    try {
      const params = new URLSearchParams({ page: String(txnPage), per_page: '30' })
      if (txnSearch) params.set('search', txnSearch)
      if (txnTypeFilter) params.set('transaction_type', txnTypeFilter)
      if (txnFlowFilter) params.set('is_income', txnFlowFilter === 'income' ? 'true' : 'false')
      if (selectedYard) params.set('yard_id', selectedYard)
      const res = await fetch(`/api/accounting/transactions?${params}`)
      if (res.ok) { const data = await res.json(); setTransactions(data.transactions || []) }
    } catch (e) { /* ignore */ }
    finally { setTxnLoading(false) }
  }, [txnPage, txnSearch, txnTypeFilter, txnFlowFilter, selectedYard])

  useEffect(() => { fetchDashboard(); fetchAccounts() }, [fetchDashboard, fetchAccounts])
  useEffect(() => { if (activeTab === 'transactions') fetchTransactions() }, [activeTab, fetchTransactions])

  const handleSync = async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/accounting/sync', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        alert(`✅ Sincronización completada: ${data.created} nuevas transacciones`)
        fetchDashboard()
        if (activeTab === 'transactions') fetchTransactions()
      }
    } catch (e) { alert('Error sincronizando datos') }
    finally { setSyncing(false) }
  }

  if (loading && !dashboard) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-navy-600" /></div>
  }

  const s = dashboard?.summary
  const cf = dashboard?.cash_flow || []
  const maxCf = Math.max(...cf.map(c => Math.max(c.income, c.expense, 1)))

  const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Resumen', icon: PieChart },
    { id: 'transactions', label: 'Transacciones', icon: Receipt },
    { id: 'invoices', label: 'Facturación', icon: FileText },
    { id: 'statements', label: 'Estados Financieros', icon: Scale },
    { id: 'estado_cuenta', label: 'Estado de Cuenta', icon: FileUp },
    { id: 'chart', label: 'Plan de Cuentas', icon: BookOpen },
    { id: 'properties', label: 'Por Propiedad', icon: Home },
    { id: 'banks', label: 'Cuentas Bancarias', icon: Landmark },
    { id: 'budget', label: 'Presupuesto', icon: BarChart3 },
    { id: 'reconciliation', label: 'Conciliación', icon: ClipboardCheck },
    { id: 'recurring', label: 'Gastos Fijos', icon: Repeat },
    { id: 'audit', label: 'Auditoría', icon: History },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-bold" style={{ color: 'var(--ink)' }}>Contabilidad</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>Gestión financiera completa · Maninos Homes</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={handleSync} disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors hover:bg-sand/50"
            style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sincronizando...' : 'Sincronizar'}
          </button>
          <button onClick={() => setShowNewTxnModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg"
            style={{ backgroundColor: 'var(--navy-800)' }}>
            <Plus className="w-4 h-4" /> Transacción
          </button>
          <button onClick={() => setShowNewInvoiceModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors hover:bg-sand/50"
            style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>
            <FileText className="w-4 h-4" /> Factura
          </button>
        </div>
      </div>

      {/* Period Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--stone)' }}>
          {(['month', 'quarter', 'year', 'all'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${period === p ? 'text-white' : 'hover:bg-sand/50'}`}
              style={period === p ? { backgroundColor: 'var(--navy-800)', color: 'white' } : { color: 'var(--charcoal)' }}>
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
        {period !== 'all' && (
          <>
            <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
              className="px-3 py-2 text-sm rounded-lg border" style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>
              {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            {period === 'month' && (
              <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))}
                className="px-3 py-2 text-sm rounded-lg border" style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>
                {MONTH_NAMES.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
            )}
          </>
        )}
        {(dashboard?.yard_breakdown || []).length > 0 && (
          <select value={selectedYard} onChange={e => setSelectedYard(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border" style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>
            <option value="">Todas las ubicaciones</option>
            {(dashboard?.yard_breakdown || []).map(y => <option key={y.yard_id} value={y.yard_id}>{y.name} ({y.city})</option>)}
          </select>
        )}
      </div>

      {/* Tab Navigation — scrollable */}
      <div className="overflow-x-auto -mx-2 px-2">
        <div className="flex gap-1 border-b min-w-max" style={{ borderColor: 'var(--sand)' }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.id ? 'border-navy-800 text-navy-800' : 'border-transparent hover:border-stone'}`}
              style={activeTab === tab.id ? { borderColor: 'var(--navy-800)', color: 'var(--navy-800)' } : { color: 'var(--slate)' }}>
              <tab.icon className="w-4 h-4" /> {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && s && <OverviewTab summary={s} cashFlow={cf} maxCf={maxCf} yardBreakdown={dashboard?.yard_breakdown || []} recentTransactions={dashboard?.recent_transactions || []} bankAccounts={dashboard?.bank_accounts || []} totals={dashboard?.totals || { properties_count: 0, sales_count: 0, renovations_count: 0, transactions_count: 0 }} />}
      {activeTab === 'transactions' && <TransactionsTab transactions={transactions} loading={txnLoading} search={txnSearch} setSearch={setTxnSearch} typeFilter={txnTypeFilter} setTypeFilter={setTxnTypeFilter} flowFilter={txnFlowFilter} setFlowFilter={setTxnFlowFilter} page={txnPage} setPage={setTxnPage} onRefresh={fetchTransactions} />}
      {activeTab === 'invoices' && <InvoicesTab />}
      {activeTab === 'statements' && <StatementsTab />}
      {activeTab === 'estado_cuenta' && <EstadoCuentaTab />}
      {activeTab === 'chart' && <ChartOfAccountsTab />}
      {activeTab === 'properties' && <PropertiesTab properties={dashboard?.property_pnl || []} />}
      {activeTab === 'banks' && <BanksTab banks={dashboard?.bank_accounts || []} onAdd={() => setShowNewBankModal(true)} />}
      {activeTab === 'budget' && <BudgetTab accounts={accounts} />}
      {activeTab === 'reconciliation' && <ReconciliationTab bankAccounts={dashboard?.bank_accounts || []} />}
      {activeTab === 'recurring' && <RecurringTab onAdd={() => setShowNewRecurringModal(true)} />}
      {activeTab === 'audit' && <AuditTab />}

      {/* Modals */}
      {showNewTxnModal && <NewTransactionModal accounts={accounts} bankAccounts={dashboard?.bank_accounts || []} yards={dashboard?.yard_breakdown || []} onClose={() => setShowNewTxnModal(false)} onCreated={() => { setShowNewTxnModal(false); fetchDashboard(); if (activeTab === 'transactions') fetchTransactions() }} />}
      {showNewBankModal && <NewBankAccountModal onClose={() => setShowNewBankModal(false)} onCreated={() => { setShowNewBankModal(false); fetchDashboard() }} />}
      {showNewRecurringModal && <NewRecurringExpenseModal accounts={accounts} onClose={() => setShowNewRecurringModal(false)} onCreated={() => setShowNewRecurringModal(false)} />}
      {showNewInvoiceModal && <NewInvoiceModal onClose={() => setShowNewInvoiceModal(false)} onCreated={() => { setShowNewInvoiceModal(false); fetchDashboard() }} />}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
//  OVERVIEW TAB
// ════════════════════════════════════════════════════════════════════════
function OverviewTab({ summary: s, cashFlow: cf, maxCf, yardBreakdown, recentTransactions, bankAccounts, totals }: {
  summary: DashboardData['summary']; cashFlow: DashboardData['cash_flow']; maxCf: number
  yardBreakdown: YardBreakdown[]; recentTransactions: Transaction[]; bankAccounts: BankAccount[]
  totals: DashboardData['totals']
}) {
  return (
    <div className="space-y-6">
      {/* KPI Cards — 6 cards now */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KPICard label="Ingresos" value={fmt(s.total_income)} sublabel={`${totals.sales_count} ventas`} icon={TrendingUp} color="#059669" bgColor="#ecfdf5" />
        <KPICard label="Gastos" value={fmt(s.total_expenses)} sublabel={`${totals.properties_count} compras`} icon={TrendingDown} color="#dc2626" bgColor="#fef2f2" />
        <KPICard label="Ganancia Neta" value={fmt(s.net_profit)} sublabel={`Margen: ${s.margin_percent}%`} icon={BarChart3} color={s.net_profit >= 0 ? '#059669' : '#dc2626'} bgColor={s.net_profit >= 0 ? '#ecfdf5' : '#fef2f2'} />
        <KPICard label="Saldo Bancario" value={fmt(s.total_bank_balance)} sublabel={`${bankAccounts.length} cuentas`} icon={Landmark} color="#2563eb" bgColor="#eff6ff" />
        <KPICard label="Por Cobrar" value={fmt(s.accounts_receivable)} sublabel={s.accounts_receivable_overdue > 0 ? `${fmt(s.accounts_receivable_overdue)} vencido` : 'Al día'} icon={ArrowUpRight} color="#8b5cf6" bgColor="#f5f3ff" />
        <KPICard label="Por Pagar" value={fmt(s.accounts_payable)} sublabel={s.accounts_payable_overdue > 0 ? `${fmt(s.accounts_payable_overdue)} vencido` : 'Al día'} icon={ArrowDownRight} color="#ea580c" bgColor="#fff7ed" />
      </div>

      {/* Income / Expense Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card-luxury p-6">
          <h3 className="font-semibold text-base mb-4 flex items-center gap-2" style={{ color: 'var(--ink)' }}>
            <ArrowUpRight className="w-5 h-5 text-emerald-500" /> Desglose de Ingresos
          </h3>
          <div className="space-y-3">
            <BreakdownRow label="Ventas Contado" amount={s.sales_by_type.contado || 0} total={s.total_income} color="#059669" />
            <BreakdownRow label="Ventas Capital (RTO)" amount={s.sales_by_type.rto || 0} total={s.total_income} color="#0891b2" />
            {s.manual_income > 0 && <BreakdownRow label="Otros Ingresos" amount={s.manual_income} total={s.total_income} color="#8b5cf6" />}
          </div>
          <div className="mt-4 pt-4 border-t flex justify-between" style={{ borderColor: 'var(--sand)' }}>
            <span className="text-sm font-medium" style={{ color: 'var(--slate)' }}>Total</span>
            <span className="text-lg font-bold text-emerald-600">{fmt(s.total_income)}</span>
          </div>
        </div>
        <div className="card-luxury p-6">
          <h3 className="font-semibold text-base mb-4 flex items-center gap-2" style={{ color: 'var(--ink)' }}>
            <ArrowDownRight className="w-5 h-5 text-red-500" /> Desglose de Gastos
          </h3>
          <div className="space-y-3">
            <BreakdownRow label="Compra de Casas" amount={s.total_purchases} total={s.total_expenses} color="#dc2626" />
            <BreakdownRow label="Renovaciones" amount={s.total_renovations} total={s.total_expenses} color="#ea580c" />
            <BreakdownRow label="Comisiones" amount={s.total_commissions} total={s.total_expenses} color="#d97706" />
            {s.manual_expense > 0 && <BreakdownRow label="Otros Gastos" amount={s.manual_expense} total={s.total_expenses} color="#64748b" />}
          </div>
          <div className="mt-4 pt-4 border-t flex justify-between" style={{ borderColor: 'var(--sand)' }}>
            <span className="text-sm font-medium" style={{ color: 'var(--slate)' }}>Total</span>
            <span className="text-lg font-bold text-red-600">{fmt(s.total_expenses)}</span>
          </div>
        </div>
      </div>

      {/* Cash Flow Chart */}
      <div className="card-luxury p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-base flex items-center gap-2" style={{ color: 'var(--ink)' }}>
            <BarChart3 className="w-5 h-5" style={{ color: 'var(--navy-600)' }} /> Flujo de Caja (12 meses)
          </h3>
          <a href="/api/accounting/export/transactions" download className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg border hover:bg-sand/50 transition-colors" style={{ borderColor: 'var(--stone)', color: 'var(--slate)' }}>
            <Download className="w-3 h-3" /> CSV
          </a>
        </div>
        <div className="overflow-x-auto">
          <div className="flex items-end gap-2 min-w-[600px]" style={{ height: 200 }}>
            {cf.map((m, i) => {
              const ih = maxCf > 0 ? (m.income / maxCf) * 160 : 0
              const eh = maxCf > 0 ? (m.expense / maxCf) * 160 : 0
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="flex items-end gap-[2px]" style={{ height: 170 }}>
                    <div className="w-4 rounded-t transition-all" style={{ height: ih, backgroundColor: '#059669', minHeight: m.income > 0 ? 4 : 0 }} title={`Ingreso: ${fmt(m.income)}`} />
                    <div className="w-4 rounded-t transition-all" style={{ height: eh, backgroundColor: '#ef4444', minHeight: m.expense > 0 ? 4 : 0 }} title={`Gasto: ${fmt(m.expense)}`} />
                  </div>
                  <span className="text-[10px] font-medium" style={{ color: 'var(--ash)' }}>{m.label}</span>
                </div>
              )
            })}
          </div>
        </div>
        <div className="flex items-center gap-6 mt-3">
          <div className="flex items-center gap-2 text-xs"><div className="w-3 h-3 rounded" style={{ backgroundColor: '#059669' }} /> Ingresos</div>
          <div className="flex items-center gap-2 text-xs"><div className="w-3 h-3 rounded" style={{ backgroundColor: '#ef4444' }} /> Gastos</div>
        </div>
      </div>

      {/* Yard Breakdown + Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card-luxury p-6">
          <h3 className="font-semibold text-base mb-4 flex items-center gap-2" style={{ color: 'var(--ink)' }}>
            <MapPin className="w-5 h-5" style={{ color: 'var(--gold-600)' }} /> Por Ubicación
          </h3>
          {yardBreakdown.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--ash)' }}>No hay datos de ubicaciones</p>
          ) : (
            <div className="space-y-4">
              {yardBreakdown.map(y => (
                <div key={y.yard_id} className="p-4 rounded-lg border" style={{ borderColor: 'var(--sand)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{y.name}</p>
                      <p className="text-xs" style={{ color: 'var(--ash)' }}>{y.city} · {y.houses} casas</p>
                    </div>
                    <span className={`text-sm font-bold ${y.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(y.profit)}</span>
                  </div>
                  <div className="flex gap-4 text-xs" style={{ color: 'var(--slate)' }}>
                    <span>↑ {fmt(y.income)}</span><span>↓ {fmt(y.expense)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card-luxury p-6">
          <h3 className="font-semibold text-base mb-4 flex items-center gap-2" style={{ color: 'var(--ink)' }}>
            <Clock className="w-5 h-5" style={{ color: 'var(--navy-600)' }} /> Transacciones Recientes
          </h3>
          {recentTransactions.length === 0 ? (
            <div className="text-center py-8">
              <Receipt className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--ash)' }} />
              <p className="text-sm" style={{ color: 'var(--ash)' }}>Sincroniza datos para importar ventas y compras.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {recentTransactions.slice(0, 10).map(t => {
                const Icon = TYPE_ICONS[t.transaction_type] || Receipt
                return (
                  <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-sand/30 transition-colors">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${t.is_income ? 'bg-emerald-100' : 'bg-red-100'}`}>
                      <Icon className={`w-4 h-4 ${t.is_income ? 'text-emerald-600' : 'text-red-600'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--charcoal)' }}>{t.description}</p>
                      <p className="text-xs" style={{ color: 'var(--ash)' }}>{t.transaction_date} · {t.counterparty_name || '—'}</p>
                    </div>
                    <span className={`text-sm font-bold whitespace-nowrap ${t.is_income ? 'text-emerald-600' : 'text-red-600'}`}>
                      {t.is_income ? '+' : '-'}{fmt(t.amount)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
//  TRANSACTIONS TAB (kept from V1)
// ════════════════════════════════════════════════════════════════════════
function TransactionsTab({ transactions, loading, search, setSearch, typeFilter, setTypeFilter, flowFilter, setFlowFilter, page, setPage, onRefresh }: {
  transactions: Transaction[]; loading: boolean; search: string; setSearch: (s: string) => void
  typeFilter: string; setTypeFilter: (s: string) => void; flowFilter: '' | 'income' | 'expense'
  setFlowFilter: (s: '' | 'income' | 'expense') => void; page: number; setPage: (n: number) => void; onRefresh: () => void
}) {
  const handleVoid = async (id: string) => {
    if (!confirm('¿Anular esta transacción?')) return
    await fetch(`/api/accounting/transactions/${id}`, { method: 'DELETE' })
    onRefresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--ash)' }} />
          <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Buscar transacciones..." className="w-full pl-10 pr-4 py-2 text-sm rounded-lg border" style={{ borderColor: 'var(--stone)' }} />
        </div>
        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1) }}
          className="px-3 py-2 text-sm rounded-lg border" style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>
          <option value="">Todos los tipos</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--stone)' }}>
          {([['', 'Todos'], ['income', '↑ Ingresos'], ['expense', '↓ Gastos']] as const).map(([val, label]) => (
            <button key={val} onClick={() => { setFlowFilter(val as any); setPage(1) }}
              className={`px-3 py-2 text-xs font-medium transition-colors ${flowFilter === val ? 'text-white' : ''}`}
              style={flowFilter === val ? { backgroundColor: 'var(--navy-800)', color: 'white' } : { color: 'var(--charcoal)' }}>
              {label}
            </button>
          ))}
        </div>
        <a href="/api/accounting/export/transactions" download className="flex items-center gap-1 px-3 py-2 text-xs font-medium rounded-lg border hover:bg-sand/50"
          style={{ borderColor: 'var(--stone)', color: 'var(--slate)' }}>
          <Download className="w-3 h-3" /> CSV
        </a>
      </div>

      <div className="card-luxury overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-navy-600" /></div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-12"><Receipt className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--ash)' }} /><p className="text-sm" style={{ color: 'var(--ash)' }}>No hay transacciones</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b" style={{ borderColor: 'var(--sand)', backgroundColor: 'var(--ivory)' }}>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--slate)' }}>Fecha</th>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--slate)' }}>Tipo</th>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--slate)' }}>Descripción</th>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--slate)' }}>Contraparte</th>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--slate)' }}>Pago</th>
                <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--slate)' }}>Monto</th>
                <th className="px-4 py-3 text-center font-medium" style={{ color: 'var(--slate)' }}>Estado</th>
                <th className="px-4 py-3" />
              </tr></thead>
              <tbody>
                {transactions.map(t => {
                  const Icon = TYPE_ICONS[t.transaction_type] || Receipt
                  return (
                    <tr key={t.id} className="border-b hover:bg-sand/20 transition-colors" style={{ borderColor: 'var(--sand)' }}>
                      <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>{t.transaction_date}</td>
                      <td className="px-4 py-3"><div className="flex items-center gap-2"><Icon className={`w-4 h-4 ${t.is_income ? 'text-emerald-500' : 'text-red-500'}`} /><span className="text-xs font-medium" style={{ color: 'var(--charcoal)' }}>{TYPE_LABELS[t.transaction_type] || t.transaction_type}</span></div></td>
                      <td className="px-4 py-3 max-w-[250px]"><p className="truncate text-sm" style={{ color: 'var(--charcoal)' }}>{t.description}</p><p className="text-xs" style={{ color: 'var(--ash)' }}>{t.transaction_number}</p></td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--slate)' }}>{t.counterparty_name || '—'}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--ash)' }}>{PAYMENT_LABELS[t.payment_method || ''] || t.payment_method || '—'}</td>
                      <td className={`px-4 py-3 text-right font-bold whitespace-nowrap ${t.is_income ? 'text-emerald-600' : 'text-red-600'}`}>{t.is_income ? '+' : '-'}{fmtFull(t.amount)}</td>
                      <td className="px-4 py-3 text-center"><span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[t.status] || 'bg-gray-100 text-gray-600'}`}>{t.status}</span></td>
                      <td className="px-4 py-3 text-center">{t.status !== 'voided' && <button onClick={() => handleVoid(t.id)} className="text-red-400 hover:text-red-600" title="Anular"><X className="w-4 h-4" /></button>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between">
        <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="flex items-center gap-1 px-3 py-2 text-sm rounded-lg border disabled:opacity-40" style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}><ChevronLeft className="w-4 h-4" /> Anterior</button>
        <span className="text-sm" style={{ color: 'var(--slate)' }}>Página {page}</span>
        <button onClick={() => setPage(page + 1)} disabled={transactions.length < 30} className="flex items-center gap-1 px-3 py-2 text-sm rounded-lg border disabled:opacity-40" style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>Siguiente <ChevronRight className="w-4 h-4" /></button>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
//  INVOICES TAB (AR / AP) — NEW
// ════════════════════════════════════════════════════════════════════════
function InvoicesTab() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [direction, setDirection] = useState<'' | 'receivable' | 'payable'>('')
  const [aging, setAging] = useState<any>(null)

  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (direction) params.set('direction', direction)
        const res = await fetch(`/api/accounting/invoices?${params}`)
        if (res.ok) { const d = await res.json(); setInvoices(d.invoices || []) }
        // Fetch aging
        const arRes = await fetch('/api/accounting/invoices/aging?direction=receivable')
        if (arRes.ok) setAging(await arRes.json())
      } catch (e) { /* ignore */ }
      finally { setLoading(false) }
    })()
  }, [direction])

  const dirLabel: Record<string, string> = { receivable: 'Por Cobrar', payable: 'Por Pagar' }
  const statusLabel: Record<string, string> = { draft: 'Borrador', sent: 'Enviada', partial: 'Parcial', paid: 'Pagada', overdue: 'Vencida', voided: 'Anulada' }

  return (
    <div className="space-y-6">
      {/* Aging Report */}
      {aging && aging.total > 0 && (
        <div className="card-luxury p-6">
          <h3 className="font-semibold text-base mb-4 flex items-center gap-2" style={{ color: 'var(--ink)' }}>
            <AlertCircle className="w-5 h-5 text-amber-500" /> Antigüedad de Cuentas por Cobrar
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[['current', 'Al día'], ['1_30', '1-30 días'], ['31_60', '31-60 días'], ['61_90', '61-90 días'], ['over_90', '+90 días']].map(([key, label]) => (
              <div key={key} className="text-center p-3 rounded-lg" style={{ backgroundColor: key === 'over_90' && (aging.buckets[key] || 0) > 0 ? '#fef2f2' : key === 'current' ? '#ecfdf5' : 'var(--ivory)' }}>
                <p className="text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>{label}</p>
                <p className={`text-lg font-bold ${key === 'over_90' && (aging.buckets[key] || 0) > 0 ? 'text-red-600' : key === 'current' ? 'text-emerald-600' : ''}`} style={key !== 'over_90' && key !== 'current' ? { color: 'var(--charcoal)' } : {}}>
                  {fmt(aging.buckets[key] || 0)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter + List */}
      <div className="flex items-center justify-between">
        <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--stone)' }}>
          {([['', 'Todas'], ['receivable', '↑ Por Cobrar'], ['payable', '↓ Por Pagar']] as const).map(([val, label]) => (
            <button key={val} onClick={() => setDirection(val as any)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${direction === val ? 'text-white' : ''}`}
              style={direction === val ? { backgroundColor: 'var(--navy-800)', color: 'white' } : { color: 'var(--charcoal)' }}>
              {label}
            </button>
          ))}
        </div>
        <a href={`/api/accounting/export/invoices${direction ? `?direction=${direction}` : ''}`} download
          className="flex items-center gap-1 px-3 py-2 text-xs font-medium rounded-lg border hover:bg-sand/50"
          style={{ borderColor: 'var(--stone)', color: 'var(--slate)' }}>
          <Download className="w-3 h-3" /> CSV
        </a>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-navy-600" /></div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-12 card-luxury">
          <FileText className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--ash)' }} />
          <p className="text-sm" style={{ color: 'var(--ash)' }}>No hay facturas. Crea una nueva factura para empezar.</p>
        </div>
      ) : (
        <div className="card-luxury overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b" style={{ borderColor: 'var(--sand)', backgroundColor: 'var(--ivory)' }}>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--slate)' }}>Número</th>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--slate)' }}>Tipo</th>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--slate)' }}>Contraparte</th>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--slate)' }}>Emisión</th>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--slate)' }}>Vencimiento</th>
                <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--slate)' }}>Total</th>
                <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--slate)' }}>Pagado</th>
                <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--slate)' }}>Pendiente</th>
                <th className="px-4 py-3 text-center font-medium" style={{ color: 'var(--slate)' }}>Estado</th>
              </tr></thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id} className="border-b hover:bg-sand/20 transition-colors" style={{ borderColor: 'var(--sand)' }}>
                    <td className="px-4 py-3 font-medium text-sm" style={{ color: 'var(--charcoal)' }}>{inv.invoice_number}</td>
                    <td className="px-4 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${inv.direction === 'receivable' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{dirLabel[inv.direction]}</span></td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--charcoal)' }}>{inv.counterparty_name}</td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--slate)' }}>{inv.issue_date}</td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--slate)' }}>{inv.due_date || '—'}</td>
                    <td className="px-4 py-3 text-right font-medium" style={{ color: 'var(--charcoal)' }}>{fmtFull(inv.total_amount)}</td>
                    <td className="px-4 py-3 text-right text-emerald-600 font-medium">{fmtFull(inv.amount_paid)}</td>
                    <td className="px-4 py-3 text-right font-bold" style={{ color: inv.balance_due > 0 ? '#dc2626' : 'var(--charcoal)' }}>{fmtFull(inv.balance_due)}</td>
                    <td className="px-4 py-3 text-center"><span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[inv.status] || 'bg-gray-100 text-gray-600'}`}>{statusLabel[inv.status] || inv.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
//  FINANCIAL STATEMENTS TAB — QuickBooks-style Hierarchical Reports
// ════════════════════════════════════════════════════════════════════════

interface QBTreeNode {
  id: string; code: string; name: string; account_type: string
  is_header: boolean; balance: number; total: number; children: QBTreeNode[]
}

// Recursive tree row component for QuickBooks-style indentation
function QBTreeRow({ node, depth = 0, expanded, toggleExpand }: {
  node: QBTreeNode; depth?: number; expanded: Record<string, boolean>
  toggleExpand: (id: string) => void
}) {
  const hasChildren = node.children && node.children.length > 0
  const isExpanded = expanded[node.id] !== false // default expanded
  const indent = depth * 24
  const isTopLevel = depth === 0
  const isTotal = node.is_header && hasChildren

  return (
    <>
      <tr
        className={`border-b transition-colors hover:bg-stone-50 ${isTopLevel ? 'bg-stone-100' : ''} ${isTotal && depth === 1 ? 'bg-stone-50' : ''}`}
        style={{ borderColor: '#eee' }}
      >
        <td className="py-1.5 pr-4" style={{ paddingLeft: `${12 + indent}px` }}>
          <div className="flex items-center gap-1">
            {hasChildren ? (
              <button onClick={() => toggleExpand(node.id)} className="p-0.5 rounded hover:bg-stone-200 transition-colors">
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-stone-500" /> : <ChevronRight className="w-3.5 h-3.5 text-stone-500" />}
              </button>
            ) : (
              <span className="w-4.5" />
            )}
            <span className={`text-sm ${node.is_header ? 'font-semibold' : ''} ${isTopLevel ? 'font-bold text-navy-900' : ''}`}
              style={{ color: isTopLevel ? 'var(--navy-800)' : node.is_header ? 'var(--charcoal)' : 'var(--slate)' }}>
              {node.name}
            </span>
          </div>
        </td>
        <td className="py-1.5 text-right pr-4">
          {(!hasChildren || (hasChildren && !isExpanded)) && (
            <span className={`text-sm tabular-nums ${isTopLevel ? 'font-bold' : node.is_header ? 'font-semibold' : ''}`}
              style={{ color: 'var(--charcoal)' }}>
              {node.total !== 0 ? fmtFull(node.total) : node.balance !== 0 ? fmtFull(node.balance) : <span style={{ color: 'var(--ash)' }}>0.00</span>}
            </span>
          )}
        </td>
      </tr>
      {hasChildren && isExpanded && (
        <>
          {node.children.map(child => (
            <QBTreeRow key={child.id} node={child} depth={depth + 1} expanded={expanded} toggleExpand={toggleExpand} />
          ))}
          {/* Total line for this section */}
          <tr className="border-b" style={{ borderColor: '#ccc' }}>
            <td className="py-1.5 pr-4" style={{ paddingLeft: `${12 + (depth + 1) * 24}px` }}>
              <span className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>
                Total for {node.name}
              </span>
            </td>
            <td className="py-1.5 text-right pr-4">
              <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--charcoal)' }}>
                {fmtFull(node.total)}
              </span>
            </td>
          </tr>
        </>
      )}
    </>
  )
}

function QBComputedLine({ label, amount, bold, thick, highlight }: {
  label: string; amount: number; bold?: boolean; thick?: boolean; highlight?: boolean
}) {
  return (
    <tr className={`${thick ? 'border-t-2 border-b-2' : 'border-b'} ${highlight ? 'bg-emerald-50' : ''}`}
      style={{ borderColor: thick ? 'var(--charcoal)' : '#ddd' }}>
      <td className="py-2 pl-3 pr-4">
        <span className={`text-sm ${bold ? 'font-bold' : 'font-semibold'}`}
          style={{ color: highlight ? 'var(--navy-800)' : 'var(--charcoal)' }}>
          {label}
        </span>
      </td>
      <td className="py-2 text-right pr-4">
        <span className={`text-sm tabular-nums ${bold ? 'font-bold' : 'font-semibold'}`}
          style={{ color: amount >= 0 ? (highlight ? 'var(--navy-800)' : 'var(--charcoal)') : '#dc2626' }}>
          {fmtFull(amount)}
        </span>
      </td>
    </tr>
  )
}

function StatementsTab() {
  const [activeReport, setActiveReport] = useState<'income' | 'balance' | 'cashflow'>('income')
  const [report, setReport] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  useEffect(() => {
    (async () => {
      setLoading(true)
      setReport(null)
      try {
        const endpoints: Record<string, string> = {
          income: '/api/accounting/reports/income-statement',
          balance: '/api/accounting/reports/balance-sheet',
          cashflow: '/api/accounting/reports/cash-flow',
        }
        const res = await fetch(endpoints[activeReport])
        if (res.ok) setReport(await res.json())
      } catch (e) { /* ignore */ }
      finally { setLoading(false) }
    })()
  }, [activeReport])

  const toggleExpand = (id: string) => {
    setExpanded(prev => ({ ...prev, [id]: prev[id] === false ? true : false }))
  }

  const collapseAll = () => {
    if (!report?.sections) return
    const allIds: Record<string, boolean> = {}
    const collectIds = (nodes: QBTreeNode[]) => {
      for (const n of nodes) {
        if (n.children?.length) { allIds[n.id] = false; collectIds(n.children) }
      }
    }
    const sec = report.sections
    if (sec.income) collectIds(sec.income)
    if (sec.cost_of_goods_sold) collectIds(sec.cost_of_goods_sold)
    if (sec.expenses) collectIds(sec.expenses)
    if (sec.other_expenses) collectIds(sec.other_expenses)
    if (sec.assets) collectIds(sec.assets)
    if (sec.liabilities) collectIds(sec.liabilities)
    if (sec.equity) collectIds(sec.equity)
    setExpanded(allIds)
  }

  const expandAll = () => setExpanded({})

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex rounded-lg border overflow-hidden w-fit" style={{ borderColor: 'var(--stone)' }}>
          {([['income', 'Profit & Loss'], ['balance', 'Balance Sheet'], ['cashflow', 'Cash Flow']] as const).map(([key, label]) => (
            <button key={key} onClick={() => { setActiveReport(key as any); setExpanded({}) }}
              className={`px-4 py-2 text-sm font-medium transition-colors ${activeReport === key ? 'text-white' : ''}`}
              style={activeReport === key ? { backgroundColor: 'var(--navy-800)', color: 'white' } : { color: 'var(--charcoal)' }}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={expandAll} className="px-3 py-1.5 text-xs rounded border hover:bg-stone-50 transition-colors" style={{ borderColor: 'var(--stone)', color: 'var(--slate)' }}>
            Expandir todo
          </button>
          <button onClick={collapseAll} className="px-3 py-1.5 text-xs rounded border hover:bg-stone-50 transition-colors" style={{ borderColor: 'var(--stone)', color: 'var(--slate)' }}>
            Colapsar todo
          </button>
          {activeReport !== 'cashflow' && (
            <a
              href={activeReport === 'income'
                ? '/api/accounting/reports/income-statement/export-csv'
                : '/api/accounting/reports/balance-sheet/export-csv'}
              download
              className="flex items-center gap-1 px-3 py-1.5 text-xs rounded border hover:bg-stone-50 transition-colors"
              style={{ borderColor: 'var(--stone)', color: 'var(--slate)' }}
            >
              <Download className="w-3 h-3" /> Exportar CSV
            </a>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-navy-600" /></div>
      ) : !report ? (
        <div className="text-center py-12 card-luxury"><p className="text-sm" style={{ color: 'var(--ash)' }}>No hay datos disponibles</p></div>
      ) : activeReport === 'income' ? (
        <QBIncomeStatement data={report} expanded={expanded} toggleExpand={toggleExpand} />
      ) : activeReport === 'balance' ? (
        <QBBalanceSheet data={report} expanded={expanded} toggleExpand={toggleExpand} />
      ) : (
        <CashFlowStatement data={report} />
      )}
    </div>
  )
}

function QBIncomeStatement({ data, expanded, toggleExpand }: { data: any; expanded: Record<string, boolean>; toggleExpand: (id: string) => void }) {
  const sec = data.sections || {}
  const today = new Date()
  return (
    <div className="card-luxury overflow-hidden">
      {/* Header */}
      <div className="text-center py-4 border-b" style={{ borderColor: 'var(--sand)' }}>
        <h2 className="font-serif text-xl font-bold" style={{ color: 'var(--ink)' }}>Profit and Loss</h2>
        <p className="text-sm" style={{ color: 'var(--slate)' }}>MANINOS HOMES</p>
        <p className="text-xs" style={{ color: 'var(--ash)' }}>
          {data.period ? `${data.period.start} through ${data.period.end}` : `As of ${today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`}
        </p>
      </div>

      <table className="w-full">
        <thead>
          <tr className="border-b-2" style={{ borderColor: 'var(--stone)' }}>
            <th className="text-left text-xs font-semibold py-2 pl-3 pr-4 uppercase tracking-wider" style={{ color: 'var(--slate)' }}>Account</th>
            <th className="text-right text-xs font-semibold py-2 pr-4 uppercase tracking-wider" style={{ color: 'var(--slate)' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {/* Income */}
          {(sec.income || []).map((node: QBTreeNode) => (
            <QBTreeRow key={node.id} node={node} depth={0} expanded={expanded} toggleExpand={toggleExpand} />
          ))}
          <QBComputedLine label="Total for Income" amount={sec.income?.reduce((s: number, n: QBTreeNode) => s + n.total, 0) || 0} bold />

          {/* COGS */}
          {(sec.cost_of_goods_sold || []).map((node: QBTreeNode) => (
            <QBTreeRow key={node.id} node={node} depth={0} expanded={expanded} toggleExpand={toggleExpand} />
          ))}
          <QBComputedLine label="Total for Cost of Goods Sold" amount={sec.cost_of_goods_sold?.reduce((s: number, n: QBTreeNode) => s + n.total, 0) || 0} bold />
          <QBComputedLine label="Gross Profit" amount={sec.gross_profit || 0} bold thick highlight />

          {/* Expenses */}
          {(sec.expenses || []).map((node: QBTreeNode) => (
            <QBTreeRow key={node.id} node={node} depth={0} expanded={expanded} toggleExpand={toggleExpand} />
          ))}
          <QBComputedLine label="Total for Expenses" amount={sec.total_expenses || 0} bold />
          <QBComputedLine label="Net Operating Income" amount={sec.net_operating_income || 0} bold thick />

          {/* Other Expenses */}
          {(sec.other_expenses || []).length > 0 && (
            <>
              {(sec.other_expenses || []).map((node: QBTreeNode) => (
                <QBTreeRow key={node.id} node={node} depth={0} expanded={expanded} toggleExpand={toggleExpand} />
              ))}
              <QBComputedLine label="Total for Other Expenses" amount={sec.total_other_expenses || 0} bold />
              <QBComputedLine label="Net Other Income" amount={sec.net_other_income || 0} bold />
            </>
          )}

          <QBComputedLine label="Net Income" amount={sec.net_income || 0} bold thick highlight />
        </tbody>
      </table>

      <div className="flex items-center justify-between px-4 py-2 border-t text-xs" style={{ borderColor: 'var(--sand)', color: 'var(--ash)' }}>
        <span>Accrual basis</span>
        <span>{today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} {today.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    </div>
  )
}

function QBBalanceSheet({ data, expanded, toggleExpand }: { data: any; expanded: Record<string, boolean>; toggleExpand: (id: string) => void }) {
  const sec = data.sections || {}
  const today = new Date()
  return (
    <div className="card-luxury overflow-hidden">
      {/* Header */}
      <div className="text-center py-4 border-b" style={{ borderColor: 'var(--sand)' }}>
        <h2 className="font-serif text-xl font-bold" style={{ color: 'var(--ink)' }}>Balance Sheet</h2>
        <p className="text-sm" style={{ color: 'var(--slate)' }}>MANINOS HOMES</p>
        <p className="text-xs" style={{ color: 'var(--ash)' }}>
          As of {data.as_of_date ? new Date(data.as_of_date + 'T12:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <table className="w-full">
        <thead>
          <tr className="border-b-2" style={{ borderColor: 'var(--stone)' }}>
            <th className="text-left text-xs font-semibold py-2 pl-3 pr-4 uppercase tracking-wider" style={{ color: 'var(--slate)' }}>Account</th>
            <th className="text-right text-xs font-semibold py-2 pr-4 uppercase tracking-wider" style={{ color: 'var(--slate)' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {/* Assets */}
          {(sec.assets || []).map((node: QBTreeNode) => (
            <QBTreeRow key={node.id} node={node} depth={0} expanded={expanded} toggleExpand={toggleExpand} />
          ))}
          <QBComputedLine label="Total for Assets" amount={sec.total_assets || 0} bold thick />

          {/* Liabilities and Equity header */}
          <tr className="bg-stone-100 border-b" style={{ borderColor: '#ddd' }}>
            <td colSpan={2} className="py-2 pl-3">
              <span className="text-sm font-bold" style={{ color: 'var(--navy-800)' }}>Liabilities and Equity</span>
            </td>
          </tr>

          {/* Liabilities */}
          {(sec.liabilities || []).map((node: QBTreeNode) => (
            <QBTreeRow key={node.id} node={node} depth={1} expanded={expanded} toggleExpand={toggleExpand} />
          ))}
          <QBComputedLine label="Total for Liabilities" amount={sec.total_liabilities || 0} bold />

          {/* Equity */}
          {(sec.equity || []).map((node: QBTreeNode) => (
            <QBTreeRow key={node.id} node={node} depth={1} expanded={expanded} toggleExpand={toggleExpand} />
          ))}
          {sec.net_income !== undefined && sec.net_income !== 0 && (
            <tr className="border-b" style={{ borderColor: '#ddd' }}>
              <td className="py-1.5 pr-4" style={{ paddingLeft: `${12 + 48}px` }}>
                <span className="text-sm" style={{ color: 'var(--slate)' }}>Net Income</span>
              </td>
              <td className="py-1.5 text-right pr-4">
                <span className="text-sm tabular-nums" style={{ color: 'var(--charcoal)' }}>{fmtFull(sec.net_income)}</span>
              </td>
            </tr>
          )}
          <QBComputedLine label="Total for Equity" amount={(sec.total_equity || 0) + (sec.net_income || 0)} bold />

          <QBComputedLine label="Total for Liabilities and Equity" amount={sec.total_liabilities_and_equity || 0} bold thick highlight />
        </tbody>
      </table>

      <div className="flex items-center justify-between px-4 py-2 border-t text-xs" style={{ borderColor: 'var(--sand)', color: 'var(--ash)' }}>
        <span>Accrual basis</span>
        <span>{today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} {today.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    </div>
  )
}

function CashFlowStatement({ data }: { data: any }) {
  return (
    <div className="card-luxury p-6 max-w-2xl">
      <h2 className="font-serif text-xl font-bold mb-1" style={{ color: 'var(--ink)' }}>Estado de Flujo de Efectivo</h2>
      <p className="text-xs mb-6" style={{ color: 'var(--ash)' }}>Período: {data.period?.start} — {data.period?.end}</p>
      
      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--navy-800)' }}>ACTIVIDADES DE OPERACIÓN</h3>
          <div className="pl-4 space-y-2">
            <div className="flex justify-between text-sm"><span style={{ color: 'var(--charcoal)' }}>Cobros de ventas</span><span className="text-emerald-600 font-medium">+{fmtFull(data.operating_activities?.inflows || 0)}</span></div>
            <div className="flex justify-between text-sm"><span style={{ color: 'var(--charcoal)' }}>Pagos operativos</span><span className="text-red-600 font-medium">-{fmtFull(data.operating_activities?.outflows || 0)}</span></div>
          </div>
          <SummaryLine label="Neto Operación" amount={data.operating_activities?.net || 0} bold />
        </div>

        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--navy-800)' }}>ACTIVIDADES DE INVERSIÓN</h3>
          <div className="pl-4 space-y-2">
            <div className="flex justify-between text-sm"><span style={{ color: 'var(--charcoal)' }}>Compra de propiedades</span><span className="text-red-600 font-medium">-{fmtFull(data.investing_activities?.property_purchases || 0)}</span></div>
          </div>
          <SummaryLine label="Neto Inversión" amount={data.investing_activities?.net || 0} bold />
        </div>

        <div className="border-t-2 pt-3" style={{ borderColor: 'var(--navy-800)' }}>
          <SummaryLine label="CAMBIO NETO EN EFECTIVO" amount={data.net_change_in_cash || 0} bold highlight />
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
//  CHART OF ACCOUNTS TAB — Editable
// ════════════════════════════════════════════════════════════════════════

function ChartOfAccountsTab() {
  const [tree, setTree] = useState<QBTreeNode[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [showAdd, setShowAdd] = useState(false)
  const [editAccount, setEditAccount] = useState<any>(null)
  const [allAccounts, setAllAccounts] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ code: '', name: '', account_type: 'expense', category: 'general', parent_account_id: '', is_header: false })

  const fetchTree = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/accounting/accounts/tree')
      if (res.ok) {
        const data = await res.json()
        setTree(data.tree || [])
        setAllAccounts(data.flat || [])
      }
    } catch (e) { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchTree() }, [fetchTree])

  const toggleExpand = (id: string) => {
    setExpanded(prev => ({ ...prev, [id]: prev[id] === false ? true : false }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (editAccount) {
        // Update
        const res = await fetch(`/api/accounting/accounts/${editAccount.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: form.code, name: form.name, category: form.category,
            parent_account_id: form.parent_account_id || null,
            is_header: form.is_header,
          }),
        })
        if (res.ok) { setEditAccount(null); fetchTree() }
        else { const d = await res.json(); alert(d.detail || 'Error') }
      } else {
        // Create
        const res = await fetch('/api/accounting/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...form,
            parent_account_id: form.parent_account_id || null,
          }),
        })
        if (res.ok) { setShowAdd(false); setForm({ code: '', name: '', account_type: 'expense', category: 'general', parent_account_id: '', is_header: false }); fetchTree() }
        else { const d = await res.json(); alert(d.detail || 'Error') }
      }
    } catch (e) { alert('Error guardando cuenta') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Desactivar la cuenta "${name}"?`)) return
    try {
      const res = await fetch(`/api/accounting/accounts/${id}`, { method: 'DELETE' })
      if (res.ok) fetchTree()
      else { const d = await res.json(); alert(d.detail || 'Error') }
    } catch (e) { alert('Error') }
  }

  const startEdit = (acc: any) => {
    setEditAccount(acc)
    setForm({
      code: acc.code, name: acc.name, account_type: acc.account_type,
      category: acc.category || 'general',
      parent_account_id: acc.parent_account_id || '',
      is_header: acc.is_header || false,
    })
  }

  // Render tree rows with edit buttons
  function renderEditableRow(node: QBTreeNode, depth: number = 0) {
    const hasChildren = node.children && node.children.length > 0
    const isExpanded = expanded[node.id] !== false
    const indent = depth * 24

    return (
      <React.Fragment key={node.id}>
        <tr className="border-b hover:bg-stone-50 transition-colors group" style={{ borderColor: '#eee' }}>
          <td className="py-2 pr-2" style={{ paddingLeft: `${8 + indent}px` }}>
            <div className="flex items-center gap-1">
              {hasChildren ? (
                <button onClick={() => toggleExpand(node.id)} className="p-0.5 rounded hover:bg-stone-200">
                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-stone-500" /> : <ChevronRight className="w-3.5 h-3.5 text-stone-500" />}
                </button>
              ) : <span className="w-4.5" />}
              <span className={`text-sm ${node.is_header ? 'font-semibold' : ''}`} style={{ color: 'var(--charcoal)' }}>
                {node.name}
              </span>
            </div>
          </td>
          <td className="py-2 text-xs" style={{ color: 'var(--ash)' }}>{node.code}</td>
          <td className="py-2 text-xs capitalize" style={{ color: 'var(--ash)' }}>{node.account_type}</td>
          <td className="py-2 text-right pr-2">
            <span className="text-sm tabular-nums" style={{ color: 'var(--charcoal)' }}>
              {node.total !== 0 ? fmtFull(node.total) : '—'}
            </span>
          </td>
          <td className="py-2 text-right pr-2">
            <div className="opacity-0 group-hover:opacity-100 flex gap-1 justify-end transition-opacity">
              <button onClick={() => startEdit(node)} className="p-1 rounded hover:bg-blue-50 text-blue-600" title="Editar">
                <Eye className="w-3.5 h-3.5" />
              </button>
              {!node.is_header && (
                <button onClick={() => handleDelete(node.id, node.name)} className="p-1 rounded hover:bg-red-50 text-red-500" title="Desactivar">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </td>
        </tr>
        {hasChildren && isExpanded && node.children.map(c => renderEditableRow(c, depth + 1))}
      </React.Fragment>
    )
  }

  const ACCOUNT_TYPES = [
    { value: 'asset', label: 'Activo' }, { value: 'liability', label: 'Pasivo' },
    { value: 'equity', label: 'Capital' }, { value: 'income', label: 'Ingreso' },
    { value: 'cogs', label: 'Costo de Ventas' }, { value: 'expense', label: 'Gasto' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-lg font-bold" style={{ color: 'var(--ink)' }}>Plan de Cuentas</h2>
          <p className="text-xs" style={{ color: 'var(--ash)' }}>Administra las cuentas contables. Haz clic en una cuenta para editarla.</p>
        </div>
        <button onClick={() => { setShowAdd(true); setEditAccount(null); setForm({ code: '', name: '', account_type: 'expense', category: 'general', parent_account_id: '', is_header: false }) }}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-white transition-colors"
          style={{ backgroundColor: 'var(--navy-800)' }}>
          <Plus className="w-4 h-4" /> Nueva Cuenta
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-navy-600" /></div>
      ) : (
        <div className="card-luxury overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 bg-stone-50" style={{ borderColor: 'var(--stone)' }}>
                <th className="text-left text-xs font-semibold py-2 pl-3 uppercase" style={{ color: 'var(--slate)' }}>Cuenta</th>
                <th className="text-left text-xs font-semibold py-2 uppercase" style={{ color: 'var(--slate)' }}>Código</th>
                <th className="text-left text-xs font-semibold py-2 uppercase" style={{ color: 'var(--slate)' }}>Tipo</th>
                <th className="text-right text-xs font-semibold py-2 pr-2 uppercase" style={{ color: 'var(--slate)' }}>Balance</th>
                <th className="text-right text-xs font-semibold py-2 pr-2 uppercase w-20" style={{ color: 'var(--slate)' }}></th>
              </tr>
            </thead>
            <tbody>
              {tree.map(node => renderEditableRow(node))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Modal */}
      {(showAdd || editAccount) && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => { setShowAdd(false); setEditAccount(null) }}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="font-serif text-lg font-bold mb-4" style={{ color: 'var(--ink)' }}>
              {editAccount ? 'Editar Cuenta' : 'Nueva Cuenta Contable'}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium" style={{ color: 'var(--slate)' }}>Código *</label>
                <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }}
                  placeholder="Ej: 60900" />
              </div>
              <div>
                <label className="text-xs font-medium" style={{ color: 'var(--slate)' }}>Nombre *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }}
                  placeholder="Ej: 60900 Gastos de Oficina" />
              </div>
              <div>
                <label className="text-xs font-medium" style={{ color: 'var(--slate)' }}>Tipo de Cuenta *</label>
                <select value={form.account_type} onChange={e => setForm(f => ({ ...f, account_type: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }}
                  disabled={!!editAccount}>
                  {ACCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium" style={{ color: 'var(--slate)' }}>Cuenta Padre (opcional)</label>
                <select value={form.parent_account_id} onChange={e => setForm(f => ({ ...f, parent_account_id: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }}>
                  <option value="">— Sin padre (nivel superior) —</option>
                  {allAccounts.filter(a => a.is_header || a.children?.length).map(a => (
                    <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="is_header" checked={form.is_header}
                  onChange={e => setForm(f => ({ ...f, is_header: e.target.checked }))} />
                <label htmlFor="is_header" className="text-sm" style={{ color: 'var(--charcoal)' }}>
                  Es cuenta agrupadora (header)
                </label>
              </div>
            </div>
            <div className="flex gap-3 mt-6 justify-end">
              <button onClick={() => { setShowAdd(false); setEditAccount(null) }}
                className="px-4 py-2 text-sm rounded-lg border" style={{ borderColor: 'var(--stone)', color: 'var(--slate)' }}>
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving || !form.code || !form.name}
                className="px-4 py-2 text-sm rounded-lg text-white font-medium disabled:opacity-50"
                style={{ backgroundColor: 'var(--navy-800)' }}>
                {saving ? 'Guardando...' : editAccount ? 'Actualizar' : 'Crear Cuenta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
//  BUDGET TAB — NEW
// ════════════════════════════════════════════════════════════════════════
function BudgetTab({ accounts }: { accounts: AccountInfo[] }) {
  const [comparison, setComparison] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ account_id: '', period_month: new Date().getMonth() + 1, budgeted_amount: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/accounting/budgets/vs-actual?year=${year}`)
        if (res.ok) { const d = await res.json(); setComparison(d.comparison || []) }
      } catch (e) { /* ignore */ }
      finally { setLoading(false) }
    })()
  }, [year])

  const handleAddBudget = async () => {
    if (!addForm.account_id || !addForm.budgeted_amount) return
    setSaving(true)
    try {
      const res = await fetch('/api/accounting/budgets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...addForm, budgeted_amount: parseFloat(addForm.budgeted_amount), period_year: year }),
      })
      if (res.ok) {
        setShowAdd(false)
        setAddForm({ account_id: '', period_month: new Date().getMonth() + 1, budgeted_amount: '' })
        // Refresh
        const r = await fetch(`/api/accounting/budgets/vs-actual?year=${year}`)
        if (r.ok) { const d = await r.json(); setComparison(d.comparison || []) }
      }
    } catch (e) { /* ignore */ }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold" style={{ color: 'var(--ink)' }}>Presupuesto vs Real</h3>
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="px-3 py-1.5 text-sm rounded-lg border" style={{ borderColor: 'var(--stone)' }}>
            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg" style={{ backgroundColor: 'var(--navy-800)' }}>
          <Plus className="w-4 h-4" /> Agregar Presupuesto
        </button>
      </div>

      {showAdd && (
        <div className="card-luxury p-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>Cuenta</label>
            <select value={addForm.account_id} onChange={e => setAddForm(f => ({ ...f, account_id: e.target.value }))} className="px-3 py-2 text-sm rounded-lg border" style={{ borderColor: 'var(--stone)' }}>
              <option value="">Seleccionar...</option>
              {accounts.filter(a => a.account_type === 'expense').map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>Mes</label>
            <select value={addForm.period_month} onChange={e => setAddForm(f => ({ ...f, period_month: Number(e.target.value) }))} className="px-3 py-2 text-sm rounded-lg border" style={{ borderColor: 'var(--stone)' }}>
              {MONTH_NAMES.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>Monto ($)</label>
            <input type="number" step="0.01" value={addForm.budgeted_amount} onChange={e => setAddForm(f => ({ ...f, budgeted_amount: e.target.value }))}
              className="px-3 py-2 text-sm rounded-lg border w-32" style={{ borderColor: 'var(--stone)' }} placeholder="0.00" />
          </div>
          <button onClick={handleAddBudget} disabled={saving} className="px-4 py-2 text-sm font-medium text-white rounded-lg" style={{ backgroundColor: 'var(--navy-800)' }}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-navy-600" /></div>
      ) : comparison.length === 0 ? (
        <div className="text-center py-12 card-luxury">
          <BookOpen className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--ash)' }} />
          <p className="text-sm" style={{ color: 'var(--ash)' }}>No hay presupuestos para {year}. Agrega uno para comparar con los gastos reales.</p>
        </div>
      ) : (
        <div className="card-luxury overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b" style={{ borderColor: 'var(--sand)', backgroundColor: 'var(--ivory)' }}>
              <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--slate)' }}>Cuenta</th>
              <th className="px-4 py-3 text-center font-medium" style={{ color: 'var(--slate)' }}>Mes</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--slate)' }}>Presupuesto</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--slate)' }}>Real</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--slate)' }}>Variación</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--slate)' }}>%</th>
            </tr></thead>
            <tbody>
              {comparison.map((c, i) => {
                const overBudget = c.variance < 0
                return (
                  <tr key={i} className="border-b" style={{ borderColor: 'var(--sand)' }}>
                    <td className="px-4 py-3" style={{ color: 'var(--charcoal)' }}>{c.account?.name || '—'}</td>
                    <td className="px-4 py-3 text-center" style={{ color: 'var(--slate)' }}>{MONTH_NAMES[c.month]}</td>
                    <td className="px-4 py-3 text-right font-medium" style={{ color: 'var(--charcoal)' }}>{fmtFull(c.budgeted)}</td>
                    <td className="px-4 py-3 text-right font-medium" style={{ color: 'var(--charcoal)' }}>{fmtFull(c.actual)}</td>
                    <td className={`px-4 py-3 text-right font-bold ${overBudget ? 'text-red-600' : 'text-emerald-600'}`}>{overBudget ? '' : '+'}{fmtFull(c.variance)}</td>
                    <td className={`px-4 py-3 text-right text-xs font-medium ${overBudget ? 'text-red-600' : 'text-emerald-600'}`}>{c.variance_pct > 0 ? '+' : ''}{c.variance_pct}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
//  RECONCILIATION TAB — NEW
// ════════════════════════════════════════════════════════════════════════
function ReconciliationTab({ bankAccounts }: { bankAccounts: BankAccount[] }) {
  const [selectedBank, setSelectedBank] = useState('')
  const [unreconciled, setUnreconciled] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [reconciling, setReconciling] = useState(false)

  useEffect(() => {
    if (!selectedBank) return
    setLoading(true)
    ;(async () => {
      try {
        const res = await fetch(`/api/accounting/reconciliation?bank_account_id=${selectedBank}`)
        if (res.ok) { const d = await res.json(); setUnreconciled(d.transactions || []) }
      } catch (e) { /* ignore */ }
      finally { setLoading(false) }
    })()
  }, [selectedBank])

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(Array.from(prev))
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const handleReconcile = async () => {
    if (selected.size === 0) return
    setReconciling(true)
    try {
      const res = await fetch('/api/accounting/reconciliation', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Array.from(selected)),
      })
      if (res.ok) {
        const d = await res.json()
        alert(`✅ ${d.reconciled} transacciones conciliadas`)
        setSelected(new Set())
        setUnreconciled(prev => prev.filter(t => !selected.has(t.id)))
      }
    } catch (e) { alert('Error') }
    finally { setReconciling(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold" style={{ color: 'var(--ink)' }}>Conciliación Bancaria</h3>
          <select value={selectedBank} onChange={e => setSelectedBank(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border" style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>
            <option value="">Seleccionar cuenta...</option>
            {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        {selected.size > 0 && (
          <button onClick={handleReconcile} disabled={reconciling}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg bg-emerald-600">
            <ShieldCheck className="w-4 h-4" /> {reconciling ? 'Conciliando...' : `Conciliar (${selected.size})`}
          </button>
        )}
      </div>

      {!selectedBank ? (
        <div className="text-center py-12 card-luxury">
          <ClipboardCheck className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--ash)' }} />
          <p className="text-sm" style={{ color: 'var(--ash)' }}>Selecciona una cuenta bancaria para ver transacciones pendientes de conciliar.</p>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-navy-600" /></div>
      ) : unreconciled.length === 0 ? (
        <div className="text-center py-12 card-luxury">
          <Check className="w-10 h-10 mx-auto mb-2 text-emerald-500" />
          <p className="text-sm font-medium text-emerald-700">¡Todas las transacciones están conciliadas!</p>
        </div>
      ) : (
        <div className="card-luxury overflow-hidden">
          <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--sand)', backgroundColor: 'var(--ivory)' }}>
            <p className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>{unreconciled.length} transacciones sin conciliar</p>
            <button onClick={() => setSelected(selected.size === unreconciled.length ? new Set() : new Set(unreconciled.map(t => t.id)))}
              className="text-xs font-medium px-3 py-1 rounded border" style={{ borderColor: 'var(--stone)', color: 'var(--navy-800)' }}>
              {selected.size === unreconciled.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
            </button>
          </div>
          <div className="max-h-[500px] overflow-y-auto">
            {unreconciled.map(t => (
              <div key={t.id} className={`flex items-center gap-4 px-4 py-3 border-b cursor-pointer transition-colors ${selected.has(t.id) ? 'bg-blue-50' : 'hover:bg-sand/20'}`}
                style={{ borderColor: 'var(--sand)' }} onClick={() => toggleSelect(t.id)}>
                <input type="checkbox" checked={selected.has(t.id)} onChange={() => {}} className="w-4 h-4 rounded" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--charcoal)' }}>{t.description}</p>
                  <p className="text-xs" style={{ color: 'var(--ash)' }}>{t.transaction_date} · {t.counterparty_name || '—'} · {t.payment_reference || ''}</p>
                </div>
                <span className={`text-sm font-bold whitespace-nowrap ${t.is_income ? 'text-emerald-600' : 'text-red-600'}`}>
                  {t.is_income ? '+' : '-'}{fmtFull(t.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
//  AUDIT TAB — NEW
// ════════════════════════════════════════════════════════════════════════
function AuditTab() {
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/accounting/audit-log')
        if (res.ok) { const d = await res.json(); setEntries(d.entries || []) }
      } catch (e) { /* ignore */ }
      finally { setLoading(false) }
    })()
  }, [])

  const actionLabels: Record<string, string> = { create: 'Creó', update: 'Modificó', delete: 'Eliminó', void: 'Anuló', reconcile: 'Concilió' }
  const actionColors: Record<string, string> = {
    create: 'bg-emerald-100 text-emerald-700', update: 'bg-blue-100 text-blue-700',
    delete: 'bg-red-100 text-red-700', void: 'bg-red-100 text-red-700', reconcile: 'bg-purple-100 text-purple-700',
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--ink)' }}>
        <History className="w-5 h-5" /> Registro de Auditoría
      </h3>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-navy-600" /></div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12 card-luxury">
          <History className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--ash)' }} />
          <p className="text-sm" style={{ color: 'var(--ash)' }}>No hay registros de auditoría aún. Las acciones se registrarán automáticamente.</p>
        </div>
      ) : (
        <div className="card-luxury overflow-hidden max-h-[600px] overflow-y-auto">
          {entries.map((e, i) => (
            <div key={e.id || i} className="flex items-start gap-4 px-4 py-3 border-b" style={{ borderColor: 'var(--sand)' }}>
              <div className="mt-0.5">
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${actionColors[e.action] || 'bg-gray-100 text-gray-600'}`}>
                  {actionLabels[e.action] || e.action}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm" style={{ color: 'var(--charcoal)' }}>{e.description || `${e.action} en ${e.table_name}`}</p>
                {e.changes && (
                  <pre className="text-xs mt-1 p-2 rounded bg-gray-50 overflow-x-auto" style={{ color: 'var(--slate)' }}>
                    {typeof e.changes === 'string' ? e.changes : JSON.stringify(e.changes, null, 2)}
                  </pre>
                )}
                <p className="text-xs mt-1" style={{ color: 'var(--ash)' }}>
                  {e.user_email || 'Sistema'} · {new Date(e.created_at).toLocaleString('es-MX')}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
//  PROPERTIES TAB
// ════════════════════════════════════════════════════════════════════════
function PropertiesTab({ properties }: { properties: PropertyPnl[] }) {
  const [sortBy, setSortBy] = useState<'profit' | 'margin' | 'cost'>('profit')
  const sorted = [...properties].sort((a, b) => sortBy === 'profit' ? b.profit - a.profit : sortBy === 'margin' ? b.margin - a.margin : b.total_cost - a.total_cost)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'var(--slate)' }}>{properties.length} propiedades</p>
        <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--stone)' }}>
          {([['profit', 'Ganancia'], ['margin', 'Margen %'], ['cost', 'Inversión']] as const).map(([val, label]) => (
            <button key={val} onClick={() => setSortBy(val as any)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${sortBy === val ? 'text-white' : ''}`}
              style={sortBy === val ? { backgroundColor: 'var(--navy-800)', color: 'white' } : { color: 'var(--charcoal)' }}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {sorted.map(p => (
          <div key={p.property_id} className="card-luxury p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div><p className="font-medium text-sm" style={{ color: 'var(--charcoal)' }}>{p.address}</p><p className="text-xs" style={{ color: 'var(--ash)' }}>{p.city}</p></div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${p.status === 'sold' ? 'bg-emerald-100 text-emerald-700' : p.status === 'published' ? 'bg-blue-100 text-blue-700' : p.status === 'renovating' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>{p.status}</span>
            </div>
            <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs mb-3">
              <div><span style={{ color: 'var(--ash)' }}>Compra</span><p className="font-semibold" style={{ color: 'var(--charcoal)' }}>{fmt(p.purchase_price)}</p></div>
              <div><span style={{ color: 'var(--ash)' }}>Renovación</span><p className="font-semibold" style={{ color: 'var(--charcoal)' }}>{fmt(p.renovation_cost)}</p></div>
              <div><span style={{ color: 'var(--ash)' }}>Inversión Total</span><p className="font-semibold" style={{ color: 'var(--charcoal)' }}>{fmt(p.total_cost)}</p></div>
              <div><span style={{ color: 'var(--ash)' }}>Venta</span><p className="font-semibold" style={{ color: 'var(--charcoal)' }}>{p.sale_price > 0 ? fmt(p.sale_price) : '—'}</p></div>
            </div>
            <div className="pt-3 border-t flex items-center justify-between" style={{ borderColor: 'var(--sand)' }}>
              <div><span className="text-xs" style={{ color: 'var(--ash)' }}>Ganancia</span><p className={`text-base font-bold ${p.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{p.profit > 0 ? '+' : ''}{fmt(p.profit)}</p></div>
              {p.margin !== 0 && <span className={`text-sm font-bold ${p.margin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{p.margin > 0 ? '+' : ''}{p.margin}%</span>}
            </div>
          </div>
        ))}
      </div>
      {properties.length === 0 && (
        <div className="text-center py-12 card-luxury"><Home className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--ash)' }} /><p className="text-sm" style={{ color: 'var(--ash)' }}>No hay propiedades en este período</p></div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
//  BANKS TAB
// ════════════════════════════════════════════════════════════════════════
function BanksTab({ banks, onAdd }: { banks: BankAccount[]; onAdd: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'var(--slate)' }}>{banks.length} cuentas bancarias</p>
        <button onClick={onAdd} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg" style={{ backgroundColor: 'var(--navy-800)' }}>
          <Plus className="w-4 h-4" /> Nueva Cuenta
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {banks.map(b => (
          <div key={b.id} className="card-luxury p-6 relative">
            {b.is_primary && <span className="absolute top-3 right-3 text-xs font-medium bg-gold-100 text-gold-700 px-2 py-0.5 rounded-full">Principal</span>}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'var(--navy-50)' }}>
                <Landmark className="w-6 h-6" style={{ color: 'var(--navy-800)' }} />
              </div>
              <div><p className="font-semibold text-sm" style={{ color: 'var(--charcoal)' }}>{b.name}</p><p className="text-xs" style={{ color: 'var(--ash)' }}>{b.bank_name || b.account_type} {b.account_number_last4 && `····${b.account_number_last4}`}</p></div>
            </div>
            <div className="mb-3"><p className="text-xs" style={{ color: 'var(--ash)' }}>Saldo Actual</p><p className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>{fmtFull(b.current_balance)}</p></div>
            {b.routing_number && <div className="mb-2"><p className="text-xs" style={{ color: 'var(--ash)' }}>Routing</p><p className="text-sm font-mono" style={{ color: 'var(--charcoal)' }}>{b.routing_number}</p></div>}
            {(b.zelle_email || b.zelle_phone) && (
              <div className="pt-3 border-t" style={{ borderColor: 'var(--sand)' }}>
                <p className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Zelle</p>
                {b.zelle_email && <p className="text-sm" style={{ color: 'var(--charcoal)' }}>{b.zelle_email}</p>}
                {b.zelle_phone && <p className="text-sm" style={{ color: 'var(--charcoal)' }}>{b.zelle_phone}</p>}
              </div>
            )}
          </div>
        ))}
      </div>
      {banks.length === 0 && (
        <div className="text-center py-12 card-luxury"><Landmark className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--ash)' }} /><p className="text-sm mb-3" style={{ color: 'var(--ash)' }}>No hay cuentas bancarias</p><button onClick={onAdd} className="text-sm font-medium text-navy-700 hover:underline">+ Agregar primera cuenta</button></div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
//  RECURRING TAB
// ════════════════════════════════════════════════════════════════════════
function RecurringTab({ onAdd }: { onAdd: () => void }) {
  const [expenses, setExpenses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try { const res = await fetch('/api/accounting/recurring-expenses'); if (res.ok) { const d = await res.json(); setExpenses(d.expenses || []) } } catch (e) { /* */ }
      finally { setLoading(false) }
    })()
  }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('¿Desactivar este gasto recurrente?')) return
    await fetch(`/api/accounting/recurring-expenses/${id}`, { method: 'DELETE' })
    setExpenses(prev => prev.filter(e => e.id !== id))
  }

  const freqLabels: Record<string, string> = { weekly: 'Semanal', biweekly: 'Quincenal', monthly: 'Mensual', quarterly: 'Trimestral', yearly: 'Anual' }
  const totalMonthly = expenses.reduce((sum, e) => {
    const f = e.frequency; const a = e.amount || 0
    return sum + (f === 'weekly' ? a * 4.33 : f === 'biweekly' ? a * 2.17 : f === 'monthly' ? a : f === 'quarterly' ? a / 3 : f === 'yearly' ? a / 12 : a)
  }, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><p className="text-sm" style={{ color: 'var(--slate)' }}>{expenses.length} gastos fijos</p>
          {expenses.length > 0 && <p className="text-xs" style={{ color: 'var(--ash)' }}>≈ {fmt(totalMonthly)}/mes estimado</p>}</div>
        <button onClick={onAdd} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg" style={{ backgroundColor: 'var(--navy-800)' }}>
          <Plus className="w-4 h-4" /> Nuevo Gasto Fijo
        </button>
      </div>
      {loading ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-navy-600" /></div> : expenses.length === 0 ? (
        <div className="text-center py-12 card-luxury"><Repeat className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--ash)' }} /><p className="text-sm" style={{ color: 'var(--ash)' }}>No hay gastos fijos registrados</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {expenses.map(e => (
            <div key={e.id} className="card-luxury p-5">
              <div className="flex items-start justify-between mb-3">
                <div><p className="font-medium text-sm" style={{ color: 'var(--charcoal)' }}>{e.name}</p>{e.description && <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>{e.description}</p>}</div>
                <button onClick={() => handleDelete(e.id)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-red-600">{fmtFull(e.amount)}</span>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100" style={{ color: 'var(--slate)' }}>{freqLabels[e.frequency] || e.frequency}</span>
              </div>
              {e.next_due_date && <p className="text-xs mt-2" style={{ color: 'var(--ash)' }}>Próximo: {e.next_due_date}</p>}
              {e.counterparty_name && <p className="text-xs" style={{ color: 'var(--ash)' }}>A: {e.counterparty_name}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
//  SHARED COMPONENTS
// ════════════════════════════════════════════════════════════════════════

function KPICard({ label, value, sublabel, icon: Icon, color, bgColor }: { label: string; value: string; sublabel?: string; icon: React.ElementType; color: string; bgColor: string }) {
  return (
    <div className="card-luxury p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--ash)' }}>{label}</span>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: bgColor }}><Icon className="w-4 h-4" style={{ color }} /></div>
      </div>
      <p className="text-xl font-bold" style={{ color: 'var(--ink)' }}>{value}</p>
      {sublabel && <p className="text-[10px] mt-0.5" style={{ color: 'var(--ash)' }}>{sublabel}</p>}
    </div>
  )
}

function BreakdownRow({ label, amount, total, color }: { label: string; amount: number; total: number; color: string }) {
  const pct = total > 0 ? (amount / total) * 100 : 0
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm" style={{ color: 'var(--charcoal)' }}>{label}</span>
        <span className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>{fmt(amount)}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--sand)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(pct, 1)}%`, backgroundColor: color }} />
      </div>
      <p className="text-xs mt-0.5 text-right" style={{ color: 'var(--ash)' }}>{pct.toFixed(1)}%</p>
    </div>
  )
}

function Section({ title, items, total, positive }: { title: string; items: Record<string, number>; total: number; positive?: boolean }) {
  const itemLabels: Record<string, string> = {
    ventas_contado: 'Ventas Contado', ventas_capital_rto: 'Ventas Capital (RTO)',
    otros_ingresos: 'Otros Ingresos', compra_casas: 'Compra de Casas',
    renovaciones: 'Renovaciones',
  }
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--navy-800)' }}>{title}</h3>
      <div className="pl-4 space-y-1">
        {Object.entries(items).map(([key, amount]) => (
          <div key={key} className="flex justify-between text-sm">
            <span style={{ color: 'var(--charcoal)' }}>{itemLabels[key] || key}</span>
            <span className="font-medium" style={{ color: 'var(--charcoal)' }}>{fmtFull(amount as number)}</span>
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-2 pt-2 border-t text-sm font-semibold" style={{ borderColor: 'var(--sand)', color: 'var(--charcoal)' }}>
        <span>Total {title.toLowerCase()}</span>
        <span>{fmtFull(total)}</span>
      </div>
    </div>
  )
}

function SummaryLine({ label, amount, bold, highlight, pct }: { label: string; amount: number; bold?: boolean; highlight?: boolean; pct?: number }) {
  const color = amount >= 0 ? 'text-emerald-700' : 'text-red-700'
  return (
    <div className={`flex justify-between mt-2 py-2 ${highlight ? 'px-3 rounded-lg' : ''}`} style={highlight ? { backgroundColor: amount >= 0 ? '#ecfdf5' : '#fef2f2' } : {}}>
      <span className={`text-sm ${bold ? 'font-bold' : 'font-medium'}`} style={{ color: 'var(--charcoal)' }}>{label}</span>
      <div className="text-right">
        <span className={`text-sm ${bold ? 'font-bold' : 'font-medium'} ${highlight ? color : ''}`} style={!highlight ? { color: 'var(--charcoal)' } : {}}>
          {fmtFull(amount)}
        </span>
        {pct !== undefined && <span className="text-xs ml-2" style={{ color: 'var(--ash)' }}>({pct}%)</span>}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
//  MODALS
// ════════════════════════════════════════════════════════════════════════

function NewTransactionModal({ accounts, bankAccounts, yards, onClose, onCreated }: {
  accounts: AccountInfo[]; bankAccounts: BankAccount[]; yards: YardBreakdown[]; onClose: () => void; onCreated: () => void
}) {
  const [form, setForm] = useState({ transaction_date: new Date().toISOString().split('T')[0], transaction_type: 'other_expense', amount: '', is_income: false, description: '', counterparty_name: '', payment_method: '', payment_reference: '', bank_account_id: '', yard_id: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const incomeTypes = ['sale_cash', 'sale_rto_capital', 'deposit_received', 'other_income']
  const expenseTypes = ['purchase_house', 'renovation', 'moving_transport', 'commission', 'operating_expense', 'other_expense']

  const handleSubmit = async () => {
    if (!form.amount || !form.description) return alert('Completa monto y descripción')
    setSaving(true)
    try {
      const body: any = { ...form, amount: parseFloat(form.amount) }
      Object.keys(body).forEach(k => { if (body[k] === '') delete body[k] })
      const res = await fetch('/api/accounting/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (res.ok) onCreated(); else { const e = await res.json(); alert(`Error: ${e.detail || 'Error'}`) }
    } catch (e) { alert('Error de conexión') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--sand)' }}>
          <h2 className="font-serif font-semibold text-lg" style={{ color: 'var(--ink)' }}>Nueva Transacción</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-sand/50"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--stone)' }}>
            <button onClick={() => setForm(f => ({ ...f, is_income: true, transaction_type: 'other_income' }))}
              className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-2 ${form.is_income ? 'bg-emerald-500 text-white' : ''}`}><ArrowUpRight className="w-4 h-4" /> Ingreso</button>
            <button onClick={() => setForm(f => ({ ...f, is_income: false, transaction_type: 'other_expense' }))}
              className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-2 ${!form.is_income ? 'bg-red-500 text-white' : ''}`}><ArrowDownRight className="w-4 h-4" /> Gasto</button>
          </div>
          <div><label className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>Tipo</label>
            <select value={form.transaction_type} onChange={e => setForm(f => ({ ...f, transaction_type: e.target.value, is_income: incomeTypes.includes(e.target.value) }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }}>
              {(form.is_income ? incomeTypes : expenseTypes).map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </select></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>Monto ($)</label>
              <input type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }} placeholder="0.00" /></div>
            <div><label className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>Fecha</label>
              <input type="date" value={form.transaction_date} onChange={e => setForm(f => ({ ...f, transaction_date: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }} /></div>
          </div>
          <div><label className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>Descripción</label>
            <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }} placeholder="Ej: Pago de renta yard Conroe" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>Contraparte</label>
              <input type="text" value={form.counterparty_name} onChange={e => setForm(f => ({ ...f, counterparty_name: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }} /></div>
            <div><label className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>Método Pago</label>
              <select value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }}>
                <option value="">—</option>{Object.entries(PAYMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>Cuenta Bancaria</label>
              <select value={form.bank_account_id} onChange={e => setForm(f => ({ ...f, bank_account_id: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }}>
                <option value="">—</option>{bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
            <div><label className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>Ubicación</label>
              <select value={form.yard_id} onChange={e => setForm(f => ({ ...f, yard_id: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }}>
                <option value="">—</option>{yards.map(y => <option key={y.yard_id} value={y.yard_id}>{y.name}</option>)}</select></div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: 'var(--sand)' }}>
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg border" style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>Cancelar</button>
          <button onClick={handleSubmit} disabled={saving} className="px-6 py-2 text-sm font-medium text-white rounded-lg flex items-center gap-2" style={{ backgroundColor: form.is_income ? '#059669' : '#dc2626' }}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {saving ? 'Guardando...' : `Registrar ${form.is_income ? 'Ingreso' : 'Gasto'}`}
          </button>
        </div>
      </div>
    </div>
  )
}

function NewBankAccountModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: '', bank_name: '', account_number_last4: '', routing_number: '', account_type: 'checking', current_balance: '', is_primary: false, zelle_email: '', zelle_phone: '' })
  const [saving, setSaving] = useState(false)
  const handleSubmit = async () => {
    if (!form.name) return alert('Nombre requerido')
    setSaving(true)
    try {
      const body: any = { ...form, current_balance: parseFloat(form.current_balance || '0') }
      Object.keys(body).forEach(k => { if (body[k] === '') delete body[k] })
      const res = await fetch('/api/accounting/bank-accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (res.ok) onCreated(); else alert('Error')
    } catch (e) { alert('Error') } finally { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--sand)' }}>
          <h2 className="font-serif font-semibold text-lg" style={{ color: 'var(--ink)' }}>Nueva Cuenta Bancaria</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-sand/50"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div><label className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>Nombre *</label><input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }} placeholder="Chase Business Checking" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>Banco</label><input type="text" value={form.bank_name} onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }} /></div>
            <div><label className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>Últimos 4</label><input type="text" maxLength={4} value={form.account_number_last4} onChange={e => setForm(f => ({ ...f, account_number_last4: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>Tipo</label><select value={form.account_type} onChange={e => setForm(f => ({ ...f, account_type: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }}><option value="checking">Checking</option><option value="savings">Savings</option><option value="zelle">Zelle</option><option value="other">Otro</option></select></div>
            <div><label className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>Saldo ($)</label><input type="number" step="0.01" value={form.current_balance} onChange={e => setForm(f => ({ ...f, current_balance: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }} /></div>
          </div>
          <div><label className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>Routing Number</label><input type="text" value={form.routing_number} onChange={e => setForm(f => ({ ...f, routing_number: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>Zelle Email</label><input type="email" value={form.zelle_email} onChange={e => setForm(f => ({ ...f, zelle_email: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }} /></div>
            <div><label className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>Zelle Tel</label><input type="tel" value={form.zelle_phone} onChange={e => setForm(f => ({ ...f, zelle_phone: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }} placeholder="832-745-9600" /></div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--charcoal)' }}><input type="checkbox" checked={form.is_primary} onChange={e => setForm(f => ({ ...f, is_primary: e.target.checked }))} className="w-4 h-4 rounded" /> Cuenta principal</label>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: 'var(--sand)' }}>
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg border" style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>Cancelar</button>
          <button onClick={handleSubmit} disabled={saving} className="px-6 py-2 text-sm font-medium text-white rounded-lg flex items-center gap-2" style={{ backgroundColor: 'var(--navy-800)' }}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Landmark className="w-4 h-4" />} {saving ? 'Guardando...' : 'Crear Cuenta'}
          </button>
        </div>
      </div>
    </div>
  )
}

function NewRecurringExpenseModal({ accounts, onClose, onCreated }: { accounts: AccountInfo[]; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: '', amount: '', frequency: 'monthly', counterparty_name: '', description: '', next_due_date: '' })
  const [saving, setSaving] = useState(false)
  const handleSubmit = async () => {
    if (!form.name || !form.amount) return alert('Nombre y monto requeridos')
    setSaving(true)
    try {
      const body: any = { ...form, amount: parseFloat(form.amount) }
      Object.keys(body).forEach(k => { if (body[k] === '') delete body[k] })
      const res = await fetch('/api/accounting/recurring-expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (res.ok) onCreated(); else alert('Error')
    } catch (e) { alert('Error') } finally { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--sand)' }}>
          <h2 className="font-serif font-semibold text-lg" style={{ color: 'var(--ink)' }}>Nuevo Gasto Recurrente</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-sand/50"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div><label className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>Nombre *</label><input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }} placeholder="Renta Yard Conroe" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>Monto ($) *</label><input type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }} /></div>
            <div><label className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>Frecuencia</label><select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }}><option value="weekly">Semanal</option><option value="biweekly">Quincenal</option><option value="monthly">Mensual</option><option value="quarterly">Trimestral</option><option value="yearly">Anual</option></select></div>
          </div>
          <div><label className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>A quién</label><input type="text" value={form.counterparty_name} onChange={e => setForm(f => ({ ...f, counterparty_name: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }} /></div>
          <div><label className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>Próximo Pago</label><input type="date" value={form.next_due_date} onChange={e => setForm(f => ({ ...f, next_due_date: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }} /></div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: 'var(--sand)' }}>
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg border" style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>Cancelar</button>
          <button onClick={handleSubmit} disabled={saving} className="px-6 py-2 text-sm font-medium text-white rounded-lg flex items-center gap-2" style={{ backgroundColor: 'var(--navy-800)' }}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Repeat className="w-4 h-4" />} {saving ? 'Guardando...' : 'Crear'}
          </button>
        </div>
      </div>
    </div>
  )
}

function NewInvoiceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ direction: 'receivable', counterparty_name: '', total_amount: '', due_date: '', description: '', payment_terms: 'Due on receipt' })
  const [saving, setSaving] = useState(false)
  const handleSubmit = async () => {
    if (!form.counterparty_name || !form.total_amount) return alert('Nombre y monto requeridos')
    setSaving(true)
    try {
      const total = parseFloat(form.total_amount)
      const body: any = { ...form, total_amount: total, subtotal: total }
      Object.keys(body).forEach(k => { if (body[k] === '') delete body[k] })
      const res = await fetch('/api/accounting/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (res.ok) onCreated(); else alert('Error')
    } catch (e) { alert('Error') } finally { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--sand)' }}>
          <h2 className="font-serif font-semibold text-lg" style={{ color: 'var(--ink)' }}>Nueva Factura</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-sand/50"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--stone)' }}>
            <button onClick={() => setForm(f => ({ ...f, direction: 'receivable' }))}
              className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-2 ${form.direction === 'receivable' ? 'bg-emerald-500 text-white' : ''}`}>
              <ArrowUpRight className="w-4 h-4" /> Por Cobrar
            </button>
            <button onClick={() => setForm(f => ({ ...f, direction: 'payable' }))}
              className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-2 ${form.direction === 'payable' ? 'bg-red-500 text-white' : ''}`}>
              <ArrowDownRight className="w-4 h-4" /> Por Pagar
            </button>
          </div>
          <div><label className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>{form.direction === 'receivable' ? 'Cliente' : 'Proveedor'} *</label>
            <input type="text" value={form.counterparty_name} onChange={e => setForm(f => ({ ...f, counterparty_name: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>Monto ($) *</label>
              <input type="number" step="0.01" value={form.total_amount} onChange={e => setForm(f => ({ ...f, total_amount: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }} /></div>
            <div><label className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>Vencimiento</label>
              <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }} /></div>
          </div>
          <div><label className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>Descripción</label>
            <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }} placeholder="Concepto de la factura" /></div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: 'var(--sand)' }}>
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg border" style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>Cancelar</button>
          <button onClick={handleSubmit} disabled={saving} className="px-6 py-2 text-sm font-medium text-white rounded-lg flex items-center gap-2" style={{ backgroundColor: form.direction === 'receivable' ? '#059669' : '#dc2626' }}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            {saving ? 'Creando...' : `Crear ${form.direction === 'receivable' ? 'Factura' : 'Bill'}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
//  ESTADO DE CUENTA TAB — Bank Statement Import & AI Classification
// ════════════════════════════════════════════════════════════════════════

interface BankStatement {
  id: string; account_key: string; account_label: string; bank_account_id?: string; original_filename: string
  file_type: string; file_url?: string; bank_name?: string; account_number_last4?: string
  statement_period_start?: string; statement_period_end?: string
  beginning_balance?: number; ending_balance?: number
  status: string; total_movements: number; classified_movements: number; posted_movements: number
  created_at: string; error_message?: string
}

interface StatementMovement {
  id: string; statement_id: string; movement_date: string; description: string
  amount: number; is_credit: boolean; reference?: string; payment_method?: string
  counterparty?: string; suggested_account_id?: string; suggested_account_code?: string
  suggested_account_name?: string; suggested_transaction_type?: string
  ai_confidence?: number; ai_reasoning?: string; needs_subcategory?: boolean
  final_account_id?: string; final_transaction_type?: string; final_notes?: string
  status: string; transaction_id?: string
  accounting_accounts?: { code: string; name: string; account_type: string; category: string }
}

// Dynamic color palette for bank account drawers
const DRAWER_COLORS = ['#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed', '#0891b2', '#be185d', '#4f46e5', '#ca8a04', '#15803d']
const DRAWER_ICONS = ['🏦', '🏠', '🏙️', '🌆', '💵', '💳', '🏢', '🏗️', '💰', '🔐']

const STMT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  uploaded: { label: 'Subido', color: 'bg-gray-100 text-gray-700' },
  parsing: { label: 'Analizando...', color: 'bg-blue-100 text-blue-700' },
  parsed: { label: 'Movimientos extraídos', color: 'bg-amber-100 text-amber-700' },
  classifying: { label: 'Clasificando...', color: 'bg-blue-100 text-blue-700' },
  review: { label: 'En revisión', color: 'bg-purple-100 text-purple-700' },
  partial: { label: 'Parcialmente importado', color: 'bg-amber-100 text-amber-700' },
  completed: { label: 'Completado', color: 'bg-emerald-100 text-emerald-700' },
  error: { label: 'Error', color: 'bg-red-100 text-red-700' },
}

function EstadoCuentaTab() {
  const [expandedDrawer, setExpandedDrawer] = useState<string | null>(null)
  const [statements, setStatements] = useState<Record<string, BankStatement[]>>({})
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)
  const [activeStatement, setActiveStatement] = useState<string | null>(null)
  const [activeMovements, setActiveMovements] = useState<StatementMovement[]>([])
  const [movementsLoading, setMovementsLoading] = useState(false)
  const [classifying, setClassifying] = useState(false)
  const [posting, setPosting] = useState(false)
  const [allAccounts, setAllAccounts] = useState<any[]>([])
  const [showNewAccount, setShowNewAccount] = useState(false)
  const [newAccountName, setNewAccountName] = useState('')
  const [newAccountBank, setNewAccountBank] = useState('')
  const [creatingAccount, setCreatingAccount] = useState(false)

  const fetchBankAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/accounting/bank-accounts')
      if (res.ok) {
        const data = await res.json()
        setBankAccounts(data.bank_accounts || [])
      }
    } catch (e) { console.error(e) }
  }, [])

  const fetchStatements = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/accounting/bank-statements')
      if (res.ok) {
        const data = await res.json()
        // Group statements by bank_account_id (preferred) or account_key (legacy)
        const grouped: Record<string, BankStatement[]> = {}
        for (const stmt of (data.statements || [])) {
          const key = stmt.bank_account_id || stmt.account_key || 'uncategorized'
          if (!grouped[key]) grouped[key] = []
          grouped[key].push(stmt)
        }
        setStatements(grouped)
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/accounting/accounts/tree')
      if (res.ok) {
        const data = await res.json()
        setAllAccounts((data.flat || []).filter((a: any) => !a.is_header))
      }
    } catch (e) { /* ignore */ }
  }, [])

  useEffect(() => { fetchBankAccounts(); fetchStatements(); fetchAccounts() }, [fetchBankAccounts, fetchStatements, fetchAccounts])

  const createBankAccount = async () => {
    if (!newAccountName.trim()) return alert('Nombre de cuenta requerido')
    setCreatingAccount(true)
    try {
      const res = await fetch('/api/accounting/bank-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newAccountName.trim(),
          bank_name: newAccountBank.trim() || undefined,
          account_type: 'checking',
          current_balance: 0,
        }),
      })
      if (res.ok) {
        setNewAccountName('')
        setNewAccountBank('')
        setShowNewAccount(false)
        fetchBankAccounts()
      } else {
        alert('Error al crear cuenta')
      }
    } catch (e) { alert('Error de conexión') }
    finally { setCreatingAccount(false) }
  }

  const deleteBankAccount = async (bankId: string, name: string) => {
    if (!confirm(`¿Eliminar la cuenta "${name}"? Los estados de cuenta asociados no se borran.`)) return
    try {
      const res = await fetch(`/api/accounting/bank-accounts/${bankId}`, { method: 'DELETE' })
      if (res.ok) {
        fetchBankAccounts()
      } else {
        const err = await res.json().catch(() => ({}))
        alert(`Error: ${err.detail || 'No se pudo eliminar'}`)
      }
    } catch (e) { alert('Error de conexión') }
  }

  // Build drawers from bank accounts — use ba.id as drawer key so it matches bank_account_id in statements
  const accountDrawers = bankAccounts.map((ba, i) => ({
    key: ba.id,       // Use the UUID so grouping by bank_account_id works
    id: ba.id,
    label: ba.name,
    bankName: ba.bank_name,
    color: DRAWER_COLORS[i % DRAWER_COLORS.length],
    icon: DRAWER_ICONS[i % DRAWER_ICONS.length],
  }))

  const handleUpload = async (bankAccountId: string, file: File) => {
    setUploading(bankAccountId)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('bank_account_id', bankAccountId)

      const res = await fetch('/api/accounting/bank-statements', { method: 'POST', body: formData })
      if (res.ok) {
        const data = await res.json()
        if (data.message) alert(data.message)
        fetchStatements()
        if (data.statement?.id) {
          setActiveStatement(data.statement.id)
          setActiveMovements(data.movements || [])
          setExpandedDrawer(bankAccountId)
        }
      } else {
        const err = await res.json().catch(() => ({}))
        alert(`Error: ${err.detail || 'Error al subir archivo'}`)
      }
    } catch (e) {
      alert('Error de conexión al subir archivo')
    }
    finally { setUploading(null) }
  }

  const openStatement = async (stmtId: string) => {
    setActiveStatement(stmtId)
    setMovementsLoading(true)
    try {
      const res = await fetch(`/api/accounting/bank-statements/${stmtId}`)
      if (res.ok) {
        const data = await res.json()
        setActiveMovements(data.movements || [])
      }
    } catch (e) { console.error(e) }
    finally { setMovementsLoading(false) }
  }

  const classifyMovements = async (stmtId: string) => {
    setClassifying(true)
    try {
      const res = await fetch(`/api/accounting/bank-statements/${stmtId}/classify`, { method: 'POST' })
      if (res.ok) {
        await openStatement(stmtId)
        fetchStatements()
      } else {
        const err = await res.json().catch(() => ({}))
        alert(`Error: ${err.detail || 'Error al clasificar'}`)
      }
    } catch (e) { alert('Error de conexión') }
    finally { setClassifying(false) }
  }

  const updateMovement = async (mvId: string, data: Record<string, any>) => {
    try {
      const res = await fetch(`/api/accounting/bank-statements/movements/${mvId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (res.ok) {
        const updated = await res.json()
        setActiveMovements(prev => prev.map(m => m.id === mvId ? { ...m, ...updated } : m))
      }
    } catch (e) { console.error(e) }
  }

  const postMovements = async (stmtId: string) => {
    setPosting(true)
    try {
      const res = await fetch(`/api/accounting/bank-statements/${stmtId}/post`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        let msg = `✅ ${data.posted} transacciones creadas en contabilidad.`
        if (data.skipped > 0) {
          msg += `\n\n⚠️ ${data.skipped} movimientos omitidos (sin cuenta contable asignada).`
          msg += `\nAsegúrate de clasificar y confirmar cada movimiento con una cuenta antes de publicar.`
        }
        if (data.errors?.length > 0) {
          msg += `\n\nDetalles:\n` + data.errors.slice(0, 5).map((e: string) => `• ${e}`).join('\n')
        }
        alert(msg)
        await openStatement(stmtId)
        fetchStatements()
      } else {
        const err = await res.json().catch(() => ({}))
        alert(`Error: ${err.detail || 'Error al publicar'}`)
      }
    } catch (e) { alert('Error de conexión') }
    finally { setPosting(false) }
  }

  const deleteStatement = async (stmtId: string) => {
    if (!confirm('¿Eliminar este estado de cuenta y todos sus movimientos?')) return
    try {
      await fetch(`/api/accounting/bank-statements/${stmtId}`, { method: 'DELETE' })
      if (activeStatement === stmtId) {
        setActiveStatement(null)
        setActiveMovements([])
      }
      fetchStatements()
    } catch (e) { console.error(e) }
  }

  const pendingCount = activeMovements.filter(m => m.status === 'pending' || m.status === 'suggested').length
  const confirmedCount = activeMovements.filter(m => m.status === 'confirmed').length
  const postedCount = activeMovements.filter(m => m.status === 'posted').length
  const activeStmt = activeStatement ? Object.values(statements).flat().find(s => s.id === activeStatement) : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>Estado de Cuenta</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>
            Importa estados de cuenta bancarios · La IA extrae y clasifica los movimientos
          </p>
        </div>
        <button
          onClick={() => setShowNewAccount(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors hover:opacity-90"
          style={{ backgroundColor: 'var(--navy-800)' }}
        >
          <Plus className="w-4 h-4" /> Nueva Cuenta
        </button>
      </div>

      {/* New Account Inline Form */}
      {showNewAccount && (
        <div className="rounded-xl border p-5 space-y-3" style={{ borderColor: 'var(--navy-800)', backgroundColor: 'var(--pearl)' }}>
          <h3 className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>Crear nueva cuenta bancaria</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>Nombre de cuenta *</label>
              <input
                type="text"
                value={newAccountName}
                onChange={e => setNewAccountName(e.target.value)}
                placeholder="Ej: Cuenta Conroe, Cash Houston"
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ borderColor: 'var(--stone)' }}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>Banco (opcional)</label>
              <input
                type="text"
                value={newAccountBank}
                onChange={e => setNewAccountBank(e.target.value)}
                placeholder="Ej: Chase, Wells Fargo"
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ borderColor: 'var(--stone)' }}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={createBankAccount}
              disabled={creatingAccount || !newAccountName.trim()}
              className="px-4 py-2 text-sm font-medium text-white rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
              style={{ backgroundColor: 'var(--navy-800)' }}
            >
              {creatingAccount ? <Loader2 className="w-4 h-4 animate-spin" /> : <Landmark className="w-4 h-4" />}
              {creatingAccount ? 'Creando...' : 'Crear Cuenta'}
            </button>
            <button
              onClick={() => { setShowNewAccount(false); setNewAccountName(''); setNewAccountBank('') }}
              className="px-4 py-2 text-sm font-medium rounded-lg border transition-colors"
              style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Account Drawers */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--navy-800)' }} /></div>
      ) : accountDrawers.length === 0 ? (
        <div className="text-center py-12 card-luxury">
          <Landmark className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--ash)' }} />
          <p className="text-sm mb-3" style={{ color: 'var(--ash)' }}>No hay cuentas bancarias</p>
          <button onClick={() => setShowNewAccount(true)} className="text-sm font-medium hover:underline" style={{ color: 'var(--navy-800)' }}>
            + Crear primera cuenta
          </button>
        </div>
      ) : (
      <div className="grid grid-cols-1 gap-4">
        {accountDrawers.map(drawer => {
          // Match statements by bank_account_id (key=UUID), or fallback: check if legacy account_key matches drawer label
          const directStmts = statements[drawer.key] || []
          // Also gather legacy statements whose account_key matches the drawer label (e.g. "conroe" in "Cuenta Conroe")
          const legacyStmts = Object.entries(statements)
            .filter(([k]) => k !== drawer.key && drawer.label.toLowerCase().includes(k.toLowerCase()))
            .flatMap(([, stmts]) => stmts)
          const drawerStmts = [...directStmts, ...legacyStmts]
          const isExpanded = expandedDrawer === drawer.key

          return (
            <div key={drawer.id} className="rounded-xl border overflow-hidden transition-all" style={{ borderColor: 'var(--stone)' }}>
              {/* Drawer Header */}
              <div className="flex items-center justify-between px-5 py-4 hover:bg-stone-50 transition-colors">
                <button
                  onClick={() => setExpandedDrawer(isExpanded ? null : drawer.key)}
                  className="flex-1 flex items-center gap-3 text-left"
                >
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
                    style={{ backgroundColor: `${drawer.color}15`, border: `1px solid ${drawer.color}30` }}>
                    {drawer.icon}
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{drawer.label}</h3>
                    <p className="text-xs" style={{ color: 'var(--ash)' }}>
                      {drawer.bankName && <span>{drawer.bankName} · </span>}
                      {drawerStmts.length === 0 ? 'Sin estados de cuenta' :
                       `${drawerStmts.length} estado${drawerStmts.length > 1 ? 's' : ''} de cuenta`}
                    </p>
                  </div>
                </button>
                <div className="flex items-center gap-2">
                  {drawerStmts.some(s => s.status === 'review') && (
                    <span className="px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-700 font-medium">
                      Pendiente revisión
                    </span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteBankAccount(drawer.id, drawer.label) }}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-stone-300 hover:text-red-500 transition-colors"
                    title="Eliminar cuenta"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => setExpandedDrawer(isExpanded ? null : drawer.key)} className="p-1">
                    {isExpanded ? <ChevronUp className="w-5 h-5 text-stone-400" /> : <ChevronDown className="w-5 h-5 text-stone-400" />}
                  </button>
                </div>
              </div>

              {/* Drawer Content */}
              {isExpanded && (
                <div className="border-t px-5 py-4 space-y-4" style={{ borderColor: 'var(--sand)', backgroundColor: 'var(--pearl)' }}>
                  {/* Upload Zone */}
                  <label
                    className={`relative flex flex-col items-center justify-center px-6 py-8 border-2 border-dashed rounded-xl cursor-pointer transition-all hover:border-solid ${uploading === drawer.key ? 'opacity-60 pointer-events-none' : ''}`}
                    style={{ borderColor: `${drawer.color}50`, backgroundColor: `${drawer.color}05` }}
                  >
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.csv"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) handleUpload(drawer.key, f)
                        e.target.value = ''
                      }}
                      disabled={uploading === drawer.key}
                    />
                    {uploading === drawer.key ? (
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-8 h-8 animate-spin" style={{ color: drawer.color }} />
                        <span className="text-sm font-medium" style={{ color: drawer.color }}>Subiendo y analizando...</span>
                        <span className="text-xs" style={{ color: 'var(--ash)' }}>La IA está extrayendo los movimientos</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: `${drawer.color}15` }}>
                          <Upload className="w-6 h-6" style={{ color: drawer.color }} />
                        </div>
                        <span className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>
                          Importar estado de cuenta
                        </span>
                        <span className="text-xs text-center" style={{ color: 'var(--ash)' }}>
                          PDF, PNG, JPG, Excel (.xlsx) o CSV<br />
                          Arrastra o haz clic para seleccionar
                        </span>
                      </div>
                    )}
                  </label>

                  {/* Statement List */}
                  {drawerStmts.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--slate)' }}>
                        Estados importados
                      </h4>
                      {drawerStmts.map(stmt => {
                        const statusInfo = STMT_STATUS_LABELS[stmt.status] || STMT_STATUS_LABELS.uploaded
                        const isActive = activeStatement === stmt.id
                        return (
                          <div
                            key={stmt.id}
                            className={`rounded-lg border p-3 transition-all ${isActive ? 'ring-2' : 'hover:border-stone-400'}`}
                            style={{
                              borderColor: isActive ? drawer.color : 'var(--stone)',
                              backgroundColor: 'white',
                            }}
                          >
                            <div className="flex items-center justify-between">
                              <button onClick={() => openStatement(stmt.id)} className="flex-1 text-left flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-stone-100">
                                  {stmt.file_type === 'pdf' ? <FileText className="w-4 h-4 text-red-500" /> :
                                   ['png','jpg','jpeg'].includes(stmt.file_type) ? <ImageIcon className="w-4 h-4 text-blue-500" /> :
                                   <FileUp className="w-4 h-4 text-green-500" />}
                                </div>
                                <div>
                                  <p className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>{stmt.original_filename}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${statusInfo.color}`}>{statusInfo.label}</span>
                                    <span className="text-[10px]" style={{ color: 'var(--ash)' }}>
                                      {stmt.total_movements} movimientos
                                      {stmt.posted_movements > 0 && ` · ${stmt.posted_movements} publicados`}
                                    </span>
                                  </div>
                                </div>
                              </button>
                              <button onClick={() => deleteStatement(stmt.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-stone-400 hover:text-red-500 transition-colors">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      )}

      {/* Movement Classification Panel */}
      {activeStatement && activeStmt && (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--stone)', backgroundColor: 'white' }}>
          {/* Panel Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b flex-wrap gap-3" style={{ borderColor: 'var(--sand)', backgroundColor: 'var(--pearl)' }}>
            <div>
              <h3 className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>
                {activeStmt.original_filename}
                <span className="ml-2 font-normal text-xs" style={{ color: 'var(--slate)' }}>
                  {activeStmt.account_label}
                </span>
              </h3>
              <div className="flex items-center gap-4 mt-1 flex-wrap">
                <span className="text-xs" style={{ color: 'var(--ash)' }}>
                  {activeMovements.length} movimientos
                </span>
                {pendingCount > 0 && <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">{pendingCount} sin clasificar</span>}
                {confirmedCount > 0 && <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">{confirmedCount} confirmados</span>}
                {postedCount > 0 && <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">{postedCount} publicados</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {(activeStmt.status === 'parsed' || pendingCount > 0) && (
                <button
                  onClick={() => classifyMovements(activeStatement)}
                  disabled={classifying}
                  className="px-3 py-1.5 text-xs font-medium text-white rounded-lg flex items-center gap-1.5 transition-colors"
                  style={{ backgroundColor: classifying ? '#9ca3af' : '#7c3aed' }}
                >
                  {classifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {classifying ? 'Clasificando...' : 'Clasificar con IA'}
                </button>
              )}
              {confirmedCount > 0 && (
                <button
                  onClick={() => postMovements(activeStatement)}
                  disabled={posting}
                  className="px-3 py-1.5 text-xs font-medium text-white rounded-lg flex items-center gap-1.5 transition-colors"
                  style={{ backgroundColor: posting ? '#9ca3af' : '#059669' }}
                >
                  {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  {posting ? 'Publicando...' : `Publicar ${confirmedCount} confirmados`}
                </button>
              )}
              <button onClick={() => { setActiveStatement(null); setActiveMovements([]) }}
                className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors">
                <X className="w-4 h-4 text-stone-400" />
              </button>
            </div>
          </div>

          {/* Movements Table */}
          {movementsLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--navy-800)' }} /></div>
          ) : activeMovements.length === 0 ? (
            <div className="text-center py-12 px-6">
              <p className="text-sm" style={{ color: 'var(--ash)' }}>No se encontraron movimientos</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left" style={{ borderColor: 'var(--sand)', backgroundColor: 'var(--pearl)' }}>
                    <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--slate)' }}>Fecha</th>
                    <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--slate)' }}>Descripción</th>
                    <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-right" style={{ color: 'var(--slate)' }}>Monto</th>
                    <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--slate)' }}>Cuenta Contable</th>
                    <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-center" style={{ color: 'var(--slate)' }}>Estado</th>
                    <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-center" style={{ color: 'var(--slate)' }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {activeMovements.map((mv) => (
                    <MovementRow
                      key={mv.id}
                      movement={mv}
                      accounts={allAccounts}
                      onUpdate={updateMovement}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}


function MovementRow({ movement: mv, accounts, onUpdate }: {
  movement: StatementMovement
  accounts: any[]
  onUpdate: (id: string, data: Record<string, any>) => void
}) {
  const [showAccountPicker, setShowAccountPicker] = useState(false)
  const [accountSearch, setAccountSearch] = useState('')

  const displayAccount = mv.final_account_id
    ? accounts.find((a: any) => a.id === mv.final_account_id)
    : mv.suggested_account_name
    ? { code: mv.suggested_account_code, name: mv.suggested_account_name }
    : null

  const isPosted = mv.status === 'posted'
  const isSkipped = mv.status === 'skipped'
  const isConfirmed = mv.status === 'confirmed'

  const filteredAccounts = accountSearch
    ? accounts.filter((a: any) =>
        a.name?.toLowerCase().includes(accountSearch.toLowerCase()) ||
        a.code?.toLowerCase().includes(accountSearch.toLowerCase())
      )
    : accounts

  const handleSelectAccount = (account: any) => {
    onUpdate(mv.id, {
      final_account_id: account.id,
      status: 'confirmed',
    })
    setShowAccountPicker(false)
    setAccountSearch('')
  }

  const confirmSuggestion = () => {
    onUpdate(mv.id, {
      final_account_id: mv.suggested_account_id,
      final_transaction_type: mv.suggested_transaction_type,
      status: 'confirmed',
    })
  }

  const skipMovement = () => {
    onUpdate(mv.id, { status: 'skipped' })
  }

  return (
    <tr className={`border-b transition-colors ${isPosted ? 'bg-blue-50/50' : isSkipped ? 'bg-stone-50 opacity-50' : isConfirmed ? 'bg-emerald-50/50' : 'hover:bg-stone-50'}`}
      style={{ borderColor: '#f0f0f0' }}>
      {/* Date */}
      <td className="px-3 py-2.5 whitespace-nowrap">
        <span className="text-xs font-mono" style={{ color: 'var(--charcoal)' }}>{mv.movement_date}</span>
      </td>

      {/* Description */}
      <td className="px-3 py-2.5 max-w-md">
        <div>
          <p className="text-xs leading-snug" style={{ color: 'var(--charcoal)' }}>{mv.description}</p>
          {mv.counterparty && (
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--ash)' }}>
              {mv.counterparty}
              {mv.payment_method && <span className="ml-1 px-1 py-0.5 rounded bg-stone-100 text-stone-500">{mv.payment_method}</span>}
            </p>
          )}
          {mv.ai_reasoning && mv.status === 'suggested' && (
            <p className="text-[10px] mt-1 italic flex items-center gap-1" style={{ color: '#7c3aed' }}>
              <Brain className="w-3 h-3" /> {mv.ai_reasoning}
            </p>
          )}
        </div>
      </td>

      {/* Amount */}
      <td className="px-3 py-2.5 text-right whitespace-nowrap">
        <span className={`text-sm font-semibold tabular-nums ${mv.is_credit ? 'text-emerald-600' : 'text-red-600'}`}>
          {mv.is_credit ? '+' : ''}{fmtFull(mv.amount)}
        </span>
      </td>

      {/* Account */}
      <td className="px-3 py-2.5 relative">
        {isPosted ? (
          <span className="text-xs font-medium" style={{ color: 'var(--charcoal)' }}>
            {displayAccount ? `${displayAccount.code} ${displayAccount.name}` : '—'}
          </span>
        ) : showAccountPicker ? (
          <div className="absolute z-20 top-0 left-0 w-80 bg-white border rounded-lg shadow-xl p-2" style={{ borderColor: 'var(--stone)' }}>
            <div className="flex items-center gap-2 mb-2">
              <Search className="w-3.5 h-3.5 text-stone-400" />
              <input
                autoFocus
                type="text"
                value={accountSearch}
                onChange={e => setAccountSearch(e.target.value)}
                placeholder="Buscar cuenta..."
                className="flex-1 text-xs outline-none"
              />
              <button onClick={() => { setShowAccountPicker(false); setAccountSearch('') }}>
                <X className="w-3.5 h-3.5 text-stone-400" />
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-0.5">
              {filteredAccounts.slice(0, 30).map((a: any) => (
                <button
                  key={a.id}
                  onClick={() => handleSelectAccount(a)}
                  className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-stone-100 transition-colors flex items-center gap-2"
                >
                  <span className="font-mono text-[10px] text-stone-400 w-14 shrink-0">{a.code}</span>
                  <span style={{ color: 'var(--charcoal)' }}>{a.name}</span>
                  <span className="ml-auto text-[10px] text-stone-400">{a.account_type}</span>
                </button>
              ))}
              {filteredAccounts.length === 0 && (
                <p className="text-xs text-center py-2" style={{ color: 'var(--ash)' }}>Sin resultados</p>
              )}
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAccountPicker(true)}
            className="text-left w-full group"
            disabled={isPosted || isSkipped}
          >
            {displayAccount ? (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-stone-100 text-stone-500">{displayAccount.code}</span>
                <span className="text-xs" style={{ color: 'var(--charcoal)' }}>{displayAccount.name}</span>
                {mv.ai_confidence != null && mv.status === 'suggested' && (
                  <span className={`text-[10px] px-1 py-0.5 rounded ${mv.ai_confidence >= 0.8 ? 'bg-emerald-100 text-emerald-600' : mv.ai_confidence >= 0.5 ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-600'}`}>
                    {Math.round(mv.ai_confidence * 100)}%
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-xs italic group-hover:underline text-amber-600">
                  ⚠️ Sin cuenta — clic para asignar
                </span>
              </div>
            )}
          </button>
        )}
      </td>

      {/* Status */}
      <td className="px-3 py-2.5 text-center">
        {mv.status === 'posted' && <span className="px-1.5 py-0.5 text-[10px] rounded bg-blue-100 text-blue-700 font-medium">Publicado</span>}
        {mv.status === 'confirmed' && <span className="px-1.5 py-0.5 text-[10px] rounded bg-emerald-100 text-emerald-700 font-medium">Confirmado</span>}
        {mv.status === 'suggested' && <span className="px-1.5 py-0.5 text-[10px] rounded bg-purple-100 text-purple-700 font-medium">Sugerido</span>}
        {mv.status === 'pending' && <span className="px-1.5 py-0.5 text-[10px] rounded bg-gray-100 text-gray-600 font-medium">Pendiente</span>}
        {mv.status === 'skipped' && <span className="px-1.5 py-0.5 text-[10px] rounded bg-stone-100 text-stone-500 font-medium">Omitido</span>}
      </td>

      {/* Actions */}
      <td className="px-3 py-2.5 text-center">
        {!isPosted && !isSkipped && (
          <div className="flex items-center justify-center gap-1">
            {mv.status === 'suggested' && mv.suggested_account_id && (
              <button onClick={confirmSuggestion}
                className="p-1 rounded hover:bg-emerald-100 text-emerald-600 transition-colors"
                title="Confirmar sugerencia">
                <Check className="w-3.5 h-3.5" />
              </button>
            )}
            <button onClick={() => setShowAccountPicker(true)}
              className="p-1 rounded hover:bg-blue-100 text-blue-600 transition-colors"
              title="Cambiar cuenta">
              <Settings className="w-3.5 h-3.5" />
            </button>
            <button onClick={skipMovement}
              className="p-1 rounded hover:bg-stone-200 text-stone-400 transition-colors"
              title="Omitir">
              <SkipForward className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {isPosted && <CheckCircle2 className="w-4 h-4 text-blue-500 mx-auto" />}
      </td>
    </tr>
  )
}
