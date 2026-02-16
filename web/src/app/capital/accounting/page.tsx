'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  DollarSign, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
  Building2, CreditCard, RefreshCw, Plus, Search, Filter, ChevronDown,
  ChevronRight, Calendar, Download, Loader2, Landmark, BarChart3,
  PieChart, Wallet, Receipt, Scale, BookOpen, FileText,
  ArrowRightLeft, Clock, X, Check, AlertCircle, Banknote,
  CircleDollarSign, Eye, Settings, History, Repeat,
  ChevronLeft, MoreHorizontal
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
//  STATEMENTS TAB
// ════════════════════════════════════════════════════════════════════════
function StatementsTab() {
  const [activeStatement, setActiveStatement] = useState<'income' | 'balance' | 'cashflow'>('income')
  const [incomeStmt, setIncomeStmt] = useState<IncomeStatement | null>(null)
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheet | null>(null)
  const [cashFlowStmt, setCashFlowStmt] = useState<CashFlowStatement | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        if (activeStatement === 'income') {
          const res = await fetch('/api/capital/accounting/reports/income-statement')
          if (res.ok) { const data = await res.json(); setIncomeStmt(data) }
        } else if (activeStatement === 'balance') {
          const res = await fetch('/api/capital/accounting/reports/balance-sheet')
          if (res.ok) { const data = await res.json(); setBalanceSheet(data) }
        } else {
          const res = await fetch('/api/capital/accounting/reports/cash-flow')
          if (res.ok) { const data = await res.json(); setCashFlowStmt(data) }
        }
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    }
    load()
  }, [activeStatement])

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {[
          { key: 'income', label: 'Estado de Resultados' },
          { key: 'balance', label: 'Balance General' },
          { key: 'cashflow', label: 'Flujo de Efectivo' },
        ].map(s => (
          <button key={s.key} onClick={() => setActiveStatement(s.key as any)}
            className="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
            style={activeStatement === s.key ? { backgroundColor: 'var(--gold-600)', color: 'white' } : { backgroundColor: 'var(--pearl)', color: 'var(--charcoal)' }}>
            {s.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--gold-600)' }} /></div>
      ) : (
        <>
          {/* Income Statement */}
          {activeStatement === 'income' && incomeStmt && (
            <div className="card-luxury p-6">
              <div className="text-center mb-6">
                <h2 className="font-serif text-xl font-bold" style={{ color: 'var(--ink)' }}>MANINOS CAPITAL LLC</h2>
                <p className="text-sm" style={{ color: 'var(--slate)' }}>Estado de Resultados</p>
                <p className="text-xs" style={{ color: 'var(--ash)' }}>{incomeStmt.period.start} al {incomeStmt.period.end}</p>
              </div>

              <div className="max-w-lg mx-auto space-y-4">
                <h3 className="font-semibold border-b pb-1" style={{ color: 'var(--ink)', borderColor: 'var(--sand)' }}>INGRESOS</h3>
                <StmtRow label="Pagos RTO" value={incomeStmt.income.rto_payments} />
                <StmtRow label="Intereses por Mora" value={incomeStmt.income.late_fees} />
                <StmtRow label="Otros Ingresos" value={incomeStmt.income.other_income} />
                <StmtRow label="TOTAL INGRESOS" value={incomeStmt.income.total} bold />

                <h3 className="font-semibold border-b pb-1 pt-4" style={{ color: 'var(--ink)', borderColor: 'var(--sand)' }}>GASTOS</h3>
                <StmtRow label="Adquisiciones" value={incomeStmt.expenses.acquisitions} />
                <StmtRow label="Retornos a Inversionistas" value={incomeStmt.expenses.investor_returns} />
                <StmtRow label="Gastos Operativos" value={incomeStmt.expenses.operating} />
                <StmtRow label="Otros Gastos" value={incomeStmt.expenses.other_expenses} />
                <StmtRow label="TOTAL GASTOS" value={incomeStmt.expenses.total} bold />

                <div className="pt-4 border-t-2" style={{ borderColor: 'var(--gold-600)' }}>
                  <StmtRow label="UTILIDAD NETA" value={incomeStmt.net_income} bold highlight />
                  <p className="text-xs text-right mt-1" style={{ color: 'var(--slate)' }}>Margen: {incomeStmt.margin_percent}%</p>
                </div>
              </div>
            </div>
          )}

          {/* Balance Sheet */}
          {activeStatement === 'balance' && balanceSheet && (
            <div className="card-luxury p-6">
              <div className="text-center mb-6">
                <h2 className="font-serif text-xl font-bold" style={{ color: 'var(--ink)' }}>MANINOS CAPITAL LLC</h2>
                <p className="text-sm" style={{ color: 'var(--slate)' }}>Balance General</p>
                <p className="text-xs" style={{ color: 'var(--ash)' }}>Al {balanceSheet.date}</p>
              </div>

              <div className="max-w-lg mx-auto space-y-4">
                <h3 className="font-semibold border-b pb-1" style={{ color: 'var(--ink)', borderColor: 'var(--sand)' }}>ACTIVOS</h3>
                <StmtRow label="Cuentas Bancarias" value={balanceSheet.assets.bank_accounts} />
                <StmtRow label="Efectivo en Mano" value={balanceSheet.assets.cash_on_hand} />
                <StmtRow label="Cuentas por Cobrar" value={balanceSheet.assets.accounts_receivable} />
                <StmtRow label="Propiedades (RTO)" value={balanceSheet.assets.property_held_for_rto} />
                <StmtRow label="TOTAL ACTIVOS" value={balanceSheet.assets.total} bold />

                <h3 className="font-semibold border-b pb-1 pt-4" style={{ color: 'var(--ink)', borderColor: 'var(--sand)' }}>PASIVOS</h3>
                <StmtRow label="Pagarés por Pagar" value={balanceSheet.liabilities.promissory_notes_payable} />
                <StmtRow label="Obligaciones con Inversionistas" value={balanceSheet.liabilities.investor_obligations} />
                <StmtRow label="TOTAL PASIVOS" value={balanceSheet.liabilities.total} bold />

                <h3 className="font-semibold border-b pb-1 pt-4" style={{ color: 'var(--ink)', borderColor: 'var(--sand)' }}>PATRIMONIO</h3>
                <StmtRow label="Utilidades Retenidas" value={balanceSheet.equity.retained_earnings} />
                <StmtRow label="TOTAL PATRIMONIO" value={balanceSheet.equity.total} bold />

                <div className="pt-4 border-t-2" style={{ borderColor: 'var(--gold-600)' }}>
                  <StmtRow label="PASIVOS + PATRIMONIO" value={balanceSheet.total_liabilities_and_equity} bold highlight />
                </div>
              </div>
            </div>
          )}

          {/* Cash Flow Statement */}
          {activeStatement === 'cashflow' && cashFlowStmt && (
            <div className="card-luxury p-6">
              <div className="text-center mb-6">
                <h2 className="font-serif text-xl font-bold" style={{ color: 'var(--ink)' }}>MANINOS CAPITAL LLC</h2>
                <p className="text-sm" style={{ color: 'var(--slate)' }}>Estado de Flujo de Efectivo</p>
                <p className="text-xs" style={{ color: 'var(--ash)' }}>{cashFlowStmt.period.start} al {cashFlowStmt.period.end}</p>
              </div>

              <div className="max-w-lg mx-auto space-y-4">
                <h3 className="font-semibold border-b pb-1" style={{ color: 'var(--ink)', borderColor: 'var(--sand)' }}>ACTIVIDADES OPERATIVAS</h3>
                <StmtRow label="Cobros RTO" value={cashFlowStmt.operating_activities.rto_collections} />
                <StmtRow label="Moras Cobradas" value={cashFlowStmt.operating_activities.late_fees_collected} />
                <StmtRow label="Gastos Operativos" value={cashFlowStmt.operating_activities.operating_expenses} />
                <StmtRow label="Neto Operativo" value={cashFlowStmt.operating_activities.net} bold />

                <h3 className="font-semibold border-b pb-1 pt-4" style={{ color: 'var(--ink)', borderColor: 'var(--sand)' }}>ACTIVIDADES DE INVERSIÓN</h3>
                <StmtRow label="Adquisición de Propiedades" value={cashFlowStmt.investing_activities.property_acquisitions} />
                <StmtRow label="Neto Inversión" value={cashFlowStmt.investing_activities.net} bold />

                <h3 className="font-semibold border-b pb-1 pt-4" style={{ color: 'var(--ink)', borderColor: 'var(--sand)' }}>ACTIVIDADES DE FINANCIAMIENTO</h3>
                <StmtRow label="Depósitos de Inversionistas" value={cashFlowStmt.financing_activities.investor_deposits} />
                <StmtRow label="Retornos a Inversionistas" value={cashFlowStmt.financing_activities.investor_returns} />
                <StmtRow label="Neto Financiamiento" value={cashFlowStmt.financing_activities.net} bold />

                <div className="pt-4 border-t-2" style={{ borderColor: 'var(--gold-600)' }}>
                  <StmtRow label="CAMBIO NETO EN EFECTIVO" value={cashFlowStmt.net_change_in_cash} bold highlight />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function StmtRow({ label, value, bold, highlight }: { label: string; value: number; bold?: boolean; highlight?: boolean }) {
  return (
    <div className={`flex justify-between py-1 ${bold ? 'font-semibold' : ''}`}>
      <span style={{ color: highlight ? 'var(--gold-700)' : 'var(--charcoal)' }}>{label}</span>
      <span style={{ color: value < 0 ? 'var(--danger)' : highlight ? 'var(--gold-700)' : 'var(--ink)' }}>{fmtFull(value)}</span>
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
//  BANKS & CASH TAB
// ════════════════════════════════════════════════════════════════════════
function BanksTab({ onAdd, onRefresh }: { onAdd: () => void; onRefresh: () => void }) {
  const toast = useToast()
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

      {/* Transfer Modal */}
      {showTransferModal && <TransferModal banks={banks} onClose={() => setShowTransferModal(false)} onDone={() => { setShowTransferModal(false); fetchBanks(); onRefresh() }} />}
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
    parent_account_id: '', is_header: false,
  })
  const [saving, setSaving] = useState(false)

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
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
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
              <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Tipo</label>
              <select value={form.account_type} onChange={e => setForm({ ...form, account_type: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }}>
                {Object.entries(ACCT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Cuenta Padre</label>
              <select value={form.parent_account_id} onChange={e => setForm({ ...form, parent_account_id: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }}>
                <option value="">Ninguna (raíz)</option>
                {headers.map(h => <option key={h.id} value={h.id}>{h.code} — {h.name}</option>)}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--charcoal)' }}>
            <input type="checkbox" checked={form.is_header} onChange={e => setForm({ ...form, is_header: e.target.checked })} />
            Es encabezado (grupo)
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

