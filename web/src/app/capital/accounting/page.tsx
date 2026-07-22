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
  FileUp, Sparkles, CheckCircle2, SkipForward, Brain, ChevronUp, Pencil, Link2, Lock, Scissors, MessageSquare,
  Paperclip, Camera
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
    ar_invoices_total?: number; ap_invoices_total?: number
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
  accounting_account_id?: string
  derived_balance?: number
  latest_statement_ending?: number | null
  latest_statement_period_end?: string | null
  discrepancy?: number | null
}

interface ReconcileMatch {
  movement_id: string
  transaction_id?: string | null
  invoice_id?: string | null
  target_type?: 'transaction' | 'invoice'
  score: number
  confidence: string
  partial?: boolean
  movement: StatementMovement
  transaction?: Transaction
  invoice?: { id: string; invoice_number?: string; counterparty_name?: string; total_amount?: number; balance_due?: number; direction?: string }
}

interface Invoice {
  id: string; invoice_number: string; direction: 'receivable' | 'payable'
  status: string; counterparty_name: string; counterparty_type?: string
  issue_date?: string; due_date?: string
  subtotal?: number; tax_amount?: number; total_amount: number
  amount_paid: number; balance_due: number
  description?: string; notes?: string; payment_terms?: string
}

interface InvoicePayment {
  id: string; amount: number; payment_date?: string; payment_method?: string
  payment_reference?: string; notes?: string; created_at?: string
}

interface ReceiptRecord {
  id: string; transaction_id?: string | null; vendor_name?: string
  amount?: number; receipt_date?: string; file_url: string
  file_type?: string; original_filename?: string; notes?: string; created_at: string
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
  parent_movement_id?: string; is_split_parent?: boolean
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

const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador', sent: 'Enviada', partial: 'Parcial', paid: 'Pagada',
  overdue: 'Vencida', voided: 'Anulada',
}

const INVOICE_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600', sent: 'bg-blue-100 text-blue-700',
  partial: 'bg-amber-100 text-amber-700', paid: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-red-100 text-red-700', voided: 'bg-stone-100 text-stone-500',
}

const FREQ_LABELS: Record<string, string> = {
  weekly: 'Semanal', biweekly: 'Quincenal', monthly: 'Mensual',
  quarterly: 'Trimestral', yearly: 'Anual',
}

const MONTH_NAMES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const PERIOD_LABELS: Record<string, string> = { month: 'Mensual', quarter: 'Trimestral', year: 'Anual', all: 'Todo' }

const ACCT_TYPE_ORDER = ['asset', 'liability', 'equity', 'income', 'expense', 'cogs']
const ACCT_TYPE_LABELS: Record<string, string> = {
  asset: 'Activos', liability: 'Pasivos', equity: 'Patrimonio',
  income: 'Ingresos', expense: 'Gastos', cogs: 'Costo de Ventas',
}

type TabId = 'overview' | 'transactions' | 'invoices' | 'statements' | 'estado_cuenta' | 'chart' | 'banks' | 'recurring' | 'audit' | 'budget'

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
        const msg = data.message || `${data.imported} transacciones importadas`
        if (data.unmapped > 0) {
          toast.warning(msg)
        } else {
          toast.success(msg)
        }
        fetchDashboard()
        if (activeTab === 'transactions') fetchTransactions()
      }
    } catch (e) { toast.error('Error sincronizando datos') }
    finally { setSyncing(false) }
  }

  const handleBackfillAccounts = async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/capital/accounting/backfill-accounts', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        if (data.updated > 0) {
          toast.success(data.message)
        } else if (data.skipped > 0) {
          toast.warning(data.message)
        } else {
          toast.info(data.message)
        }
        fetchDashboard()
        if (activeTab === 'transactions') fetchTransactions()
      } else {
        toast.error('Error al asignar cuentas')
      }
    } catch (e) { toast.error('Error de conexión') }
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
    { id: 'invoices', label: 'Facturación', icon: FileText },
    { id: 'statements', label: 'Estados Financieros', icon: Scale },
    { id: 'estado_cuenta', label: 'Estado de Cuenta', icon: Upload },
    { id: 'chart', label: 'Plan de Cuentas', icon: BookOpen },
    { id: 'banks', label: 'Bancos', icon: Landmark },
    { id: 'recurring', label: 'Gastos Recurrentes', icon: Repeat },
    { id: 'audit', label: 'Auditoría', icon: History },
    { id: 'budget', label: 'Presupuesto', icon: BarChart3 },
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
          <button onClick={handleBackfillAccounts} disabled={syncing}
            title="Asignar cuentas contables a transacciones sin cuenta"
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors hover:bg-sand/50"
            style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>
            <ArrowRightLeft className="w-4 h-4" />
            Mapear Cuentas
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
      {activeTab === 'invoices' && <InvoicesTab bankAccounts={dashboard?.bank_accounts || []} />}
      {activeTab === 'statements' && <StatementsTab />}
      {activeTab === 'estado_cuenta' && <EstadoCuentaCapitalSection onRefresh={fetchDashboard} />}
      {activeTab === 'chart' && <ChartOfAccountsTab />}
      {activeTab === 'banks' && <BanksTab onAdd={() => setShowNewBankModal(true)} onRefresh={fetchDashboard} />}
      {activeTab === 'recurring' && <RecurringTab />}
      {activeTab === 'audit' && <AuditTab />}
      {activeTab === 'budget' && <BudgetTab />}

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

      {/* Invoice AR / AP */}
      {(s.ar_invoices_total != null || s.ap_invoices_total != null) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <KPICard icon={ArrowUpRight} label="Por Cobrar (Facturas)" value={fmtFull(s.ar_invoices_total || 0)} color="#059669" sub="Facturas pendientes de cobro" />
          <KPICard icon={ArrowDownRight} label="Por Pagar (Facturas)" value={fmtFull(s.ap_invoices_total || 0)} color="#dc2626" sub="Facturas pendientes de pago" />
        </div>
      )}

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
  const toast = useToast()
  const [attachTxnId, setAttachTxnId] = useState<string | null>(null)
  const [txnsWithReceipts, setTxnsWithReceipts] = useState<Set<string>>(new Set())
  const [splitTxnId, setSplitTxnId] = useState<string | null>(null)
  const [splitParts, setSplitParts] = useState<{ amount: string; description: string }[]>([{ amount: '', description: '' }, { amount: '', description: '' }])

  // Edit / reclassify / void / account-filter (parity with Homes)
  const [editTxn, setEditTxn] = useState<Transaction | null>(null)
  const [editForm, setEditForm] = useState<{ amount: string; description: string; counterparty_name: string }>({ amount: '', description: '', counterparty_name: '' })
  const [reclassTxn, setReclassTxn] = useState<Transaction | null>(null)
  const [reclassCode, setReclassCode] = useState('')
  const [acctOptions, setAcctOptions] = useState<{ code: string; name: string; is_header?: boolean; account_type?: string }[]>([])
  const [acctFilter, setAcctFilter] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/capital/accounting/accounts')
      .then(r => r.json())
      .then(d => setAcctOptions((d.accounts || d || []).filter((a: any) => !a.is_header)))
      .catch(() => {})
  }, [])

  const openEdit = (t: Transaction) => {
    setEditTxn(t)
    setEditForm({ amount: String(Math.abs(t.amount)), description: t.description || '', counterparty_name: t.counterparty_name || '' })
  }
  const handleEditSave = async () => {
    if (!editTxn) return
    setBusyId(editTxn.id)
    try {
      const res = await fetch(`/api/capital/accounting/transactions/${editTxn.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: parseFloat(editForm.amount) || 0, description: editForm.description, counterparty_name: editForm.counterparty_name }),
      })
      if (res.ok) { toast.success('Transacción actualizada'); setEditTxn(null); onRefresh() }
      else { const e = await res.json().catch(() => ({})); toast.error(e.detail || 'Error al actualizar') }
    } catch { toast.error('Error de conexión') } finally { setBusyId(null) }
  }
  const handleReclassify = async () => {
    if (!reclassTxn || !reclassCode) return
    setBusyId(reclassTxn.id)
    try {
      const res = await fetch(`/api/capital/accounting/transactions/${reclassTxn.id}/reclassify`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_code: reclassCode }),
      })
      if (res.ok) { toast.success('Cuenta reclasificada'); setReclassTxn(null); setReclassCode(''); onRefresh() }
      else { const e = await res.json().catch(() => ({})); toast.error(e.detail || 'Error al reclasificar') }
    } catch { toast.error('Error de conexión') } finally { setBusyId(null) }
  }
  const handleVoid = async (t: Transaction) => {
    if (!confirm(`¿Anular esta transacción? Se anulará también su asiento vinculado.`)) return
    setBusyId(t.id)
    try {
      const res = await fetch(`/api/capital/accounting/transactions/${t.id}`, { method: 'DELETE' })
      if (res.ok) { toast.success('Transacción anulada'); onRefresh() }
      else { const e = await res.json().catch(() => ({})); toast.error(e.detail || 'Error al anular') }
    } catch { toast.error('Error de conexión') } finally { setBusyId(null) }
  }

  const shownTxns = acctFilter ? transactions.filter(t => t.capital_accounts?.code === acctFilter) : transactions

  useEffect(() => {
    const fetchReceiptStatus = async () => {
      try {
        const res = await fetch('/api/capital/accounting/receipts')
        if (!res.ok) return
        const receipts: { transaction_id: string | null }[] = await res.json()
        setTxnsWithReceipts(new Set(receipts.filter(r => r.transaction_id).map(r => r.transaction_id!)))
      } catch { /* ignore */ }
    }
    if (transactions.length > 0) fetchReceiptStatus()
  }, [transactions])

  const handleSplitTxn = async (id: string) => {
    const txn = transactions.find(t => t.id === id)
    if (!txn) return
    const absTotal = Math.abs(txn.amount)
    const parts = splitParts.filter(p => p.amount && parseFloat(p.amount) !== 0)
      .map(p => ({ amount: Math.abs(parseFloat(p.amount)), description: p.description || txn.description }))
    const total = parts.reduce((s, p) => s + p.amount, 0)
    if (parts.length < 2) { toast.warning('Necesitas al menos 2 partes'); return }
    if (Math.abs(total - absTotal) > 0.01) {
      toast.error(`Las partes suman $${total.toFixed(2)} pero la transacción es $${absTotal.toFixed(2)}`)
      return
    }
    try {
      const res = await fetch(`/api/capital/accounting/transactions/${id}/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parts }),
      })
      if (res.ok) {
        toast.success(`Transacción dividida en ${parts.length} partes`)
        setSplitTxnId(null)
        onRefresh()
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.detail || 'Error al dividir transacción')
      }
    } catch { toast.error('Error de conexión') }
  }

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
        <select value={acctFilter} onChange={e => setAcctFilter(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border" style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }} title="Filtrar por cuenta contable">
          <option value="">Todas las cuentas</option>
          {acctOptions.map(a => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
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
                  <th className="px-4 py-3 text-center font-medium" style={{ color: 'var(--ash)' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {shownTxns.map(t => {
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
                      <td className="px-4 py-3 text-center relative">
                        <div className="flex items-center justify-center gap-1">
                          {t.status !== 'voided' && (
                            <button onClick={() => openEdit(t)} disabled={busyId === t.id}
                              className="p-1 rounded text-blue-500 hover:text-blue-700 hover:bg-blue-50 transition-colors" title="Editar">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {t.status !== 'voided' && (
                            <button onClick={() => { setReclassTxn(t); setReclassCode(t.capital_accounts?.code || '') }} disabled={busyId === t.id}
                              className="p-1 rounded text-purple-500 hover:text-purple-700 hover:bg-purple-50 transition-colors" title="Cambiar cuenta (reclasificar)">
                              <ArrowRightLeft className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {t.status !== 'voided' && (
                            <button onClick={() => { setSplitTxnId(splitTxnId === t.id ? null : t.id); setSplitParts([{ amount: '', description: '' }, { amount: '', description: '' }]) }}
                              className="p-1 rounded text-amber-500 hover:text-amber-700 hover:bg-amber-50 transition-colors" title="Dividir">
                              <Scissors className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button onClick={() => setAttachTxnId(t.id)}
                            className={`p-1 rounded transition-colors relative ${txnsWithReceipts.has(t.id) ? 'text-emerald-500 hover:text-emerald-700' : 'text-stone-400 hover:text-stone-600'}`}
                            title={txnsWithReceipts.has(t.id) ? 'Documentos adjuntos ✓' : 'Adjuntar recibo'}>
                            <Paperclip className="w-4 h-4" />
                            {txnsWithReceipts.has(t.id) && <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500 absolute -top-0.5 -right-0.5" />}
                          </button>
                          {t.status !== 'voided' && (
                            <button onClick={() => handleVoid(t)} disabled={busyId === t.id}
                              className="p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Anular">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        {/* Split popover */}
                        {splitTxnId === t.id && (
                          <div className="absolute right-0 z-20 w-80 bg-white border rounded-lg shadow-xl p-3 text-left mt-1" style={{ borderColor: 'var(--stone)' }}>
                            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--ink)' }}>Dividir ${Math.abs(t.amount).toFixed(2)}</p>
                            {splitParts.map((part, i) => (
                              <div key={i} className="flex items-center gap-1 mb-1.5">
                                <span className="text-[10px] text-stone-400 w-4">{i + 1}.</span>
                                <input type="number" step="0.01" placeholder="Monto" value={part.amount}
                                  onChange={e => { const p = [...splitParts]; p[i].amount = e.target.value; setSplitParts(p) }}
                                  className="w-20 text-xs px-1.5 py-1 rounded border" style={{ borderColor: 'var(--stone)' }} />
                                <input type="text" placeholder="Descripción" value={part.description}
                                  onChange={e => { const p = [...splitParts]; p[i].description = e.target.value; setSplitParts(p) }}
                                  className="flex-1 text-xs px-1.5 py-1 rounded border" style={{ borderColor: 'var(--stone)' }} />
                                {splitParts.length > 2 && (
                                  <button onClick={() => setSplitParts(splitParts.filter((_, j) => j !== i))} className="text-red-400"><X className="w-3 h-3" /></button>
                                )}
                              </div>
                            ))}
                            <div className="flex items-center justify-between mt-2">
                              <button onClick={() => setSplitParts([...splitParts, { amount: '', description: '' }])}
                                className="text-[10px] text-blue-600 hover:underline">+ Añadir parte</button>
                              <div className="flex gap-1">
                                <button onClick={() => setSplitTxnId(null)} className="text-xs px-2 py-1 rounded border" style={{ borderColor: 'var(--stone)' }}>Cancelar</button>
                                <button onClick={() => handleSplitTxn(t.id)} className="text-xs px-2 py-1 rounded text-white" style={{ backgroundColor: 'var(--gold-600)' }}>Dividir</button>
                              </div>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {transactions.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-12 text-center" style={{ color: 'var(--ash)' }}>No hay transacciones para estos filtros</td></tr>
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

      {/* Attachment modal */}
      {attachTxnId && <TransactionAttachments transactionId={attachTxnId} onClose={() => { setAttachTxnId(null); onRefresh() }} />}

      {/* Edit modal */}
      {editTxn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={() => setEditTxn(null)}>
          <div className="card-luxury p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>Editar transacción</h3>
              <button onClick={() => setEditTxn(null)}><X className="w-5 h-5" style={{ color: 'var(--ash)' }} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium" style={{ color: 'var(--slate)' }}>Monto</label>
                <input type="number" step="0.01" value={editForm.amount} onChange={e => setEditForm({ ...editForm, amount: e.target.value })}
                  className="w-full mt-1 px-3 py-2 text-sm rounded-lg border" style={{ borderColor: 'var(--stone)' }} />
              </div>
              <div>
                <label className="text-xs font-medium" style={{ color: 'var(--slate)' }}>Descripción</label>
                <input type="text" value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full mt-1 px-3 py-2 text-sm rounded-lg border" style={{ borderColor: 'var(--stone)' }} />
              </div>
              <div>
                <label className="text-xs font-medium" style={{ color: 'var(--slate)' }}>Contraparte</label>
                <input type="text" value={editForm.counterparty_name} onChange={e => setEditForm({ ...editForm, counterparty_name: e.target.value })}
                  className="w-full mt-1 px-3 py-2 text-sm rounded-lg border" style={{ borderColor: 'var(--stone)' }} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setEditTxn(null)} className="text-sm px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--stone)' }}>Cancelar</button>
                <button onClick={handleEditSave} disabled={busyId === editTxn.id} className="text-sm px-3 py-2 rounded-lg text-white disabled:opacity-50" style={{ backgroundColor: 'var(--gold-600)' }}>Guardar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reclassify modal */}
      {reclassTxn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={() => setReclassTxn(null)}>
          <div className="card-luxury p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>Reclasificar cuenta</h3>
              <button onClick={() => setReclassTxn(null)}><X className="w-5 h-5" style={{ color: 'var(--ash)' }} /></button>
            </div>
            <p className="text-xs mb-4" style={{ color: 'var(--ash)' }}>
              Cambia la cuenta contable de esta transacción sin re-postear. El asiento del banco no se toca.
            </p>
            <div className="mb-3 text-sm" style={{ color: 'var(--slate)' }}>
              Cuenta actual: <span className="font-mono">{reclassTxn.capital_accounts?.code} {reclassTxn.capital_accounts?.name}</span>
            </div>
            <label className="text-xs font-medium" style={{ color: 'var(--slate)' }}>Nueva cuenta</label>
            <select value={reclassCode} onChange={e => setReclassCode(e.target.value)}
              className="w-full mt-1 px-3 py-2 text-sm rounded-lg border" style={{ borderColor: 'var(--stone)' }}>
              <option value="">Elegí una cuenta…</option>
              {acctOptions.map(a => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
            </select>
            <div className="flex justify-end gap-2 pt-4">
              <button onClick={() => setReclassTxn(null)} className="text-sm px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--stone)' }}>Cancelar</button>
              <button onClick={handleReclassify} disabled={!reclassCode || busyId === reclassTxn.id} className="text-sm px-3 py-2 rounded-lg text-white disabled:opacity-50" style={{ backgroundColor: 'var(--gold-600)' }}>Reclasificar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


// ── Transaction Attachments (Recibos) ──
function TransactionAttachments({ transactionId, onClose }: { transactionId: string; onClose: () => void }) {
  const toast = useToast()
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [viewReceipt, setViewReceipt] = useState<ReceiptRecord | null>(null)

  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const cameraInputRef = React.useRef<HTMLInputElement>(null)

  const fetchReceipts = useCallback(async () => {
    try {
      const res = await fetch(`/api/capital/accounting/receipts?transaction_id=${transactionId}`)
      if (res.ok) setReceipts(await res.json())
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [transactionId])

  useEffect(() => { fetchReceipts() }, [fetchReceipts])

  const handleUpload = async (file: File) => {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('transaction_id', transactionId)
      const res = await fetch('/api/capital/accounting/receipts', { method: 'POST', body: formData })
      if (res.ok) {
        toast.success('Documento adjuntado')
        fetchReceipts()
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.detail || 'No se pudo subir el documento')
      }
    } catch { toast.error('Error de conexión') }
    finally { setUploading(false) }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleUpload(file)
    e.target.value = ''
  }

  const deleteReceipt = async (id: string) => {
    if (!confirm('¿Eliminar este documento?')) return
    try {
      const res = await fetch(`/api/capital/accounting/receipts/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setReceipts(prev => prev.filter(r => r.id !== id))
        if (viewReceipt?.id === id) setViewReceipt(null)
      }
    } catch { toast.error('Error de conexión') }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--sand)' }}>
          <h3 className="font-serif font-semibold" style={{ color: 'var(--ink)' }}>Documentos Adjuntos</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-stone-100"><X className="w-5 h-5" style={{ color: 'var(--slate)' }} /></button>
        </div>

        {/* Upload buttons */}
        <div className="p-4 border-b flex flex-wrap gap-2" style={{ borderColor: 'var(--sand)' }}>
          <button onClick={() => cameraInputRef.current?.click()} disabled={uploading}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors hover:bg-sand/50"
            style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            Tomar Foto
          </button>
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors hover:bg-sand/50"
            style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Subir Archivo
          </button>
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} className="hidden" />
          <input ref={fileInputRef} type="file" accept="image/*,.pdf" onChange={handleFileChange} className="hidden" />
        </div>

        {/* Documents list */}
        <div className="p-4 overflow-y-auto max-h-[50vh]">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--ash)' }} /></div>
          ) : receipts.length === 0 ? (
            <div className="text-center py-8">
              <ImageIcon className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--ash)' }} />
              <p className="text-sm" style={{ color: 'var(--ash)' }}>Sin documentos adjuntos</p>
              <p className="text-xs mt-1" style={{ color: 'var(--ash)' }}>Sube una foto de recibo, factura o comprobante</p>
            </div>
          ) : (
            <div className="space-y-2">
              {receipts.map(r => (
                <div key={r.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-sand/30 group">
                  <div className="w-12 h-12 rounded-lg overflow-hidden bg-stone-100 flex-shrink-0 cursor-pointer" onClick={() => setViewReceipt(r)}>
                    {r.file_type === 'pdf' ? (
                      <div className="w-full h-full flex items-center justify-center"><FileText className="w-6 h-6" style={{ color: 'var(--slate)' }} /></div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.file_url} alt={r.original_filename || ''} className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setViewReceipt(r)}>
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--charcoal)' }}>{r.original_filename || 'Documento'}</p>
                    <p className="text-xs" style={{ color: 'var(--ash)' }}>{new Date(r.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </div>
                  <button onClick={() => deleteReceipt(r.id)}
                    className="p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50">
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Image viewer overlay */}
      {viewReceipt && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4" onClick={() => setViewReceipt(null)}>
          <div className="relative max-w-3xl max-h-[90vh] w-full" onClick={e => e.stopPropagation()}>
            <button onClick={() => setViewReceipt(null)} className="absolute -top-3 -right-3 z-10 p-2 rounded-full bg-white shadow-lg hover:bg-stone-100">
              <X className="w-5 h-5" style={{ color: 'var(--charcoal)' }} />
            </button>
            {viewReceipt.file_type === 'pdf' ? (
              <iframe src={viewReceipt.file_url} className="w-full h-[80vh] rounded-lg bg-white" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={viewReceipt.file_url} alt="Documento" className="w-full max-h-[80vh] object-contain rounded-lg bg-white" />
            )}
          </div>
        </div>
      )}
    </div>
  )
}


// ════════════════════════════════════════════════════════════════════════
//  INVOICES TAB (Facturación AR / AP)
// ════════════════════════════════════════════════════════════════════════
function InvoicesTab({ bankAccounts }: { bankAccounts: BankAccount[] }) {
  const toast = useToast()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [direction, setDirection] = useState<'' | 'receivable' | 'payable'>('')
  const [statusFilter, setStatusFilter] = useState('')
  const [aging, setAging] = useState<any>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showNewInvoice, setShowNewInvoice] = useState(false)
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null)
  const [generatingRto, setGeneratingRto] = useState(false)

  const fetchInvoices = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (direction) params.set('direction', direction)
      const res = await fetch(`/api/capital/accounting/invoices?${params}`)
      if (res.ok) { const d = await res.json(); setInvoices(d.invoices || []) }
      const agRes = await fetch(`/api/capital/accounting/invoices/aging/summary?direction=${direction || 'receivable'}`)
      if (agRes.ok) setAging(await agRes.json())
    } catch (e) { /* ignore */ }
    finally { setLoading(false) }
  }, [direction])

  useEffect(() => { fetchInvoices() }, [fetchInvoices])

  const handleDeleteInvoice = async (inv: Invoice) => {
    if (!confirm(`¿Eliminar la factura ${inv.invoice_number} (${fmtFull(inv.total_amount)})?\n\nSe borrarán también sus asientos contables. Esta acción no se puede deshacer.`)) return
    setDeletingId(inv.id)
    try {
      const res = await fetch(`/api/capital/accounting/invoices/${inv.id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Factura eliminada')
        setInvoices(prev => prev.filter(i => i.id !== inv.id))
      } else {
        const d = await res.json().catch(() => ({}))
        toast.error(d.detail || 'No se pudo eliminar la factura')
      }
    } catch { toast.error('Error de conexión') }
    finally { setDeletingId(null) }
  }

  const handleGenerateRto = async () => {
    setGeneratingRto(true)
    try {
      const res = await fetch('/api/capital/accounting/invoices/generate-rto', { method: 'POST' })
      if (res.ok) {
        const d = await res.json()
        toast.success(`Facturas RTO: ${d.created ?? 0} creadas, ${d.skipped ?? 0} omitidas`)
        fetchInvoices()
      } else {
        const d = await res.json().catch(() => ({}))
        toast.error(d.detail || 'Error al generar facturas RTO')
      }
    } catch { toast.error('Error de conexión') }
    finally { setGeneratingRto(false) }
  }

  const dirLabel: Record<string, string> = { receivable: 'Por Cobrar', payable: 'Por Pagar' }
  const filteredInvoices = statusFilter ? invoices.filter(i => i.status === statusFilter) : invoices

  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--stone)' }}>
          {([['', 'Todas'], ['receivable', '↑ Por Cobrar'], ['payable', '↓ Por Pagar']] as const).map(([val, label]) => (
            <button key={val} onClick={() => setDirection(val as any)}
              className="px-4 py-2 text-sm font-medium transition-colors"
              style={direction === val ? { backgroundColor: 'var(--gold-600)', color: 'white' } : { color: 'var(--charcoal)' }}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={handleGenerateRto} disabled={generatingRto}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors hover:bg-sand/50 disabled:opacity-50"
            style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>
            {generatingRto ? <Loader2 className="w-4 h-4 animate-spin" /> : <Repeat className="w-4 h-4" />}
            {generatingRto ? 'Generando...' : 'Generar facturas RTO'}
          </button>
          <button onClick={() => window.open(`/api/capital/accounting/export/invoices${direction ? `?direction=${direction}` : ''}`, '_blank')}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors hover:bg-sand/50"
            style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>
            <Download className="w-4 h-4" /> Exportar CSV
          </button>
          <button onClick={() => setShowNewInvoice(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg"
            style={{ backgroundColor: 'var(--gold-600)' }}>
            <Plus className="w-4 h-4" /> Nueva Factura
          </button>
        </div>
      </div>

      {/* Aging Report */}
      {aging && aging.total > 0 && (
        <div className="card-luxury p-6">
          <h3 className="font-semibold text-base mb-4 flex items-center gap-2" style={{ color: 'var(--ink)' }}>
            <AlertCircle className="w-5 h-5 text-amber-500" /> Antigüedad de Cuentas {direction === 'payable' ? 'por Pagar' : 'por Cobrar'}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[['current', 'Al día'], ['1_30', '1-30 días'], ['31_60', '31-60 días'], ['61_90', '61-90 días'], ['over_90', '+90 días']].map(([key, label]) => (
              <div key={key} className="text-center p-3 rounded-lg" style={{ backgroundColor: key === 'over_90' && (aging.buckets?.[key] || 0) > 0 ? '#fef2f2' : key === 'current' ? '#ecfdf5' : 'var(--ivory)' }}>
                <p className="text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>{label}</p>
                <p className={`text-lg font-bold ${key === 'over_90' && (aging.buckets?.[key] || 0) > 0 ? 'text-red-600' : key === 'current' ? 'text-emerald-600' : ''}`}
                  style={key !== 'over_90' && key !== 'current' ? { color: 'var(--charcoal)' } : {}}>
                  {fmt(aging.buckets?.[key] || 0)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setStatusFilter('')}
          className="px-3 py-1.5 text-xs font-medium rounded-full border transition-colors"
          style={statusFilter === '' ? { backgroundColor: 'var(--gold-600)', color: 'white', borderColor: 'var(--gold-600)' } : { borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>
          Todas ({invoices.length})
        </button>
        {Object.entries(INVOICE_STATUS_LABELS).map(([key, label]) => {
          const count = invoices.filter(i => i.status === key).length
          if (count === 0) return null
          return (
            <button key={key} onClick={() => setStatusFilter(statusFilter === key ? '' : key)}
              className="px-3 py-1.5 text-xs font-medium rounded-full border transition-colors"
              style={statusFilter === key ? { backgroundColor: 'var(--gold-600)', color: 'white', borderColor: 'var(--gold-600)' } : { borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>
              {label} ({count})
            </button>
          )
        })}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--gold-600)' }} /></div>
      ) : filteredInvoices.length === 0 ? (
        <div className="text-center py-12 card-luxury">
          <FileText className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--ash)' }} />
          <p className="text-sm" style={{ color: 'var(--ash)' }}>No hay facturas. Crea una nueva factura para empezar.</p>
        </div>
      ) : (
        <div className="card-luxury overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b" style={{ borderColor: 'var(--sand)', backgroundColor: 'var(--pearl)' }}>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--ash)' }}>Número</th>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--ash)' }}>Tipo</th>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--ash)' }}>Contraparte</th>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--ash)' }}>Emisión</th>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--ash)' }}>Vencimiento</th>
                <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--ash)' }}>Total</th>
                <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--ash)' }}>Pagado</th>
                <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--ash)' }}>Pendiente</th>
                <th className="px-4 py-3 text-center font-medium" style={{ color: 'var(--ash)' }}>Estado</th>
                <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--ash)' }}>Acciones</th>
              </tr></thead>
              <tbody>
                {filteredInvoices.map(inv => (
                  <tr key={inv.id} className="border-b hover:bg-sand/20 transition-colors cursor-pointer" style={{ borderColor: 'var(--sand)' }}
                    onClick={() => setDetailInvoice(inv)}>
                    <td className="px-4 py-3 font-medium text-sm" style={{ color: 'var(--charcoal)' }}>{inv.invoice_number}</td>
                    <td className="px-4 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${inv.direction === 'receivable' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{dirLabel[inv.direction]}</span></td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--charcoal)' }}>{inv.counterparty_name}</td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--slate)' }}>{inv.issue_date || '—'}</td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--slate)' }}>{inv.due_date || '—'}</td>
                    <td className="px-4 py-3 text-right font-medium" style={{ color: 'var(--charcoal)' }}>{fmtFull(inv.total_amount)}</td>
                    <td className="px-4 py-3 text-right text-emerald-600 font-medium">{fmtFull(inv.amount_paid)}</td>
                    <td className="px-4 py-3 text-right font-bold" style={{ color: inv.balance_due > 0 ? '#dc2626' : 'var(--charcoal)' }}>{fmtFull(inv.balance_due)}</td>
                    <td className="px-4 py-3 text-center"><span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${INVOICE_STATUS_COLORS[inv.status] || 'bg-gray-100 text-gray-600'}`}>{INVOICE_STATUS_LABELS[inv.status] || inv.status}</span></td>
                    <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setDetailInvoice(inv)} title="Ver detalle"
                          className="p-1.5 rounded-lg hover:bg-sand/50 transition-colors">
                          <Eye className="w-4 h-4" style={{ color: 'var(--gold-600)' }} />
                        </button>
                        <button onClick={() => handleDeleteInvoice(inv)} disabled={deletingId === inv.id} title="Eliminar factura"
                          className="p-1.5 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50">
                          {deletingId === inv.id
                            ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--danger)' }} />
                            : <Trash2 className="w-4 h-4" style={{ color: 'var(--danger)' }} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      {showNewInvoice && <NewCapitalInvoiceModal onClose={() => setShowNewInvoice(false)} onCreated={() => { setShowNewInvoice(false); fetchInvoices() }} />}
      {detailInvoice && (
        <InvoiceDetailModal invoiceId={detailInvoice.id} bankAccounts={bankAccounts}
          onClose={() => setDetailInvoice(null)} onChanged={fetchInvoices} />
      )}
    </div>
  )
}

function NewCapitalInvoiceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast()
  const [form, setForm] = useState({
    direction: 'receivable' as 'receivable' | 'payable',
    counterparty_name: '', total_amount: '',
    issue_date: new Date().toISOString().split('T')[0],
    due_date: '', description: '', notes: '', payment_terms: 'Due on receipt',
  })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!form.counterparty_name || !form.total_amount) { toast.warning('Nombre y monto son requeridos'); return }
    setSaving(true)
    try {
      const total = parseFloat(form.total_amount)
      const body: any = {
        ...form,
        counterparty_type: form.direction === 'receivable' ? 'client' : 'vendor',
        total_amount: total, subtotal: total, tax_amount: 0,
      }
      Object.keys(body).forEach(k => { if (body[k] === '') delete body[k] })
      const res = await fetch('/api/capital/accounting/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        toast.success('Factura creada')
        onCreated()
      } else {
        const d = await res.json().catch(() => ({}))
        toast.error(d.detail || 'Error al crear factura')
      }
    } catch { toast.error('Error de conexión') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>Nueva Factura</h2>
          <button onClick={onClose}><X className="w-5 h-5" style={{ color: 'var(--ash)' }} /></button>
        </div>

        <div className="space-y-3">
          <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--stone)' }}>
            <button onClick={() => setForm(f => ({ ...f, direction: 'receivable' }))}
              className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-2 ${form.direction === 'receivable' ? 'bg-emerald-500 text-white' : ''}`}
              style={form.direction !== 'receivable' ? { color: 'var(--charcoal)' } : undefined}>
              <ArrowUpRight className="w-4 h-4" /> Por Cobrar
            </button>
            <button onClick={() => setForm(f => ({ ...f, direction: 'payable' }))}
              className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-2 ${form.direction === 'payable' ? 'bg-red-500 text-white' : ''}`}
              style={form.direction !== 'payable' ? { color: 'var(--charcoal)' } : undefined}>
              <ArrowDownRight className="w-4 h-4" /> Por Pagar
            </button>
          </div>

          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>{form.direction === 'receivable' ? 'Cliente' : 'Proveedor'} <span className="text-red-500">*</span></label>
            <input type="text" value={form.counterparty_name} onChange={e => setForm(f => ({ ...f, counterparty_name: e.target.value }))}
              className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Monto ($) <span className="text-red-500">*</span></label>
              <input type="number" step="0.01" value={form.total_amount} onChange={e => setForm(f => ({ ...f, total_amount: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} placeholder="0.00" />
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Fecha de emisión</label>
              <input type="date" value={form.issue_date} onChange={e => setForm(f => ({ ...f, issue_date: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Vencimiento</label>
              <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} />
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Términos de pago</label>
              <input type="text" value={form.payment_terms} onChange={e => setForm(f => ({ ...f, payment_terms: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Descripción</label>
            <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} placeholder="Concepto de la factura" />
          </div>

          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Notas</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} rows={2} />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm rounded-lg border" style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>Cancelar</button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ backgroundColor: form.direction === 'receivable' ? '#059669' : '#dc2626' }}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            {saving ? 'Creando...' : `Crear ${form.direction === 'receivable' ? 'Factura' : 'Bill'}`}
          </button>
        </div>
      </div>
    </div>
  )
}

function InvoiceDetailModal({ invoiceId, bankAccounts, onClose, onChanged }: {
  invoiceId: string; bankAccounts: BankAccount[]; onClose: () => void; onChanged: () => void
}) {
  const toast = useToast()
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [payments, setPayments] = useState<InvoicePayment[]>([])
  const [loading, setLoading] = useState(true)
  const [showPayModal, setShowPayModal] = useState(false)

  const fetchDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/capital/accounting/invoices/${invoiceId}`)
      if (res.ok) {
        const d = await res.json()
        setInvoice(d.invoice || null)
        setPayments(d.payments || [])
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [invoiceId])

  useEffect(() => { fetchDetail() }, [fetchDetail])

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>Detalle de Factura</h2>
          <button onClick={onClose}><X className="w-5 h-5" style={{ color: 'var(--ash)' }} /></button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--gold-600)' }} /></div>
        ) : !invoice ? (
          <p className="text-sm text-center py-8" style={{ color: 'var(--ash)' }}>No se pudo cargar la factura</p>
        ) : (
          <div className="space-y-4">
            {/* Header info */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold" style={{ color: 'var(--ink)' }}>{invoice.invoice_number}</p>
                <p className="text-sm" style={{ color: 'var(--slate)' }}>{invoice.counterparty_name}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${invoice.direction === 'receivable' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                  {invoice.direction === 'receivable' ? 'Por Cobrar' : 'Por Pagar'}
                </span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${INVOICE_STATUS_COLORS[invoice.status] || 'bg-gray-100 text-gray-600'}`}>
                  {INVOICE_STATUS_LABELS[invoice.status] || invoice.status}
                </span>
              </div>
            </div>

            {/* Amounts */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg text-center" style={{ backgroundColor: 'var(--pearl)' }}>
                <p className="text-[10px] uppercase font-medium" style={{ color: 'var(--ash)' }}>Total</p>
                <p className="font-bold" style={{ color: 'var(--ink)' }}>{fmtFull(invoice.total_amount)}</p>
              </div>
              <div className="p-3 rounded-lg text-center bg-emerald-50">
                <p className="text-[10px] uppercase font-medium text-emerald-600">Pagado</p>
                <p className="font-bold text-emerald-700">{fmtFull(invoice.amount_paid)}</p>
              </div>
              <div className="p-3 rounded-lg text-center" style={{ backgroundColor: invoice.balance_due > 0 ? '#fef2f2' : 'var(--pearl)' }}>
                <p className="text-[10px] uppercase font-medium" style={{ color: invoice.balance_due > 0 ? '#dc2626' : 'var(--ash)' }}>Pendiente</p>
                <p className="font-bold" style={{ color: invoice.balance_due > 0 ? '#dc2626' : 'var(--ink)' }}>{fmtFull(invoice.balance_due)}</p>
              </div>
            </div>

            {/* Dates + descriptions */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs" style={{ color: 'var(--ash)' }}>Emisión</p><p style={{ color: 'var(--charcoal)' }}>{invoice.issue_date || '—'}</p></div>
              <div><p className="text-xs" style={{ color: 'var(--ash)' }}>Vencimiento</p><p style={{ color: 'var(--charcoal)' }}>{invoice.due_date || '—'}</p></div>
              {invoice.description && <div className="col-span-2"><p className="text-xs" style={{ color: 'var(--ash)' }}>Descripción</p><p style={{ color: 'var(--charcoal)' }}>{invoice.description}</p></div>}
              {invoice.notes && <div className="col-span-2"><p className="text-xs" style={{ color: 'var(--ash)' }}>Notas</p><p style={{ color: 'var(--charcoal)' }}>{invoice.notes}</p></div>}
            </div>

            {/* Payment history */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>Historial de Pagos</h4>
                {invoice.balance_due > 0 && invoice.status !== 'voided' && (
                  <button onClick={() => setShowPayModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-lg"
                    style={{ backgroundColor: 'var(--gold-600)' }}>
                    <CircleDollarSign className="w-3.5 h-3.5" /> Registrar pago
                  </button>
                )}
              </div>
              {payments.length === 0 ? (
                <p className="text-sm text-center py-4" style={{ color: 'var(--ash)' }}>Sin pagos registrados</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {payments.map(p => (
                    <div key={p.id} className="flex items-center justify-between py-2 px-3 rounded-lg border" style={{ borderColor: 'var(--sand)' }}>
                      <div>
                        <p className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>{p.payment_date || (p.created_at || '').slice(0, 10)}</p>
                        <p className="text-xs" style={{ color: 'var(--ash)' }}>
                          {PAYMENT_LABELS[p.payment_method || ''] || p.payment_method || '—'}
                          {p.payment_reference && ` · Ref: ${p.payment_reference}`}
                        </p>
                      </div>
                      <span className="font-semibold text-sm text-emerald-600">+{fmtFull(p.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Register payment modal */}
      {showPayModal && invoice && (
        <RegisterInvoicePaymentModal invoice={invoice} bankAccounts={bankAccounts}
          onClose={() => setShowPayModal(false)}
          onPaid={() => { setShowPayModal(false); setLoading(true); fetchDetail(); onChanged() }} />
      )}
    </div>
  )
}

function RegisterInvoicePaymentModal({ invoice, bankAccounts, onClose, onPaid }: {
  invoice: Invoice; bankAccounts: BankAccount[]; onClose: () => void; onPaid: () => void
}) {
  const toast = useToast()
  const [banks, setBanks] = useState<BankAccount[]>(bankAccounts)
  const [form, setForm] = useState({
    amount: String(invoice.balance_due || ''),
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'bank_transfer',
    payment_reference: '',
    bank_account_id: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (banks.length === 0) {
      fetch('/api/capital/accounting/bank-accounts')
        .then(r => r.ok ? r.json() : { bank_accounts: [] })
        .then(d => setBanks(d.bank_accounts || []))
        .catch(() => {})
    }
  }, [banks.length])

  const handleSubmit = async () => {
    const amount = parseFloat(form.amount)
    if (!amount || amount <= 0) { toast.warning('Ingresa un monto válido'); return }
    if (!form.bank_account_id) { toast.warning('Selecciona la cuenta bancaria (requerido para el ledger)'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/capital/accounting/invoices/${invoice.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoice.id,
          amount,
          payment_date: form.payment_date || undefined,
          payment_method: form.payment_method || undefined,
          payment_reference: form.payment_reference || undefined,
          bank_account_id: form.bank_account_id,
          notes: form.notes || undefined,
        }),
      })
      if (res.ok) {
        toast.success('Pago registrado')
        onPaid()
      } else {
        const d = await res.json().catch(() => ({}))
        toast.error(d.detail || 'Error al registrar pago')
      }
    } catch { toast.error('Error de conexión') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>Registrar Pago</h2>
          <button onClick={onClose}><X className="w-5 h-5" style={{ color: 'var(--ash)' }} /></button>
        </div>
        <p className="text-xs mb-3" style={{ color: 'var(--slate)' }}>
          {invoice.invoice_number} · Pendiente: <strong>{fmtFull(invoice.balance_due)}</strong>
        </p>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Monto ($) <span className="text-red-500">*</span></label>
              <input type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} />
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Fecha</label>
              <input type="date" value={form.payment_date} onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Método</label>
              <select value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }}>
                {Object.entries(PAYMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Referencia</label>
              <input type="text" value={form.payment_reference} onChange={e => setForm(f => ({ ...f, payment_reference: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} placeholder="# confirmación" />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Cuenta Bancaria <span className="text-red-500">*</span></label>
            <select value={form.bank_account_id} onChange={e => setForm(f => ({ ...f, bank_account_id: e.target.value }))}
              className="w-full px-3 py-2 text-sm rounded-lg border mt-1"
              style={{ borderColor: form.bank_account_id ? 'var(--stone)' : '#f59e0b' }}>
              <option value="">Seleccionar cuenta...</option>
              {banks.map(b => <option key={b.id} value={b.id}>{b.name} ({b.bank_name || b.account_type})</option>)}
            </select>
            {!form.bank_account_id && <p className="text-[10px] mt-1 text-amber-600">Requerido — el pago se registra en el ledger de esta cuenta.</p>}
          </div>

          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Notas</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} rows={2} />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm rounded-lg border" style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>Cancelar</button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
            style={{ backgroundColor: 'var(--gold-600)' }}>
            {saving ? 'Registrando...' : 'Registrar Pago'}
          </button>
        </div>
      </div>
    </div>
  )
}



// ════════════════════════════════════════════════════════════════════════
//  RECURRING EXPENSES TAB (Gastos Recurrentes)
// ════════════════════════════════════════════════════════════════════════
function RecurringTab() {
  const toast = useToast()
  const [expenses, setExpenses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)

  const fetchExpenses = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/capital/accounting/recurring-expenses')
      if (res.ok) { const d = await res.json(); setExpenses(d.expenses || []) }
    } catch (e) { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchExpenses() }, [fetchExpenses])

  const handleDelete = async (id: string) => {
    if (!confirm('¿Desactivar este gasto recurrente?')) return
    try {
      const res = await fetch(`/api/capital/accounting/recurring-expenses/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Gasto recurrente desactivado')
        setExpenses(prev => prev.filter(e => e.id !== id))
      } else {
        toast.error('Error al desactivar')
      }
    } catch { toast.error('Error de conexión') }
  }

  const totalMonthly = expenses.reduce((sum, e) => {
    const f = e.frequency; const a = e.amount || 0
    return sum + (f === 'weekly' ? a * 4.33 : f === 'biweekly' ? a * 2.17 : f === 'monthly' ? a : f === 'quarterly' ? a / 3 : f === 'yearly' ? a / 12 : a)
  }, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm" style={{ color: 'var(--slate)' }}>{expenses.length} gastos recurrentes</p>
          {expenses.length > 0 && <p className="text-xs" style={{ color: 'var(--ash)' }}>≈ {fmt(totalMonthly)}/mes estimado</p>}
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg"
          style={{ backgroundColor: 'var(--gold-600)' }}>
          <Plus className="w-4 h-4" /> Nuevo Gasto Recurrente
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--gold-600)' }} /></div>
      ) : expenses.length === 0 ? (
        <div className="text-center py-12 card-luxury">
          <Repeat className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--ash)' }} />
          <p className="text-sm" style={{ color: 'var(--ash)' }}>No hay gastos recurrentes registrados</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {expenses.map(e => (
            <div key={e.id} className="card-luxury p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-medium text-sm" style={{ color: 'var(--charcoal)' }}>{e.name}</p>
                  {e.description && <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>{e.description}</p>}
                </div>
                <button onClick={() => handleDelete(e.id)} className="text-red-400 hover:text-red-600" title="Desactivar"><X className="w-4 h-4" /></button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-red-600">{fmtFull(e.amount)}</span>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100" style={{ color: 'var(--slate)' }}>{FREQ_LABELS[e.frequency] || e.frequency}</span>
              </div>
              {e.next_due_date && <p className="text-xs mt-2" style={{ color: 'var(--ash)' }}>Próximo: {e.next_due_date}</p>}
              {e.counterparty_name && <p className="text-xs" style={{ color: 'var(--ash)' }}>A: {e.counterparty_name}</p>}
            </div>
          ))}
        </div>
      )}

      {showNew && <NewCapitalRecurringModal onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); fetchExpenses() }} />}
    </div>
  )
}

function NewCapitalRecurringModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast()
  const [form, setForm] = useState({ name: '', amount: '', frequency: 'monthly', counterparty_name: '', description: '', next_due_date: '' })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!form.name || !form.amount) { toast.warning('Nombre y monto son requeridos'); return }
    setSaving(true)
    try {
      const body: any = { ...form, amount: parseFloat(form.amount) }
      Object.keys(body).forEach(k => { if (body[k] === '') delete body[k] })
      const res = await fetch('/api/capital/accounting/recurring-expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        toast.success('Gasto recurrente creado')
        onCreated()
      } else {
        const d = await res.json().catch(() => ({}))
        toast.error(d.detail || 'Error al crear gasto recurrente')
      }
    } catch { toast.error('Error de conexión') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>Nuevo Gasto Recurrente</h2>
          <button onClick={onClose}><X className="w-5 h-5" style={{ color: 'var(--ash)' }} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Nombre <span className="text-red-500">*</span></label>
            <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} placeholder="Ej: Seguro flota" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Monto ($) <span className="text-red-500">*</span></label>
              <input type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} placeholder="0.00" />
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Frecuencia</label>
              <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }}>
                {Object.entries(FREQ_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>A quién</label>
            <input type="text" value={form.counterparty_name} onChange={e => setForm(f => ({ ...f, counterparty_name: e.target.value }))}
              className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} />
          </div>
          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Próximo Pago</label>
            <input type="date" value={form.next_due_date} onChange={e => setForm(f => ({ ...f, next_due_date: e.target.value }))}
              className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} />
          </div>
          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Descripción</label>
            <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm rounded-lg border" style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>Cancelar</button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ backgroundColor: 'var(--gold-600)' }}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Repeat className="w-4 h-4" />}
            {saving ? 'Guardando...' : 'Crear'}
          </button>
        </div>
      </div>
    </div>
  )
}


// ════════════════════════════════════════════════════════════════════════
//  AUDIT TAB (Registro de Auditoría)
// ════════════════════════════════════════════════════════════════════════
function AuditTab() {
  const [entries, setEntries] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const perPage = 30

  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/capital/accounting/audit-log?page=${page}&per_page=${perPage}`)
        if (res.ok) {
          const d = await res.json()
          setEntries(d.entries || [])
          setTotal(d.total || 0)
        }
      } catch (e) { /* ignore */ }
      finally { setLoading(false) }
    })()
  }, [page])

  const actionLabels: Record<string, string> = { create: 'Creó', update: 'Modificó', delete: 'Eliminó', void: 'Anuló', reconcile: 'Concilió' }
  const actionColors: Record<string, string> = {
    create: 'bg-emerald-100 text-emerald-700', update: 'bg-blue-100 text-blue-700',
    delete: 'bg-red-100 text-red-700', void: 'bg-red-100 text-red-700', reconcile: 'bg-purple-100 text-purple-700',
  }
  const totalPages = Math.max(1, Math.ceil(total / perPage))

  return (
    <div className="space-y-4">
      <h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--ink)' }}>
        <History className="w-5 h-5" /> Registro de Auditoría
        {total > 0 && <span className="text-xs font-normal" style={{ color: 'var(--slate)' }}>({total} registros)</span>}
      </h3>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--gold-600)' }} /></div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12 card-luxury">
          <History className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--ash)' }} />
          <p className="text-sm" style={{ color: 'var(--ash)' }}>No hay registros de auditoría aún. Las acciones se registrarán automáticamente.</p>
        </div>
      ) : (
        <>
          <div className="card-luxury overflow-hidden">
            {entries.map((e, i) => (
              <div key={e.id || i} className="flex items-start gap-4 px-4 py-3 border-b last:border-0" style={{ borderColor: 'var(--sand)' }}>
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
                    {e.user_email || 'Sistema'} · {e.table_name} · {new Date(e.created_at).toLocaleString('es-MX')}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}
              className="flex items-center gap-1 px-3 py-2 text-sm rounded-lg border disabled:opacity-40"
              style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>
              <ChevronLeft className="w-4 h-4" /> Anterior
            </button>
            <span className="text-sm" style={{ color: 'var(--slate)' }}>Página {page} de {totalPages}</span>
            <button onClick={() => setPage(page + 1)} disabled={page >= totalPages}
              className="flex items-center gap-1 px-3 py-2 text-sm rounded-lg border disabled:opacity-40"
              style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>
              Siguiente <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </>
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

interface SavedStatement {
  id: string; portal: string; report_type: string; name: string
  as_of_date?: string; period_start?: string; period_end?: string
  total_assets?: number; total_liabilities?: number; total_equity?: number
  total_income?: number; total_expenses?: number; net_income?: number
  notes?: string; saved_by?: string; status: string; created_at: string
}

function StatementsTab() {
  const toast = useToast()
  const [activeStatement, setActiveStatement] = useState<'balance' | 'pnl' | 'cashflow' | 'customer' | 'vendor'>('balance')
  const [hideZeros, setHideZeros] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [cashFlow, setCashFlow] = useState<any | null>(null)
  const [partySummary, setPartySummary] = useState<any | null>(null)
  const [extraLoading, setExtraLoading] = useState(false)
  const [bsData, setBsData] = useState<BSTreeData | null>(null)
  const [plData, setPlData] = useState<PLTreeData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Drill-down: click an amount in the statements → see its transactions
  const [drill, setDrill] = useState<ReportNode | null>(null)
  const [drillTxns, setDrillTxns] = useState<any[]>([])
  const [drillLoading, setDrillLoading] = useState(false)

  useEffect(() => {
    if (!drill?.id) { setDrillTxns([]); return }
    let cancelled = false
    setDrillLoading(true)
    fetch(`/api/capital/accounting/transactions?account_id=${drill.id}&per_page=200`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setDrillTxns(d.ok ? (d.transactions || []) : []) })
      .catch(() => { if (!cancelled) setDrillTxns([]) })
      .finally(() => { if (!cancelled) setDrillLoading(false) })
    return () => { cancelled = true }
  }, [drill?.id])

  // Save / Saved reports state
  const [saving, setSaving] = useState(false)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveNotes, setSaveNotes] = useState('')
  const [savedReports, setSavedReports] = useState<SavedStatement[]>([])
  const [loadingSaved, setLoadingSaved] = useState(false)
  const [viewingSaved, setViewingSaved] = useState<SavedStatement | null>(null)
  const [viewingSavedData, setViewingSavedData] = useState<any>(null)
  const [editingReportId, setEditingReportId] = useState<string | null>(null)
  const [editingReportName, setEditingReportName] = useState('')

  const fetchSavedReports = useCallback(async () => {
    setLoadingSaved(true)
    try {
      const res = await fetch('/api/capital/accounting/reports/saved')
      if (res.ok) {
        const data = await res.json()
        setSavedReports(data.statements || [])
      }
    } catch (e) { console.error(e) }
    finally { setLoadingSaved(false) }
  }, [])

  useEffect(() => { fetchSavedReports() }, [fetchSavedReports])

  // Reusable report loader — used on mount and after edits
  const loadReport = useCallback(async (statement: 'balance' | 'pnl', options?: { silent?: boolean }) => {
    if (!options?.silent) { setLoading(true); setError(null) }
    try {
      if (statement === 'balance') {
        const res = await fetch('/api/capital/accounting/reports/balance-sheet-tree')
        const data = await res.json().catch(() => null)
        if (data) {
          setBsData(data)
        } else {
          setBsData({
            date: new Date().toISOString().slice(0, 10),
            assets: [], liabilities: [], equity: [],
            total_assets: 0, total_liabilities: 0, total_equity: 0, total_liabilities_and_equity: 0,
          })
          if (!options?.silent) setError('No se pudieron cargar las cuentas del Balance. Verifica que la migración 042 se haya ejecutado.')
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
          if (!options?.silent) setError('No se pudieron cargar las cuentas de P&L. Verifica que la migración 042 se haya ejecutado.')
        }
      }
    } catch (e) {
      console.error(e)
      if (!options?.silent) {
        setError('Error de conexión al cargar estados financieros.')
        if (statement === 'balance') {
          setBsData({ date: new Date().toISOString().slice(0, 10), assets: [], liabilities: [], equity: [], total_assets: 0, total_liabilities: 0, total_equity: 0, total_liabilities_and_equity: 0 })
        } else {
          const now = new Date()
          setPlData({ period: { start: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`, end: now.toISOString().slice(0,10) }, income: [], expenses: [], other_income: [], other_expenses: [], total_income: 0, gross_profit: 0, total_expenses: 0, net_operating_income: 0, total_other_income: 0, total_other_expenses: 0, net_other_income: 0, net_income: 0 })
        }
      }
    }
    finally { if (!options?.silent) setLoading(false) }
  }, [])

  useEffect(() => {
    setViewingSaved(null)
    setViewingSavedData(null)
    if (activeStatement === 'balance' || activeStatement === 'pnl') {
      loadReport(activeStatement)
      return
    }
    // Cash flow / customer / vendor use their own endpoints.
    setExtraLoading(true)
    const url = activeStatement === 'cashflow'
      ? '/api/capital/accounting/reports/cash-flow'
      : activeStatement === 'customer'
        ? '/api/capital/accounting/reports/customer-balance-summary'
        : '/api/capital/accounting/reports/vendor-balance-summary'
    fetch(url).then(r => r.json()).then(d => {
      if (activeStatement === 'cashflow') { setCashFlow(d); setPartySummary(null) }
      else { setPartySummary(d); setCashFlow(null) }
    }).catch(() => { setCashFlow(null); setPartySummary(null) })
      .finally(() => setExtraLoading(false))
  }, [activeStatement, loadReport])

  const handleSave = async () => {
    if (!saveName.trim()) { toast.warning('Ingresa un nombre para el reporte'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/capital/accounting/reports/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_type: activeStatement === 'balance' ? 'balance_sheet' : 'profit_loss',
          name: saveName.trim(),
          notes: saveNotes.trim() || undefined,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        toast.success(data.message || 'Reporte guardado')
        setShowSaveModal(false)
        setSaveName('')
        setSaveNotes('')
        fetchSavedReports()
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.detail || 'Error al guardar')
      }
    } catch (e) { toast.error('Error de conexión') }
    finally { setSaving(false) }
  }

  const handleViewSaved = async (stmt: SavedStatement) => {
    try {
      const res = await fetch(`/api/capital/accounting/reports/saved/${stmt.id}`)
      if (res.ok) {
        const data = await res.json()
        setViewingSaved(stmt)
        setViewingSavedData(data.statement?.report_data)
      }
    } catch (e) { toast.error('Error al cargar reporte guardado') }
  }

  const handleDeleteSaved = async (id: string) => {
    try {
      const res = await fetch(`/api/capital/accounting/reports/saved/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Reporte archivado')
        fetchSavedReports()
        if (viewingSaved?.id === id) { setViewingSaved(null); setViewingSavedData(null) }
      }
    } catch (e) { toast.error('Error al archivar reporte') }
  }

  const handleRenameReport = useCallback(async (id: string) => {
    const name = editingReportName.trim()
    if (!name) { setEditingReportId(null); return }
    try {
      const res = await fetch(`/api/capital/accounting/reports/saved/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (res.ok) {
        setSavedReports(prev => prev.map(r => r.id === id ? { ...r, name } : r))
        if (viewingSaved?.id === id) setViewingSaved(prev => prev ? { ...prev, name } : prev)
        toast.success('Nombre actualizado')
      } else {
        toast.error('Error al renombrar')
      }
    } catch { toast.error('Error de conexión') }
    setEditingReportId(null)
  }, [editingReportName, toast, viewingSaved])

  // ── Reset / Vaciar Cifras ──
  const [showResetModal, setShowResetModal] = useState(false)
  const [resetScope, setResetScope] = useState<'all' | 'profit_loss' | 'balance_sheet'>('all')
  const [resetting, setResetting] = useState(false)

  const handleResetBalances = async (scope?: string) => {
    setResetting(true)
    try {
      const res = await fetch('/api/capital/accounting/accounts/reset-balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: scope || resetScope }),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success(data.message || 'Cifras vaciadas')
        setShowResetModal(false)
        // Reload both reports
        loadReport('balance', { silent: true })
        loadReport('pnl', { silent: true })
      } else {
        toast.error(data.detail || 'Error al vaciar cifras')
      }
    } catch {
      toast.error('Error de conexión')
    }
    finally { setResetting(false) }
  }

  // Determine which data to render (live or saved)
  const renderBsData = viewingSaved?.report_type === 'balance_sheet' && viewingSavedData ? viewingSavedData as BSTreeData : bsData
  const renderPlData = viewingSaved?.report_type === 'profit_loss' && viewingSavedData ? viewingSavedData as PLTreeData : plData
  const isViewingSaved = !!viewingSaved

  return (
    <div className="space-y-4">
      {/* Tab buttons + Save button */}
      <div className="flex items-center justify-between flex-wrap gap-2">
      <div className="flex gap-2">
        {[
            { key: 'balance', label: 'Balance Sheet' },
            { key: 'pnl', label: 'Profit and Loss' },
            { key: 'cashflow', label: 'Cash Flow' },
            { key: 'customer', label: 'Saldos Clientes' },
            { key: 'vendor', label: 'Saldos Proveedores' },
        ].map(s => (
            <button key={s.key} onClick={() => { setActiveStatement(s.key as any); setViewingSaved(null); setViewingSavedData(null) }}
            className="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
              style={activeStatement === s.key && !isViewingSaved ? { backgroundColor: 'var(--gold-600)', color: 'white' } : { backgroundColor: 'var(--pearl)', color: 'var(--charcoal)' }}>
            {s.label}
          </button>
        ))}
        </div>
        {!isViewingSaved && (
          <div className="flex items-center gap-2">
            {(activeStatement === 'balance' || activeStatement === 'pnl') && (
              <>
                <button onClick={() => setCollapsed(c => !c)}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors hover:bg-sand/50"
                  style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>
                  {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />} {collapsed ? 'Expandir' : 'Colapsar'}
                </button>
                <button onClick={() => setHideZeros(z => !z)}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors hover:bg-sand/50"
                  style={hideZeros ? { borderColor: 'var(--gold-600)', color: 'var(--gold-700)' } : { borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>
                  <Eye className="w-4 h-4" /> {hideZeros ? 'Mostrar ceros' : 'Ocultar ceros'}
                </button>
              </>
            )}
            <button
              onClick={() => window.open(
                activeStatement === 'balance'
                  ? '/api/capital/accounting/reports/balance-sheet/export-csv'
                  : '/api/capital/accounting/reports/income-statement/export-csv',
                '_blank'
              )}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border transition-colors hover:bg-sand/50"
              style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>
              <Download className="w-4 h-4" /> Exportar CSV
            </button>
            <button onClick={() => setShowResetModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border transition-colors hover:bg-red-50"
              style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>
              <Trash2 className="w-4 h-4" /> Vaciar Cifras
            </button>
            <button onClick={() => { setSaveName(`${activeStatement === 'balance' ? 'Balance Sheet' : 'Profit & Loss'} — ${new Date().toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}`); setShowSaveModal(true) }}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors"
              style={{ backgroundColor: 'var(--gold-600)', color: 'white' }}>
              <Download className="w-4 h-4" /> Guardar Reporte
            </button>
          </div>
        )}
      </div>

      {/* Viewing saved banner */}
      {isViewingSaved && viewingSaved && (
        <div className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.3)' }}>
          <div className="flex items-center gap-2">
            <History className="w-4 h-4" style={{ color: '#7c3aed' }} />
            <span className="text-sm font-medium" style={{ color: '#7c3aed' }}>
              Viendo reporte guardado: {viewingSaved.name}
            </span>
            <span className="text-xs" style={{ color: '#9f7aea' }}>
              ({new Date(viewingSaved.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })})
            </span>
          </div>
          <button onClick={() => { setViewingSaved(null); setViewingSavedData(null) }}
            className="flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-lg transition-colors"
            style={{ backgroundColor: '#7c3aed', color: 'white' }}>
            <X className="w-3 h-3" /> Volver al actual
          </button>
        </div>
      )}

      {/* Info: auto-populate */}
      {!isViewingSaved && (
        <div className="flex items-center gap-2 p-3 rounded-lg text-xs" style={{ backgroundColor: 'var(--ivory)', color: 'var(--slate)' }}>
          <Sparkles className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--gold-600)' }} />
          <span>
            Los balances se calculan automáticamente desde transacciones y movimientos bancarios.
          </span>
        </div>
      )}

      {error && !isViewingSaved && (
        <div className="flex items-center gap-2 p-3 rounded-lg text-sm" style={{ backgroundColor: 'rgba(255,165,0,0.1)', color: 'var(--gold-700)', border: '1px solid var(--gold-400)' }}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && !isViewingSaved ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--gold-600)' }} /></div>
      ) : (
        <>
          {/* ── BALANCE SHEET ── */}
          {((activeStatement === 'balance' && !isViewingSaved) || viewingSaved?.report_type === 'balance_sheet') && renderBsData && (
            <div className="card-luxury p-6">
              <div className="text-center mb-6">
                <h2 className="font-serif text-xl font-bold" style={{ color: 'var(--ink)' }}>Balance Sheet</h2>
                <h3 className="text-sm font-semibold mt-1" style={{ color: 'var(--charcoal)' }}>MANINOS CAPITAL</h3>
                <p className="text-xs mt-1" style={{ color: 'var(--ash)' }}>As of {renderBsData.date}</p>
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
                  {renderBsData.assets.length === 0 && (
                    <p className="text-xs italic pl-4 py-1" style={{ color: 'var(--ash)' }}>No hay cuentas de tipo Asset cargadas aún</p>
                  )}
                  {renderBsData.assets.map(node => <ReportTreeNode key={node.id} node={node} depth={1} onDrill={setDrill} hideZeros={hideZeros} collapsed={collapsed} />)}
                  <div className="flex justify-between py-1.5 border-t font-bold text-sm mt-1" style={{ borderColor: 'var(--charcoal)' }}>
                    <span style={{ color: 'var(--ink)' }}>Total for Assets</span>
                    <span style={{ color: 'var(--ink)' }}>{fmtFull(renderBsData.total_assets)}</span>
                  </div>
                </div>

                {/* Liabilities and Equity */}
                <div className="mb-4">
                  <p className="font-bold text-sm py-1" style={{ color: 'var(--ink)' }}>Liabilities and Equity</p>

                  {/* Liabilities */}
                  <p className="font-semibold text-sm py-1 pl-4" style={{ color: 'var(--ink)' }}>Liabilities</p>
                  {renderBsData.liabilities.length === 0 && (
                    <p className="text-xs italic pl-8 py-1" style={{ color: 'var(--ash)' }}>No hay cuentas de tipo Liability cargadas aún</p>
                  )}
                  {renderBsData.liabilities.map(node => <ReportTreeNode key={node.id} node={node} depth={2} onDrill={setDrill} hideZeros={hideZeros} collapsed={collapsed} />)}
                  <div className="flex justify-between py-1 border-t font-semibold text-sm pl-4" style={{ borderColor: 'var(--sand)' }}>
                    <span style={{ color: 'var(--ink)' }}>Total for Liabilities</span>
                    <span style={{ color: 'var(--ink)' }}>{fmtFull(renderBsData.total_liabilities)}</span>
                </div>

                  {/* Equity */}
                  <p className="font-semibold text-sm py-1 pl-4 mt-2" style={{ color: 'var(--ink)' }}>Equity</p>
                  {renderBsData.equity.length === 0 && (
                    <p className="text-xs italic pl-8 py-1" style={{ color: 'var(--ash)' }}>No hay cuentas de tipo Equity cargadas aún</p>
                  )}
                  {renderBsData.equity.map(node => <ReportTreeNode key={node.id} node={node} depth={2} onDrill={setDrill} hideZeros={hideZeros} collapsed={collapsed} />)}
                  <div className="flex justify-between py-1 border-t font-semibold text-sm pl-4" style={{ borderColor: 'var(--sand)' }}>
                    <span style={{ color: 'var(--ink)' }}>Total for Equity</span>
                    <span style={{ color: 'var(--ink)' }}>{fmtFull(renderBsData.total_equity)}</span>
              </div>
                </div>

                {/* Grand Total */}
                <div className="flex justify-between py-2 border-t-2 border-b-2 font-bold text-sm" style={{ borderColor: 'var(--charcoal)' }}>
                  <span style={{ color: 'var(--ink)' }}>Total for Liabilities and Equity</span>
                  <span style={{ color: 'var(--ink)' }}>{fmtFull(renderBsData.total_liabilities_and_equity)}</span>
                </div>
              </div>

              <p className="text-[10px] text-center mt-6" style={{ color: 'var(--ash)' }}>
                Accrual Basis · {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
          )}

          {/* ── PROFIT AND LOSS ── */}
          {((activeStatement === 'pnl' && !isViewingSaved) || viewingSaved?.report_type === 'profit_loss') && renderPlData && (
            <div className="card-luxury p-6">
              <div className="text-center mb-6">
                <h2 className="font-serif text-xl font-bold" style={{ color: 'var(--ink)' }}>Profit and Loss</h2>
                <h3 className="text-sm font-semibold mt-1" style={{ color: 'var(--charcoal)' }}>MANINOS CAPITAL</h3>
                <p className="text-xs mt-1" style={{ color: 'var(--ash)' }}>{renderPlData.period.start} — {renderPlData.period.end}</p>
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
                  {renderPlData.income.length === 0 && (
                    <p className="text-xs italic pl-4 py-1" style={{ color: 'var(--ash)' }}>No hay cuentas de tipo Income cargadas aún</p>
                  )}
                  {renderPlData.income.map(node => <ReportTreeNode key={node.id} node={node} depth={1} onDrill={setDrill} hideZeros={hideZeros} collapsed={collapsed} />)}
                  <div className="flex justify-between py-1 border-t font-semibold text-sm" style={{ borderColor: 'var(--sand)' }}>
                    <span style={{ color: 'var(--ink)' }}>Total for Income</span>
                    <span style={{ color: 'var(--ink)' }}>{fmtFull(renderPlData.total_income)}</span>
                  </div>
                </div>

                {/* Gross Profit */}
                <div className="flex justify-between py-2 border-t-2 border-b font-bold text-sm" style={{ borderColor: 'var(--charcoal)' }}>
                  <span style={{ color: 'var(--ink)' }}>Gross Profit</span>
                  <span style={{ color: 'var(--ink)' }}>{fmtFull(renderPlData.gross_profit)}</span>
                </div>

                {/* Expenses */}
                <div className="mb-2 mt-2">
                  <p className="font-bold text-sm py-1" style={{ color: 'var(--ink)' }}>Expenses</p>
                  {renderPlData.expenses.length === 0 && (
                    <p className="text-xs italic pl-4 py-1" style={{ color: 'var(--ash)' }}>No hay cuentas de tipo Expense cargadas aún</p>
                  )}
                  {renderPlData.expenses.map(node => <ReportTreeNode key={node.id} node={node} depth={1} onDrill={setDrill} hideZeros={hideZeros} collapsed={collapsed} />)}
                  <div className="flex justify-between py-1 border-t font-semibold text-sm" style={{ borderColor: 'var(--sand)' }}>
                    <span style={{ color: 'var(--ink)' }}>Total for Expenses</span>
                    <span style={{ color: 'var(--ink)' }}>{fmtFull(renderPlData.total_expenses)}</span>
                </div>
                </div>

                {/* Net Operating Income */}
                <div className="flex justify-between py-2 border-t-2 border-b font-bold text-sm" style={{ borderColor: 'var(--charcoal)' }}>
                  <span style={{ color: 'var(--ink)' }}>Net Operating Income</span>
                  <span style={{ color: renderPlData.net_operating_income < 0 ? 'var(--danger)' : 'var(--ink)' }}>{fmtFull(renderPlData.net_operating_income)}</span>
                </div>

                {/* Other Income */}
                {renderPlData.other_income.length > 0 && (
                  <div className="mb-2 mt-2">
                    <p className="font-bold text-sm py-1" style={{ color: 'var(--ink)' }}>Other Income</p>
                    {renderPlData.other_income.map(node => <ReportTreeNode key={node.id} node={node} depth={1} onDrill={setDrill} hideZeros={hideZeros} collapsed={collapsed} />)}
                    <div className="flex justify-between py-1 border-t font-semibold text-sm" style={{ borderColor: 'var(--sand)' }}>
                      <span style={{ color: 'var(--ink)' }}>Total for Other Income</span>
                      <span style={{ color: 'var(--ink)' }}>{fmtFull(renderPlData.total_other_income)}</span>
              </div>
            </div>
          )}

                {/* Other Expenses */}
                {renderPlData.other_expenses.length > 0 && (
                  <div className="mb-2 mt-2">
                    <p className="font-bold text-sm py-1" style={{ color: 'var(--ink)' }}>Other Expenses</p>
                    {renderPlData.other_expenses.map(node => <ReportTreeNode key={node.id} node={node} depth={1} onDrill={setDrill} hideZeros={hideZeros} collapsed={collapsed} />)}
                    <div className="flex justify-between py-1 border-t font-semibold text-sm" style={{ borderColor: 'var(--sand)' }}>
                      <span style={{ color: 'var(--ink)' }}>Total for Other Expenses</span>
                      <span style={{ color: 'var(--ink)' }}>{fmtFull(renderPlData.total_other_expenses)}</span>
              </div>
                  </div>
                )}

                {/* Net Other Income */}
                {(renderPlData.other_income.length > 0 || renderPlData.other_expenses.length > 0) && (
                  <div className="flex justify-between py-2 border-t font-semibold text-sm" style={{ borderColor: 'var(--sand)' }}>
                    <span style={{ color: 'var(--ink)' }}>Net Other Income</span>
                    <span style={{ color: renderPlData.net_other_income < 0 ? 'var(--danger)' : 'var(--ink)' }}>{fmtFull(renderPlData.net_other_income)}</span>
                  </div>
                )}

                {/* Net Income */}
                <div className="flex justify-between py-2 border-t-2 border-b-2 font-bold text-sm mt-2" style={{ borderColor: 'var(--charcoal)' }}>
                  <span style={{ color: 'var(--ink)' }}>Net Income</span>
                  <span style={{ color: renderPlData.net_income < 0 ? 'var(--danger)' : 'var(--ink)' }}>{fmtFull(renderPlData.net_income)}</span>
                </div>
              </div>

              <p className="text-[10px] text-center mt-6" style={{ color: 'var(--ash)' }}>
                Accrual Basis · {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
          )}
        </>
      )}

      {/* ── CASH FLOW ── */}
      {activeStatement === 'cashflow' && !isViewingSaved && (
        <div className="card-luxury p-6">
          <h2 className="font-serif text-lg mb-4" style={{ color: 'var(--ink)' }}>Flujo de Caja</h2>
          {extraLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--gold-600)' }} /></div>
          ) : !cashFlow || !(cashFlow.months || cashFlow.periods || cashFlow.data || []).length ? (
            <p className="text-sm text-center py-6" style={{ color: 'var(--slate)' }}>Sin datos de flujo de caja.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs" style={{ color: 'var(--ash)' }}>
                  <th className="pb-2 pr-3">Período</th>
                  <th className="pb-2 pr-3 text-right">Ingresos</th>
                  <th className="pb-2 pr-3 text-right">Gastos</th>
                  <th className="pb-2 text-right">Neto</th>
                </tr>
              </thead>
              <tbody>
                {(cashFlow.months || cashFlow.periods || cashFlow.data || []).map((m: any, i: number) => {
                  const inc = Number(m.income ?? m.inflow ?? m.total_income ?? 0)
                  const exp = Number(m.expense ?? m.outflow ?? m.total_expense ?? m.expenses ?? 0)
                  const net = m.net != null ? Number(m.net) : inc - exp
                  return (
                    <tr key={i} className="border-t" style={{ borderColor: 'var(--cream)' }}>
                      <td className="py-1.5 pr-3" style={{ color: 'var(--charcoal)' }}>{m.label || m.month || m.period || `#${i + 1}`}</td>
                      <td className="py-1.5 pr-3 text-right font-mono" style={{ color: 'var(--success)' }}>{fmtFull(inc)}</td>
                      <td className="py-1.5 pr-3 text-right font-mono" style={{ color: 'var(--danger)' }}>{fmtFull(exp)}</td>
                      <td className="py-1.5 text-right font-mono" style={{ color: net < 0 ? 'var(--danger)' : 'var(--ink)' }}>{fmtFull(net)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── SALDOS POR CLIENTE / PROVEEDOR ── */}
      {(activeStatement === 'customer' || activeStatement === 'vendor') && !isViewingSaved && (
        <div className="card-luxury p-6">
          <h2 className="font-serif text-lg mb-1" style={{ color: 'var(--ink)' }}>
            {activeStatement === 'customer' ? 'Saldos por Cliente (por cobrar)' : 'Saldos por Proveedor (por pagar)'}
          </h2>
          <p className="text-xs mb-4" style={{ color: 'var(--ash)' }}>Facturas abiertas agrupadas por contraparte.</p>
          {extraLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--gold-600)' }} /></div>
          ) : !partySummary || !(partySummary.parties || []).length ? (
            <p className="text-sm text-center py-6" style={{ color: 'var(--slate)' }}>No hay saldos abiertos.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs" style={{ color: 'var(--ash)' }}>
                  <th className="pb-2 pr-3">{activeStatement === 'customer' ? 'Cliente' : 'Proveedor'}</th>
                  <th className="pb-2 pr-3 text-center">Facturas</th>
                  <th className="pb-2 pr-3">Más antigua</th>
                  <th className="pb-2 pr-3 text-right">Vencido</th>
                  <th className="pb-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {partySummary.parties.map((p: any, i: number) => (
                  <tr key={i} className="border-t" style={{ borderColor: 'var(--cream)' }}>
                    <td className="py-1.5 pr-3" style={{ color: 'var(--charcoal)' }}>{p.counterparty_name}</td>
                    <td className="py-1.5 pr-3 text-center" style={{ color: 'var(--slate)' }}>{p.invoice_count}</td>
                    <td className="py-1.5 pr-3" style={{ color: 'var(--slate)' }}>{p.oldest_due_date || '—'}</td>
                    <td className="py-1.5 pr-3 text-right font-mono" style={{ color: p.overdue_due > 0 ? 'var(--danger)' : 'var(--ash)' }}>{fmtFull(p.overdue_due || 0)}</td>
                    <td className="py-1.5 text-right font-mono font-semibold" style={{ color: 'var(--ink)' }}>{fmtFull(p.total_due || 0)}</td>
                  </tr>
                ))}
                <tr className="border-t-2" style={{ borderColor: 'var(--charcoal)' }}>
                  <td className="py-2 font-bold" style={{ color: 'var(--ink)' }} colSpan={4}>Total</td>
                  <td className="py-2 text-right font-mono font-bold" style={{ color: 'var(--ink)' }}>{fmtFull(partySummary.total || 0)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── DRILL-DOWN: transacciones de una cuenta ── */}
      {drill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={() => setDrill(null)}>
          <div className="card-luxury p-6 w-full max-w-3xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>
                {drill.code && <span className="font-mono text-sm mr-2" style={{ color: 'var(--ash)' }}>{drill.code}</span>}
                {drill.name}
              </h3>
              <button onClick={() => setDrill(null)}><X className="w-5 h-5" style={{ color: 'var(--ash)' }} /></button>
            </div>
            <p className="text-xs mb-4" style={{ color: 'var(--ash)' }}>
              Saldo {fmtFull(drill.balance)} · {drillTxns.length} transacción(es)
            </p>
            {drillLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--gold-600)' }} /></div>
            ) : drillTxns.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: 'var(--slate)' }}>No hay transacciones para esta cuenta.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs" style={{ color: 'var(--ash)' }}>
                    <th className="pb-2 pr-3">Fecha</th>
                    <th className="pb-2 pr-3">Descripción</th>
                    <th className="pb-2 pr-3">Contraparte</th>
                    <th className="pb-2 text-right">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {drillTxns.map((t: any) => (
                    <tr key={t.id} className="border-t" style={{ borderColor: 'var(--cream)' }}>
                      <td className="py-1.5 pr-3 whitespace-nowrap" style={{ color: 'var(--slate)' }}>{t.transaction_date}</td>
                      <td className="py-1.5 pr-3" style={{ color: 'var(--charcoal)' }}>{t.description || '—'}</td>
                      <td className="py-1.5 pr-3" style={{ color: 'var(--slate)' }}>{t.counterparty_name || '—'}</td>
                      <td className="py-1.5 text-right font-mono" style={{ color: t.is_income ? 'var(--success)' : 'var(--danger)' }}>
                        {t.is_income ? '+' : '−'}{fmtFull(Math.abs(Number(t.amount) || 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── SAVED REPORTS ── */}
      <div className="card-luxury p-5 mt-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif text-base font-bold" style={{ color: 'var(--ink)' }}>
            <History className="w-4 h-4 inline-block mr-2" style={{ color: 'var(--gold-600)' }} />
            Reportes Guardados
          </h3>
                </div>
        {loadingSaved ? (
          <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--gold-600)' }} /></div>
        ) : savedReports.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: 'var(--ash)' }}>
            No hay reportes guardados. Usa el botón "Guardar Reporte" para crear un snapshot.
          </p>
        ) : (
          <div className="space-y-2">
            {savedReports.map(stmt => (
              <div key={stmt.id} className="group flex items-center justify-between p-3 rounded-lg border transition-colors hover:border-[var(--gold-300)]"
                style={{ borderColor: viewingSaved?.id === stmt.id ? 'var(--gold-500)' : 'var(--sand)', backgroundColor: viewingSaved?.id === stmt.id ? 'rgba(212,175,55,0.06)' : 'white' }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ backgroundColor: stmt.report_type === 'balance_sheet' ? 'rgba(59,130,246,0.1)' : 'rgba(16,185,129,0.1)', color: stmt.report_type === 'balance_sheet' ? '#3b82f6' : '#10b981' }}>
                      {stmt.report_type === 'balance_sheet' ? 'Balance' : 'P&L'}
                    </span>
                    {editingReportId === stmt.id ? (
                      <input
                        value={editingReportName}
                        onChange={e => setEditingReportName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRenameReport(stmt.id)
                          if (e.key === 'Escape') setEditingReportId(null)
                        }}
                        onBlur={() => handleRenameReport(stmt.id)}
                        autoFocus
                        className="text-sm font-medium px-2 py-0.5 border rounded w-48 focus:outline-none focus:ring-2 focus:ring-[var(--gold-400)]"
                        style={{ borderColor: 'var(--gold-400)', color: 'var(--ink)' }}
                      />
                    ) : (
                      <button
                        onClick={() => { setEditingReportId(stmt.id); setEditingReportName(stmt.name) }}
                        className="text-sm font-medium truncate flex items-center gap-1 hover:text-blue-700 transition-colors"
                        style={{ color: 'var(--ink)' }}
                        title="Editar nombre"
                      >
                        {stmt.name} <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100" style={{ color: 'var(--ash)' }} />
                      </button>
                    )}
              </div>
                  <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: 'var(--ash)' }}>
                    <span>{new Date(stmt.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    {stmt.report_type === 'balance_sheet' && stmt.total_assets != null && (
                      <span>Assets: {fmtFull(stmt.total_assets)}</span>
                    )}
                    {stmt.report_type === 'profit_loss' && stmt.net_income != null && (
                      <span>Net Income: {fmtFull(stmt.net_income)}</span>
                    )}
                    {stmt.notes && <span className="italic truncate max-w-[200px]">{stmt.notes}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <button onClick={() => handleViewSaved(stmt)} title="Ver reporte"
                    className="p-1.5 rounded-lg transition-colors hover:bg-[var(--pearl)]">
                    <Eye className="w-4 h-4" style={{ color: 'var(--gold-600)' }} />
                  </button>
                  <button onClick={() => handleDeleteSaved(stmt.id)} title="Archivar"
                    className="p-1.5 rounded-lg transition-colors hover:bg-red-50">
                    <Trash2 className="w-4 h-4" style={{ color: 'var(--danger)' }} />
                  </button>
                </div>
              </div>
            ))}
            </div>
          )}
      </div>

      {/* ── SAVE MODAL ── */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl mx-4">
            <h3 className="font-serif text-lg font-bold mb-4" style={{ color: 'var(--ink)' }}>
              Guardar {activeStatement === 'balance' ? 'Balance Sheet' : 'Profit & Loss'}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Nombre del reporte *</label>
                <input value={saveName} onChange={e => setSaveName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--gold-400)]"
                  style={{ borderColor: 'var(--sand)' }} placeholder="Ej: Balance Sheet Febrero 2026" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Notas (opcional)</label>
                <textarea value={saveNotes} onChange={e => setSaveNotes(e.target.value)} rows={2}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--gold-400)]"
                  style={{ borderColor: 'var(--sand)' }} placeholder="Notas adicionales..." />
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg text-xs mt-3"
              style={{ backgroundColor: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.3)', color: '#92400e' }}>
              <Lock className="w-4 h-4 flex-shrink-0" />
              <span>Este reporte se guardará como <strong>inmutable</strong> con un PDF adjunto que no podrá ser editado.</span>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowSaveModal(false)} className="px-4 py-2 text-sm rounded-lg" style={{ color: 'var(--charcoal)' }}>Cancelar</button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                style={{ backgroundColor: 'var(--gold-600)', color: 'white' }}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── RESET / VACIAR CIFRAS MODAL ── */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl mx-4">
            <h3 className="font-serif text-lg font-bold mb-2" style={{ color: 'var(--ink)' }}>Vaciar Cifras</h3>
            <p className="text-sm mb-4" style={{ color: 'var(--slate)' }}>
              Elimina transacciones de estados de cuenta, resetea movimientos y pone balances a $0.
            </p>
            <div className="space-y-2">
              <button onClick={() => handleResetBalances('all')}
                disabled={resetting}
                className="w-full text-left px-4 py-2.5 text-sm rounded-lg border transition-colors hover:bg-red-50"
                style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>
                Todas las cuentas
              </button>
              <button onClick={() => handleResetBalances('profit_loss')}
                disabled={resetting}
                className="w-full text-left px-4 py-2.5 text-sm rounded-lg border transition-colors hover:bg-red-50"
                style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>
                Solo cuentas de P&L (Ingresos/Gastos)
              </button>
              <button onClick={() => handleResetBalances('balance_sheet')}
                disabled={resetting}
                className="w-full text-left px-4 py-2.5 text-sm rounded-lg border transition-colors hover:bg-red-50"
                style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>
                Solo cuentas de Balance Sheet (Activos/Pasivos/Patrimonio)
              </button>
            </div>
            <div className="flex justify-end mt-4">
              <button onClick={() => setShowResetModal(false)} className="px-4 py-2 text-sm rounded-lg" style={{ color: 'var(--charcoal)' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ReportTreeNode({ node, depth, onDrill, hideZeros, collapsed }: {
  node: ReportNode; depth: number; onDrill?: (node: ReportNode) => void
  hideZeros?: boolean; collapsed?: boolean
}) {
  const hasChildren = (node.children || []).length > 0
  const indent = depth * 16

  // Hide-zeros: skip a leaf with no balance (and no drillable movements).
  if (hideZeros && !hasChildren && (node.balance || 0) === 0) return null

  // A leaf account with a real id and a non-zero balance is drillable.
  const canDrill = !!onDrill && !!node.id && !node.is_header && node.balance !== 0
  const Amount = ({ value }: { value: number }) => (
    canDrill ? (
      <button
        onClick={() => onDrill!(node)}
        className="text-sm font-mono underline decoration-dotted hover:decoration-solid cursor-pointer"
        style={{ color: value < 0 ? 'var(--danger)' : 'var(--gold-700)' }}
        title="Ver transacciones de esta cuenta"
      >{fmtFull(value)}</button>
    ) : (
      <span className="text-sm font-mono" style={{ color: value < 0 ? 'var(--danger)' : 'var(--ink)' }}>{fmtFull(value)}</span>
    )
  )

  if (hasChildren) {
    return (
      <>
        <div className="flex justify-between py-0.5" style={{ paddingLeft: indent }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>
            {node.code && <span className="font-mono text-xs mr-1" style={{ color: 'var(--ash)' }}>{node.code}</span>}
            {node.name}
          </span>
          {node.balance !== 0 && !node.is_header && <Amount value={node.balance} />}
        </div>
        {!collapsed && node.children!.map(child => (
          <ReportTreeNode key={child.id} node={child} depth={depth + 1} onDrill={onDrill} hideZeros={hideZeros} collapsed={collapsed} />
        ))}
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

  return (
    <div className="flex justify-between py-0.5" style={{ paddingLeft: indent }}>
      <span className="text-sm" style={{ color: 'var(--charcoal)' }}>
        {node.code && <span className="font-mono text-xs mr-1" style={{ color: 'var(--ash)' }}>{node.code}</span>}
        {node.name}
      </span>
      <Amount value={node.balance} />
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
//  BANKS & CASH TAB (Estado de Cuenta is now its own top-level tab)
// ════════════════════════════════════════════════════════════════════════
function BanksTab({ onAdd, onRefresh }: { onAdd: () => void; onRefresh: () => void }) {
  const toast = useToast()
  const subTab: 'accounts' = 'accounts'
  const [banks, setBanks] = useState<BankAccount[]>([])
  const [summary, setSummary] = useState({ total_balance: 0, bank_balance: 0, cash_on_hand: 0, count: 0 })
  const [loading, setLoading] = useState(true)
  const [selectedBank, setSelectedBank] = useState<string | null>(null)
  const [bankTxns, setBankTxns] = useState<Transaction[]>([])
  const [bankDetail, setBankDetail] = useState<BankAccount | null>(null)
  const [editingBalance, setEditingBalance] = useState(false)
  const [newBalance, setNewBalance] = useState('')
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [qbAccounts, setQbAccounts] = useState<any[]>([])

  const fetchQbAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/capital/accounting/accounts/tree')
      if (res.ok) {
        const data = await res.json()
        setQbAccounts((data.flat || []).filter((a: any) => !a.is_header && a.parent_account_id && a.account_type === 'asset'))
      }
    } catch { /* ignore */ }
  }, [])

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

  useEffect(() => { fetchBanks(); fetchQbAccounts() }, [fetchBanks, fetchQbAccounts])

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

      {/* Cuentas Bancarias (Estado de Cuenta is now a top-level tab) */}
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
                <p className="text-xl font-bold mt-3" style={{ color: 'var(--ink)' }}>{fmtFull(b.derived_balance ?? b.current_balance)}</p>
                {b.discrepancy != null && b.latest_statement_ending != null && (
                  <div className={`flex items-center gap-1 mt-1.5 text-[10px] font-medium px-2 py-1 rounded-lg ${Math.abs(b.discrepancy) > 1 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    {Math.abs(b.discrepancy) > 1
                      ? <AlertCircle className="w-3 h-3 flex-shrink-0" />
                      : <CheckCircle2 className="w-3 h-3 flex-shrink-0" />}
                    <span>Estado de cuenta: {fmtFull(b.latest_statement_ending)} · Diferencia: {fmtFull(b.discrepancy)}</span>
                  </div>
                )}
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
                      <p className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>{fmtFull(bankDetail.derived_balance ?? bankDetail.current_balance)}</p>
                      <button onClick={() => { setEditingBalance(true); setNewBalance(String(bankDetail.derived_balance ?? bankDetail.current_balance)) }}
                        className="text-xs px-2 py-1 rounded border" style={{ borderColor: 'var(--stone)', color: 'var(--slate)' }}>
                        Editar
                      </button>
                    </div>
                  )}
                  {bankDetail.discrepancy != null && bankDetail.latest_statement_ending != null && (
                    <div className={`inline-flex items-center gap-1 mt-2 text-xs font-medium px-2 py-1 rounded-lg ${Math.abs(bankDetail.discrepancy) > 1 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                      {Math.abs(bankDetail.discrepancy) > 1
                        ? <AlertCircle className="w-3.5 h-3.5" />
                        : <CheckCircle2 className="w-3.5 h-3.5" />}
                      <span>Estado de cuenta: {fmtFull(bankDetail.latest_statement_ending)} · Diferencia: {fmtFull(bankDetail.discrepancy)}</span>
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

                {/* QB Account Linking */}
                <div className="flex items-center gap-3">
                  <label className="text-xs font-medium whitespace-nowrap" style={{ color: 'var(--slate)' }}>
                    Cuenta contable QB:
                  </label>
                  <select
                    value={bankDetail.accounting_account_id || ''}
                    onChange={async (e) => {
                      const val = e.target.value || null
                      try {
                        await fetch(`/api/capital/accounting/bank-accounts/${bankDetail.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ accounting_account_id: val }),
                        })
                        fetchBanks()
                        loadBankDetail(bankDetail.id)
                      } catch { toast.error('Error al vincular cuenta') }
                    }}
                    className="flex-1 max-w-xs px-2 py-1.5 text-xs rounded-lg border"
                    style={{ borderColor: bankDetail.accounting_account_id ? 'var(--stone)' : '#f59e0b' }}
                  >
                    <option value="">— Sin vincular —</option>
                    {qbAccounts.map((a: any) => (
                      <option key={a.id} value={a.id}>{a.code} {a.name}</option>
                    ))}
                  </select>
                  {!bankDetail.accounting_account_id && (
                    <span className="text-[10px] text-amber-600">Requerido para Balance Sheet</span>
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

      {/* Transfer Modal */}
      {showTransferModal && <TransferModal banks={banks} onClose={() => setShowTransferModal(false)} onDone={() => { setShowTransferModal(false); fetchBanks(); onRefresh() }} />}
    </div>
  )
}


// ════════════════════════════════════════════════════════════════════════
//  ESTADO DE CUENTA — Capital Bank Statement Import & AI Classification
// ════════════════════════════════════════════════════════════════════════
function EstadoCuentaCapitalSection({ onRefresh }: { onRefresh: () => void }) {
  const toast = useToast()
  const [expandedDrawer, setExpandedDrawer] = useState<string | null>(null)
  const [statements, setStatements] = useState<Record<string, BankStatement[]>>({})
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)
  const [parsingPhase, setParsingPhase] = useState(false)
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

  // Reconciliation wizard state
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1)
  const [reconciling, setReconciling] = useState(false)
  const [reconcileMatches, setReconcileMatches] = useState<ReconcileMatch[]>([])
  const [selectedMatches, setSelectedMatches] = useState<Set<string>>(new Set())
  const [confirmingReconcile, setConfirmingReconcile] = useState(false)
  const [reconcileDone, setReconcileDone] = useState(false)

  const fetchBankAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/capital/accounting/bank-accounts')
      if (res.ok) {
        const data = await res.json()
        setBankAccounts(data.bank_accounts || [])
      }
    } catch (e) { console.error(e) }
  }, [])

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
        setAllAccounts((data.flat || []).filter((a: any) => !a.is_header && a.parent_account_id))
      }
    } catch (e) { /* ignore */ }
  }, [])

  useEffect(() => { fetchBankAccounts(); fetchStatements(); fetchAccounts() }, [fetchBankAccounts, fetchStatements, fetchAccounts])

  const createBankAccount = async () => {
    if (!newAccountName.trim()) { toast.error('Nombre de cuenta requerido'); return }
    setCreatingAccount(true)
    try {
      const res = await fetch('/api/capital/accounting/bank-accounts', {
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
        toast.success('Cuenta bancaria creada')
        setNewAccountName('')
        setNewAccountBank('')
        setShowNewAccount(false)
        fetchBankAccounts()
      } else {
        toast.error('Error al crear cuenta')
      }
    } catch { toast.error('Error de conexión') }
    finally { setCreatingAccount(false) }
  }

  const deleteBankAccount = async (bankId: string, name: string) => {
    if (!confirm(`¿Eliminar la cuenta "${name}"? Los estados de cuenta asociados no se borran.`)) return
    try {
      const res = await fetch(`/api/capital/accounting/bank-accounts/${bankId}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Cuenta eliminada')
        fetchBankAccounts()
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.detail || 'No se pudo eliminar')
      }
    } catch { toast.error('Error de conexión') }
  }

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
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.detail || 'Error al subir archivo')
        return
      }
      const data = await res.json()
      const stmtId = data.statement?.id
      if (!stmtId) {
        toast.error('El archivo se subió pero no se recibió un ID de statement')
        return
      }
      setActiveStatement(stmtId)
      setActiveMovements(data.movements || [])
      setExpandedDrawer(bankAccountId)
      fetchStatements()

      // The backend parses in background — the upload response returns
      // immediately with status='parsing'. Poll every 3s until parsed/error.
      setParsingPhase(true)
      const start = Date.now()
      const maxWait = 240_000 // ~4 minutes
      const pollInterval = 3000
      try {
        while (Date.now() - start < maxWait) {
          await new Promise(r => setTimeout(r, pollInterval))
          try {
            const pollRes = await fetch(`/api/capital/accounting/bank-statements/${stmtId}`)
            if (!pollRes.ok) continue
            const pollData = await pollRes.json()
            const status = pollData.statement?.status
            if (['parsed', 'review', 'classifying', 'completed'].includes(status)) {
              setActiveMovements(pollData.movements || [])
              fetchStatements()
              toast.success(`Extraídos ${(pollData.movements || []).length} movimientos del estado de cuenta`)
              return
            }
            if (status === 'error') {
              toast.error(pollData.statement?.error_message || 'Error al parsear el archivo')
              fetchStatements()
              return
            }
            // status === 'parsing' or 'uploaded' → keep polling
          } catch { /* network blip — keep trying */ }
        }
        toast.warning('El parser está tardando más de lo esperado. Revisa el statement en unos minutos.')
        fetchStatements()
      } finally { setParsingPhase(false) }
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

  const reconcileMovements = async (stmtId: string) => {
    setReconciling(true)
    try {
      const res = await fetch(`/api/capital/accounting/bank-statements/${stmtId}/reconcile`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        const matches: ReconcileMatch[] = data.matches || []
        setReconcileMatches(matches)
        // Auto-select only high-confidence full matches. Partial (split) payments
        // are left unchecked so the operator reviews them before confirming.
        setSelectedMatches(new Set(matches.filter(m => m.confidence === 'high' && !m.partial).map(m => m.movement_id)))
        if (matches.length === 0) {
          toast.info(data.message || 'No se encontraron coincidencias')
        } else {
          toast.success(`${matches.length} coincidencias encontradas`)
        }
      } else {
        toast.error('Error al conciliar')
      }
    } catch (e) { toast.error('Error de conexión') }
    finally { setReconciling(false) }
  }

  const confirmReconciliation = async (stmtId: string) => {
    const pairs = reconcileMatches
      .filter(m => selectedMatches.has(m.movement_id))
      .map(m => {
        const isInvoice = m.target_type === 'invoice' || (!!m.invoice_id && !m.transaction_id)
        return isInvoice
          ? { movement_id: m.movement_id, invoice_id: m.invoice_id, target_type: 'invoice' as const }
          : { movement_id: m.movement_id, transaction_id: m.transaction_id }
      })
    if (!pairs.length) return
    setConfirmingReconcile(true)
    try {
      const res = await fetch(`/api/capital/accounting/bank-statements/${stmtId}/reconcile/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairs }),
      })
      if (res.ok) {
        const data = await res.json()
        toast.success(`${data.reconciled} movimientos conciliados`)
        setReconcileDone(true)
        setReconcileMatches([])
        setSelectedMatches(new Set())
        await openStatement(stmtId)
      } else {
        toast.error('Error al confirmar conciliación')
      }
    } catch (e) { toast.error('Error de conexión') }
    finally { setConfirmingReconcile(false) }
  }

  const toggleMatchSelect = (movementId: string) => {
    setSelectedMatches(prev => {
      const next = new Set(prev)
      if (next.has(movementId)) next.delete(movementId)
      else next.add(movementId)
      return next
    })
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

  const splitMovement = async (mvId: string, parts: { amount: number; description: string }[]) => {
    try {
      const res = await fetch(`/api/capital/accounting/bank-statements/movements/${mvId}/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parts }),
      })
      if (res.ok) {
        const data = await res.json()
        toast.success(`Movimiento dividido en ${data.children?.length || parts.length} partes`)
        if (activeStatement) await openStatement(activeStatement)
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.detail || 'Error al dividir movimiento')
      }
    } catch (e) { toast.error('Error de conexión') }
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
  const reconciledCount = activeMovements.filter(m => m.status === 'reconciled').length
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
          style={{ backgroundColor: 'var(--gold-600)' }}
        >
          <Plus className="w-4 h-4" /> Nueva Cuenta
        </button>
      </div>

      {/* New Account Inline Form */}
      {showNewAccount && (
        <div className="rounded-xl border p-5 space-y-3" style={{ borderColor: 'var(--gold-600)', backgroundColor: 'var(--pearl)' }}>
          <h3 className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>Crear nueva cuenta bancaria</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>Nombre de cuenta *</label>
              <input
                type="text"
                value={newAccountName}
                onChange={e => setNewAccountName(e.target.value)}
                placeholder="Ej: Capital Checking, Cash Houston"
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
              style={{ backgroundColor: 'var(--gold-600)' }}
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
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--gold-600)' }} /></div>
      ) : accountDrawers.length === 0 ? (
        <div className="text-center py-12 card-luxury">
          <Landmark className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--ash)' }} />
          <p className="text-sm mb-3" style={{ color: 'var(--ash)' }}>No hay cuentas bancarias</p>
          <button onClick={() => setShowNewAccount(true)} className="text-sm font-medium hover:underline" style={{ color: 'var(--gold-600)' }}>
            + Crear primera cuenta
          </button>
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
                    {/* QB Account Linking */}
                    {(() => {
                      const ba = bankAccounts.find(b => b.id === drawer.id)
                      const assetAccounts = allAccounts.filter((a: any) => a.account_type === 'asset')
                      return (
                        <div className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--ivory)' }}>
                          <Link2 className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--slate)' }} />
                          <label className="text-xs font-medium whitespace-nowrap" style={{ color: 'var(--slate)' }}>
                            Cuenta contable QB:
                          </label>
                          <select
                            value={ba?.accounting_account_id || ''}
                            onChange={async (e) => {
                              const val = e.target.value || null
                              try {
                                await fetch(`/api/capital/accounting/bank-accounts/${drawer.id}`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ accounting_account_id: val }),
                                })
                                fetchBankAccounts()
                                toast.success('Cuenta contable vinculada')
                              } catch { toast.error('Error al vincular cuenta') }
                            }}
                            className="flex-1 max-w-xs px-2 py-1.5 text-xs rounded-lg border"
                            style={{ borderColor: ba?.accounting_account_id ? 'var(--stone)' : '#f59e0b' }}
                          >
                            <option value="">— Sin vincular —</option>
                            {assetAccounts.map((a: any) => (
                              <option key={a.id} value={a.id}>{a.code} {a.name}</option>
                            ))}
                          </select>
                          {!ba?.accounting_account_id && (
                            <span className="text-[10px] text-amber-600 whitespace-nowrap">Requerido para Balance Sheet</span>
                          )}
                        </div>
                      )
                    })()}

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
                          <span className="text-sm font-medium" style={{ color: drawer.color }}>{parsingPhase ? 'Parseando movimientos…' : 'Subiendo archivo...'}</span>
                          <span className="text-xs" style={{ color: 'var(--ash)' }}>La IA está extrayendo los movimientos — puede tardar unos minutos</span>
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
                {reconciledCount > 0 && <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">{reconciledCount} conciliados</span>}
                {confirmedCount > 0 && <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">{confirmedCount} confirmados</span>}
                {postedCount > 0 && <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">{postedCount} publicados</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { setActiveStatement(null); setActiveMovements([]); setWizardStep(1); setReconcileMatches([]); setReconcileDone(false) }}
                className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors">
                <X className="w-4 h-4 text-stone-400" />
              </button>
            </div>
          </div>

          {/* ── 3-Step Wizard Indicator ── */}
          <div className="flex items-center justify-center gap-2 px-5 py-3 border-b" style={{ borderColor: 'var(--sand)', backgroundColor: '#fafaf9' }}>
            {[
              { step: 1 as const, label: 'Conciliar', icon: <Link2 className="w-3.5 h-3.5" /> },
              { step: 2 as const, label: 'Clasificar con IA', icon: <Sparkles className="w-3.5 h-3.5" /> },
              { step: 3 as const, label: 'Integrar', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
            ].map(({ step, label, icon }, i) => (
              <React.Fragment key={step}>
                {i > 0 && <ChevronRight className="w-4 h-4" style={{ color: 'var(--ash)' }} />}
                <button
                  onClick={() => setWizardStep(step)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    wizardStep === step ? 'text-white' : 'hover:bg-stone-100'
                  }`}
                  style={{
                    backgroundColor: wizardStep === step
                      ? step === 1 ? '#7c3aed' : step === 2 ? '#2563eb' : '#059669'
                      : 'transparent',
                    color: wizardStep === step ? 'white' : 'var(--slate)',
                  }}
                >
                  {icon} {label}
                </button>
              </React.Fragment>
            ))}
          </div>

          {/* ── Step 1: Reconciliation ── */}
          {wizardStep === 1 && (
            <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--sand)' }}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Paso 1: Conciliar con transacciones existentes</h4>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>Busca coincidencias automáticas entre los movimientos bancarios y las transacciones ya registradas en contabilidad.</p>
                </div>
                <div className="flex items-center gap-2">
                  {reconcileDone && <span className="text-xs text-emerald-600 font-medium">Conciliación completada</span>}
                  <button
                    onClick={() => reconcileMovements(activeStatement)}
                    disabled={reconciling || pendingCount === 0}
                    className="px-3 py-1.5 text-xs font-medium text-white rounded-lg flex items-center gap-1.5"
                    style={{ backgroundColor: reconciling ? '#9ca3af' : pendingCount === 0 ? '#d1d5db' : '#7c3aed' }}
                  >
                    {reconciling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    {reconciling ? 'Buscando...' : 'Buscar coincidencias'}
                  </button>
                  <button onClick={() => setWizardStep(2)}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors hover:bg-stone-50"
                    style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>
                    Siguiente →
                  </button>
                </div>
              </div>

              {reconcileMatches.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium" style={{ color: 'var(--charcoal)' }}>{reconcileMatches.length} coincidencias encontradas</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setSelectedMatches(new Set(reconcileMatches.map(m => m.movement_id)))}
                        className="text-[10px] text-blue-600 hover:underline">Seleccionar todas</button>
                      <button onClick={() => setSelectedMatches(new Set())}
                        className="text-[10px] text-stone-500 hover:underline">Deseleccionar</button>
                    </div>
                  </div>
                  <div className="max-h-72 overflow-y-auto border rounded-lg" style={{ borderColor: 'var(--sand)' }}>
                    {reconcileMatches.map(match => {
                      const isInvoiceMatch = match.target_type === 'invoice' && !!match.invoice
                      return (
                        <div key={match.movement_id}
                          className="flex items-center gap-3 px-3 py-2 border-b last:border-0 hover:bg-stone-50 transition-colors cursor-pointer"
                          style={{ borderColor: 'var(--pearl)' }}
                          onClick={() => toggleMatchSelect(match.movement_id)}>
                          <input type="checkbox" checked={selectedMatches.has(match.movement_id)}
                            onChange={() => toggleMatchSelect(match.movement_id)}
                            onClick={e => e.stopPropagation()}
                            className="rounded border-stone-300" />
                          <div className="flex-1 min-w-0 grid grid-cols-2 gap-4">
                            <div>
                              <div className="text-[9px] font-semibold uppercase tracking-wider text-stone-400">Estado de Cuenta</div>
                              <div className="text-xs font-medium truncate" style={{ color: 'var(--ink)' }}>{match.movement.description}</div>
                              <div className="text-[10px]" style={{ color: 'var(--ash)' }}>{match.movement.movement_date} · ${Math.abs(match.movement.amount).toFixed(2)}</div>
                            </div>
                            {isInvoiceMatch ? (
                              <div>
                                <div className="text-[9px] font-semibold uppercase tracking-wider text-violet-500 flex items-center gap-1.5">
                                  Factura {match.invoice!.direction === 'receivable' ? '(Por Cobrar)' : '(Por Pagar)'}
                                  {match.partial && (
                                    <span className="px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-800 text-[9px] font-bold normal-case tracking-normal">Pago parcial</span>
                                  )}
                                </div>
                                <div className="text-xs font-medium truncate" style={{ color: 'var(--ink)' }}>
                                  {match.invoice!.invoice_number || '—'}: {match.invoice!.counterparty_name || '—'}
                                </div>
                                <div className="text-[10px]" style={{ color: 'var(--ash)' }}>
                                  Balance: ${Number(match.invoice!.balance_due || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} de ${Number(match.invoice!.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </div>
                                {match.partial ? (
                                  <div className="text-[10px] text-amber-700 font-medium">
                                    Aplica ${Math.abs(match.movement.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} · quedarían ${Math.max(0, Number(match.invoice!.balance_due || 0) - Math.abs(match.movement.amount)).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                  </div>
                                ) : (
                                  <div className="text-[10px] text-violet-700 font-medium">Al confirmar: se cobra/paga automáticamente</div>
                                )}
                              </div>
                            ) : (
                              <div>
                                <div className="text-[9px] font-semibold uppercase tracking-wider text-blue-400">Transacción App</div>
                                <div className="text-xs font-medium truncate" style={{ color: 'var(--ink)' }}>{match.transaction?.description || '—'}</div>
                                <div className="text-[10px]" style={{ color: 'var(--ash)' }}>{match.transaction?.transaction_date || '—'} · ${Math.abs(match.transaction?.amount || 0).toFixed(2)}</div>
                              </div>
                            )}
                          </div>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                            match.confidence === 'high' ? 'bg-emerald-100 text-emerald-700' :
                            match.confidence === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-stone-100 text-stone-600'
                          }`}>{match.score}pts</span>
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={() => confirmReconciliation(activeStatement)}
                      disabled={confirmingReconcile || selectedMatches.size === 0}
                      className="px-4 py-2 text-xs font-medium text-white rounded-lg flex items-center gap-1.5"
                      style={{ backgroundColor: confirmingReconcile || selectedMatches.size === 0 ? '#9ca3af' : '#059669' }}
                    >
                      {confirmingReconcile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      Confirmar {selectedMatches.size} coincidencias
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Classify — Action bar ── */}
          {wizardStep === 2 && (
            <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'var(--sand)', backgroundColor: '#fafaf9' }}>
              <div>
                <h4 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Paso 2: Clasificar movimientos con IA</h4>
                <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>La IA sugiere cuentas contables. Revisa y confirma cada clasificación.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => classifyMovements(activeStatement)}
                  disabled={classifying}
                  className="px-3 py-1.5 text-xs font-medium text-white rounded-lg flex items-center gap-1.5"
                  style={{ backgroundColor: classifying ? '#9ca3af' : '#2563eb' }}
                >
                  {classifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {classifying ? 'Clasificando...' : 'Clasificar con IA'}
                </button>
                <button onClick={() => setWizardStep(3)}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors hover:bg-stone-50"
                  style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>
                  Siguiente →
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Post — Action bar ── */}
          {wizardStep === 3 && (
            <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'var(--sand)', backgroundColor: '#fafaf9' }}>
              <div>
                <h4 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Paso 3: Integrar a contabilidad</h4>
                <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>
                  Publica {confirmedCount + reconciledCount} movimientos ({confirmedCount} confirmados, {reconciledCount} conciliados) como transacciones de doble partida.
                </p>
              </div>
              <button
                onClick={() => postMovements(activeStatement)}
                disabled={posting || (confirmedCount + reconciledCount) === 0}
                className="px-4 py-2 text-xs font-medium text-white rounded-lg flex items-center gap-1.5"
                style={{ backgroundColor: posting || (confirmedCount + reconciledCount) === 0 ? '#9ca3af' : '#059669' }}
              >
                {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                {posting ? 'Publicando...' : `Integrar ${confirmedCount + reconciledCount} movimientos`}
              </button>
            </div>
          )}

          {/* Movements Table */}
          {movementsLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--gold-600)' }} /></div>
          ) : activeMovements.length === 0 ? (
            <div className="text-center py-12 px-6">
              {parsingPhase ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--gold-600)' }} />
                  <p className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>Parseando movimientos…</p>
                  <p className="text-xs" style={{ color: 'var(--ash)' }}>La IA está extrayendo los movimientos del archivo</p>
                </div>
              ) : (
                <p className="text-sm" style={{ color: 'var(--ash)' }}>No se encontraron movimientos</p>
              )}
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
                      onSplit={splitMovement}
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
function CapitalMovementRow({ movement: mv, accounts, onUpdate, onSplit }: {
  movement: StatementMovement
  accounts: any[]
  onUpdate: (id: string, data: Record<string, any>) => void
  onSplit: (id: string, parts: { amount: number; description: string }[]) => void
}) {
  const toast = useToast()
  const [showAccountPicker, setShowAccountPicker] = useState(false)
  const [accountSearch, setAccountSearch] = useState('')
  const [editingDesc, setEditingDesc] = useState(false)
  const [descDraft, setDescDraft] = useState(mv.description)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesDraft, setNotesDraft] = useState(mv.final_notes || '')
  const [showSplit, setShowSplit] = useState(false)
  const [splitParts, setSplitParts] = useState<{ amount: string; description: string }[]>([
    { amount: '', description: '' },
    { amount: '', description: '' },
  ])

  const displayAccount = mv.final_account_id
    ? accounts.find((a: any) => a.id === mv.final_account_id)
    : mv.suggested_account_name
    ? { code: mv.suggested_account_code, name: mv.suggested_account_name }
    : null

  const isPosted = mv.status === 'posted'
  const isSkipped = mv.status === 'skipped'
  const isSplit = mv.status === 'split' || mv.is_split_parent
  const isChild = !!mv.parent_movement_id
  const isConfirmed = mv.status === 'confirmed'
  const isReconciled = mv.status === 'reconciled'
  const canEdit = !isPosted && !isSkipped && !isSplit

  const filteredAccounts = accountSearch
    ? accounts.filter((a: any) =>
        a.name?.toLowerCase().includes(accountSearch.toLowerCase()) ||
        a.code?.toLowerCase().includes(accountSearch.toLowerCase())
      )
    : accounts

  const handleSelectAccount = (account: any) => {
    onUpdate(mv.id, { final_account_id: account.id, status: 'confirmed' })
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

  const skipMovement = () => { onUpdate(mv.id, { status: 'skipped' }) }

  const saveDescription = () => {
    if (descDraft !== mv.description) onUpdate(mv.id, { description: descDraft })
    setEditingDesc(false)
  }

  const saveNotes = () => {
    onUpdate(mv.id, { final_notes: notesDraft || null })
    setEditingNotes(false)
  }

  const handleSplit = () => {
    const absTotal = Math.abs(mv.amount)
    const parts = splitParts
      .filter(p => p.amount && parseFloat(p.amount) !== 0)
      .map(p => ({ amount: Math.abs(parseFloat(p.amount)), description: p.description || mv.description }))
    const total = parts.reduce((s, p) => s + p.amount, 0)
    if (Math.abs(total - absTotal) > 0.01) {
      toast.error(`Las partes suman $${total.toFixed(2)} pero el movimiento es $${absTotal.toFixed(2)}`)
      return
    }
    if (parts.length < 2) { toast.error('Necesitas al menos 2 partes'); return }
    onSplit(mv.id, parts)
    setShowSplit(false)
  }

  if (isSplit && !isChild) {
    // Split parent: show greyed out with "Dividido" badge
    return (
      <tr className="border-b bg-stone-50/50 opacity-60" style={{ borderColor: '#f0f0f0' }}>
        <td className="px-3 py-2 whitespace-nowrap"><span className="text-xs font-mono" style={{ color: 'var(--ash)' }}>{mv.movement_date}</span></td>
        <td className="px-3 py-2 max-w-md"><p className="text-xs line-through" style={{ color: 'var(--ash)' }}>{mv.description}</p></td>
        <td className="px-3 py-2 text-right whitespace-nowrap"><span className="text-sm font-semibold tabular-nums text-stone-400">{fmtFull(mv.amount)}</span></td>
        <td className="px-3 py-2"><span className="text-xs text-stone-400">—</span></td>
        <td className="px-3 py-2 text-center"><span className="px-1.5 py-0.5 text-[10px] rounded bg-stone-200 text-stone-600 font-medium">Dividido</span></td>
        <td className="px-3 py-2"></td>
      </tr>
    )
  }

  return (
    <tr className={`border-b transition-colors ${isPosted ? 'bg-blue-50/50' : isSkipped ? 'bg-stone-50 opacity-50' : isReconciled ? 'bg-purple-50/50' : isConfirmed ? 'bg-emerald-50/50' : 'hover:bg-stone-50'}`}
      style={{ borderColor: '#f0f0f0' }}>
      {/* Date */}
      <td className={`px-3 py-2.5 whitespace-nowrap ${isChild ? 'pl-6' : ''}`}>
        <span className="text-xs font-mono" style={{ color: 'var(--charcoal)' }}>
          {isChild && <span className="text-stone-300 mr-1">↳</span>}
          {mv.movement_date}
        </span>
      </td>

      {/* Description — editable */}
      <td className="px-3 py-2.5 max-w-md">
        <div>
          {editingDesc ? (
            <div className="flex items-center gap-1">
              <input autoFocus value={descDraft} onChange={e => setDescDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveDescription(); if (e.key === 'Escape') { setEditingDesc(false); setDescDraft(mv.description) } }}
                className="flex-1 text-xs px-1.5 py-1 rounded border outline-none" style={{ borderColor: 'var(--gold-600)' }} />
              <button onClick={saveDescription} className="text-emerald-600"><Check className="w-3.5 h-3.5" /></button>
              <button onClick={() => { setEditingDesc(false); setDescDraft(mv.description) }} className="text-red-400"><X className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <p className="text-xs leading-snug group/desc cursor-pointer" style={{ color: 'var(--charcoal)' }}
              onClick={() => canEdit && setEditingDesc(true)} title={canEdit ? 'Clic para editar' : ''}>
              {mv.description}
              {canEdit && <Pencil className="w-2.5 h-2.5 inline ml-1 opacity-0 group-hover/desc:opacity-50" />}
            </p>
          )}
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
          {/* Notes display/edit */}
          {editingNotes ? (
            <div className="mt-1 flex items-start gap-1">
              <textarea value={notesDraft} onChange={e => setNotesDraft(e.target.value)}
                rows={2} className="flex-1 text-[10px] px-1.5 py-1 rounded border outline-none resize-none"
                style={{ borderColor: 'var(--gold-600)' }} placeholder="Añadir notas..." autoFocus />
              <button onClick={saveNotes} className="text-emerald-600 mt-0.5"><Check className="w-3 h-3" /></button>
              <button onClick={() => { setEditingNotes(false); setNotesDraft(mv.final_notes || '') }} className="text-red-400 mt-0.5"><X className="w-3 h-3" /></button>
            </div>
          ) : mv.final_notes ? (
            <p className="text-[10px] mt-1 italic cursor-pointer hover:underline" style={{ color: 'var(--slate)' }}
              onClick={() => canEdit && setEditingNotes(true)}>
              <MessageSquare className="w-2.5 h-2.5 inline mr-0.5" />{mv.final_notes}
            </p>
          ) : canEdit ? (
            <button onClick={() => setEditingNotes(true)}
              className="text-[10px] mt-0.5 hover:underline flex items-center gap-0.5" style={{ color: 'var(--ash)' }}>
              <MessageSquare className="w-2.5 h-2.5" /> Añadir nota
            </button>
          ) : null}
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
              <input autoFocus type="text" value={accountSearch} onChange={e => setAccountSearch(e.target.value)}
                placeholder="Buscar cuenta Capital..." className="flex-1 text-xs outline-none" />
              <button onClick={() => { setShowAccountPicker(false); setAccountSearch('') }}><X className="w-3.5 h-3.5 text-stone-400" /></button>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-0.5">
              {filteredAccounts.map((a: any) => (
                <button key={a.id} onClick={() => handleSelectAccount(a)}
                  className={`w-full text-left px-2 py-1.5 rounded text-xs hover:bg-stone-100 transition-colors flex items-center gap-2 ${a.is_header ? 'font-semibold bg-stone-50' : ''}`}>
                  <span className="font-mono text-[10px] text-stone-400 w-14 shrink-0">{a.code}</span>
                  <span style={{ color: 'var(--charcoal)' }}>{a.name}{a.is_header ? ' (grupo)' : ''}</span>
                  <span className="ml-auto text-[10px] text-stone-400">{a.account_type}</span>
                </button>
              ))}
              {filteredAccounts.length === 0 && <p className="text-xs text-center py-2" style={{ color: 'var(--ash)' }}>Sin resultados</p>}
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAccountPicker(true)} className="text-left w-full group" disabled={isPosted || isSkipped}>
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
                <span className="text-xs italic group-hover:underline text-amber-600">Sin cuenta — clic para asignar</span>
              </div>
            )}
          </button>
        )}
      </td>

      {/* Status */}
      <td className="px-3 py-2.5 text-center">
        {mv.status === 'posted' && <span className="px-1.5 py-0.5 text-[10px] rounded bg-blue-100 text-blue-700 font-medium">Publicado</span>}
        {mv.status === 'reconciled' && <span className="px-1.5 py-0.5 text-[10px] rounded bg-purple-100 text-purple-700 font-medium">Conciliado</span>}
        {mv.status === 'confirmed' && <span className="px-1.5 py-0.5 text-[10px] rounded bg-emerald-100 text-emerald-700 font-medium">Confirmado</span>}
        {mv.status === 'suggested' && <span className="px-1.5 py-0.5 text-[10px] rounded bg-violet-100 text-violet-700 font-medium">Sugerido</span>}
        {mv.status === 'pending' && <span className="px-1.5 py-0.5 text-[10px] rounded bg-gray-100 text-gray-600 font-medium">Pendiente</span>}
        {mv.status === 'skipped' && <span className="px-1.5 py-0.5 text-[10px] rounded bg-stone-100 text-stone-500 font-medium">Omitido</span>}
      </td>

      {/* Actions */}
      <td className="px-3 py-2.5 text-center">
        {canEdit && (
          <div className="flex items-center justify-center gap-1">
            {mv.status === 'suggested' && mv.suggested_account_id && (
              <button onClick={confirmSuggestion} className="p-1 rounded hover:bg-emerald-100 text-emerald-600 transition-colors" title="Confirmar sugerencia">
                <Check className="w-3.5 h-3.5" />
              </button>
            )}
            <button onClick={() => setShowAccountPicker(true)} className="p-1 rounded hover:bg-blue-100 text-blue-600 transition-colors" title="Cambiar cuenta">
              <Settings className="w-3.5 h-3.5" />
            </button>
            {!isChild && (
              <button onClick={() => setShowSplit(!showSplit)} className="p-1 rounded hover:bg-amber-100 text-amber-600 transition-colors" title="Dividir monto">
                <Scissors className="w-3.5 h-3.5" />
              </button>
            )}
            <button onClick={skipMovement} className="p-1 rounded hover:bg-stone-200 text-stone-400 transition-colors" title="Omitir">
              <SkipForward className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {isPosted && <CheckCircle2 className="w-4 h-4 text-blue-500 mx-auto" />}

        {/* Split inline form */}
        {showSplit && (
          <div className="absolute right-0 z-20 w-80 bg-white border rounded-lg shadow-xl p-3 text-left mt-1" style={{ borderColor: 'var(--stone)' }}>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--ink)' }}>Dividir ${Math.abs(mv.amount).toFixed(2)}</p>
            {splitParts.map((part, i) => (
              <div key={i} className="flex items-center gap-1 mb-1.5">
                <span className="text-[10px] text-stone-400 w-4">{i + 1}.</span>
                <input type="number" step="0.01" placeholder="Monto" value={part.amount}
                  onChange={e => { const p = [...splitParts]; p[i].amount = e.target.value; setSplitParts(p) }}
                  className="w-20 text-xs px-1.5 py-1 rounded border" style={{ borderColor: 'var(--stone)' }} />
                <input type="text" placeholder="Descripción" value={part.description}
                  onChange={e => { const p = [...splitParts]; p[i].description = e.target.value; setSplitParts(p) }}
                  className="flex-1 text-xs px-1.5 py-1 rounded border" style={{ borderColor: 'var(--stone)' }} />
                {splitParts.length > 2 && (
                  <button onClick={() => setSplitParts(splitParts.filter((_, j) => j !== i))} className="text-red-400"><X className="w-3 h-3" /></button>
                )}
              </div>
            ))}
            <div className="flex items-center justify-between mt-2">
              <button onClick={() => setSplitParts([...splitParts, { amount: '', description: '' }])}
                className="text-[10px] text-blue-600 hover:underline">+ Añadir parte</button>
              <div className="flex gap-1">
                <button onClick={() => setShowSplit(false)} className="text-xs px-2 py-1 rounded border" style={{ borderColor: 'var(--stone)' }}>Cancelar</button>
                <button onClick={handleSplit} className="text-xs px-2 py-1 rounded text-white" style={{ backgroundColor: 'var(--gold-600)' }}>Dividir</button>
              </div>
            </div>
          </div>
        )}
      </td>
    </tr>
  )
}


// ════════════════════════════════════════════════════════════════════════
//  BUDGET TAB — Presupuesto vs Real
// ════════════════════════════════════════════════════════════════════════

interface CapitalAccountRef {
  code: string
  name: string
  account_type: string
  category?: string
  is_header?: boolean
}

function BudgetTab() {
  const toast = useToast()
  const [comparison, setComparison] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [year, setYear] = useState(new Date().getFullYear())
  const [showAdd, setShowAdd] = useState(false)
  const [accounts, setAccounts] = useState<(CapitalAccountRef & { id: string })[]>([])
  const [addForm, setAddForm] = useState({ account_id: '', period_month: new Date().getMonth() + 1, budgeted_amount: '' })
  const [saving, setSaving] = useState(false)

  const fetchComparison = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/capital/accounting/budgets/vs-actual?year=${year}`)
      if (res.ok) {
        const d = await res.json()
        setComparison(d.comparison || [])
      } else {
        const d = await res.json().catch(() => ({}))
        setError(d.detail || `Error ${res.status} al cargar presupuestos. ¿Ya ejecutaste la migración 044?`)
      }
    } catch (e) {
      setError('Error de conexión al cargar presupuestos.')
    }
    finally { setLoading(false) }
  }, [year])

  // Fetch from accounts/tree — the SAME source used by P&L and Balance Sheet
  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/capital/accounting/accounts/tree')
      if (res.ok) {
        const d = await res.json()
        setAccounts(d.flat || [])
      }
    } catch (e) { /* ignore */ }
  }, [])

  useEffect(() => { fetchComparison() }, [fetchComparison])
  useEffect(() => { fetchAccounts() }, [fetchAccounts])

  const handleAddBudget = async () => {
    if (!addForm.account_id) {
      toast.warning('Selecciona una cuenta.')
      return
    }
    if (!addForm.budgeted_amount || parseFloat(addForm.budgeted_amount) <= 0) {
      toast.warning('Ingresa un monto válido mayor a 0.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/capital/accounting/budgets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...addForm, budgeted_amount: parseFloat(addForm.budgeted_amount), period_year: year }),
      })
      if (res.ok) {
        const acct = accounts.find(a => a.id === addForm.account_id)
        toast.success(`Presupuesto guardado: ${acct?.name || 'Cuenta'} — ${MONTH_NAMES[addForm.period_month]} ${year}`)
        setShowAdd(false)
        setAddForm({ account_id: '', period_month: new Date().getMonth() + 1, budgeted_amount: '' })
        fetchComparison()
      } else {
        const d = await res.json().catch(() => ({}))
        toast.error(d.detail || 'Error al guardar presupuesto. ¿Ya ejecutaste la migración 044_capital_budgets.sql?')
      }
    } catch (e) {
      toast.error('Error de conexión al guardar presupuesto.')
    }
    finally { setSaving(false) }
  }

  // Totals
  const totalBudgeted = comparison.reduce((s, c) => s + c.budgeted, 0)
  const totalActual = comparison.reduce((s, c) => s + c.actual, 0)
  const totalVariance = totalBudgeted - totalActual
  const totalVariancePct = totalBudgeted !== 0 ? (totalVariance / totalBudgeted * 100) : 0

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h3 className="font-serif text-lg font-semibold" style={{ color: 'var(--ink)' }}>Presupuesto vs Real</h3>
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="px-3 py-1.5 text-sm rounded-lg border" style={{ borderColor: 'var(--stone)' }}>
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg"
          style={{ backgroundColor: 'var(--gold-600)' }}>
          <Plus className="w-4 h-4" /> Agregar Presupuesto
        </button>
      </div>

      {/* Summary KPIs */}
      {comparison.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card-luxury p-4">
            <p className="text-xs" style={{ color: 'var(--ash)' }}>Total Presupuestado</p>
            <p className="font-serif text-lg font-semibold" style={{ color: 'var(--ink)' }}>{fmtFull(totalBudgeted)}</p>
          </div>
          <div className="card-luxury p-4">
            <p className="text-xs" style={{ color: 'var(--ash)' }}>Total Real</p>
            <p className="font-serif text-lg font-semibold" style={{ color: 'var(--charcoal)' }}>{fmtFull(totalActual)}</p>
          </div>
          <div className="card-luxury p-4">
            <p className="text-xs" style={{ color: 'var(--ash)' }}>Variación</p>
            <p className={`font-serif text-lg font-semibold ${totalVariance < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {totalVariance >= 0 ? '+' : ''}{fmtFull(totalVariance)}
            </p>
          </div>
          <div className="card-luxury p-4">
            <p className="text-xs" style={{ color: 'var(--ash)' }}>% Variación</p>
            <p className={`font-serif text-lg font-semibold ${totalVariancePct < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {totalVariancePct >= 0 ? '+' : ''}{totalVariancePct.toFixed(1)}%
            </p>
          </div>
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="card-luxury p-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>Cuenta</label>
            <select value={addForm.account_id} onChange={e => setAddForm(f => ({ ...f, account_id: e.target.value }))}
              className="px-3 py-2 text-sm rounded-lg border" style={{ borderColor: 'var(--stone)' }}>
              <option value="">Seleccionar cuenta...</option>
              {accounts.length > 0 && (
                <>
                  <optgroup label="📉 Gastos (Profit & Loss)">
                    {accounts.filter(a => a.account_type === 'expense' || a.account_type === 'cogs').map(a => (
                      <option key={a.id} value={a.id}>
                        {a.is_header ? `${a.code} — ${a.name} (grupo)` : `  ${a.code} — ${a.name}`}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="📈 Ingresos (Profit & Loss)">
                    {accounts.filter(a => a.account_type === 'income').map(a => (
                      <option key={a.id} value={a.id}>
                        {a.is_header ? `${a.code} — ${a.name} (grupo)` : `  ${a.code} — ${a.name}`}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="🏦 Activos (Balance Sheet)">
                    {accounts.filter(a => a.account_type === 'asset').map(a => (
                      <option key={a.id} value={a.id}>
                        {a.is_header ? `${a.code} — ${a.name} (grupo)` : `  ${a.code} — ${a.name}`}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="📋 Pasivos (Balance Sheet)">
                    {accounts.filter(a => a.account_type === 'liability').map(a => (
                      <option key={a.id} value={a.id}>
                        {a.is_header ? `${a.code} — ${a.name} (grupo)` : `  ${a.code} — ${a.name}`}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="💼 Patrimonio (Balance Sheet)">
                    {accounts.filter(a => a.account_type === 'equity').map(a => (
                      <option key={a.id} value={a.id}>
                        {a.is_header ? `${a.code} — ${a.name} (grupo)` : `  ${a.code} — ${a.name}`}
                      </option>
                    ))}
                  </optgroup>
                </>
              )}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>Mes</label>
            <select value={addForm.period_month} onChange={e => setAddForm(f => ({ ...f, period_month: Number(e.target.value) }))}
              className="px-3 py-2 text-sm rounded-lg border" style={{ borderColor: 'var(--stone)' }}>
              {MONTH_NAMES.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>Monto ($)</label>
            <input type="number" step="0.01" value={addForm.budgeted_amount}
              onChange={e => setAddForm(f => ({ ...f, budgeted_amount: e.target.value }))}
              className="px-3 py-2 text-sm rounded-lg border w-32" style={{ borderColor: 'var(--stone)' }} placeholder="0.00" />
          </div>
          <button onClick={handleAddBudget} disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg"
            style={{ backgroundColor: 'var(--gold-600)' }}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
          <button onClick={() => setShowAdd(false)}
            className="px-4 py-2 text-sm rounded-lg border" style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>
            Cancelar
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card-luxury p-4 flex items-start gap-3" style={{ borderColor: 'var(--error)', borderWidth: 1 }}>
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: 'var(--error)' }} />
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--error)' }}>Error al cargar presupuestos</p>
            <p className="text-xs mt-1" style={{ color: 'var(--charcoal)' }}>{error}</p>
            <p className="text-xs mt-2" style={{ color: 'var(--ash)' }}>
              Asegúrate de ejecutar la migración <code className="px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--cream)' }}>044_capital_budgets.sql</code> en Supabase SQL Editor.
            </p>
          </div>
        </div>
      )}

      {/* Info: ¿Qué es el presupuesto? */}
      <div className="card-luxury p-4" style={{ backgroundColor: 'var(--cream)' }}>
        <p className="text-xs" style={{ color: 'var(--slate)' }}>
          <strong>¿Cómo funciona?</strong> Define cuánto <em>planeas</em> gastar por cuenta/mes.
          La tabla compara tu presupuesto contra los gastos <em>reales</em> registrados en transacciones.
          Variación positiva (verde) = gastaste menos de lo planeado. Negativa (rojo) = te pasaste del presupuesto.
          Esto NO afecta los estados financieros — es solo una herramienta de análisis.
        </p>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--gold-600)' }} /></div>
      ) : !error && comparison.length === 0 ? (
        <div className="text-center py-12 card-luxury">
          <BookOpen className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--ash)' }} />
          <p className="text-sm" style={{ color: 'var(--ash)' }}>No hay presupuestos para {year}.</p>
          <p className="text-xs mt-1" style={{ color: 'var(--ash)' }}>Agrega uno para comparar con los gastos reales de Capital.</p>
          <button onClick={() => setShowAdd(true)} className="mt-3 px-4 py-2 text-sm font-medium text-white rounded-lg" style={{ backgroundColor: 'var(--gold-600)' }}>
            <Plus className="w-4 h-4 inline mr-1" /> Crear primer presupuesto
          </button>
        </div>
      ) : (
        <div className="card-luxury overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--sand)', backgroundColor: 'var(--ivory)' }}>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--slate)' }}>Cuenta</th>
                <th className="px-4 py-3 text-center font-medium" style={{ color: 'var(--slate)' }}>Mes</th>
                <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--slate)' }}>Presupuesto</th>
                <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--slate)' }}>Real</th>
                <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--slate)' }}>Variación</th>
                <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--slate)' }}>%</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((c, i) => {
                const overBudget = c.variance < 0
                return (
                  <tr key={i} className="border-b" style={{ borderColor: 'var(--sand)' }}>
                    <td className="px-4 py-3" style={{ color: 'var(--charcoal)' }}>
                      {c.account ? `${c.account.code} — ${c.account.name}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-center" style={{ color: 'var(--slate)' }}>{MONTH_NAMES[c.month]}</td>
                    <td className="px-4 py-3 text-right font-medium" style={{ color: 'var(--charcoal)' }}>{fmtFull(c.budgeted)}</td>
                    <td className="px-4 py-3 text-right font-medium" style={{ color: 'var(--charcoal)' }}>{fmtFull(c.actual)}</td>
                    <td className={`px-4 py-3 text-right font-bold ${overBudget ? 'text-red-600' : 'text-emerald-600'}`}>
                      {overBudget ? '' : '+'}{fmtFull(c.variance)}
                    </td>
                    <td className={`px-4 py-3 text-right text-xs font-medium ${overBudget ? 'text-red-600' : 'text-emerald-600'}`}>
                      {c.variance_pct > 0 ? '+' : ''}{c.variance_pct}%
                    </td>
                  </tr>
                )
              })}
              {/* Totals row */}
              <tr className="border-t-2 font-semibold" style={{ borderColor: 'var(--charcoal)', backgroundColor: 'var(--pearl)' }}>
                <td className="px-4 py-3" style={{ color: 'var(--ink)' }}>Total</td>
                <td />
                <td className="px-4 py-3 text-right" style={{ color: 'var(--ink)' }}>{fmtFull(totalBudgeted)}</td>
                <td className="px-4 py-3 text-right" style={{ color: 'var(--ink)' }}>{fmtFull(totalActual)}</td>
                <td className={`px-4 py-3 text-right ${totalVariance < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {totalVariance >= 0 ? '+' : ''}{fmtFull(totalVariance)}
                </td>
                <td className={`px-4 py-3 text-right text-xs ${totalVariancePct < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {totalVariancePct >= 0 ? '+' : ''}{totalVariancePct.toFixed(1)}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}


// ════════════════════════════════════════════════════════════════════════
//  MODALS
// ════════════════════════════════════════════════════════════════════════

function NewTransactionModal({ bankAccounts, onClose, onCreated }: { bankAccounts: BankAccount[]; onClose: () => void; onCreated: () => void }) {
  const toast = useToast()
  const [form, setForm] = useState({
    transaction_date: new Date().toISOString().split('T')[0],
    transaction_type: 'operating_expense',
    amount: '',
    is_income: false,
    account_id: '',
    description: '',
    bank_account_id: '',
    payment_method: '',
    counterparty_name: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [accounts, setAccounts] = useState<{ id: string; code: string; name: string; account_type: string; is_header: boolean }[]>([])

  // Fetch from accounts/tree — the SAME source used by P&L and Balance Sheet
  useEffect(() => {
    fetch('/api/capital/accounting/accounts/tree')
      .then(r => r.json())
      .then(d => setAccounts(d.flat || []))
      .catch(() => {})
  }, [])

  // Maps: which transaction types are income vs expense
  const INCOME_TYPES = ['rto_payment', 'down_payment', 'late_fee', 'investor_deposit', 'other_income']
  const EXPENSE_TYPES = ['acquisition', 'investor_return', 'commission', 'insurance', 'tax', 'operating_expense', 'other_expense']

  // When account changes, auto-set is_income and suggest a transaction_type
  const handleAccountChange = (accountId: string) => {
    const acct = accounts.find(a => a.id === accountId)
    if (acct) {
      const isIncome = acct.account_type === 'income'
      const isExpense = acct.account_type === 'expense' || acct.account_type === 'cogs'
      setForm(f => ({
        ...f,
        account_id: accountId,
        is_income: isIncome ? true : isExpense ? false : f.is_income,
        transaction_type: isIncome
          ? (INCOME_TYPES.includes(f.transaction_type) ? f.transaction_type : 'other_income')
          : isExpense
            ? (EXPENSE_TYPES.includes(f.transaction_type) ? f.transaction_type : 'operating_expense')
            : f.transaction_type,
      }))
    } else {
      setForm(f => ({ ...f, account_id: accountId }))
    }
  }

  // When flow (is_income) changes, auto-adjust transaction_type if it conflicts
  const handleFlowChange = (isIncome: boolean) => {
    setForm(f => ({
      ...f,
      is_income: isIncome,
      transaction_type: isIncome
        ? (INCOME_TYPES.includes(f.transaction_type) ? f.transaction_type : 'other_income')
        : (EXPENSE_TYPES.includes(f.transaction_type) ? f.transaction_type : 'operating_expense'),
    }))
  }

  // Filter type options based on current flow
  const filteredTypes = Object.entries(TYPE_LABELS).filter(([k]) => {
    if (form.is_income) return INCOME_TYPES.includes(k) || k === 'transfer' || k === 'adjustment'
    return EXPENSE_TYPES.includes(k) || k === 'transfer' || k === 'adjustment'
  })

  // Group accounts by type for the selector — same grouping used in P&L / Balance Sheet
  const incomeAccounts = accounts.filter(a => a.account_type === 'income')
  const expenseAccounts = accounts.filter(a => a.account_type === 'expense' || a.account_type === 'cogs')
  const assetAccounts = accounts.filter(a => a.account_type === 'asset')
  const liabilityAccounts = accounts.filter(a => a.account_type === 'liability')
  const equityAccounts = accounts.filter(a => a.account_type === 'equity')

  // Render account option label — same format everywhere
  const acctLabel = (a: { code: string; name: string; is_header: boolean }) =>
    a.is_header ? `${a.code} — ${a.name} (grupo)` : `  ${a.code} — ${a.name}`

  const handleSubmit = async () => {
    if (!form.amount || !form.description) { toast.warning('Monto y descripción son requeridos'); return }
    if (!form.account_id) { toast.warning('Selecciona una cuenta contable para clasificar la transacción'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/capital/accounting/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          amount: parseFloat(form.amount),
          bank_account_id: form.bank_account_id || undefined,
          account_id: form.account_id || undefined,
        }),
      })
      if (res.ok) {
        const selectedAcct = accounts.find(a => a.id === form.account_id)
        toast.success(`Transacción registrada → ${selectedAcct?.code} ${selectedAcct?.name || ''}`)
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

        {/* Info banner */}
        <div className="p-3 rounded-lg mb-4 text-xs" style={{ backgroundColor: 'var(--ivory)', color: 'var(--slate)' }}>
          💡 Selecciona una <strong>cuenta contable</strong> para que la transacción se refleje en los estados financieros y el presupuesto.
        </div>

        <div className="space-y-3">
          {/* Row 1: Flow toggle (prominent) */}
          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>¿Es ingreso o gasto?</label>
            <div className="flex rounded-lg border overflow-hidden mt-1" style={{ borderColor: 'var(--stone)' }}>
              <button onClick={() => handleFlowChange(true)}
                className="flex-1 py-2.5 text-sm font-medium transition-all"
                style={form.is_income ? { backgroundColor: '#059669', color: 'white' } : { color: 'var(--charcoal)' }}>
                ↗ Ingreso
              </button>
              <button onClick={() => handleFlowChange(false)}
                className="flex-1 py-2.5 text-sm font-medium transition-all"
                style={!form.is_income ? { backgroundColor: '#dc2626', color: 'white' } : { color: 'var(--charcoal)' }}>
                ↘ Gasto
              </button>
            </div>
          </div>

          {/* Row 2: Cuenta Contable (THE KEY FIELD) */}
          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>
              Cuenta Contable <span className="text-red-500">*</span>
            </label>
            <select value={form.account_id} onChange={e => handleAccountChange(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border mt-1"
              style={{ borderColor: form.account_id ? 'var(--gold-600)' : 'var(--stone)', fontWeight: form.account_id ? 500 : 400 }}>
              <option value="">Seleccionar cuenta...</option>
              {/* Show expense accounts first if expense, income first if income */}
              {form.is_income ? (
                <>
                  {incomeAccounts.length > 0 && (
                    <optgroup label="📈 Ingresos (Profit & Loss)">
                      {incomeAccounts.map(a => <option key={a.id} value={a.id}>{acctLabel(a)}</option>)}
                    </optgroup>
                  )}
                  {expenseAccounts.length > 0 && (
                    <optgroup label="📉 Gastos (Profit & Loss)">
                      {expenseAccounts.map(a => <option key={a.id} value={a.id}>{acctLabel(a)}</option>)}
                    </optgroup>
                  )}
                </>
              ) : (
                <>
                  {expenseAccounts.length > 0 && (
                    <optgroup label="📉 Gastos (Profit & Loss)">
                      {expenseAccounts.map(a => <option key={a.id} value={a.id}>{acctLabel(a)}</option>)}
                    </optgroup>
                  )}
                  {incomeAccounts.length > 0 && (
                    <optgroup label="📈 Ingresos (Profit & Loss)">
                      {incomeAccounts.map(a => <option key={a.id} value={a.id}>{acctLabel(a)}</option>)}
                    </optgroup>
                  )}
                </>
              )}
              {assetAccounts.length > 0 && (
                <optgroup label="🏦 Activos (Balance Sheet)">
                  {assetAccounts.map(a => <option key={a.id} value={a.id}>{acctLabel(a)}</option>)}
                </optgroup>
              )}
              {liabilityAccounts.length > 0 && (
                <optgroup label="📋 Pasivos (Balance Sheet)">
                  {liabilityAccounts.map(a => <option key={a.id} value={a.id}>{acctLabel(a)}</option>)}
                </optgroup>
              )}
              {equityAccounts.length > 0 && (
                <optgroup label="💼 Patrimonio (Balance Sheet)">
                  {equityAccounts.map(a => <option key={a.id} value={a.id}>{acctLabel(a)}</option>)}
                </optgroup>
              )}
            </select>
            {!form.account_id && (
              <p className="text-[10px] mt-1 text-amber-600">⚠ Sin cuenta contable, la transacción no aparecerá en estados financieros ni presupuesto.</p>
            )}
          </div>

          {/* Row 3: Date + Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Fecha</label>
              <input type="date" value={form.transaction_date} onChange={e => setForm({ ...form, transaction_date: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} />
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Categoría</label>
              <select value={form.transaction_type} onChange={e => setForm({ ...form, transaction_type: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }}>
                {filteredTypes.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>

          {/* Row 4: Amount */}
          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Monto ($) <span className="text-red-500">*</span></label>
            <input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} placeholder="0.00" />
          </div>

          {/* Row 5: Description */}
          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Descripción <span className="text-red-500">*</span></label>
            <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} placeholder="Descripción del movimiento" />
          </div>

          {/* Row 6: Bank Account */}
          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Cuenta Bancaria</label>
            <select value={form.bank_account_id} onChange={e => setForm({ ...form, bank_account_id: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }}>
              <option value="">Sin asignar</option>
              {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name} ({b.bank_name || b.account_type})</option>)}
            </select>
          </div>

          {/* Row 7: Payment + Counterparty */}
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

          {/* Row 8: Notes */}
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

