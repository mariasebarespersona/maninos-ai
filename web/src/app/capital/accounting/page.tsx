'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  DollarSign, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
  Building2, CreditCard, RefreshCw, Plus, Search, Filter, ChevronDown,
  ChevronRight, Calendar, Download, Loader2, Landmark, BarChart3,
  PieChart, Wallet, Receipt, Scale, BookOpen, FileText,
  ArrowRightLeft, Clock, X, Check, AlertCircle, Banknote,
  CircleDollarSign, Eye, Settings, History, Repeat,
  ChevronLeft, MoreHorizontal, Upload, Trash2, Image as ImageIcon,
  FileUp, Sparkles, CheckCircle2, SkipForward, Brain, ChevronUp
} from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

// ── Types ──
interface DashboardData {
  period: { type: string; start_date: string; end_date: string; year: number; month: number }
  summary: {
    total_income: number; total_expenses: number; net_profit: number; margin_percent: number
    rto_income: number; down_payment_income: number; late_fee_income: number
    investor_deposits: number; acquisition_spend: number; investor_returns: number
    commissions_paid: number; operating_expenses: number
    manual_income: number; manual_expense: number
    accounts_receivable: number; accounts_receivable_overdue: number
    accounts_payable: number
    active_contracts: number; portfolio_value: number
    total_bank_balance: number; total_cash_on_hand: number
  }
  cash_flow: { month: string; label: string; income: number; expense: number; net: number }[]
  bank_accounts: BankAccount[]
  recent_transactions: Transaction[]
}

interface Transaction {
  id: string; transaction_date: string; transaction_type: string
  amount: number; is_income: boolean; description: string
  counterparty_name?: string; payment_method?: string; payment_reference?: string
  status: string; notes?: string
  capital_accounts?: { code: string; name: string }
  capital_bank_accounts?: { name: string; bank_name: string }
}

interface BankAccount {
  id: string; name: string; bank_name?: string; account_number?: string
  account_type: string; current_balance: number; is_primary: boolean
  routing_number?: string; zelle_email?: string; zelle_phone?: string
  notes?: string; is_active: boolean
}

interface AccountNode {
  id: string; code: string; name: string; account_type: string
  category: string; is_header: boolean; balance: number; subtotal?: number
  children?: AccountNode[]; parent_account_id?: string
}

interface IncomeStatement {
  period: { start: string; end: string }
  income: { rto_payments: number; late_fees: number; other_income: number; total: number }
  expenses: { acquisitions: number; investor_returns: number; operating: number; other_expenses: number; total: number }
  net_income: number; margin_percent: number
}

interface BalanceSheet {
  date: string
  assets: { bank_accounts: number; cash_on_hand: number; cash_and_equivalents: number; accounts_receivable: number; property_held_for_rto: number; total: number }
  liabilities: { promissory_notes_payable: number; investor_obligations: number; total: number }
  equity: { retained_earnings: number; total: number }
  total_liabilities_and_equity: number
}

interface CashFlowStatement {
  period: { start: string; end: string }
  operating_activities: { rto_collections: number; late_fees_collected: number; operating_expenses: number; net: number }
  investing_activities: { property_acquisitions: number; net: number }
  financing_activities: { investor_deposits: number; investor_returns: number; net: number }
  net_change_in_cash: number
}

// ── Bank Statement Types ──
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
}

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

// ── Helpers ──
const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
const fmtFull = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

const TYPE_LABELS: Record<string, string> = {
  rto_payment: 'Pago RTO', down_payment: 'Enganche', late_fee: 'Mora',
  acquisition: 'Adquisición', investor_deposit: 'Depósito Inversionista',
  investor_return: 'Retorno Inversionista', commission: 'Comisión',
  insurance: 'Seguro', tax: 'Impuesto', operating_expense: 'Gasto Operativo',
  transfer: 'Transferencia', adjustment: 'Ajuste', other_income: 'Otro Ingreso',
  other_expense: 'Otro Gasto',
}

const PAYMENT_LABELS: Record<string, string> = {
  bank_transfer: 'Transferencia', zelle: 'Zelle', cash: 'Efectivo',
  check: 'Cheque', stripe: 'Stripe', wire: 'Wire',
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600', pending: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-emerald-100 text-emerald-700', reconciled: 'bg-blue-100 text-blue-700',
  voided: 'bg-red-100 text-red-700',
}

const MONTH_NAMES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const PERIOD_LABELS: Record<string, string> = { month: 'Mensual', quarter: 'Trimestral', year: 'Anual', all: 'Todo' }

const ACCT_TYPE_ORDER = ['asset', 'liability', 'equity', 'income', 'expense', 'cogs']
const ACCT_TYPE_LABELS: Record<string, string> = {
  asset: 'Activos', liability: 'Pasivos', equity: 'Patrimonio',
  income: 'Ingresos', expense: 'Gastos', cogs: 'Costo de Ventas',
}

type TabId = 'overview' | 'transactions' | 'statements' | 'chart' | 'banks'

// ── Main Component ──
export default function CapitalAccountingPage() {
  const toast = useToast()
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('month')
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [txnLoading, setTxnLoading] = useState(false)
  const [txnPage, setTxnPage] = useState(1)
  const [txnSearch, setTxnSearch] = useState('')
  const [txnTypeFilter, setTxnTypeFilter] = useState('')
  const [txnFlowFilter, setTxnFlowFilter] = useState<'' | 'income' | 'expense'>('')
  const [showNewTxnModal, setShowNewTxnModal] = useState(false)
  const [showNewBankModal, setShowNewBankModal] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const fetchDashboard = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ period, year: String(selectedYear), month: String(selectedMonth) })
      const res = await fetch(`/api/capital/accounting/dashboard?${params}`)
      if (res.ok) setDashboard(await res.json())
    } catch (e) { console.error('Dashboard fetch error', e) }
    finally { setLoading(false) }
  }, [period, selectedYear, selectedMonth])

  const fetchTransactions = useCallback(async () => {
    setTxnLoading(true)
    try {
      const params = new URLSearchParams({ page: String(txnPage), per_page: '30' })
      if (txnSearch) params.set('search', txnSearch)
      if (txnTypeFilter) params.set('transaction_type', txnTypeFilter)
      if (txnFlowFilter) params.set('flow', txnFlowFilter)
      const res = await fetch(`/api/capital/accounting/transactions?${params}`)
      if (res.ok) { const data = await res.json(); setTransactions(data.transactions || []) }
    } catch (e) { /* ignore */ }
    finally { setTxnLoading(false) }
  }, [txnPage, txnSearch, txnTypeFilter, txnFlowFilter])

  useEffect(() => { fetchDashboard() }, [fetchDashboard])
  useEffect(() => { if (activeTab === 'transactions') fetchTransactions() }, [activeTab, fetchTransactions])

  const handleSync = async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/capital/accounting/sync', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        toast.success(`Sincronización completada: ${data.imported} transacciones importadas`)
        fetchDashboard()
        if (activeTab === 'transactions') fetchTransactions()
      }
    } catch (e) { toast.error('Error sincronizando datos') }
    finally { setSyncing(false) }
  }

  if (loading && !dashboard) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--gold-600)' }} /></div>
  }

  const s = dashboard?.summary
  const cf = dashboard?.cash_flow || []
  const maxCf = Math.max(...cf.map(c => Math.max(c.income, c.expense, 1)))

  const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Resumen', icon: PieChart },
    { id: 'transactions', label: 'Transacciones', icon: Receipt },
    { id: 'statements', label: 'Estados Financieros', icon: Scale },
    { id: 'chart', label: 'Plan de Cuentas', icon: BookOpen },
    { id: 'banks', label: 'Bancos y Cash', icon: Landmark },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-bold" style={{ color: 'var(--ink)' }}>Contabilidad Capital</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>Gestión financiera · Maninos Capital LLC</p>
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
            style={{ backgroundColor: 'var(--gold-600)' }}>
            <Plus className="w-4 h-4" /> Transacción
          </button>
          <a href="/api/capital/accounting/export/transactions" download
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors hover:bg-sand/50"
            style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>
            <Download className="w-4 h-4" /> CSV
          </a>
        </div>
      </div>

      {/* Period Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--stone)' }}>
          {(['month', 'quarter', 'year', 'all'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${period === p ? 'text-white' : 'hover:bg-sand/50'}`}
              style={period === p ? { backgroundColor: 'var(--gold-600)', color: 'white' } : { color: 'var(--charcoal)' }}>
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
      </div>

      {/* Tab Navigation */}
      <div className="overflow-x-auto -mx-2 px-2">
        <div className="flex gap-1 border-b min-w-max" style={{ borderColor: 'var(--sand)' }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap`}
              style={activeTab === tab.id ? { borderColor: 'var(--gold-600)', color: 'var(--gold-700)' } : { borderColor: 'transparent', color: 'var(--slate)' }}>
              <tab.icon className="w-4 h-4" /> {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && s && <OverviewTab summary={s} cashFlow={cf} maxCf={maxCf} bankAccounts={dashboard?.bank_accounts || []} recentTransactions={dashboard?.recent_transactions || []} />}
      {activeTab === 'transactions' && <TransactionsTab transactions={transactions} loading={txnLoading} search={txnSearch} setSearch={setTxnSearch} typeFilter={txnTypeFilter} setTypeFilter={setTxnTypeFilter} flowFilter={txnFlowFilter} setFlowFilter={setTxnFlowFilter} page={txnPage} setPage={setTxnPage} onRefresh={fetchTransactions} />}
      {activeTab === 'statements' && <StatementsTab />}
      {activeTab === 'chart' && <ChartOfAccountsTab />}
      {activeTab === 'banks' && <BanksTab onAdd={() => setShowNewBankModal(true)} onRefresh={fetchDashboard} />}

      {/* Modals */}
      {showNewTxnModal && <NewTransactionModal bankAccounts={dashboard?.bank_accounts || []} onClose={() => setShowNewTxnModal(false)} onCreated={() => { setShowNewTxnModal(false); fetchDashboard(); if (activeTab === 'transactions') fetchTransactions() }} />}
      {showNewBankModal && <NewBankAccountModal onClose={() => setShowNewBankModal(false)} onCreated={() => { setShowNewBankModal(false); fetchDashboard() }} />}
    </div>
  )
}


// ════════════════════════════════════════════════════════════════════════
//  OVERVIEW TAB
// ════════════════════════════════════════════════════════════════════════
function OverviewTab({ summary: s, cashFlow: cf, maxCf, bankAccounts, recentTransactions }: {
  summary: DashboardData['summary']; cashFlow: DashboardData['cash_flow']; maxCf: number
  bankAccounts: BankAccount[]; recentTransactions: Transaction[]
}) {
  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard icon={TrendingUp} label="Ingresos Totales" value={fmt(s.total_income)} color="var(--success)" />
        <KPICard icon={TrendingDown} label="Gastos Totales" value={fmt(s.total_expenses)} color="var(--danger)" />
        <KPICard icon={DollarSign} label="Utilidad Neta" value={fmt(s.net_profit)} color={s.net_profit >= 0 ? 'var(--success)' : 'var(--danger)'} sub={`${s.margin_percent}% margen`} />
        <KPICard icon={Building2} label="Valor Portafolio" value={fmt(s.portfolio_value)} color="var(--gold-600)" sub={`${s.active_contracts} contratos activos`} />
      </div>

      {/* Bank & Cash Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card-luxury p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#dbeafe' }}>
              <Landmark className="w-5 h-5" style={{ color: '#1e40af' }} />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Saldo Bancario</p>
              <p className="text-xl font-bold" style={{ color: 'var(--ink)' }}>{fmtFull(s.total_bank_balance)}</p>
            </div>
          </div>
          <p className="text-xs" style={{ color: 'var(--slate)' }}>{bankAccounts.filter(b => b.account_type !== 'cash').length} cuentas bancarias</p>
        </div>
        <div className="card-luxury p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#d1fae5' }}>
              <Banknote className="w-5 h-5" style={{ color: '#059669' }} />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Cash en Mano</p>
              <p className="text-xl font-bold" style={{ color: 'var(--ink)' }}>{fmtFull(s.total_cash_on_hand)}</p>
            </div>
          </div>
          <p className="text-xs" style={{ color: 'var(--slate)' }}>{bankAccounts.filter(b => b.account_type === 'cash').length} cuentas de efectivo</p>
        </div>
        <div className="card-luxury p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#fef3c7' }}>
              <Wallet className="w-5 h-5" style={{ color: '#d97706' }} />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Liquidez Total</p>
              <p className="text-xl font-bold" style={{ color: 'var(--ink)' }}>{fmtFull(s.total_bank_balance + s.total_cash_on_hand)}</p>
            </div>
          </div>
          <p className="text-xs" style={{ color: 'var(--slate)' }}>Bancos + Efectivo</p>
        </div>
      </div>

      {/* Income / Expense Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-luxury p-5">
          <h3 className="font-serif text-lg mb-4" style={{ color: 'var(--ink)' }}>Ingresos</h3>
          <div className="space-y-3">
            <BreakdownRow label="Pagos RTO" value={s.rto_income} total={s.total_income} color="#059669" />
            <BreakdownRow label="Enganches" value={s.down_payment_income} total={s.total_income} color="#0d9488" />
            <BreakdownRow label="Moras" value={s.late_fee_income} total={s.total_income} color="#d97706" />
            <BreakdownRow label="Depósitos Inversionistas" value={s.investor_deposits} total={s.total_income} color="#2563eb" />
            <BreakdownRow label="Otros" value={s.manual_income} total={s.total_income} color="#6b7280" />
            <div className="pt-2 border-t" style={{ borderColor: 'var(--sand)' }}>
              <div className="flex justify-between font-bold"><span>Total</span><span>{fmtFull(s.total_income)}</span></div>
            </div>
          </div>
        </div>
        <div className="card-luxury p-5">
          <h3 className="font-serif text-lg mb-4" style={{ color: 'var(--ink)' }}>Gastos</h3>
          <div className="space-y-3">
            <BreakdownRow label="Adquisiciones" value={s.acquisition_spend} total={s.total_expenses} color="#dc2626" />
            <BreakdownRow label="Retornos Inversionistas" value={s.investor_returns} total={s.total_expenses} color="#7c3aed" />
            <BreakdownRow label="Comisiones" value={s.commissions_paid} total={s.total_expenses} color="#ea580c" />
            <BreakdownRow label="Gastos Operativos" value={s.operating_expenses} total={s.total_expenses} color="#64748b" />
            <BreakdownRow label="Otros" value={s.manual_expense} total={s.total_expenses} color="#6b7280" />
            <div className="pt-2 border-t" style={{ borderColor: 'var(--sand)' }}>
              <div className="flex justify-between font-bold"><span>Total</span><span>{fmtFull(s.total_expenses)}</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* Receivables / Payables */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card-luxury p-5">
          <h3 className="font-serif text-lg mb-2" style={{ color: 'var(--ink)' }}>Cuentas por Cobrar</h3>
          <p className="text-2xl font-bold" style={{ color: 'var(--success)' }}>{fmtFull(s.accounts_receivable)}</p>
          {s.accounts_receivable_overdue > 0 && (
            <p className="text-sm mt-1" style={{ color: 'var(--danger)' }}>⚠️ {fmtFull(s.accounts_receivable_overdue)} vencidas</p>
          )}
        </div>
        <div className="card-luxury p-5">
          <h3 className="font-serif text-lg mb-2" style={{ color: 'var(--ink)' }}>Obligaciones (Inversionistas)</h3>
          <p className="text-2xl font-bold" style={{ color: 'var(--danger)' }}>{fmtFull(s.accounts_payable)}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>Pagarés activos pendientes</p>
        </div>
      </div>

      {/* Cash Flow Chart */}
      <div className="card-luxury p-5">
        <h3 className="font-serif text-lg mb-4" style={{ color: 'var(--ink)' }}>Flujo de Efectivo (12 meses)</h3>
        <div className="flex items-end gap-1" style={{ height: 180 }}>
          {cf.map((c, i) => {
            const ih = (c.income / maxCf) * 160
            const eh = (c.expense / maxCf) * 160
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${c.label}: +${fmtFull(c.income)} / -${fmtFull(c.expense)}`}>
                <div className="flex items-end gap-0.5 w-full justify-center" style={{ height: 160 }}>
                  <div className="rounded-t" style={{ width: '40%', height: ih, backgroundColor: '#059669', minHeight: 2 }} />
                  <div className="rounded-t" style={{ width: '40%', height: eh, backgroundColor: '#dc2626', minHeight: 2 }} />
                </div>
                <span className="text-[9px]" style={{ color: 'var(--ash)' }}>{c.label}</span>
              </div>
            )
          })}
        </div>
        <div className="flex items-center gap-4 mt-3 text-xs" style={{ color: 'var(--slate)' }}>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ backgroundColor: '#059669' }} /> Ingresos</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ backgroundColor: '#dc2626' }} /> Gastos</span>
        </div>
      </div>

      {/* Recent Transactions */}
      {recentTransactions.length > 0 && (
        <div className="card-luxury p-5">
          <h3 className="font-serif text-lg mb-4" style={{ color: 'var(--ink)' }}>Últimas Transacciones</h3>
          <div className="space-y-2">
            {recentTransactions.slice(0, 8).map(t => (
              <div key={t.id} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: 'var(--sand)' }}>
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${t.is_income ? 'bg-emerald-100' : 'bg-red-100'}`}>
                    {t.is_income ? <ArrowUpRight className="w-4 h-4 text-emerald-600" /> : <ArrowDownRight className="w-4 h-4 text-red-600" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>{t.description}</p>
                    <p className="text-xs" style={{ color: 'var(--ash)' }}>{t.transaction_date} · {TYPE_LABELS[t.transaction_type] || t.transaction_type}</p>
                  </div>
                </div>
                <span className={`font-semibold text-sm ${t.is_income ? 'text-emerald-600' : 'text-red-600'}`}>
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

function KPICard({ icon: Icon, label, value, color, sub }: { icon: React.ElementType; label: string; value: string; color: string; sub?: string }) {
  return (
    <div className="card-luxury p-5">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ash)' }}>{label}</p>
      </div>
      <p className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>{sub}</p>}
    </div>
  )
}

function BreakdownRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span style={{ color: 'var(--charcoal)' }}>{label}</span>
        <span className="font-medium">{fmtFull(value)}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--sand)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}


// ════════════════════════════════════════════════════════════════════════
//  TRANSACTIONS TAB
// ════════════════════════════════════════════════════════════════════════
function TransactionsTab({ transactions, loading, search, setSearch, typeFilter, setTypeFilter, flowFilter, setFlowFilter, page, setPage, onRefresh }: {
  transactions: Transaction[]; loading: boolean; search: string; setSearch: (s: string) => void
  typeFilter: string; setTypeFilter: (t: string) => void
  flowFilter: '' | 'income' | 'expense'; setFlowFilter: (f: '' | 'income' | 'expense') => void
  page: number; setPage: (p: number) => void; onRefresh: () => void
}) {
  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
          <input type="text" placeholder="Buscar transacciones..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm rounded-lg border" style={{ borderColor: 'var(--stone)' }} />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border" style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>
          <option value="">Todos los tipos</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--stone)' }}>
          {[{ key: '', label: 'Todos' }, { key: 'income', label: 'Ingresos' }, { key: 'expense', label: 'Gastos' }].map(f => (
            <button key={f.key} onClick={() => setFlowFilter(f.key as any)}
              className={`px-3 py-2 text-xs font-medium transition-colors`}
              style={flowFilter === f.key ? { backgroundColor: 'var(--gold-600)', color: 'white' } : { color: 'var(--charcoal)' }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--gold-600)' }} /></div>
      ) : (
        <div className="card-luxury overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: 'var(--pearl)' }}>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--ash)' }}>Fecha</th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--ash)' }}>Tipo</th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--ash)' }}>Descripción</th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--ash)' }}>Cuenta</th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--ash)' }}>Banco</th>
                  <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--ash)' }}>Monto</th>
                  <th className="px-4 py-3 text-center font-medium" style={{ color: 'var(--ash)' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(t => {
                  const acc = t.capital_accounts
                  const bank = t.capital_bank_accounts
                  return (
                    <tr key={t.id} className="border-t hover:bg-sand/20" style={{ borderColor: 'var(--sand)' }}>
                      <td className="px-4 py-3" style={{ color: 'var(--charcoal)' }}>{t.transaction_date}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100">{TYPE_LABELS[t.transaction_type] || t.transaction_type}</span>
                      </td>
                      <td className="px-4 py-3">
                        <p style={{ color: 'var(--charcoal)' }}>{t.description}</p>
                        {t.counterparty_name && <p className="text-xs" style={{ color: 'var(--ash)' }}>{t.counterparty_name}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--slate)' }}>
                        {acc ? `${acc.code} ${acc.name}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--slate)' }}>
                        {bank ? `${bank.name}` : '—'}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold ${t.is_income ? 'text-emerald-600' : 'text-red-600'}`}>
                        {t.is_income ? '+' : '-'}{fmtFull(t.amount)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[t.status] || 'bg-gray-100'}`}>
                          {t.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
                {transactions.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-12 text-center" style={{ color: 'var(--ash)' }}>No hay transacciones para estos filtros</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: 'var(--sand)' }}>
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}
              className="flex items-center gap-1 text-sm disabled:opacity-40" style={{ color: 'var(--charcoal)' }}>
              <ChevronLeft className="w-4 h-4" /> Anterior
            </button>
            <span className="text-sm" style={{ color: 'var(--slate)' }}>Página {page}</span>
            <button onClick={() => setPage(page + 1)} disabled={transactions.length < 30}
              className="flex items-center gap-1 text-sm disabled:opacity-40" style={{ color: 'var(--charcoal)' }}>
              Siguiente <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}


// ════════════════════════════════════════════════════════════════════════
//  STATEMENTS TAB — QuickBooks-style Balance Sheet & Profit/Loss
// ════════════════════════════════════════════════════════════════════════

interface ReportNode {
  id: string; code: string; name: string; account_type: string
  is_header: boolean; balance: number; subtotal?: number
  children?: ReportNode[]; category?: string
}

interface BSTreeData {
  date: string; assets: ReportNode[]; liabilities: ReportNode[]; equity: ReportNode[]
  total_assets: number; total_liabilities: number; total_equity: number; total_liabilities_and_equity: number
}

interface PLTreeData {
  period: { start: string; end: string }
  income: ReportNode[]; expenses: ReportNode[]
  other_income: ReportNode[]; other_expenses: ReportNode[]
  total_income: number; gross_profit: number; total_expenses: number
  net_operating_income: number; total_other_income: number
  total_other_expenses: number; net_other_income: number; net_income: number
}

function StatementsTab() {
  const [activeStatement, setActiveStatement] = useState<'balance' | 'pnl'>('balance')
  const [bsData, setBsData] = useState<BSTreeData | null>(null)
  const [plData, setPlData] = useState<PLTreeData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        if (activeStatement === 'balance') {
          const res = await fetch('/api/capital/accounting/reports/balance-sheet-tree')
          const data = await res.json().catch(() => null)
          if (data) {
            setBsData(data)
          } else {
            // Set empty but valid structure so the format always renders
            setBsData({
              date: new Date().toISOString().slice(0, 10),
              assets: [], liabilities: [], equity: [],
              total_assets: 0, total_liabilities: 0, total_equity: 0, total_liabilities_and_equity: 0,
            })
            setError('No se pudieron cargar las cuentas del Balance. Verifica que la migración 042 se haya ejecutado.')
          }
        } else {
          const res = await fetch('/api/capital/accounting/reports/profit-loss-tree')
          const data = await res.json().catch(() => null)
          if (data) {
            setPlData(data)
          } else {
            const now = new Date()
            setPlData({
              period: { start: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`, end: now.toISOString().slice(0,10) },
              income: [], expenses: [], other_income: [], other_expenses: [],
              total_income: 0, gross_profit: 0, total_expenses: 0,
              net_operating_income: 0, total_other_income: 0,
              total_other_expenses: 0, net_other_income: 0, net_income: 0,
            })
            setError('No se pudieron cargar las cuentas de P&L. Verifica que la migración 042 se haya ejecutado.')
          }
        }
      } catch (e) {
        console.error(e)
        setError('Error de conexión al cargar estados financieros.')
        // Still set empty data so format renders
        if (activeStatement === 'balance') {
          setBsData({
            date: new Date().toISOString().slice(0, 10),
            assets: [], liabilities: [], equity: [],
            total_assets: 0, total_liabilities: 0, total_equity: 0, total_liabilities_and_equity: 0,
          })
        } else {
          const now = new Date()
          setPlData({
            period: { start: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`, end: now.toISOString().slice(0,10) },
            income: [], expenses: [], other_income: [], other_expenses: [],
            total_income: 0, gross_profit: 0, total_expenses: 0,
            net_operating_income: 0, total_other_income: 0,
            total_other_expenses: 0, net_other_income: 0, net_income: 0,
          })
        }
      }
      finally { setLoading(false) }
    }
    load()
  }, [activeStatement])

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {[
          { key: 'balance', label: 'Balance Sheet' },
          { key: 'pnl', label: 'Profit and Loss' },
        ].map(s => (
          <button key={s.key} onClick={() => setActiveStatement(s.key as 'balance' | 'pnl')}
            className="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
            style={activeStatement === s.key ? { backgroundColor: 'var(--gold-600)', color: 'white' } : { backgroundColor: 'var(--pearl)', color: 'var(--charcoal)' }}>
            {s.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg text-sm" style={{ backgroundColor: 'rgba(255,165,0,0.1)', color: 'var(--gold-700)', border: '1px solid var(--gold-400)' }}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--gold-600)' }} /></div>
      ) : (
        <>
          {/* ── BALANCE SHEET ── */}
          {activeStatement === 'balance' && bsData && (
            <div className="card-luxury p-6">
              <div className="text-center mb-6">
                <h2 className="font-serif text-xl font-bold" style={{ color: 'var(--ink)' }}>Balance Sheet</h2>
                <h3 className="text-sm font-semibold mt-1" style={{ color: 'var(--charcoal)' }}>MANINOS CAPITAL</h3>
                <p className="text-xs mt-1" style={{ color: 'var(--ash)' }}>As of {bsData.date}</p>
              </div>

              <div className="max-w-2xl mx-auto">
                {/* Header row */}
                <div className="flex justify-between py-2 border-b-2 mb-2" style={{ borderColor: 'var(--charcoal)' }}>
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--slate)' }}>DISTRIBUTION ACCOUNT</span>
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--slate)' }}>TOTAL</span>
                </div>

                {/* Assets */}
                <div className="mb-4">
                  <p className="font-bold text-sm py-1" style={{ color: 'var(--ink)' }}>Assets</p>
                  {bsData.assets.length === 0 && (
                    <p className="text-xs italic pl-4 py-1" style={{ color: 'var(--ash)' }}>No hay cuentas de tipo Asset cargadas aún</p>
                  )}
                  {bsData.assets.map(node => <ReportTreeNode key={node.id} node={node} depth={1} />)}
                  <div className="flex justify-between py-1.5 border-t font-bold text-sm mt-1" style={{ borderColor: 'var(--charcoal)' }}>
                    <span style={{ color: 'var(--ink)' }}>Total for Assets</span>
                    <span style={{ color: 'var(--ink)' }}>{fmtFull(bsData.total_assets)}</span>
                  </div>
                </div>

                {/* Liabilities and Equity */}
                <div className="mb-4">
                  <p className="font-bold text-sm py-1" style={{ color: 'var(--ink)' }}>Liabilities and Equity</p>

                  {/* Liabilities */}
                  <p className="font-semibold text-sm py-1 pl-4" style={{ color: 'var(--ink)' }}>Liabilities</p>
                  {bsData.liabilities.length === 0 && (
                    <p className="text-xs italic pl-8 py-1" style={{ color: 'var(--ash)' }}>No hay cuentas de tipo Liability cargadas aún</p>
                  )}
                  {bsData.liabilities.map(node => <ReportTreeNode key={node.id} node={node} depth={2} />)}
                  <div className="flex justify-between py-1 border-t font-semibold text-sm pl-4" style={{ borderColor: 'var(--sand)' }}>
                    <span style={{ color: 'var(--ink)' }}>Total for Liabilities</span>
                    <span style={{ color: 'var(--ink)' }}>{fmtFull(bsData.total_liabilities)}</span>
                  </div>

                  {/* Equity */}
                  <p className="font-semibold text-sm py-1 pl-4 mt-2" style={{ color: 'var(--ink)' }}>Equity</p>
                  {bsData.equity.length === 0 && (
                    <p className="text-xs italic pl-8 py-1" style={{ color: 'var(--ash)' }}>No hay cuentas de tipo Equity cargadas aún</p>
                  )}
                  {bsData.equity.map(node => <ReportTreeNode key={node.id} node={node} depth={2} />)}
                  <div className="flex justify-between py-1 border-t font-semibold text-sm pl-4" style={{ borderColor: 'var(--sand)' }}>
                    <span style={{ color: 'var(--ink)' }}>Total for Equity</span>
                    <span style={{ color: 'var(--ink)' }}>{fmtFull(bsData.total_equity)}</span>
                  </div>
                </div>

                {/* Grand Total */}
                <div className="flex justify-between py-2 border-t-2 border-b-2 font-bold text-sm" style={{ borderColor: 'var(--charcoal)' }}>
                  <span style={{ color: 'var(--ink)' }}>Total for Liabilities and Equity</span>
                  <span style={{ color: 'var(--ink)' }}>{fmtFull(bsData.total_liabilities_and_equity)}</span>
                </div>
              </div>

              <p className="text-[10px] text-center mt-6" style={{ color: 'var(--ash)' }}>
                Accrual Basis · {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
          )}

          {/* ── PROFIT AND LOSS ── */}
          {activeStatement === 'pnl' && plData && (
            <div className="card-luxury p-6">
              <div className="text-center mb-6">
                <h2 className="font-serif text-xl font-bold" style={{ color: 'var(--ink)' }}>Profit and Loss</h2>
                <h3 className="text-sm font-semibold mt-1" style={{ color: 'var(--charcoal)' }}>MANINOS CAPITAL</h3>
                <p className="text-xs mt-1" style={{ color: 'var(--ash)' }}>{plData.period.start} — {plData.period.end}</p>
              </div>

              <div className="max-w-2xl mx-auto">
                {/* Header row */}
                <div className="flex justify-between py-2 border-b-2 mb-2" style={{ borderColor: 'var(--charcoal)' }}>
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--slate)' }}>DISTRIBUTION ACCOUNT</span>
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--slate)' }}>TOTAL</span>
                </div>

                {/* Income */}
                <div className="mb-2">
                  <p className="font-bold text-sm py-1" style={{ color: 'var(--ink)' }}>Income</p>
                  {plData.income.length === 0 && (
                    <p className="text-xs italic pl-4 py-1" style={{ color: 'var(--ash)' }}>No hay cuentas de tipo Income cargadas aún</p>
                  )}
                  {plData.income.map(node => <ReportTreeNode key={node.id} node={node} depth={1} />)}
                  <div className="flex justify-between py-1 border-t font-semibold text-sm" style={{ borderColor: 'var(--sand)' }}>
                    <span style={{ color: 'var(--ink)' }}>Total for Income</span>
                    <span style={{ color: 'var(--ink)' }}>{fmtFull(plData.total_income)}</span>
                  </div>
                </div>

                {/* Gross Profit */}
                <div className="flex justify-between py-2 border-t-2 border-b font-bold text-sm" style={{ borderColor: 'var(--charcoal)' }}>
                  <span style={{ color: 'var(--ink)' }}>Gross Profit</span>
                  <span style={{ color: 'var(--ink)' }}>{fmtFull(plData.gross_profit)}</span>
                </div>

                {/* Expenses */}
                <div className="mb-2 mt-2">
                  <p className="font-bold text-sm py-1" style={{ color: 'var(--ink)' }}>Expenses</p>
                  {plData.expenses.length === 0 && (
                    <p className="text-xs italic pl-4 py-1" style={{ color: 'var(--ash)' }}>No hay cuentas de tipo Expense cargadas aún</p>
                  )}
                  {plData.expenses.map(node => <ReportTreeNode key={node.id} node={node} depth={1} />)}
                  <div className="flex justify-between py-1 border-t font-semibold text-sm" style={{ borderColor: 'var(--sand)' }}>
                    <span style={{ color: 'var(--ink)' }}>Total for Expenses</span>
                    <span style={{ color: 'var(--ink)' }}>{fmtFull(plData.total_expenses)}</span>
                  </div>
                </div>

                {/* Net Operating Income */}
                <div className="flex justify-between py-2 border-t-2 border-b font-bold text-sm" style={{ borderColor: 'var(--charcoal)' }}>
                  <span style={{ color: 'var(--ink)' }}>Net Operating Income</span>
                  <span style={{ color: plData.net_operating_income < 0 ? 'var(--danger)' : 'var(--ink)' }}>{fmtFull(plData.net_operating_income)}</span>
                </div>

                {/* Other Income */}
                {plData.other_income.length > 0 && (
                  <div className="mb-2 mt-2">
                    <p className="font-bold text-sm py-1" style={{ color: 'var(--ink)' }}>Other Income</p>
                    {plData.other_income.map(node => <ReportTreeNode key={node.id} node={node} depth={1} />)}
                    <div className="flex justify-between py-1 border-t font-semibold text-sm" style={{ borderColor: 'var(--sand)' }}>
                      <span style={{ color: 'var(--ink)' }}>Total for Other Income</span>
                      <span style={{ color: 'var(--ink)' }}>{fmtFull(plData.total_other_income)}</span>
                    </div>
                  </div>
                )}

                {/* Other Expenses */}
                {plData.other_expenses.length > 0 && (
                  <div className="mb-2 mt-2">
                    <p className="font-bold text-sm py-1" style={{ color: 'var(--ink)' }}>Other Expenses</p>
                    {plData.other_expenses.map(node => <ReportTreeNode key={node.id} node={node} depth={1} />)}
                    <div className="flex justify-between py-1 border-t font-semibold text-sm" style={{ borderColor: 'var(--sand)' }}>
                      <span style={{ color: 'var(--ink)' }}>Total for Other Expenses</span>
                      <span style={{ color: 'var(--ink)' }}>{fmtFull(plData.total_other_expenses)}</span>
                    </div>
                  </div>
                )}

                {/* Net Other Income */}
                {(plData.other_income.length > 0 || plData.other_expenses.length > 0) && (
                  <div className="flex justify-between py-2 border-t font-semibold text-sm" style={{ borderColor: 'var(--sand)' }}>
                    <span style={{ color: 'var(--ink)' }}>Net Other Income</span>
                    <span style={{ color: plData.net_other_income < 0 ? 'var(--danger)' : 'var(--ink)' }}>{fmtFull(plData.net_other_income)}</span>
                  </div>
                )}

                {/* Net Income */}
                <div className="flex justify-between py-2 border-t-2 border-b-2 font-bold text-sm mt-2" style={{ borderColor: 'var(--charcoal)' }}>
                  <span style={{ color: 'var(--ink)' }}>Net Income</span>
                  <span style={{ color: plData.net_income < 0 ? 'var(--danger)' : 'var(--ink)' }}>{fmtFull(plData.net_income)}</span>
                </div>
              </div>

              <p className="text-[10px] text-center mt-6" style={{ color: 'var(--ash)' }}>
                Accrual Basis · {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ReportTreeNode({ node, depth }: { node: ReportNode; depth: number }) {
  const hasChildren = (node.children || []).length > 0
  const indent = depth * 16

  if (hasChildren) {
    return (
      <>
        {/* Header row */}
        <div className="flex justify-between py-0.5" style={{ paddingLeft: indent }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>
            {node.code && <span className="font-mono text-xs mr-1" style={{ color: 'var(--ash)' }}>{node.code}</span>}
            {node.name}
          </span>
          {node.balance !== 0 && !node.is_header && (
            <span className="text-sm font-mono" style={{ color: node.balance < 0 ? 'var(--danger)' : 'var(--ink)' }}>
              {fmtFull(node.balance)}
            </span>
          )}
        </div>
        {/* Children */}
        {node.children!.map(child => <ReportTreeNode key={child.id} node={child} depth={depth + 1} />)}
        {/* Subtotal row */}
        <div className="flex justify-between py-0.5 border-t" style={{ paddingLeft: indent, borderColor: '#e5e5e5' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>
            Total for {node.code ? `${node.code} ` : ''}{node.name}
          </span>
          <span className="text-sm font-semibold font-mono" style={{ color: (node.subtotal || 0) < 0 ? 'var(--danger)' : 'var(--ink)' }}>
            {fmtFull(node.subtotal || 0)}
          </span>
        </div>
      </>
    )
  }

  // Leaf account
  return (
    <div className="flex justify-between py-0.5" style={{ paddingLeft: indent }}>
      <span className="text-sm" style={{ color: 'var(--charcoal)' }}>
        {node.code && <span className="font-mono text-xs mr-1" style={{ color: 'var(--ash)' }}>{node.code}</span>}
        {node.name}
      </span>
      <span className="text-sm font-mono" style={{ color: node.balance < 0 ? 'var(--danger)' : 'var(--ink)' }}>
        {fmtFull(node.balance)}
      </span>
    </div>
  )
}


// ════════════════════════════════════════════════════════════════════════
//  CHART OF ACCOUNTS TAB
// ════════════════════════════════════════════════════════════════════════
function ChartOfAccountsTab() {
  const [tree, setTree] = useState<AccountNode[]>([])
  const [flat, setFlat] = useState<AccountNode[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewAccountModal, setShowNewAccountModal] = useState(false)

  const fetchTree = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/capital/accounting/accounts/tree')
      if (res.ok) {
        const data = await res.json()
        setTree(data.tree || [])
        setFlat(data.flat || [])
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchTree() }, [fetchTree])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'var(--slate)' }}>{flat.length} cuentas activas</p>
        <button onClick={() => setShowNewAccountModal(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg"
          style={{ backgroundColor: 'var(--gold-600)' }}>
          <Plus className="w-4 h-4" /> Nueva Cuenta
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--gold-600)' }} /></div>
      ) : tree.length === 0 ? (
        <div className="card-luxury p-12 text-center">
          <BookOpen className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--ash)' }} />
          <h3 className="font-serif text-lg" style={{ color: 'var(--charcoal)' }}>Plan de cuentas vacío</h3>
          <p className="mt-2 text-sm" style={{ color: 'var(--slate)' }}>Crea tu primera cuenta contable para Capital</p>
        </div>
      ) : (
        <div className="card-luxury overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: 'var(--pearl)' }}>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--ash)' }}>Código</th>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--ash)' }}>Nombre</th>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--ash)' }}>Tipo</th>
                <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--ash)' }}>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {tree.map(node => <AccountRow key={node.id} node={node} depth={0} />)}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {showNewAccountModal && <NewAccountModal flat={flat} onClose={() => setShowNewAccountModal(false)} onCreated={() => { setShowNewAccountModal(false); fetchTree() }} />}
    </div>
  )
}

function AccountRow({ node, depth }: { node: AccountNode; depth: number }) {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = (node.children || []).length > 0

  return (
    <>
      <tr className={`border-t ${node.is_header ? 'font-semibold' : ''}`} style={{ borderColor: 'var(--sand)', backgroundColor: node.is_header ? 'var(--pearl)' : undefined }}>
        <td className="px-4 py-2" style={{ paddingLeft: `${16 + depth * 20}px`, color: 'var(--charcoal)' }}>
          <div className="flex items-center gap-1">
            {hasChildren ? (
              <button onClick={() => setExpanded(!expanded)} className="w-4 h-4 flex items-center justify-center">
                {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </button>
            ) : <span className="w-4" />}
            <span className="font-mono text-xs">{node.code}</span>
          </div>
        </td>
        <td className="px-4 py-2" style={{ color: 'var(--charcoal)' }}>{node.name}</td>
        <td className="px-4 py-2">
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100" style={{ color: 'var(--slate)' }}>
            {ACCT_TYPE_LABELS[node.account_type] || node.account_type}
          </span>
        </td>
        <td className="px-4 py-2 text-right font-mono" style={{ color: (node.subtotal || node.balance) < 0 ? 'var(--danger)' : 'var(--ink)' }}>
          {fmtFull(node.subtotal || node.balance)}
        </td>
      </tr>
      {expanded && (node.children || []).map(child => <AccountRow key={child.id} node={child} depth={depth + 1} />)}
    </>
  )
}


// ════════════════════════════════════════════════════════════════════════
//  BANKS & CASH TAB — with Estado de Cuenta (Bank Statement Import)
// ════════════════════════════════════════════════════════════════════════
function BanksTab({ onAdd, onRefresh }: { onAdd: () => void; onRefresh: () => void }) {
  const toast = useToast()
  const [subTab, setSubTab] = useState<'accounts' | 'estado_cuenta'>('accounts')
  const [banks, setBanks] = useState<BankAccount[]>([])
  const [summary, setSummary] = useState({ total_balance: 0, bank_balance: 0, cash_on_hand: 0, count: 0 })
  const [loading, setLoading] = useState(true)
  const [selectedBank, setSelectedBank] = useState<string | null>(null)
  const [bankTxns, setBankTxns] = useState<Transaction[]>([])
  const [bankDetail, setBankDetail] = useState<BankAccount | null>(null)
  const [editingBalance, setEditingBalance] = useState(false)
  const [newBalance, setNewBalance] = useState('')
  const [showTransferModal, setShowTransferModal] = useState(false)

  const fetchBanks = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/capital/accounting/bank-accounts')
      if (res.ok) {
        const data = await res.json()
        setBanks(data.bank_accounts || [])
        setSummary(data.summary || { total_balance: 0, bank_balance: 0, cash_on_hand: 0, count: 0 })
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  const loadBankDetail = useCallback(async (bankId: string) => {
    try {
      const res = await fetch(`/api/capital/accounting/bank-accounts/${bankId}`)
      if (res.ok) {
        const data = await res.json()
        setBankDetail(data.bank_account)
        setBankTxns(data.transactions || [])
      }
    } catch (e) { console.error(e) }
  }, [])

  useEffect(() => { fetchBanks() }, [fetchBanks])

  const handleUpdateBalance = async () => {
    if (!selectedBank || !newBalance) return
    try {
      const res = await fetch(`/api/capital/accounting/bank-accounts/${selectedBank}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_balance: parseFloat(newBalance) }),
      })
      if (res.ok) {
        toast.success('Saldo actualizado')
        setEditingBalance(false)
        fetchBanks()
        loadBankDetail(selectedBank)
        onRefresh()
      }
    } catch { toast.error('Error actualizando saldo') }
  }

  const handleDeactivate = async (bankId: string) => {
    if (!confirm('¿Desactivar esta cuenta?')) return
    try {
      await fetch(`/api/capital/accounting/bank-accounts/${bankId}`, { method: 'DELETE' })
      toast.success('Cuenta desactivada')
      fetchBanks()
      if (selectedBank === bankId) { setSelectedBank(null); setBankDetail(null) }
      onRefresh()
    } catch { toast.error('Error desactivando cuenta') }
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card-luxury p-4">
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Total Liquidez</p>
          <p className="text-2xl font-bold mt-1" style={{ color: 'var(--ink)' }}>{fmtFull(summary.total_balance)}</p>
        </div>
        <div className="card-luxury p-4">
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ash)' }}>En Bancos</p>
          <p className="text-2xl font-bold mt-1" style={{ color: '#1e40af' }}>{fmtFull(summary.bank_balance)}</p>
        </div>
        <div className="card-luxury p-4">
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Efectivo en Mano</p>
          <p className="text-2xl font-bold mt-1" style={{ color: '#059669' }}>{fmtFull(summary.cash_on_hand)}</p>
        </div>
        <div className="card-luxury p-4">
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Cuentas</p>
          <p className="text-2xl font-bold mt-1" style={{ color: 'var(--ink)' }}>{summary.count}</p>
        </div>
      </div>

      {/* Sub-tabs: Cuentas | Estado de Cuenta */}
      <div className="flex gap-2 border-b" style={{ borderColor: 'var(--sand)' }}>
        {[
          { key: 'accounts' as const, label: 'Cuentas Bancarias', icon: Landmark },
          { key: 'estado_cuenta' as const, label: 'Estado de Cuenta (Import)', icon: Upload },
        ].map(tab => (
          <button key={tab.key} onClick={() => setSubTab(tab.key)}
            className="flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors"
            style={subTab === tab.key
              ? { borderColor: 'var(--gold-600)', color: 'var(--gold-700)' }
              : { borderColor: 'transparent', color: 'var(--slate)' }}>
            <tab.icon className="w-4 h-4" /> {tab.label}
          </button>
        ))}
      </div>

      {/* ── SUB-TAB: Cuentas Bancarias ── */}
      {subTab === 'accounts' && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm" style={{ color: 'var(--slate)' }}>{banks.length} cuentas registradas</p>
            <div className="flex gap-2">
              {banks.length >= 2 && (
                <button onClick={() => setShowTransferModal(true)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors hover:bg-sand/50"
                  style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>
                  <ArrowRightLeft className="w-4 h-4" /> Transferir
                </button>
              )}
              <button onClick={onAdd}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg"
                style={{ backgroundColor: 'var(--gold-600)' }}>
                <Plus className="w-4 h-4" /> Nueva Cuenta
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--gold-600)' }} /></div>
          ) : banks.length === 0 ? (
            <div className="card-luxury p-12 text-center">
              <Landmark className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--ash)' }} />
              <h3 className="font-serif text-lg" style={{ color: 'var(--charcoal)' }}>No hay cuentas bancarias</h3>
              <p className="mt-2 text-sm" style={{ color: 'var(--slate)' }}>Registra tus cuentas de banco y efectivo</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Bank Cards */}
              <div className="lg:col-span-1 space-y-3">
                {banks.map(b => (
                  <div key={b.id}
                    className={`card-luxury p-5 cursor-pointer transition-all ${selectedBank === b.id ? 'ring-2' : 'hover:shadow-md'}`}
                    style={selectedBank === b.id ? { boxShadow: '0 0 0 2px var(--gold-600)' } : undefined}
                    onClick={() => { setSelectedBank(b.id); loadBankDetail(b.id); setEditingBalance(false) }}>
                    {b.is_primary && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Principal</span>}
                    <div className="flex items-center gap-3 mt-2">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: b.account_type === 'cash' ? '#d1fae5' : '#dbeafe' }}>
                        {b.account_type === 'cash'
                          ? <Banknote className="w-5 h-5" style={{ color: '#059669' }} />
                          : <Landmark className="w-5 h-5" style={{ color: '#1e40af' }} />}
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-sm" style={{ color: 'var(--charcoal)' }}>{b.name}</p>
                        <p className="text-xs" style={{ color: 'var(--ash)' }}>
                          {b.bank_name || (b.account_type === 'cash' ? 'Efectivo' : b.account_type)}
                          {b.account_number && ` ····${b.account_number.slice(-4)}`}
                        </p>
                      </div>
                    </div>
                    <p className="text-xl font-bold mt-3" style={{ color: 'var(--ink)' }}>{fmtFull(b.current_balance)}</p>
                  </div>
                ))}
              </div>

              {/* Bank Detail Panel */}
              <div className="lg:col-span-2">
                {selectedBank && bankDetail ? (
                  <div className="card-luxury p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>{bankDetail.name}</h3>
                        <p className="text-sm" style={{ color: 'var(--slate)' }}>
                          {bankDetail.bank_name || (bankDetail.account_type === 'cash' ? 'Efectivo' : bankDetail.account_type)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleDeactivate(bankDetail.id)}
                          className="text-xs px-3 py-1.5 rounded-lg border text-red-600 border-red-200 hover:bg-red-50">
                          Desactivar
                        </button>
                      </div>
                    </div>

                    {/* Balance */}
                    <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--pearl)' }}>
                      <p className="text-xs font-medium uppercase" style={{ color: 'var(--ash)' }}>Saldo Actual</p>
                      {editingBalance ? (
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-lg">$</span>
                          <input type="number" value={newBalance} onChange={e => setNewBalance(e.target.value)}
                            className="text-2xl font-bold border-b-2 outline-none w-40" style={{ borderColor: 'var(--gold-600)' }} />
                          <button onClick={handleUpdateBalance} className="text-emerald-600"><Check className="w-5 h-5" /></button>
                          <button onClick={() => setEditingBalance(false)} className="text-red-500"><X className="w-5 h-5" /></button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <p className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>{fmtFull(bankDetail.current_balance)}</p>
                          <button onClick={() => { setEditingBalance(true); setNewBalance(String(bankDetail.current_balance)) }}
                            className="text-xs px-2 py-1 rounded border" style={{ borderColor: 'var(--stone)', color: 'var(--slate)' }}>
                            Editar
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Account Info */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {bankDetail.routing_number && (
                        <div><p className="text-xs" style={{ color: 'var(--ash)' }}>Routing</p><p className="font-mono" style={{ color: 'var(--charcoal)' }}>{bankDetail.routing_number}</p></div>
                      )}
                      {bankDetail.zelle_email && (
                        <div><p className="text-xs" style={{ color: 'var(--ash)' }}>Zelle Email</p><p style={{ color: 'var(--charcoal)' }}>{bankDetail.zelle_email}</p></div>
                      )}
                      {bankDetail.zelle_phone && (
                        <div><p className="text-xs" style={{ color: 'var(--ash)' }}>Zelle Teléfono</p><p style={{ color: 'var(--charcoal)' }}>{bankDetail.zelle_phone}</p></div>
                      )}
                      {bankDetail.notes && (
                        <div className="col-span-2"><p className="text-xs" style={{ color: 'var(--ash)' }}>Notas</p><p style={{ color: 'var(--charcoal)' }}>{bankDetail.notes}</p></div>
                      )}
                    </div>

                    {/* Recent Transactions */}
                    <div>
                      <h4 className="font-semibold text-sm mb-3" style={{ color: 'var(--ink)' }}>Últimos Movimientos</h4>
                      {bankTxns.length === 0 ? (
                        <p className="text-sm text-center py-6" style={{ color: 'var(--ash)' }}>Sin movimientos registrados</p>
                      ) : (
                        <div className="space-y-2 max-h-80 overflow-y-auto">
                          {bankTxns.map(t => (
                            <div key={t.id} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: 'var(--sand)' }}>
                              <div>
                                <p className="text-sm" style={{ color: 'var(--charcoal)' }}>{t.description}</p>
                                <p className="text-xs" style={{ color: 'var(--ash)' }}>{t.transaction_date}</p>
                              </div>
                              <span className={`font-semibold text-sm ${t.is_income ? 'text-emerald-600' : 'text-red-600'}`}>
                                {t.is_income ? '+' : '-'}{fmtFull(t.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="card-luxury p-12 text-center">
                    <Eye className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--ash)' }} />
                    <p style={{ color: 'var(--slate)' }}>Selecciona una cuenta para ver sus detalles</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── SUB-TAB: Estado de Cuenta ── */}
      {subTab === 'estado_cuenta' && (
        <EstadoCuentaCapitalSection bankAccounts={banks} onRefresh={() => { fetchBanks(); onRefresh() }} />
      )}

      {/* Transfer Modal */}
      {showTransferModal && <TransferModal banks={banks} onClose={() => setShowTransferModal(false)} onDone={() => { setShowTransferModal(false); fetchBanks(); onRefresh() }} />}
    </div>
  )
}


// ════════════════════════════════════════════════════════════════════════
//  ESTADO DE CUENTA — Capital Bank Statement Import & AI Classification
// ════════════════════════════════════════════════════════════════════════
function EstadoCuentaCapitalSection({ bankAccounts, onRefresh }: { bankAccounts: BankAccount[]; onRefresh: () => void }) {
  const toast = useToast()
  const [expandedDrawer, setExpandedDrawer] = useState<string | null>(null)
  const [statements, setStatements] = useState<Record<string, BankStatement[]>>({})
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)
  const [activeStatement, setActiveStatement] = useState<string | null>(null)
  const [activeMovements, setActiveMovements] = useState<StatementMovement[]>([])
  const [movementsLoading, setMovementsLoading] = useState(false)
  const [classifying, setClassifying] = useState(false)
  const [posting, setPosting] = useState(false)
  const [allAccounts, setAllAccounts] = useState<any[]>([])

  const fetchStatements = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/capital/accounting/bank-statements')
      if (res.ok) {
        const data = await res.json()
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
      const res = await fetch('/api/capital/accounting/accounts/tree')
      if (res.ok) {
        const data = await res.json()
        setAllAccounts((data.flat || []).filter((a: any) => !a.is_header))
      }
    } catch (e) { /* ignore */ }
  }, [])

  useEffect(() => { fetchStatements(); fetchAccounts() }, [fetchStatements, fetchAccounts])

  const accountDrawers = bankAccounts.map((ba, i) => ({
    key: ba.id,
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

      const res = await fetch('/api/capital/accounting/bank-statements', { method: 'POST', body: formData })
      if (res.ok) {
        const data = await res.json()
        toast.success(`${data.movements?.length || 0} movimientos extraídos`)
        fetchStatements()
        if (data.statement?.id) {
          setActiveStatement(data.statement.id)
          setActiveMovements(data.movements || [])
          setExpandedDrawer(bankAccountId)
        }
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.detail || 'Error al subir archivo')
      }
    } catch (e) {
      toast.error('Error de conexión al subir archivo')
    }
    finally { setUploading(null) }
  }

  const openStatement = async (stmtId: string) => {
    setActiveStatement(stmtId)
    setMovementsLoading(true)
    try {
      const res = await fetch(`/api/capital/accounting/bank-statements/${stmtId}`)
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
      const res = await fetch(`/api/capital/accounting/bank-statements/${stmtId}/classify`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        toast.success(`${data.classified || 0} movimientos clasificados con IA`)
        await openStatement(stmtId)
        fetchStatements()
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.detail || 'Error al clasificar')
      }
    } catch (e) { toast.error('Error de conexión') }
    finally { setClassifying(false) }
  }

  const updateMovement = async (mvId: string, data: Record<string, any>) => {
    try {
      const res = await fetch(`/api/capital/accounting/bank-statements/movements/${mvId}`, {
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
      const res = await fetch(`/api/capital/accounting/bank-statements/${stmtId}/post`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        let msg = `✅ ${data.posted} transacciones creadas en contabilidad Capital.`
        if (data.skipped > 0) {
          msg += `\n⚠️ ${data.skipped} movimientos omitidos (sin cuenta asignada).`
        }
        toast.success(msg.replace(/\n/g, ' '))
        await openStatement(stmtId)
        fetchStatements()
        onRefresh()
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.detail || 'Error al publicar')
      }
    } catch (e) { toast.error('Error de conexión') }
    finally { setPosting(false) }
  }

  const deleteStatement = async (stmtId: string) => {
    if (!confirm('¿Eliminar este estado de cuenta y todos sus movimientos?')) return
    try {
      await fetch(`/api/capital/accounting/bank-statements/${stmtId}`, { method: 'DELETE' })
      if (activeStatement === stmtId) {
        setActiveStatement(null)
        setActiveMovements([])
      }
      fetchStatements()
      toast.success('Estado de cuenta eliminado')
    } catch (e) { console.error(e) }
  }

  const pendingCount = activeMovements.filter(m => m.status === 'pending' || m.status === 'suggested').length
  const confirmedCount = activeMovements.filter(m => m.status === 'confirmed').length
  const postedCount = activeMovements.filter(m => m.status === 'posted').length
  const activeStmt = activeStatement ? Object.values(statements).flat().find(s => s.id === activeStatement) : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>Estado de Cuenta — Capital</h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>
          Importa estados de cuenta bancarios · La IA extrae y clasifica los movimientos con el plan de cuentas de Capital
        </p>
      </div>

      {/* Account Drawers */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--gold-600)' }} /></div>
      ) : accountDrawers.length === 0 ? (
        <div className="text-center py-12 card-luxury">
          <Landmark className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--ash)' }} />
          <p className="text-sm mb-3" style={{ color: 'var(--ash)' }}>No hay cuentas bancarias registradas</p>
          <p className="text-xs" style={{ color: 'var(--slate)' }}>Primero crea una cuenta en la pestaña "Cuentas Bancarias"</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {accountDrawers.map(drawer => {
            const directStmts = statements[drawer.key] || []
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
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--gold-600)' }} /></div>
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
                    <CapitalMovementRow
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


// ── Movement Row for Capital Bank Statement ──
function CapitalMovementRow({ movement: mv, accounts, onUpdate }: {
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
                placeholder="Buscar cuenta Capital..."
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
                  Sin cuenta — clic para asignar
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


// ════════════════════════════════════════════════════════════════════════
//  MODALS
// ════════════════════════════════════════════════════════════════════════

function NewTransactionModal({ bankAccounts, onClose, onCreated }: { bankAccounts: BankAccount[]; onClose: () => void; onCreated: () => void }) {
  const toast = useToast()
  const [form, setForm] = useState({
    transaction_date: new Date().toISOString().split('T')[0],
    transaction_type: 'other_income',
    amount: '',
    is_income: true,
    description: '',
    bank_account_id: '',
    payment_method: '',
    counterparty_name: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!form.amount || !form.description) { toast.warning('Monto y descripción son requeridos'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/capital/accounting/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount: parseFloat(form.amount), bank_account_id: form.bank_account_id || undefined }),
      })
      if (res.ok) {
        toast.success('Transacción registrada')
        onCreated()
      } else {
        toast.error('Error al registrar')
      }
    } catch { toast.error('Error de conexión') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>Nueva Transacción</h2>
          <button onClick={onClose}><X className="w-5 h-5" style={{ color: 'var(--ash)' }} /></button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Fecha</label>
              <input type="date" value={form.transaction_date} onChange={e => setForm({ ...form, transaction_date: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} />
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Tipo</label>
              <select value={form.transaction_type} onChange={e => setForm({ ...form, transaction_type: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }}>
                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Monto ($)</label>
              <input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} placeholder="0.00" />
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Flujo</label>
              <div className="flex rounded-lg border overflow-hidden mt-1" style={{ borderColor: 'var(--stone)' }}>
                <button onClick={() => setForm({ ...form, is_income: true })}
                  className="flex-1 py-2 text-xs font-medium"
                  style={form.is_income ? { backgroundColor: '#059669', color: 'white' } : { color: 'var(--charcoal)' }}>
                  Ingreso
                </button>
                <button onClick={() => setForm({ ...form, is_income: false })}
                  className="flex-1 py-2 text-xs font-medium"
                  style={!form.is_income ? { backgroundColor: '#dc2626', color: 'white' } : { color: 'var(--charcoal)' }}>
                  Gasto
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Descripción</label>
            <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} placeholder="Descripción del movimiento" />
          </div>

          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Cuenta Bancaria</label>
            <select value={form.bank_account_id} onChange={e => setForm({ ...form, bank_account_id: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }}>
              <option value="">Sin asignar</option>
              {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name} ({b.bank_name || b.account_type})</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Método de Pago</label>
              <select value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }}>
                <option value="">—</option>
                {Object.entries(PAYMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Contraparte</label>
              <input type="text" value={form.counterparty_name} onChange={e => setForm({ ...form, counterparty_name: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Notas</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} rows={2} />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm rounded-lg border" style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
            style={{ backgroundColor: 'var(--gold-600)' }}>
            {saving ? 'Guardando...' : 'Guardar Transacción'}
          </button>
        </div>
      </div>
    </div>
  )
}


function NewBankAccountModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast()
  const [form, setForm] = useState({
    name: '', bank_name: '', account_number: '', account_type: 'checking',
    current_balance: '', routing_number: '', zelle_email: '', zelle_phone: '', notes: '',
  })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!form.name) { toast.warning('Nombre de cuenta es requerido'); return }
    setSaving(true)
    try {
      const payload: any = { ...form, current_balance: parseFloat(form.current_balance || '0') }
      Object.keys(payload).forEach(k => { if (payload[k] === '') delete payload[k] })
      payload.name = form.name // ensure name is always present

      const res = await fetch('/api/capital/accounting/bank-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        toast.success('Cuenta creada exitosamente')
        onCreated()
      } else {
        toast.error('Error al crear cuenta')
      }
    } catch { toast.error('Error de conexión') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>Nueva Cuenta Bancaria / Cash</h2>
          <button onClick={onClose}><X className="w-5 h-5" style={{ color: 'var(--ash)' }} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Nombre de Cuenta *</label>
            <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} placeholder="Ej: Cuenta Operativa Principal" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Tipo de Cuenta</label>
              <select value={form.account_type} onChange={e => setForm({ ...form, account_type: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }}>
                <option value="checking">Checking</option>
                <option value="savings">Savings</option>
                <option value="cash">Efectivo (Cash)</option>
                <option value="credit_card">Tarjeta de Crédito</option>
                <option value="loan">Préstamo</option>
                <option value="other">Otro</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Saldo Inicial ($)</label>
              <input type="number" step="0.01" value={form.current_balance} onChange={e => setForm({ ...form, current_balance: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} placeholder="0.00" />
            </div>
          </div>

          {form.account_type !== 'cash' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Banco</label>
                  <input type="text" value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} placeholder="Ej: Chase" />
                </div>
                <div>
                  <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>No. Cuenta (últimos 4)</label>
                  <input type="text" value={form.account_number} onChange={e => setForm({ ...form, account_number: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} placeholder="1234" maxLength={20} />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Routing Number</label>
                <input type="text" value={form.routing_number} onChange={e => setForm({ ...form, routing_number: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Zelle Email</label>
                  <input type="email" value={form.zelle_email} onChange={e => setForm({ ...form, zelle_email: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} />
                </div>
                <div>
                  <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Zelle Teléfono</label>
                  <input type="tel" value={form.zelle_phone} onChange={e => setForm({ ...form, zelle_phone: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Notas</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} rows={2} />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm rounded-lg border" style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
            style={{ backgroundColor: 'var(--gold-600)' }}>
            {saving ? 'Creando...' : 'Crear Cuenta'}
          </button>
        </div>
      </div>
    </div>
  )
}


function NewAccountModal({ flat, onClose, onCreated }: { flat: AccountNode[]; onClose: () => void; onCreated: () => void }) {
  const toast = useToast()
  const [form, setForm] = useState({
    code: '', name: '', account_type: 'asset', category: 'general',
    parent_account_id: '', is_header: false, report_section: 'balance_sheet',
  })
  const [saving, setSaving] = useState(false)

  // Auto-update report_section when account_type changes
  const handleTypeChange = (val: string) => {
    const rs = ['asset', 'liability', 'equity'].includes(val) ? 'balance_sheet' : 'profit_loss'
    setForm({ ...form, account_type: val, report_section: rs })
  }

  const handleSubmit = async () => {
    if (!form.code || !form.name) { toast.warning('Código y nombre son requeridos'); return }
    setSaving(true)
    try {
      const payload: any = { ...form, parent_account_id: form.parent_account_id || undefined }
      const res = await fetch('/api/capital/accounting/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        toast.success('Cuenta creada')
        onCreated()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.detail || 'Error al crear cuenta')
      }
    } catch { toast.error('Error de conexión') }
    finally { setSaving(false) }
  }

  const headers = flat.filter(a => a.is_header)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>Nueva Cuenta Contable</h2>
          <button onClick={onClose}><X className="w-5 h-5" style={{ color: 'var(--ash)' }} /></button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Código *</label>
              <input type="text" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border mt-1 font-mono" style={{ borderColor: 'var(--stone)' }} placeholder="10100" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Nombre *</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} placeholder="Nombre de la cuenta" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Tipo de Cuenta</label>
              <select value={form.account_type} onChange={e => handleTypeChange(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }}>
                {Object.entries(ACCT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Reporte *</label>
              <select value={form.report_section} onChange={e => setForm({ ...form, report_section: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }}>
                <option value="balance_sheet">📊 Balance Sheet</option>
                <option value="profit_loss">📈 Profit &amp; Loss</option>
              </select>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--ash)' }}>
                ¿En qué reporte aparecerá esta cuenta?
              </p>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Cuenta Padre</label>
            <select value={form.parent_account_id} onChange={e => setForm({ ...form, parent_account_id: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }}>
              <option value="">Ninguna (raíz)</option>
              {headers.map(h => <option key={h.id} value={h.id}>{h.code} — {h.name}</option>)}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--charcoal)' }}>
            <input type="checkbox" checked={form.is_header} onChange={e => setForm({ ...form, is_header: e.target.checked })} />
            Es encabezado (grupo de cuentas)
          </label>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm rounded-lg border" style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>Cancelar</button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
            style={{ backgroundColor: 'var(--gold-600)' }}>
            {saving ? 'Creando...' : 'Crear Cuenta'}
          </button>
        </div>
      </div>
    </div>
  )
}


function TransferModal({ banks, onClose, onDone }: { banks: BankAccount[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [sourceId, setSourceId] = useState(banks[0]?.id || '')
  const [targetId, setTargetId] = useState(banks[1]?.id || '')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const handleTransfer = async () => {
    if (!sourceId || !targetId || !amount || parseFloat(amount) <= 0) {
      toast.warning('Selecciona cuentas y un monto válido')
      return
    }
    if (sourceId === targetId) {
      toast.warning('No puedes transferir a la misma cuenta')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/capital/accounting/bank-accounts/${sourceId}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_bank_id: targetId, amount: parseFloat(amount), description }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        toast.success(data.message)
        onDone()
      } else {
        toast.error(data.detail || 'Error en la transferencia')
      }
    } catch { toast.error('Error de conexión') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>Transferencia entre Cuentas</h2>
          <button onClick={onClose}><X className="w-5 h-5" style={{ color: 'var(--ash)' }} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Desde</label>
            <select value={sourceId} onChange={e => setSourceId(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }}>
              {banks.map(b => <option key={b.id} value={b.id}>{b.name} — {fmtFull(b.current_balance)}</option>)}
            </select>
          </div>

          <div className="flex justify-center"><ArrowRightLeft className="w-5 h-5" style={{ color: 'var(--ash)' }} /></div>

          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Hacia</label>
            <select value={targetId} onChange={e => setTargetId(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }}>
              {banks.map(b => <option key={b.id} value={b.id}>{b.name} — {fmtFull(b.current_balance)}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Monto ($)</label>
            <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} placeholder="0.00" />
          </div>

          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Descripción</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} placeholder="Motivo de la transferencia" />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm rounded-lg border" style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>Cancelar</button>
          <button onClick={handleTransfer} disabled={saving}
            className="flex-1 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
            style={{ backgroundColor: 'var(--gold-600)' }}>
            {saving ? 'Transfiriendo...' : 'Transferir'}
          </button>
        </div>
      </div>
    </div>
  )
}

