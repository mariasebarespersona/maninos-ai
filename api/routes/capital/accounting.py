"""
Capital Accounting — Financial management for Maninos Homes LLC.

Features:
  - Dashboard: P&L overview, cash flow, KPIs
  - Transactions journal (auto + manual)
  - Financial Statements (Income Statement, Balance Sheet, Cash Flow)
  - Chart of Accounts (Capital-specific, user-provided)
  - Bank Statement Import (PDF/Excel/Image) with AI classification
  - Sync from existing capital_flows / rto_payments / investments
  - Export CSV
"""

import csv
import io
import json
import logging
from datetime import date, datetime, timedelta
from calendar import monthrange
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query, Request, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from tools.supabase_client import sb

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/accounting", tags=["Capital - Accounting"])


# ============================================================================
# SCHEMAS
# ============================================================================

class TransactionCreate(BaseModel):
    transaction_date: str
    transaction_type: str
    amount: float
    is_income: bool
    account_id: Optional[str] = None
    bank_account_id: Optional[str] = None
    description: str
    investor_id: Optional[str] = None
    property_id: Optional[str] = None
    rto_contract_id: Optional[str] = None
    client_id: Optional[str] = None
    payment_method: Optional[str] = None
    payment_reference: Optional[str] = None
    counterparty_name: Optional[str] = None
    notes: Optional[str] = None


class TransactionUpdate(BaseModel):
    transaction_date: Optional[str] = None
    transaction_type: Optional[str] = None
    amount: Optional[float] = None
    is_income: Optional[bool] = None
    account_id: Optional[str] = None
    description: Optional[str] = None
    payment_method: Optional[str] = None
    payment_reference: Optional[str] = None
    counterparty_name: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None


class AccountCreate(BaseModel):
    code: str
    name: str
    account_type: str  # asset, liability, equity, income, expense, cogs
    category: str = "general"
    parent_account_id: Optional[str] = None
    is_header: bool = False
    description: Optional[str] = None
    report_section: Optional[str] = None  # balance_sheet or profit_loss


class AccountUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    category: Optional[str] = None
    parent_account_id: Optional[str] = None
    is_header: Optional[bool] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    current_balance: Optional[float] = None


class BankAccountCreate(BaseModel):
    name: str
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    account_type: str = "checking"      # checking, savings, cash, credit_card, loan, other
    current_balance: float = 0
    is_primary: bool = False
    routing_number: Optional[str] = None
    zelle_email: Optional[str] = None
    zelle_phone: Optional[str] = None
    notes: Optional[str] = None


class BankAccountUpdate(BaseModel):
    name: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    account_type: Optional[str] = None
    current_balance: Optional[float] = None
    is_primary: Optional[bool] = None
    routing_number: Optional[str] = None
    zelle_email: Optional[str] = None
    zelle_phone: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None
    accounting_account_id: Optional[str] = None


class RTOPaymentRegister(BaseModel):
    """Manually register an RTO payment in Capital accounting."""
    client_name: str
    amount: float
    payment_method: str = "transfer"  # transfer, zelle, cash, check, stripe
    payment_reference: Optional[str] = None
    bank_account_id: Optional[str] = None
    transaction_date: Optional[str] = None  # YYYY-MM-DD, defaults to today
    description: Optional[str] = None
    notes: Optional[str] = None


class CapitalBudgetCreate(BaseModel):
    account_id: str
    period_month: int
    period_year: int
    budgeted_amount: float
    notes: Optional[str] = None


# ============================================================================
# HELPERS
# ============================================================================

def _get_period_dates(period: str, year: int, month: int):
    """Get start/end dates for a period."""
    if period == "all":
        return "2020-01-01", date.today().isoformat()
    elif period == "year":
        return f"{year}-01-01", f"{year}-12-31"
    elif period == "quarter":
        q = (month - 1) // 3
        start_month = q * 3 + 1
        end_month = start_month + 2
        _, last_day = monthrange(year, end_month)
        return f"{year}-{start_month:02d}-01", f"{year}-{end_month:02d}-{last_day}"
    else:  # month
        _, last_day = monthrange(year, month)
        return f"{year}-{month:02d}-01", f"{year}-{month:02d}-{last_day}"


# ============================================================================
# ACCOUNT MAPPING — transaction_type → accounting account code
# ============================================================================
# This mapping connects each transaction_type to its corresponding
# account in the chart of accounts (capital_accounts.code).
#
# When Sebastian provides the complete chart of accounts, update the codes
# here — the rest of the system picks them up automatically.
#
# Format: transaction_type → account_code (from capital_accounts)
# ============================================================================

# ── INCOME transaction types → account codes ──
INCOME_ACCOUNT_MAP: dict[str, str] = {
    "rto_payment":      "41000",   # RTO Rental Income (placeholder — needs account)
    "down_payment":     "42000",   # Down Payment Income (placeholder — needs account)
    "late_fee":         "43000",   # Late Fee Income (placeholder — needs account)
    "other_income":     "70000",   # OTHER INCOME (exists)
}

# ── EXPENSE transaction types → account codes ──
EXPENSE_ACCOUNT_MAP: dict[str, str] = {
    "acquisition":       "14300",  # RTO Properties (postable; 14100 is a header)
    "investor_interest": "71400",  # Interest paid — interest portion of a return
    "commission":        "60100",  # Commissions & fees (exists)
    "operating_expense": "60500",  # Office expenses (exists)
    "insurance":         "60500",  # Office expenses (fallback — update when account exists)
    "tax":               "60500",  # Office expenses (fallback — update when account exists)
    "other_expense":     "71000",  # Other Business Expenses (header child — exists)
}

# ── BALANCE SHEET transaction types → account codes ──
BALANCE_ACCOUNT_MAP: dict[str, str] = {
    "investor_deposit":  "23900",  # Investor Notes Payable (postable; 23000 is a header)
    "investor_return":   "23900",  # Return of PRINCIPAL reduces the same liability
    "transfer":          "10100",  # Bank and Cash Equivalents (inter-account transfer)
}

# Combined lookup for convenience
_FULL_ACCOUNT_MAP = {**INCOME_ACCOUNT_MAP, **EXPENSE_ACCOUNT_MAP, **BALANCE_ACCOUNT_MAP}

# Cache: code → account_id (populated lazily from DB)
_account_id_cache: dict[str, str | None] = {}


def _resolve_account_id(transaction_type: str) -> str | None:
    """Resolve a transaction_type to its account_id via the mapping.

    Returns the UUID of the matching capital_account, or None if the
    account code doesn't exist in the DB yet (placeholder).

    Uses an in-memory cache so we don't query Supabase for every single
    transaction during a sync batch.
    """
    code = _FULL_ACCOUNT_MAP.get(transaction_type)
    if not code:
        return None

    # Check cache first
    if code in _account_id_cache:
        return _account_id_cache[code]

    # Query DB
    try:
        result = sb.table("capital_accounts") \
            .select("id") \
            .eq("code", code) \
            .eq("is_active", True) \
            .limit(1) \
            .execute()
        account_id = result.data[0]["id"] if result.data else None
        _account_id_cache[code] = account_id
        return account_id
    except Exception as e:
        logger.warning(f"[account-mapping] Could not resolve code '{code}': {e}")
        _account_id_cache[code] = None
        return None


def _clear_account_cache():
    """Clear the account mapping cache (call after adding new accounts)."""
    _account_id_cache.clear()


# ============================================================================
# DASHBOARD
# ============================================================================

@router.get("/dashboard")
async def get_accounting_dashboard(
    period: str = Query("month"),
    year: Optional[int] = None,
    month: Optional[int] = None,
):
    """Capital accounting dashboard with P&L, cash flow, and KPIs."""
    now = date.today()
    y = year or now.year
    m = month or now.month
    start_date, end_date = _get_period_dates(period, y, m)

    # ---- Capital Transactions (manual) ----
    manual_txns = []
    try:
        q = sb.table("capital_transactions") \
            .select("*") \
            .gte("transaction_date", start_date) \
            .lte("transaction_date", end_date) \
            .neq("status", "voided") \
            .order("transaction_date", desc=True)
        manual_txns = q.execute().data or []
    except Exception as e:
        logger.warning(f"[capital-accounting] Could not fetch capital_transactions: {e}")

    # ---- RTO Payments (income) ----
    rto_payments = []
    try:
        rto_payments = sb.table("rto_payments") \
            .select("id, amount, paid_amount, status, due_date, paid_date, late_fee_amount, "
                    "rto_contracts(id, client_id, property_id, monthly_rent, clients(name), properties(address))") \
            .gte("due_date", start_date) \
            .lte("due_date", end_date) \
            .execute().data or []
    except Exception as e:
        logger.warning(f"[capital-accounting] Could not fetch rto_payments: {e}")

    # ---- Capital Flows (investments, acquisitions, returns) ----
    capital_flows = []
    try:
        capital_flows = sb.table("capital_flows") \
            .select("*") \
            .gte("flow_date", start_date) \
            .lte("flow_date", end_date) \
            .execute().data or []
    except Exception as e:
        logger.warning(f"[capital-accounting] Could not fetch capital_flows: {e}")

    # ---- Commissions ----
    commissions_paid = 0
    try:
        comms = sb.table("commissions") \
            .select("amount, status") \
            .eq("status", "paid") \
            .execute().data or []
        commissions_paid = sum(float(c.get("amount", 0)) for c in comms)
    except Exception:
        pass

    # ---- Compute P&L ----
    # Income
    rto_income = sum(float(p.get("paid_amount", 0) or 0) for p in rto_payments if p.get("status") == "paid")
    down_payment_income = sum(float(f.get("amount", 0)) for f in capital_flows if f.get("flow_type") == "down_payment_received")
    late_fee_income = sum(float(p.get("late_fee_amount", 0) or 0) for p in rto_payments if p.get("status") == "paid" and p.get("late_fee_amount"))
    investor_deposits = sum(abs(float(f.get("amount", 0))) for f in capital_flows if f.get("flow_type") == "investment_in")
    manual_income = sum(float(t["amount"]) for t in manual_txns if t["is_income"])
    other_income = sum(abs(float(f.get("amount", 0))) for f in capital_flows
                       if f.get("flow_type") in ("rent_income", "late_fee_income") and float(f.get("amount", 0)) > 0)

    total_income = rto_income + down_payment_income + late_fee_income + manual_income + other_income

    # Expenses
    acquisition_spend = sum(abs(float(f.get("amount", 0))) for f in capital_flows if f.get("flow_type") == "acquisition_out")
    investor_returns = sum(abs(float(f.get("amount", 0))) for f in capital_flows if f.get("flow_type") == "return_out")
    operating_expenses = sum(abs(float(f.get("amount", 0))) for f in capital_flows if f.get("flow_type") == "operating_expense")
    manual_expense = sum(float(t["amount"]) for t in manual_txns if not t["is_income"])

    total_expenses = acquisition_spend + investor_returns + commissions_paid + operating_expenses + manual_expense
    net_profit = total_income - total_expenses

    # ---- Receivables ----
    try:
        all_pending = sb.table("rto_payments") \
            .select("amount, due_date, status") \
            .in_("status", ["pending", "late", "scheduled"]) \
            .execute().data or []
        accounts_receivable = sum(float(p.get("amount", 0)) for p in all_pending)
        today_str = date.today().isoformat()
        accounts_receivable_overdue = sum(float(p.get("amount", 0)) for p in all_pending
                                          if p.get("due_date", "") < today_str and p.get("status") in ("pending", "late"))
    except Exception:
        accounts_receivable = 0
        accounts_receivable_overdue = 0

    # ---- Payables (investor obligations) ----
    try:
        active_notes = sb.table("promissory_notes") \
            .select("total_due, paid_amount") \
            .eq("status", "active") \
            .execute().data or []
        accounts_payable = sum(float(n.get("total_due", 0)) - float(n.get("paid_amount", 0) or 0) for n in active_notes)
    except Exception:
        accounts_payable = 0

    # ---- Cash Flow (12 months) ----
    cash_flow = []
    for i in range(11, -1, -1):
        cf_date = date(y, m, 1) - timedelta(days=30 * i)
        cf_y, cf_m = cf_date.year, cf_date.month
        cf_start, cf_end = _get_period_dates("month", cf_y, cf_m)
        month_label = f"{cf_m:02d}/{cf_y}"

        # Quick calculation from capital_flows
        month_in = sum(abs(float(f.get("amount", 0))) for f in capital_flows
                       if cf_start <= (f.get("flow_date") or "") <= cf_end and float(f.get("amount", 0)) > 0)
        month_out = sum(abs(float(f.get("amount", 0))) for f in capital_flows
                        if cf_start <= (f.get("flow_date") or "") <= cf_end and float(f.get("amount", 0)) < 0)
        # Add RTO payments for this month
        month_rto = sum(float(p.get("paid_amount", 0) or 0) for p in rto_payments
                        if p.get("status") == "paid" and cf_start <= (p.get("paid_date") or p.get("due_date") or "") <= cf_end)
        month_in += month_rto

        cash_flow.append({
            "month": f"{cf_y}-{cf_m:02d}",
            "label": month_label,
            "income": round(month_in, 2),
            "expense": round(month_out, 2),
            "net": round(month_in - month_out, 2),
        })

    # ---- Recent Transactions ----
    recent = sorted(manual_txns, key=lambda t: t.get("transaction_date", ""), reverse=True)[:10]

    # ---- Active Contracts ----
    try:
        contracts = sb.table("rto_contracts") \
            .select("id, status, purchase_price") \
            .execute().data or []
        active_contracts = len([c for c in contracts if c.get("status") == "active"])
        portfolio_value = sum(float(c.get("purchase_price", 0)) for c in contracts if c.get("status") == "active")
    except Exception:
        active_contracts = 0
        portfolio_value = 0

    # ---- Bank Accounts (balances DERIVED from the ledger, like Homes) ----
    bank_accounts = []
    total_bank_balance = 0
    total_cash_on_hand = 0
    try:
        from api.services.capital_ledger import get_all_capital_bank_balances
        bank_accounts = sb.table("capital_bank_accounts") \
            .select("*") \
            .eq("is_active", True) \
            .order("is_primary", desc=True) \
            .execute().data or []
        derived = get_all_capital_bank_balances()
        for b in bank_accounts:
            b["derived_balance"] = derived.get(b["id"], 0.0)
            # current_balance shown in the UI mirrors the ledger; the stored
            # column is only a reference and is never trusted for display.
            b["current_balance"] = b["derived_balance"]
        total_bank_balance = sum(float(b.get("derived_balance", 0)) for b in bank_accounts
                                 if b.get("account_type") != "cash")
        total_cash_on_hand = sum(float(b.get("derived_balance", 0)) for b in bank_accounts
                                  if b.get("account_type") == "cash")
    except Exception as e:
        logger.warning(f"[capital-accounting] Could not fetch bank accounts: {e}")

    # ---- Invoice-based AR/AP (Facturación) ----
    ar_invoices_total = 0.0
    ap_invoices_total = 0.0
    try:
        open_invoices = sb.table("capital_invoices") \
            .select("direction, balance_due") \
            .in_("status", ["sent", "partial", "overdue"]) \
            .execute().data or []
        for inv in open_invoices:
            bal = float(inv.get("balance_due") or 0)
            if bal <= 0:
                continue
            if inv.get("direction") == "receivable":
                ar_invoices_total += bal
            else:
                ap_invoices_total += bal
    except Exception as e:
        logger.warning(f"[capital-accounting] Could not fetch open invoices: {e}")

    return {
        "period": {"type": period, "start_date": start_date, "end_date": end_date, "year": y, "month": m},
        "bank_accounts": bank_accounts,
        "summary": {
            "total_income": round(total_income, 2),
            "total_expenses": round(total_expenses, 2),
            "net_profit": round(net_profit, 2),
            "margin_percent": round((net_profit / total_income * 100) if total_income > 0 else 0, 1),
            "rto_income": round(rto_income, 2),
            "down_payment_income": round(down_payment_income, 2),
            "late_fee_income": round(late_fee_income, 2),
            "investor_deposits": round(investor_deposits, 2),
            "acquisition_spend": round(acquisition_spend, 2),
            "investor_returns": round(investor_returns, 2),
            "commissions_paid": round(commissions_paid, 2),
            "operating_expenses": round(operating_expenses, 2),
            "manual_income": round(manual_income, 2),
            "manual_expense": round(manual_expense, 2),
            "accounts_receivable": round(accounts_receivable, 2),
            "accounts_receivable_overdue": round(accounts_receivable_overdue, 2),
            "accounts_payable": round(accounts_payable, 2),
            "ar_invoices_total": round(ar_invoices_total, 2),
            "ap_invoices_total": round(ap_invoices_total, 2),
            "active_contracts": active_contracts,
            "portfolio_value": round(portfolio_value, 2),
            "total_bank_balance": round(total_bank_balance, 2),
            "total_cash_on_hand": round(total_cash_on_hand, 2),
        },
        "cash_flow": cash_flow,
        "recent_transactions": recent,
    }


# ============================================================================
# TRANSACTIONS
# ============================================================================

@router.get("/transactions")
async def list_transactions(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=10, le=200),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    transaction_type: Optional[str] = None,
    flow: Optional[str] = None,  # 'income' | 'expense'
    search: Optional[str] = None,
    account_id: Optional[str] = None,   # drill-down: legs of one chart account
    account_code: Optional[str] = None,  # drill-down by code (resolved to id)
):
    """List capital transactions with filters and pagination."""
    try:
        # Drill-down from the financial statements: resolve a code to its id.
        if account_code and not account_id:
            ac = sb.table("capital_accounts").select("id").eq("code", account_code).limit(1).execute()
            if ac.data:
                account_id = ac.data[0]["id"]

        q = sb.table("capital_transactions") \
            .select("*, capital_accounts(code, name), capital_bank_accounts(name, bank_name)") \
            .neq("status", "voided") \
            .order("transaction_date", desc=True)

        if account_id:
            q = q.eq("account_id", account_id)
        if start_date:
            q = q.gte("transaction_date", start_date)
        if end_date:
            q = q.lte("transaction_date", end_date)
        if transaction_type:
            q = q.eq("transaction_type", transaction_type)
        if flow == "income":
            q = q.eq("is_income", True)
        elif flow == "expense":
            q = q.eq("is_income", False)
        if search:
            q = q.or_(f"description.ilike.%{search}%,counterparty_name.ilike.%{search}%,notes.ilike.%{search}%")

        offset = (page - 1) * per_page
        result = q.range(offset, offset + per_page - 1).execute()

        return {"ok": True, "transactions": result.data or [], "page": page, "per_page": per_page}
    except Exception as e:
        logger.error(f"Error listing capital transactions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _max_capital_txn_seq(prefix: str) -> int:
    """Highest sequence number in use today, parsing the numeric part and
    IGNORING the -D/-C suffix that ledger pairs add. Count-based numbering
    was fragile: post_to_capital_ledger writes two rows (…-D and …-C) per
    base number, so a plain count desynced from the real max and could
    reissue a number, violating the UNIQUE index. Max-based never reissues."""
    try:
        existing = sb.table("capital_transactions") \
            .select("transaction_number") \
            .like("transaction_number", f"{prefix}%") \
            .execute().data or []
    except Exception:
        return 0
    hi = 0
    for row in existing:
        num = row.get("transaction_number") or ""
        mid = num[len(prefix):].split("-")[0]  # strip -D / -C suffix
        if mid.isdigit():
            hi = max(hi, int(mid))
    return hi


def _generate_capital_txn_number() -> str:
    today = date.today().strftime("%y%m%d")
    prefix = f"TXN-{today}-"
    return f"{prefix}{_max_capital_txn_seq(prefix) + 1:03d}"


@router.post("/transactions")
async def create_transaction(data: TransactionCreate):
    """Create a manual capital transaction as a DOUBLE-ENTRY pair (like Homes).

    If no account_id is provided, the system auto-assigns one based on
    the transaction_type using the ACCOUNT_MAP. If a bank_account_id is
    provided and the bank is linked to a chart account, the bank-side
    counterpart row is created and linked automatically.
    """
    try:
        # Auto-assign account_id if not explicitly provided
        account_id = data.account_id or _resolve_account_id(data.transaction_type)
        txn_number = _generate_capital_txn_number()

        record = {
            "transaction_number": txn_number,
            "transaction_date": data.transaction_date,
            "transaction_type": data.transaction_type,
            "amount": data.amount,
            "is_income": data.is_income,
            "account_id": account_id,
            "bank_account_id": data.bank_account_id,
            "description": data.description,
            "investor_id": data.investor_id,
            "property_id": data.property_id,
            "rto_contract_id": data.rto_contract_id,
            "client_id": data.client_id,
            "payment_method": data.payment_method,
            "payment_reference": data.payment_reference,
            "counterparty_name": data.counterparty_name,
            "notes": data.notes,
            "status": "confirmed",
            "created_by": "admin",
        }
        # Remove None values
        record = {k: v for k, v in record.items() if v is not None}

        result = sb.table("capital_transactions").insert(record).execute()
        pnl_txn = result.data[0] if result.data else None
        if not pnl_txn:
            raise HTTPException(status_code=500, detail="Error creating transaction")

        try:
            from api.routes.capital.accounting_invoices import _log_capital_audit
            _log_capital_audit("capital_transactions", pnl_txn["id"], "create",
                               description=f"Created {txn_number}: ${data.amount}")
        except Exception:
            pass

        # Double-entry: bank-side counterpart when the bank is chart-linked.
        # This must be ATOMIC with the P&L leg: if the bank leg cannot be
        # written (no accounting_account_id, or the insert throws), we roll
        # back (delete) the P&L leg and raise — a lone P&L row that still
        # carries a bank_account_id is an unbalanced single leg that skews the
        # derived bank balance.
        if data.bank_account_id:
            try:
                ba = sb.table("capital_bank_accounts").select("accounting_account_id") \
                    .eq("id", data.bank_account_id).execute()
                bank_accounting_id = ba.data[0].get("accounting_account_id") if ba.data else None
                if not bank_accounting_id:
                    raise ValueError(
                        f"Bank account {data.bank_account_id} has no accounting_account_id — "
                        f"cannot post a balanced pair"
                    )

                bank_data = {
                    "transaction_number": _generate_capital_txn_number(),
                    "transaction_date": data.transaction_date,
                    "transaction_type": data.transaction_type,
                    "amount": data.amount,
                    "is_income": data.is_income,  # deposits grow the bank, withdrawals shrink it
                    "account_id": bank_accounting_id,
                    "bank_account_id": data.bank_account_id,
                    "linked_transaction_id": pnl_txn["id"],
                    "counterparty_name": data.counterparty_name,
                    "description": data.description,
                    "notes": f"Contrapartida bancaria de {txn_number}",
                    "status": "confirmed",
                }
                bank_data = {k: v for k, v in bank_data.items() if v is not None}
                bank_result = sb.table("capital_transactions").insert(bank_data).execute()
                if not bank_result.data:
                    raise RuntimeError("Bank leg insert returned no data")

                sb.table("capital_transactions").update(
                    {"linked_transaction_id": bank_result.data[0]["id"]}
                ).eq("id", pnl_txn["id"]).execute()
                pnl_txn["linked_transaction_id"] = bank_result.data[0]["id"]
                # The P&L leg keeps bank_account_id=None so derived balances
                # only count the bank leg once.
                sb.table("capital_transactions").update(
                    {"bank_account_id": None}
                ).eq("id", pnl_txn["id"]).execute()
                pnl_txn["bank_account_id"] = None
            except Exception as be:
                # Roll back the orphaned P&L leg so we never persist an
                # unbalanced single row, then surface the error.
                try:
                    sb.table("capital_transactions").delete().eq("id", pnl_txn["id"]).execute()
                except Exception as de:
                    logger.error(f"Bank leg failed AND P&L rollback failed for {txn_number}: "
                                 f"bank={be} rollback={de}")
                raise HTTPException(
                    status_code=400,
                    detail=f"No se pudo registrar la contrapartida bancaria (transacción revertida): {be}",
                )

        return {"ok": True, "transaction": pnl_txn}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating capital transaction: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/transactions/{transaction_id}")
async def update_transaction(transaction_id: str, data: TransactionUpdate):
    """Update a capital transaction."""
    try:
        updates = {k: v for k, v in data.dict(exclude_unset=True).items() if v is not None}
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")

        result = sb.table("capital_transactions") \
            .update(updates) \
            .eq("id", transaction_id) \
            .execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Transaction not found")

        return {"ok": True, "transaction": result.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating capital transaction: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/transactions/{transaction_id}")
async def void_transaction(transaction_id: str):
    """Void (soft-delete) a transaction AND its linked double-entry leg."""
    try:
        row = sb.table("capital_transactions").select("id, linked_transaction_id") \
            .eq("id", transaction_id).execute()
        sb.table("capital_transactions") \
            .update({"status": "voided"}) \
            .eq("id", transaction_id) \
            .execute()
        linked = (row.data[0].get("linked_transaction_id") if row.data else None)
        if linked:
            sb.table("capital_transactions") \
                .update({"status": "voided"}).eq("id", linked).execute()
        try:
            from api.routes.capital.accounting_invoices import _log_capital_audit
            _log_capital_audit("capital_transactions", transaction_id, "void")
        except Exception:
            pass
        return {"ok": True, "message": "Transaction voided"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/transactions/{transaction_id}/split")
async def split_capital_transaction(transaction_id: str, data: dict):
    """Split a transaction into multiple parts. Sum of parts must equal the
    original amount. Voids the original pair and creates child pairs."""
    parts = data.get("parts")
    if not parts or not isinstance(parts, list) or len(parts) < 2:
        raise HTTPException(status_code=400, detail="Must provide at least 2 parts")

    parent = sb.table("capital_transactions").select("*").eq("id", transaction_id).execute()
    if not parent.data:
        raise HTTPException(status_code=404, detail="Transaction not found")
    p = parent.data[0]

    parent_amount = float(p["amount"])
    parts_total = sum(abs(float(pt["amount"])) for pt in parts)
    if abs(parts_total - abs(parent_amount)) > 0.01:
        raise HTTPException(status_code=400, detail=f"Parts total ({parts_total:.2f}) != transaction ({abs(parent_amount):.2f})")

    # Void original + linked bank-side leg
    sb.table("capital_transactions").update({"status": "voided"}).eq("id", transaction_id).execute()
    if p.get("linked_transaction_id"):
        sb.table("capital_transactions").update({"status": "voided"}).eq("id", p["linked_transaction_id"]).execute()
    try:
        from api.routes.capital.accounting_invoices import _log_capital_audit
        _log_capital_audit("capital_transactions", transaction_id, "update",
                           description=f"Split into {len(parts)} parts")
    except Exception:
        pass

    # Bank chart account for double-entry on children. The P&L leg doesn't
    # carry the bank id (only the bank leg does), so fall back to the linked
    # counterpart's bank when splitting from the P&L side.
    split_bank_id = p.get("bank_account_id")
    if not split_bank_id and p.get("linked_transaction_id"):
        linked_row = sb.table("capital_transactions").select("bank_account_id") \
            .eq("id", p["linked_transaction_id"]).execute().data
        if linked_row:
            split_bank_id = linked_row[0].get("bank_account_id")
    bank_accounting_id = None
    if split_bank_id:
        ba = sb.table("capital_bank_accounts").select("accounting_account_id").eq("id", split_bank_id).execute()
        if ba.data and ba.data[0].get("accounting_account_id"):
            bank_accounting_id = ba.data[0]["accounting_account_id"]

    # Seed the running sequence ONCE and increment locally — re-querying per
    # insert would race and can reissue a number (UNIQUE violation).
    today = date.today().strftime("%y%m%d")
    prefix = f"TXN-{today}-"
    seq = _max_capital_txn_seq(prefix)

    def _next_number() -> str:
        nonlocal seq
        seq += 1
        return f"{prefix}{seq:03d}"

    created = []
    for pt in parts:
        child = {
            "transaction_number": _next_number(),
            "transaction_date": p["transaction_date"],
            "transaction_type": p["transaction_type"],
            "amount": float(pt["amount"]),
            "is_income": p["is_income"],
            "account_id": pt.get("account_id") or p.get("account_id"),
            "description": pt.get("description", p.get("description", ""))[:500],
            "counterparty_name": p.get("counterparty_name"),
            "investor_id": p.get("investor_id"),
            "rto_contract_id": p.get("rto_contract_id"),
            "client_id": p.get("client_id"),
            "property_id": pt.get("property_id") or p.get("property_id"),
            "entity_type": p.get("entity_type"),
            "entity_id": p.get("entity_id"),
            "payment_method": p.get("payment_method"),
            "status": "confirmed",
        }
        # The P&L child carries no bank id when a bank counterpart is created,
        # so derived balances count the movement once.
        if not bank_accounting_id:
            child["bank_account_id"] = split_bank_id
        child = {k: v for k, v in child.items() if v is not None}
        try:
            r = sb.table("capital_transactions").insert(child).execute()
            if r.data:
                pnl_id = r.data[0]["id"]
                created.append(r.data[0])
                if bank_accounting_id:
                    bank_child = {
                        "transaction_number": _next_number(),
                        "transaction_date": p["transaction_date"],
                        "transaction_type": p["transaction_type"],
                        "amount": float(pt["amount"]),
                        "is_income": p["is_income"],
                        "account_id": bank_accounting_id,
                        "linked_transaction_id": pnl_id,
                        "description": pt.get("description", p.get("description", ""))[:500],
                        "bank_account_id": split_bank_id,
                        "notes": "Contrapartida bancaria (split)",
                        "status": "confirmed",
                    }
                    bank_r = sb.table("capital_transactions").insert(bank_child).execute()
                    if bank_r.data:
                        sb.table("capital_transactions").update(
                            {"linked_transaction_id": bank_r.data[0]["id"]}
                        ).eq("id", pnl_id).execute()
        except Exception as e:
            logger.error(f"[capital-accounting] Split child error: {e}")

    return {"ok": True, "message": f"Split into {len(created)} parts", "children": created}


# ============================================================================
# CHART OF ACCOUNTS
# ============================================================================

@router.get("/accounts")
async def list_accounts():
    """List all Capital accounts."""
    try:
        result = sb.table("capital_accounts") \
            .select("*") \
            .eq("is_active", True) \
            .order("code") \
            .execute()
        return {"ok": True, "accounts": result.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/accounts/tree")
async def get_accounts_tree():
    """Get hierarchical chart of accounts with computed balances."""
    try:
        accounts = sb.table("capital_accounts") \
            .select("*") \
            .eq("is_active", True) \
            .order("display_order") \
            .order("code") \
            .execute().data or []
    except Exception:
        accounts = sb.table("capital_accounts") \
            .select("*") \
            .eq("is_active", True) \
            .order("code") \
            .execute().data or []

    # Compute balances from transactions
    balances = {}
    try:
        txns = sb.table("capital_transactions") \
            .select("account_id, amount, is_income") \
            .neq("status", "voided") \
            .execute().data or []
        for t in txns:
            aid = t.get("account_id")
            if aid:
                amt = float(t["amount"])
                if aid not in balances:
                    balances[aid] = 0
                balances[aid] += amt
    except Exception as e:
        logger.warning(f"[capital accounts/tree] Could not compute balances: {e}")

    # Add manual current_balance
    for acc in accounts:
        acc_id = acc["id"]
        manual_bal = float(acc.get("current_balance") or 0)
        if manual_bal != 0:
            balances[acc_id] = balances.get(acc_id, 0) + manual_bal

    # Build tree
    by_id = {}
    for a in accounts:
        by_id[a["id"]] = {**a, "balance": round(balances.get(a["id"], 0), 2), "children": []}

    roots = []
    for a in accounts:
        node = by_id[a["id"]]
        pid = a.get("parent_account_id")
        if pid and pid in by_id:
            by_id[pid]["children"].append(node)
        else:
            roots.append(node)

    # Propagate balances up
    def compute_subtotal(node):
        subtotal = node["balance"]
        for child in node.get("children", []):
            subtotal += compute_subtotal(child)
        node["subtotal"] = round(subtotal, 2)
        return subtotal

    for r in roots:
        compute_subtotal(r)

    flat = [{**a, "balance": round(balances.get(a["id"], 0), 2)} for a in accounts]

    return {"ok": True, "tree": roots, "flat": flat}


@router.post("/accounts")
async def create_account(data: AccountCreate):
    """Create a new Capital account."""
    try:
        # Auto-derive report_section from account_type if not provided
        report_section = data.report_section
        if not report_section:
            if data.account_type in ("asset", "liability", "equity"):
                report_section = "balance_sheet"
            else:
                report_section = "profit_loss"

        record = {
            "code": data.code,
            "name": data.name,
            "account_type": data.account_type,
            "category": data.category,
            "parent_account_id": data.parent_account_id,
            "is_header": data.is_header,
            "description": data.description,
            "report_section": report_section,
        }
        record = {k: v for k, v in record.items() if v is not None}
        result = sb.table("capital_accounts").insert(record).execute()
        return {"ok": True, "account": result.data[0] if result.data else None}
    except Exception as e:
        logger.error(f"Error creating capital account: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/accounts/{account_id}")
async def update_account(account_id: str, data: AccountUpdate):
    """Update a Capital account."""
    try:
        updates = {k: v for k, v in data.dict(exclude_unset=True).items() if v is not None}
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")

        result = sb.table("capital_accounts") \
            .update(updates) \
            .eq("id", account_id) \
            .execute()
        return {"ok": True, "account": result.data[0] if result.data else None}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/accounts/{account_id}")
async def deactivate_account(account_id: str):
    """Deactivate (soft-delete) a Capital account."""
    try:
        sb.table("capital_accounts") \
            .update({"is_active": False}) \
            .eq("id", account_id) \
            .execute()
        return {"ok": True, "message": "Account deactivated"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class ResetBalancesRequest(BaseModel):
    scope: str = "all"  # "all" | "profit_loss" | "balance_sheet"


@router.post("/accounts/reset-balances")
async def reset_account_balances(request: Request):
    """Reset financial statements by deleting bank_statement transactions and resetting movements.

    Body: { "scope": "all" | "profit_loss" | "balance_sheet" }
    """
    try:
        body = await request.json()
        scope = body.get("scope", "all")

        # 1. Reset current_balance on accounts
        accounts = sb.table("capital_accounts") \
            .select("id, code, account_type, current_balance") \
            .eq("is_active", True) \
            .execute().data or []

        reset_count = 0
        for acc in accounts:
            bal = float(acc.get("current_balance") or 0)
            if bal == 0:
                continue
            atype = acc.get("account_type", "")
            if scope == "profit_loss" and atype not in ("income", "expense", "cogs"):
                continue
            if scope == "balance_sheet" and atype not in ("asset", "liability", "equity"):
                continue
            sb.table("capital_accounts") \
                .update({"current_balance": 0}) \
                .eq("id", acc["id"]) \
                .execute()
            reset_count += 1

        # 2. Clear statement movements & bank_statement transactions
        # Clear ALL FK references on statement_movements that point to transactions
        sb.table("capital_statement_movements") \
            .update({"transaction_id": None, "matched_transaction_id": None}) \
            .neq("status", "pending") \
            .execute()

        # Reset posted movements back to confirmed (so they can be re-integrated)
        sb.table("capital_statement_movements") \
            .update({"status": "confirmed"}) \
            .eq("status", "posted") \
            .execute()

        # Reset bank_statements stats
        sb.table("capital_bank_statements") \
            .update({"posted_movements": 0, "status": "review"}) \
            .in_("status", ["completed", "partial"]) \
            .execute()

        # 3. Delete transactions for the selected scope
        # First, get all account IDs in the target scope
        scope_types = {
            "profit_loss": ("income", "expense", "cogs"),
            "balance_sheet": ("asset", "liability", "equity"),
            "all": ("income", "expense", "cogs", "asset", "liability", "equity"),
        }
        target_types = scope_types.get(scope, scope_types["all"])

        scope_account_ids = [a["id"] for a in accounts if a.get("account_type") in target_types]

        deleted_count = 0
        if scope_account_ids:
            # Clear linked_transaction_id self-references before deleting (avoid FK constraint)
            sb.table("capital_transactions") \
                .update({"linked_transaction_id": None}) \
                .in_("account_id", scope_account_ids) \
                .execute()

            # Delete ALL transactions for the scoped accounts
            deleted = sb.table("capital_transactions") \
                .delete() \
                .in_("account_id", scope_account_ids) \
                .execute()
            deleted_count = len(deleted.data or [])

        scope_labels = {"all": "todas", "profit_loss": "P&L", "balance_sheet": "Balance Sheet"}
        return {
            "ok": True,
            "reset_count": reset_count,
            "deleted_transactions": deleted_count,
            "scope": scope,
            "message": f"Cifras vaciadas: {deleted_count} transacciones eliminadas, {reset_count} cuentas reseteadas ({scope_labels.get(scope, scope)})",
        }

    except Exception as e:
        logger.error(f"Error resetting Capital account balances: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# BANK ACCOUNTS & CASH
# ============================================================================

@router.get("/bank-accounts")
async def list_bank_accounts(include_inactive: bool = False):
    """List Capital bank and cash accounts.

    Balances are DERIVED from the ledger (single source of truth, like
    Homes). Each bank also reports the latest uploaded statement's ending
    balance and the discrepancy vs the ledger."""
    try:
        from api.services.capital_ledger import get_all_capital_bank_balances
        q = sb.table("capital_bank_accounts").select("*")
        if not include_inactive:
            q = q.eq("is_active", True)
        result = q.order("is_primary", desc=True).order("name").execute()
        banks = result.data or []
        derived = get_all_capital_bank_balances()

        # Latest statement per bank (for the discrepancy indicator)
        latest_stmt: dict = {}
        try:
            stmts = sb.table("capital_bank_statements") \
                .select("bank_account_id, ending_balance, statement_period_end, created_at") \
                .order("created_at", desc=True).limit(200).execute().data or []
            for s in stmts:
                bid = s.get("bank_account_id")
                if bid and bid not in latest_stmt:
                    latest_stmt[bid] = s
        except Exception:
            pass

        for b in banks:
            b["derived_balance"] = derived.get(b["id"], 0.0)
            b["stored_balance"] = b.get("current_balance")
            b["current_balance"] = b["derived_balance"]
            stmt = latest_stmt.get(b["id"])
            if stmt and stmt.get("ending_balance") is not None:
                b["latest_statement_ending"] = float(stmt["ending_balance"])
                b["latest_statement_period_end"] = stmt.get("statement_period_end")
                b["discrepancy"] = round(float(stmt["ending_balance"]) - b["derived_balance"], 2)
            else:
                b["latest_statement_ending"] = None
                b["discrepancy"] = None

        total_balance = sum(float(b.get("derived_balance", 0)) for b in banks)
        bank_balance = sum(float(b.get("derived_balance", 0)) for b in banks
                           if b.get("account_type") not in ("cash",))
        cash_on_hand = sum(float(b.get("derived_balance", 0)) for b in banks
                            if b.get("account_type") == "cash")
        return {
            "ok": True,
            "bank_accounts": banks,
            "summary": {
                "total_balance": round(total_balance, 2),
                "bank_balance": round(bank_balance, 2),
                "cash_on_hand": round(cash_on_hand, 2),
                "count": len(banks),
            },
        }
    except Exception as e:
        logger.error(f"Error listing capital bank accounts: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/bank-accounts/{bank_id}")
async def get_bank_account(bank_id: str):
    """Get a single bank account with recent transactions."""
    try:
        result = sb.table("capital_bank_accounts").select("*").eq("id", bank_id).single().execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Bank account not found")
        try:
            from api.services.capital_ledger import get_capital_bank_balance
            result.data["derived_balance"] = get_capital_bank_balance(bank_id)
            result.data["current_balance"] = result.data["derived_balance"]
        except Exception:
            pass

        # Recent transactions for this bank account
        txns = sb.table("capital_transactions") \
            .select("id, transaction_date, transaction_type, amount, is_income, description, counterparty_name, status") \
            .eq("bank_account_id", bank_id) \
            .neq("status", "voided") \
            .order("transaction_date", desc=True) \
            .limit(50) \
            .execute().data or []

        return {"ok": True, "bank_account": result.data, "transactions": txns}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/bank-accounts")
async def create_bank_account(data: BankAccountCreate):
    """Create a new bank/cash account for Capital.

    Also auto-creates its chart account under '10100 Bank and Cash
    Equivalents' and links it via accounting_account_id, so the ledger can
    post against this bank immediately (Homes required a manual link;
    Capital does it automatically)."""
    try:
        record = {k: v for k, v in data.model_dump().items() if v is not None}
        result = sb.table("capital_bank_accounts").insert(record).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Error creating bank account")
        bank = result.data[0]

        # Auto-provision + link the chart account. Retry on code collision:
        # two banks created back-to-back can race on the "next free 101xx code"
        # (read lag makes both pick the same number → UNIQUE violation), which
        # previously left the second bank with no chart account and unusable
        # for ledger postings.
        try:
            parent = sb.table("capital_accounts").select("id").eq("code", "10100").limit(1).execute()
            parent_id = parent.data[0]["id"] if parent.data else None
            acct_row = None
            for attempt in range(6):
                existing = sb.table("capital_accounts").select("code").like("code", "101%").execute().data or []
                nums = [int(a["code"]) for a in existing if (a.get("code") or "").isdigit()]
                next_code = str((max(nums) if nums else 10100) + 10 + attempt * 10)
                try:
                    acct = sb.table("capital_accounts").insert({
                        "code": next_code,
                        "name": bank["name"],
                        "account_type": "asset",
                        "category": "bank",
                        "is_header": False,
                        "report_section": "balance_sheet",
                        "parent_account_id": parent_id,
                    }).execute()
                    if acct.data:
                        acct_row = acct.data[0]
                        break
                except Exception as insert_err:
                    # Likely a duplicate code from a concurrent create — retry
                    # with a bumped code.
                    logger.info(f"[capital-accounting] bank chart code {next_code} taken, retrying: {insert_err}")
                    continue
            if acct_row:
                sb.table("capital_bank_accounts").update(
                    {"accounting_account_id": acct_row["id"]}
                ).eq("id", bank["id"]).execute()
                bank["accounting_account_id"] = acct_row["id"]
            else:
                logger.warning(f"[capital-accounting] Could not provision chart account for bank {bank['id']} after retries")
        except Exception as e:
            logger.warning(f"[capital-accounting] Could not auto-link chart account for bank {bank['id']}: {e}")

        return {"ok": True, "bank_account": bank}
    except Exception as e:
        logger.error(f"Error creating capital bank account: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/bank-accounts/{bank_id}")
async def update_bank_account(bank_id: str, data: BankAccountUpdate):
    """Update a Capital bank/cash account."""
    try:
        updates = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        result = sb.table("capital_bank_accounts") \
            .update(updates) \
            .eq("id", bank_id) \
            .execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Bank account not found")
        return {"ok": True, "bank_account": result.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/bank-accounts/{bank_id}")
async def deactivate_bank_account(bank_id: str):
    """Soft-delete a Capital bank account."""
    try:
        sb.table("capital_bank_accounts") \
            .update({"is_active": False}) \
            .eq("id", bank_id) \
            .execute()
        return {"ok": True, "message": "Bank account deactivated"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/bank-accounts/{bank_id}/transfer")
async def bank_transfer(bank_id: str, data: dict):
    """Transfer money between two Capital bank/cash accounts."""
    target_id = data.get("target_bank_id")
    amount = float(data.get("amount", 0))
    description = data.get("description", "Transferencia entre cuentas")
    if not target_id or amount <= 0:
        raise HTTPException(status_code=400, detail="target_bank_id y amount > 0 son requeridos")
    if bank_id == target_id:
        raise HTTPException(status_code=400, detail="No puede transferir a la misma cuenta")

    try:
        # Get both accounts
        source = sb.table("capital_bank_accounts").select("*").eq("id", bank_id).single().execute().data
        target = sb.table("capital_bank_accounts").select("*").eq("id", target_id).single().execute().data
        if not source or not target:
            raise HTTPException(status_code=404, detail="Una o ambas cuentas no existen")

        # Balanced pair via the ledger engine — zero P&L impact, and derived
        # balances move automatically. No manual current_balance writes.
        from api.services.capital_ledger import post_to_capital_ledger, get_capital_bank_balance
        try:
            post_to_capital_ledger(
                event_type="bank_transfer",
                amount=amount,
                date=data.get("transfer_date") or date.today().isoformat(),
                bank_account_id_from=bank_id,
                bank_account_id_to=target_id,
                description_data={"concept": description},
                payment_method="bank_transfer",
                status="confirmed",
                created_by=data.get("created_by") or "admin",
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"No se puede registrar la transferencia: {e}")

        return {
            "ok": True,
            "message": f"Transferencia de ${amount:,.2f} completada",
            "source_balance": get_capital_bank_balance(bank_id),
            "target_balance": get_capital_bank_balance(target_id),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in bank transfer: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# FINANCIAL STATEMENTS
# ============================================================================

@router.get("/reports/income-statement")
async def get_income_statement(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
):
    """Generate an Income Statement (P&L) for Capital."""
    now = date.today()
    sd = start_date or date(now.year, now.month, 1).isoformat()
    ed = end_date or now.isoformat()

    # Get all transactions in period
    txns = []
    try:
        txns = sb.table("capital_transactions") \
            .select("transaction_type, amount, is_income, account_id") \
            .gte("transaction_date", sd) \
            .lte("transaction_date", ed) \
            .neq("status", "voided") \
            .execute().data or []
    except Exception:
        pass

    # Also pull from RTO payments
    rto_paid = []
    try:
        rto_paid = sb.table("rto_payments") \
            .select("paid_amount, late_fee_amount, status, due_date") \
            .eq("status", "paid") \
            .gte("due_date", sd) \
            .lte("due_date", ed) \
            .execute().data or []
    except Exception:
        pass

    # Also pull from capital_flows
    flows = []
    try:
        flows = sb.table("capital_flows") \
            .select("flow_type, amount, flow_date") \
            .gte("flow_date", sd) \
            .lte("flow_date", ed) \
            .execute().data or []
    except Exception:
        pass

    # Calculate categories
    rto_payment_income = sum(float(p.get("paid_amount", 0) or 0) for p in rto_paid)
    late_fee_income = sum(float(p.get("late_fee_amount", 0) or 0) for p in rto_paid if p.get("late_fee_amount"))
    manual_income = sum(float(t["amount"]) for t in txns if t["is_income"])
    flow_income = sum(abs(float(f.get("amount", 0))) for f in flows
                      if f.get("flow_type") in ("rent_income", "late_fee_income", "down_payment_received")
                      and float(f.get("amount", 0)) > 0)

    total_income = rto_payment_income + late_fee_income + manual_income + flow_income

    acquisition_cost = sum(abs(float(f.get("amount", 0))) for f in flows if f.get("flow_type") == "acquisition_out")
    investor_returns = sum(abs(float(f.get("amount", 0))) for f in flows if f.get("flow_type") == "return_out")
    operating_exp = sum(abs(float(f.get("amount", 0))) for f in flows if f.get("flow_type") == "operating_expense")
    manual_expense = sum(float(t["amount"]) for t in txns if not t["is_income"])

    total_expenses = acquisition_cost + investor_returns + operating_exp + manual_expense
    net_income = total_income - total_expenses

    return {
        "ok": True,
        "period": {"start": sd, "end": ed},
        "income": {
            "rto_payments": round(rto_payment_income, 2),
            "late_fees": round(late_fee_income, 2),
            "other_income": round(manual_income + flow_income, 2),
            "total": round(total_income, 2),
        },
        "expenses": {
            "acquisitions": round(acquisition_cost, 2),
            "investor_returns": round(investor_returns, 2),
            "operating": round(operating_exp, 2),
            "other_expenses": round(manual_expense, 2),
            "total": round(total_expenses, 2),
        },
        "net_income": round(net_income, 2),
        "margin_percent": round((net_income / total_income * 100) if total_income > 0 else 0, 1),
    }


@router.get("/reports/balance-sheet")
async def get_balance_sheet():
    """Generate a Balance Sheet for Capital."""
    try:
        # ASSETS
        # Cash & bank = from capital_bank_accounts (preferred) or fallback to capital_flows sum
        bank_accs = []
        try:
            bank_accs = sb.table("capital_bank_accounts") \
                .select("current_balance, account_type") \
                .eq("is_active", True) \
                .execute().data or []
        except Exception:
            pass

        if bank_accs:
            bank_balance = sum(float(b.get("current_balance", 0)) for b in bank_accs
                               if b.get("account_type") not in ("cash",))
            cash_on_hand = sum(float(b.get("current_balance", 0)) for b in bank_accs
                                if b.get("account_type") == "cash")
            cash_balance = bank_balance + cash_on_hand
        else:
            flows = sb.table("capital_flows").select("amount").execute().data or []
            cash_balance = sum(float(f.get("amount", 0)) for f in flows)
            bank_balance = cash_balance
            cash_on_hand = 0

        # Receivables = pending RTO payments
        pending = sb.table("rto_payments") \
            .select("amount") \
            .in_("status", ["pending", "late", "scheduled"]) \
            .execute().data or []
        receivables = sum(float(p.get("amount", 0)) for p in pending)

        # Property assets (active RTO contracts = properties held)
        contracts = sb.table("rto_contracts") \
            .select("purchase_price, status") \
            .in_("status", ["active", "completed"]) \
            .execute().data or []
        property_assets = sum(float(c.get("purchase_price", 0)) for c in contracts)

        total_assets = cash_balance + receivables + property_assets

        # LIABILITIES
        # Promissory notes payable
        notes = sb.table("promissory_notes") \
            .select("total_due, paid_amount, status") \
            .eq("status", "active") \
            .execute().data or []
        notes_payable = sum(float(n.get("total_due", 0)) - float(n.get("paid_amount", 0) or 0) for n in notes)

        # Investor deposits (total invested - returned)
        investments = sb.table("investments") \
            .select("amount, return_amount, status") \
            .execute().data or []
        investor_liability = sum(float(i.get("amount", 0)) - float(i.get("return_amount", 0) or 0)
                                 for i in investments if i.get("status") in ("active", "partial_return"))

        total_liabilities = notes_payable + investor_liability

        # EQUITY = Assets - Liabilities
        equity = total_assets - total_liabilities

        return {
            "ok": True,
            "date": date.today().isoformat(),
            "assets": {
                "bank_accounts": round(bank_balance, 2),
                "cash_on_hand": round(cash_on_hand, 2),
                "cash_and_equivalents": round(cash_balance, 2),
                "accounts_receivable": round(receivables, 2),
                "property_held_for_rto": round(property_assets, 2),
                "total": round(total_assets, 2),
            },
            "liabilities": {
                "promissory_notes_payable": round(notes_payable, 2),
                "investor_obligations": round(investor_liability, 2),
                "total": round(total_liabilities, 2),
            },
            "equity": {
                "retained_earnings": round(equity, 2),
                "total": round(equity, 2),
            },
            "total_liabilities_and_equity": round(total_liabilities + equity, 2),
        }
    except Exception as e:
        logger.error(f"Error generating balance sheet: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/reports/cash-flow")
async def get_cash_flow_statement(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
):
    """Generate a Cash Flow Statement for Capital."""
    now = date.today()
    sd = start_date or date(now.year, now.month, 1).isoformat()
    ed = end_date or now.isoformat()

    try:
        flows = sb.table("capital_flows") \
            .select("flow_type, amount, flow_date, description") \
            .gte("flow_date", sd) \
            .lte("flow_date", ed) \
            .order("flow_date") \
            .execute().data or []

        rto_paid = sb.table("rto_payments") \
            .select("paid_amount, late_fee_amount, status, paid_date") \
            .eq("status", "paid") \
            .gte("paid_date", sd) \
            .lte("paid_date", ed) \
            .execute().data or []
    except Exception as e:
        logger.error(f"Error getting cash flow data: {e}")
        flows = []
        rto_paid = []

    # Operating activities
    rto_collections = sum(float(p.get("paid_amount", 0) or 0) for p in rto_paid)
    late_fees_collected = sum(float(p.get("late_fee_amount", 0) or 0) for p in rto_paid if p.get("late_fee_amount"))
    operating_expenses = sum(abs(float(f.get("amount", 0))) for f in flows if f.get("flow_type") == "operating_expense")
    net_operating = rto_collections + late_fees_collected - operating_expenses

    # Investing activities
    acquisitions = sum(abs(float(f.get("amount", 0))) for f in flows if f.get("flow_type") == "acquisition_out")
    net_investing = -acquisitions

    # Financing activities
    investor_in = sum(abs(float(f.get("amount", 0))) for f in flows if f.get("flow_type") == "investment_in")
    investor_out = sum(abs(float(f.get("amount", 0))) for f in flows if f.get("flow_type") == "return_out")
    net_financing = investor_in - investor_out

    net_change = net_operating + net_investing + net_financing

    return {
        "ok": True,
        "period": {"start": sd, "end": ed},
        "operating_activities": {
            "rto_collections": round(rto_collections, 2),
            "late_fees_collected": round(late_fees_collected, 2),
            "operating_expenses": round(-operating_expenses, 2),
            "net": round(net_operating, 2),
        },
        "investing_activities": {
            "property_acquisitions": round(-acquisitions, 2),
            "net": round(net_investing, 2),
        },
        "financing_activities": {
            "investor_deposits": round(investor_in, 2),
            "investor_returns": round(-investor_out, 2),
            "net": round(net_financing, 2),
        },
        "net_change_in_cash": round(net_change, 2),
    }


# ============================================================================
# SYNC — Import from existing capital_flows + rto_payments
# ============================================================================

@router.post("/sync")
async def sync_transactions():
    """
    Auto-import transactions from capital_flows and rto_payments
    that don't already have a corresponding capital_transaction.

    Every transaction is automatically linked to its accounting account
    via the ACCOUNT_MAP (transaction_type → account code → account_id).
    """
    imported = 0
    mapped = 0  # How many got an account_id

    # Clear cache so we pick up any newly-added accounts
    _clear_account_cache()

    try:
        # 1. Sync from capital_flows
        flows = sb.table("capital_flows") \
            .select("id, flow_type, amount, flow_date, description, investor_id, property_id, rto_contract_id") \
            .execute().data or []

        # Get existing synced flow IDs
        existing = sb.table("capital_transactions") \
            .select("capital_flow_id") \
            .not_.is_("capital_flow_id", "null") \
            .execute().data or []
        synced_flow_ids = {e["capital_flow_id"] for e in existing}

        flow_type_map = {
            "investment_in": ("investor_deposit", True),
            "acquisition_out": ("acquisition", False),
            "rent_income": ("rto_payment", True),
            "return_out": ("investor_return", False),
            "late_fee_income": ("late_fee", True),
            "operating_expense": ("operating_expense", False),
            "down_payment_received": ("down_payment", True),
        }

        for flow in flows:
            if flow["id"] in synced_flow_ids:
                continue
            ft = flow.get("flow_type", "")
            if ft not in flow_type_map:
                continue

            txn_type, is_income = flow_type_map[ft]
            account_id = _resolve_account_id(txn_type)

            record = {
                "transaction_date": flow.get("flow_date") or date.today().isoformat(),
                "transaction_type": txn_type,
                "amount": abs(float(flow.get("amount", 0))),
                "is_income": is_income,
                "description": flow.get("description") or f"Auto: {ft}",
                "capital_flow_id": flow["id"],
                "investor_id": flow.get("investor_id"),
                "property_id": flow.get("property_id"),
                "rto_contract_id": flow.get("rto_contract_id"),
                "account_id": account_id,
                "status": "confirmed",
                "created_by": "auto-sync",
            }
            record = {k: v for k, v in record.items() if v is not None}
            sb.table("capital_transactions").insert(record).execute()
            imported += 1
            if account_id:
                mapped += 1

        # 2. Sync from rto_payments (paid ones)
        paid = sb.table("rto_payments") \
            .select("id, amount, paid_amount, paid_date, late_fee_amount, payment_method, payment_reference, "
                    "rto_contracts(client_id, property_id)") \
            .eq("status", "paid") \
            .execute().data or []

        existing_pmt = sb.table("capital_transactions") \
            .select("rto_payment_id") \
            .not_.is_("rto_payment_id", "null") \
            .execute().data or []
        synced_pmt_ids = {e["rto_payment_id"] for e in existing_pmt}

        rto_account_id = _resolve_account_id("rto_payment")
        late_fee_account_id = _resolve_account_id("late_fee")

        for pmt in paid:
            if pmt["id"] in synced_pmt_ids:
                continue
            contract = pmt.get("rto_contracts") or {}
            record = {
                "transaction_date": pmt.get("paid_date") or date.today().isoformat(),
                "transaction_type": "rto_payment",
                "amount": float(pmt.get("paid_amount") or pmt.get("amount", 0)),
                "is_income": True,
                "description": f"Pago RTO #{pmt['id'][:8]}",
                "rto_payment_id": pmt["id"],
                "client_id": contract.get("client_id"),
                "property_id": contract.get("property_id"),
                "payment_method": pmt.get("payment_method"),
                "payment_reference": pmt.get("payment_reference"),
                "account_id": rto_account_id,
                "status": "confirmed",
                "created_by": "auto-sync",
            }
            record = {k: v for k, v in record.items() if v is not None}
            sb.table("capital_transactions").insert(record).execute()
            imported += 1
            if rto_account_id:
                mapped += 1

            # Also import late fees as separate transactions
            late_fee = float(pmt.get("late_fee_amount", 0) or 0)
            if late_fee > 0:
                fee_record = {
                    "transaction_date": pmt.get("paid_date") or date.today().isoformat(),
                    "transaction_type": "late_fee",
                    "amount": late_fee,
                    "is_income": True,
                    "description": f"Recargo por mora — Pago #{pmt['id'][:8]}",
                    "rto_payment_id": pmt["id"],
                    "client_id": contract.get("client_id"),
                    "account_id": late_fee_account_id,
                    "status": "confirmed",
                    "created_by": "auto-sync",
                }
                fee_record = {k: v for k, v in fee_record.items() if v is not None}
                sb.table("capital_transactions").insert(fee_record).execute()
                imported += 1
                if late_fee_account_id:
                    mapped += 1

        # 3. Sync from rto_commissions (paid ones)
        try:
            paid_comms = sb.table("rto_commissions") \
                .select("id, total_commission, paid_at, property_id, client_id, contract_id, notes") \
                .eq("status", "paid") \
                .execute().data or []

            # Check which commissions already have a transaction
            existing_desc = sb.table("capital_transactions") \
                .select("notes") \
                .eq("transaction_type", "commission") \
                .execute().data or []
            synced_comm_notes = {e.get("notes") for e in existing_desc if e.get("notes")}

            commission_account_id = _resolve_account_id("commission")

            for comm in paid_comms:
                tag = f"comm:{comm['id']}"
                if tag in synced_comm_notes:
                    continue
                record = {
                    "transaction_date": comm.get("paid_at", date.today().isoformat())[:10],
                    "transaction_type": "commission",
                    "amount": float(comm.get("total_commission", 0)),
                    "is_income": False,
                    "description": f"Comisión RTO #{comm['id'][:8]}",
                    "property_id": comm.get("property_id"),
                    "client_id": comm.get("client_id"),
                    "rto_contract_id": comm.get("contract_id"),
                    "account_id": commission_account_id,
                    "notes": tag,
                    "status": "confirmed",
                    "created_by": "auto-sync",
                }
                record = {k: v for k, v in record.items() if v is not None}
                sb.table("capital_transactions").insert(record).execute()
                imported += 1
                if commission_account_id:
                    mapped += 1
        except Exception as comm_err:
            logger.warning(f"Could not sync commissions: {comm_err}")

        # 4. Sync from promissory_note_payments
        try:
            pn_payments = sb.table("promissory_note_payments") \
                .select("id, amount, paid_at, promissory_note_id, payment_method, reference, notes, "
                        "promissory_notes(investor_id, investors(name))") \
                .execute().data or []

            existing_pn = sb.table("capital_transactions") \
                .select("notes") \
                .eq("transaction_type", "investor_return") \
                .eq("created_by", "auto-sync") \
                .execute().data or []
            synced_pn_notes = {e.get("notes") for e in existing_pn if e.get("notes")}

            investor_return_account_id = _resolve_account_id("investor_return")

            for pnp in pn_payments:
                tag = f"pnp:{pnp['id']}"
                if tag in synced_pn_notes:
                    continue
                note_data = pnp.get("promissory_notes") or {}
                investor_name = (note_data.get("investors") or {}).get("name", "")
                record = {
                    "transaction_date": (pnp.get("paid_at") or date.today().isoformat())[:10],
                    "transaction_type": "investor_return",
                    "amount": float(pnp.get("amount", 0)),
                    "is_income": False,
                    "description": f"Pago nota promisoria a {investor_name}",
                    "investor_id": note_data.get("investor_id"),
                    "payment_method": pnp.get("payment_method"),
                    "payment_reference": pnp.get("reference"),
                    "account_id": investor_return_account_id,
                    "notes": tag,
                    "status": "confirmed",
                    "created_by": "auto-sync",
                }
                record = {k: v for k, v in record.items() if v is not None}
                sb.table("capital_transactions").insert(record).execute()
                imported += 1
                if investor_return_account_id:
                    mapped += 1
        except Exception as pn_err:
            logger.warning(f"Could not sync promissory note payments: {pn_err}")

    except Exception as e:
        logger.error(f"Error syncing capital transactions: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    unmapped = imported - mapped
    msg = f"{imported} transacciones importadas ({mapped} con cuenta contable)"
    if unmapped > 0:
        msg += f" — {unmapped} sin cuenta (faltan cuentas en el plan)"

    return {"ok": True, "imported": imported, "mapped": mapped, "unmapped": unmapped, "message": msg}


@router.post("/backfill-accounts")
async def backfill_transaction_accounts():
    """Assign account_id to existing transactions that don't have one.

    Uses the ACCOUNT_MAP to look up the correct account based on
    each transaction's transaction_type.  Useful after adding new
    accounts to the chart of accounts.
    """
    _clear_account_cache()

    try:
        # Fetch all transactions without account_id
        orphans = sb.table("capital_transactions") \
            .select("id, transaction_type") \
            .is_("account_id", "null") \
            .neq("status", "voided") \
            .execute().data or []

        if not orphans:
            return {
                "ok": True,
                "updated": 0,
                "skipped": 0,
                "message": "Todas las transacciones ya tienen cuenta contable.",
            }

        updated = 0
        skipped = 0
        skipped_types: dict[str, int] = {}

        for txn in orphans:
            account_id = _resolve_account_id(txn["transaction_type"])
            if account_id:
                sb.table("capital_transactions") \
                    .update({"account_id": account_id}) \
                    .eq("id", txn["id"]) \
                    .execute()
                updated += 1
            else:
                skipped += 1
                tt = txn["transaction_type"]
                skipped_types[tt] = skipped_types.get(tt, 0) + 1

        msg = f"{updated} transacciones actualizadas con cuenta contable"
        if skipped > 0:
            missing = ", ".join(f"{tt} ({n})" for tt, n in skipped_types.items())
            msg += f" — {skipped} sin asignar (cuentas faltantes: {missing})"

        return {
            "ok": True,
            "updated": updated,
            "skipped": skipped,
            "skipped_types": skipped_types,
            "message": msg,
        }

    except Exception as e:
        logger.error(f"Error backfilling transaction accounts: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/account-mapping")
async def get_account_mapping():
    """Return the current transaction_type → account mapping with resolution status.

    Useful for debugging and for the frontend to show which types are
    mapped and which are missing their account in the chart.
    """
    _clear_account_cache()

    mapping = []
    for txn_type, code in _FULL_ACCOUNT_MAP.items():
        account_id = _resolve_account_id(txn_type)
        is_income = txn_type in INCOME_ACCOUNT_MAP
        is_balance = txn_type in BALANCE_ACCOUNT_MAP

        mapping.append({
            "transaction_type": txn_type,
            "account_code": code,
            "account_id": account_id,
            "resolved": account_id is not None,
            "flow": "income" if is_income else ("balance" if is_balance else "expense"),
        })

    resolved = sum(1 for m in mapping if m["resolved"])
    total = len(mapping)

    return {
        "ok": True,
        "mapping": mapping,
        "resolved": resolved,
        "total": total,
        "missing": total - resolved,
        "message": f"{resolved}/{total} tipos mapeados a cuentas existentes",
    }


# ============================================================================
# EXPORT CSV
# ============================================================================

@router.get("/export/transactions")
async def export_transactions_csv(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
):
    """Export capital transactions as CSV."""
    try:
        q = sb.table("capital_transactions") \
            .select("*, capital_accounts(code, name), capital_bank_accounts(name, bank_name)") \
            .neq("status", "voided") \
            .order("transaction_date", desc=True)

        if start_date:
            q = q.gte("transaction_date", start_date)
        if end_date:
            q = q.lte("transaction_date", end_date)

        txns = q.execute().data or []

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "Fecha", "Tipo", "Descripción", "Monto", "Ingreso/Gasto",
            "Cuenta Contable", "Cuenta Bancaria", "Método Pago", "Referencia",
            "Contraparte", "Estado", "Notas"
        ])
        for t in txns:
            acc = t.get("capital_accounts") or {}
            bank = t.get("capital_bank_accounts") or {}
            writer.writerow([
                t.get("transaction_date", ""),
                t.get("transaction_type", ""),
                t.get("description", ""),
                t.get("amount", 0),
                "Ingreso" if t.get("is_income") else "Gasto",
                f"{acc.get('code', '')} {acc.get('name', '')}".strip(),
                f"{bank.get('name', '')} ({bank.get('bank_name', '')})".strip(" ()") if bank.get("name") else "",
                t.get("payment_method", ""),
                t.get("payment_reference", ""),
                t.get("counterparty_name", ""),
                t.get("status", ""),
                t.get("notes", ""),
            ])

        output.seek(0)
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode("utf-8-sig")),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=capital_transactions.csv"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# FINANCIAL STATEMENTS — Account-tree-based (matches QuickBooks format)
# ============================================================================

@router.get("/reports/balance-sheet-tree")
async def get_balance_sheet_tree():
    """Balance Sheet built from the chart of accounts tree (QuickBooks format)."""
    try:
        # Try multiple query strategies — columns may not exist yet
        accounts = []
        for query_fn in [
            lambda: sb.table("capital_accounts").select("*").eq("is_active", True)
                      .eq("report_section", "balance_sheet").order("display_order").order("code").execute(),
            lambda: sb.table("capital_accounts").select("*").eq("is_active", True)
                      .eq("report_section", "balance_sheet").order("code").execute(),
            lambda: sb.table("capital_accounts").select("*").eq("is_active", True)
                      .in_("account_type", ["asset", "liability", "equity"]).order("code").execute(),
        ]:
            try:
                result = query_fn()
                accounts = result.data or []
                if accounts:
                    break
            except Exception as qe:
                logger.warning(f"[balance-sheet-tree] Query attempt failed: {qe}")
                continue

        # If still empty, get ALL accounts and filter locally
        if not accounts:
            try:
                all_accts = sb.table("capital_accounts").select("*").eq("is_active", True).order("code").execute().data or []
                accounts = [a for a in all_accts if a.get("account_type") in ("asset", "liability", "equity")]
            except Exception as e2:
                logger.error(f"[balance-sheet-tree] Final fallback failed: {e2}")
                accounts = []

        # Compute balances from transactions
        balances = {}
        try:
            txns = sb.table("capital_transactions") \
                .select("account_id, amount, is_income") \
                .neq("status", "voided") \
                .execute().data or []
            for t in txns:
                aid = t.get("account_id")
                if aid:
                    if aid not in balances:
                        balances[aid] = 0
                    balances[aid] += float(t["amount"]) if t["is_income"] else -float(t["amount"])
        except Exception as e:
            logger.warning(f"[balance-sheet-tree] Could not compute balances: {e}")

        # Add manual current_balance
        for acc in accounts:
            manual_bal = float(acc.get("current_balance") or 0)
            if manual_bal != 0:
                balances[acc["id"]] = balances.get(acc["id"], 0) + manual_bal

        # Build tree
        by_id = {}
        for a in accounts:
            by_id[a["id"]] = {
                "id": a["id"], "code": a["code"], "name": a["name"],
                "account_type": a["account_type"], "is_header": a.get("is_header", False),
                "balance": round(balances.get(a["id"], 0), 2),
                "children": [],
            }

        roots = []
        for a in accounts:
            node = by_id[a["id"]]
            pid = a.get("parent_account_id")
            if pid and pid in by_id:
                by_id[pid]["children"].append(node)
            else:
                roots.append(node)

        def compute_subtotal(node):
            subtotal = node["balance"]
            for child in node.get("children", []):
                subtotal += compute_subtotal(child)
            node["subtotal"] = round(subtotal, 2)
            return subtotal

        for r in roots:
            compute_subtotal(r)

        # Group by account_type for the report
        assets = [r for r in roots if r["account_type"] == "asset"]
        liabilities = [r for r in roots if r["account_type"] == "liability"]
        equity = [r for r in roots if r["account_type"] == "equity"]

        total_assets = sum(r.get("subtotal", 0) for r in assets)
        total_liabilities = sum(r.get("subtotal", 0) for r in liabilities)
        total_equity = sum(r.get("subtotal", 0) for r in equity)

        return {
            "ok": True,
            "date": date.today().isoformat(),
            "assets": assets,
            "liabilities": liabilities,
            "equity": equity,
            "total_assets": round(total_assets, 2),
            "total_liabilities": round(total_liabilities, 2),
            "total_equity": round(total_equity, 2),
            "total_liabilities_and_equity": round(total_liabilities + total_equity, 2),
        }

    except Exception as e:
        logger.error(f"[balance-sheet-tree] Unexpected error: {e}")
        # Return empty but valid structure so the frontend always renders
        return {
            "ok": False,
            "error": str(e),
            "date": date.today().isoformat(),
            "assets": [], "liabilities": [], "equity": [],
            "total_assets": 0, "total_liabilities": 0, "total_equity": 0,
            "total_liabilities_and_equity": 0,
        }


@router.get("/reports/profit-loss-tree")
async def get_profit_loss_tree(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
):
    """Profit & Loss built from the chart of accounts tree (QuickBooks format)."""
    now = date.today()
    sd = start_date or date(now.year, now.month, 1).isoformat()
    ed = end_date or now.isoformat()

    try:
        # Try multiple query strategies — columns may not exist yet
        accounts = []
        for query_fn in [
            lambda: sb.table("capital_accounts").select("*").eq("is_active", True)
                      .eq("report_section", "profit_loss").order("display_order").order("code").execute(),
            lambda: sb.table("capital_accounts").select("*").eq("is_active", True)
                      .eq("report_section", "profit_loss").order("code").execute(),
            lambda: sb.table("capital_accounts").select("*").eq("is_active", True)
                      .in_("account_type", ["income", "expense", "cogs"]).order("code").execute(),
        ]:
            try:
                result = query_fn()
                accounts = result.data or []
                if accounts:
                    break
            except Exception as qe:
                logger.warning(f"[profit-loss-tree] Query attempt failed: {qe}")
                continue

        # If still empty, get ALL accounts and filter locally
        if not accounts:
            try:
                all_accts = sb.table("capital_accounts").select("*").eq("is_active", True).order("code").execute().data or []
                accounts = [a for a in all_accts if a.get("account_type") in ("income", "expense", "cogs")]
            except Exception as e2:
                logger.error(f"[profit-loss-tree] Final fallback failed: {e2}")
                accounts = []

        # Compute balances from transactions in period
        balances = {}
        try:
            txns = sb.table("capital_transactions") \
                .select("account_id, amount, is_income") \
                .gte("transaction_date", sd) \
                .lte("transaction_date", ed) \
                .neq("status", "voided") \
                .execute().data or []
            for t in txns:
                aid = t.get("account_id")
                if aid:
                    if aid not in balances:
                        balances[aid] = 0
                    balances[aid] += float(t["amount"])
        except Exception as e:
            logger.warning(f"[profit-loss-tree] Could not compute balances: {e}")

        # Add manual current_balance (same as Balance Sheet)
        for acc in accounts:
            manual_bal = float(acc.get("current_balance") or 0)
            if manual_bal != 0:
                balances[acc["id"]] = balances.get(acc["id"], 0) + manual_bal

        # Build tree
        by_id = {}
        for a in accounts:
            by_id[a["id"]] = {
                "id": a["id"], "code": a["code"], "name": a["name"],
                "account_type": a["account_type"], "category": a.get("category", "general"),
                "is_header": a.get("is_header", False),
                "balance": round(balances.get(a["id"], 0), 2),
                "children": [],
            }

        roots = []
        for a in accounts:
            node = by_id[a["id"]]
            pid = a.get("parent_account_id")
            if pid and pid in by_id:
                by_id[pid]["children"].append(node)
            else:
                roots.append(node)

        def compute_subtotal(node):
            subtotal = node["balance"]
            for child in node.get("children", []):
                subtotal += compute_subtotal(child)
            node["subtotal"] = round(subtotal, 2)
            return subtotal

        for r in roots:
            compute_subtotal(r)

        # Separate income vs expense
        income_roots = [r for r in roots if r["account_type"] == "income" and r.get("category") != "other"]
        other_income_roots = [r for r in roots if r["account_type"] == "income" and r.get("category") == "other"]
        expense_roots = [r for r in roots if r["account_type"] in ("expense", "cogs") and r.get("category") != "other"]
        other_expense_roots = [r for r in roots if r["account_type"] in ("expense", "cogs") and r.get("category") == "other"]

        total_income = sum(r.get("subtotal", 0) for r in income_roots)
        total_other_income = sum(r.get("subtotal", 0) for r in other_income_roots)
        total_expenses = sum(r.get("subtotal", 0) for r in expense_roots)
        total_other_expenses = sum(r.get("subtotal", 0) for r in other_expense_roots)

        gross_profit = total_income
        net_operating_income = gross_profit - total_expenses
        net_other_income = total_other_income - total_other_expenses
        net_income = net_operating_income + net_other_income

        return {
            "ok": True,
            "period": {"start": sd, "end": ed},
            "income": income_roots,
            "expenses": expense_roots,
            "other_income": other_income_roots,
            "other_expenses": other_expense_roots,
            "total_income": round(total_income, 2),
            "gross_profit": round(gross_profit, 2),
            "total_expenses": round(total_expenses, 2),
            "net_operating_income": round(net_operating_income, 2),
            "total_other_income": round(total_other_income, 2),
            "total_other_expenses": round(total_other_expenses, 2),
            "net_other_income": round(net_other_income, 2),
            "net_income": round(net_income, 2),
        }

    except Exception as e:
        logger.error(f"[profit-loss-tree] Unexpected error: {e}")
        # Return empty but valid structure so the frontend always renders
        return {
            "ok": False,
            "error": str(e),
            "period": {"start": sd, "end": ed},
            "income": [], "expenses": [], "other_income": [], "other_expenses": [],
            "total_income": 0, "gross_profit": 0, "total_expenses": 0,
            "net_operating_income": 0, "total_other_income": 0,
            "total_other_expenses": 0, "net_other_income": 0, "net_income": 0,
        }


# ============================================================================
# SAVED FINANCIAL STATEMENTS — Snapshots of Balance Sheet & P&L
# ============================================================================

class SaveStatementRequest(BaseModel):
    report_type: str  # 'balance_sheet' or 'profit_loss'
    name: str
    notes: Optional[str] = None
    saved_by: Optional[str] = None


@router.post("/reports/save")
async def save_financial_statement(data: SaveStatementRequest):
    """Save an immutable snapshot of the current Balance Sheet or P&L for Capital."""
    try:
        # Generate the live report
        if data.report_type == "balance_sheet":
            report = await get_balance_sheet_tree()
            record = {
                "portal": "capital",
                "report_type": "balance_sheet",
                "name": data.name,
                "as_of_date": report.get("date", date.today().isoformat()),
                "report_data": json.dumps(report),
                "total_assets": report.get("total_assets", 0),
                "total_liabilities": report.get("total_liabilities", 0),
                "total_equity": report.get("total_equity", 0),
                "net_income": 0,
                "notes": data.notes,
                "saved_by": data.saved_by,
            }
            period_start = None
            period_end = report.get("date", date.today().isoformat())
        elif data.report_type == "profit_loss":
            report = await get_profit_loss_tree()
            record = {
                "portal": "capital",
                "report_type": "profit_loss",
                "name": data.name,
                "period_start": report.get("period", {}).get("start"),
                "period_end": report.get("period", {}).get("end"),
                "report_data": json.dumps(report),
                "total_income": report.get("total_income", 0),
                "total_expenses": report.get("total_expenses", 0),
                "net_income": report.get("net_income", 0),
                "notes": data.notes,
                "saved_by": data.saved_by,
            }
            period_start = report.get("period", {}).get("start")
            period_end = report.get("period", {}).get("end")
        else:
            raise HTTPException(status_code=400, detail="report_type must be 'balance_sheet' or 'profit_loss'")

        # Generate immutable PDF
        pdf_url = None
        try:
            from api.services.pdf_service import generate_financial_report_pdf
            from api.services.document_service import _upload_to_storage
            pdf_bytes = generate_financial_report_pdf(
                report_type=data.report_type,
                report_data=report,
                period_start=period_start,
                period_end=period_end,
                portal="capital",
            )
            timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            filename = f"{data.report_type}_{timestamp}.pdf"
            pdf_url = _upload_to_storage(pdf_bytes, "financial-reports/capital", filename)
        except Exception as pdf_err:
            logger.warning(f"[save-financial-statement-capital] PDF generation failed: {pdf_err}")

        # Add immutability fields
        record["is_locked"] = True
        record["locked_at"] = datetime.utcnow().isoformat()
        record["locked_by"] = data.saved_by or "system"
        if pdf_url:
            record["pdf_url"] = pdf_url

        record = {k: v for k, v in record.items() if v is not None}
        result = sb.table("saved_financial_statements").insert(record).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Error saving statement")

        return {
            "ok": True,
            "statement": result.data[0],
            "pdf_url": pdf_url,
            "message": f"Estado financiero '{data.name}' guardado exitosamente (inmutable)"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[save-financial-statement] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/reports/saved")
async def list_saved_statements(report_type: Optional[str] = None):
    """List all saved financial statements for Capital."""
    try:
        q = sb.table("saved_financial_statements") \
            .select("id, portal, report_type, name, as_of_date, period_start, period_end, "
                    "total_assets, total_liabilities, total_equity, total_income, total_expenses, "
                    "net_income, notes, saved_by, status, created_at, is_locked, pdf_url, locked_at") \
            .eq("portal", "capital") \
            .neq("status", "archived") \
            .order("created_at", desc=True)

        if report_type:
            q = q.eq("report_type", report_type)

        result = q.execute()
        return {"ok": True, "statements": result.data or []}

    except Exception as e:
        logger.error(f"[list-saved-statements] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/reports/saved/{statement_id}")
async def get_saved_statement(statement_id: str):
    """Get a specific saved financial statement with full report data."""
    try:
        result = sb.table("saved_financial_statements") \
            .select("*") \
            .eq("id", statement_id) \
            .eq("portal", "capital") \
            .execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Saved statement not found")

        stmt = result.data[0]
        # Parse the JSON report_data back
        if isinstance(stmt.get("report_data"), str):
            stmt["report_data"] = json.loads(stmt["report_data"])

        return {"ok": True, "statement": stmt}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[get-saved-statement] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/reports/saved/{statement_id}")
async def delete_saved_statement(statement_id: str):
    """Archive (soft-delete) a saved financial statement."""
    try:
        result = sb.table("saved_financial_statements") \
            .update({"status": "archived"}) \
            .eq("id", statement_id) \
            .eq("portal", "capital") \
            .execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Saved statement not found")

        return {"ok": True, "message": "Estado financiero archivado"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[delete-saved-statement] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/reports/saved/{statement_id}/pdf")
async def get_saved_report_pdf(statement_id: str):
    """Get the PDF URL for a saved financial report."""
    try:
        result = sb.table("saved_financial_statements") \
            .select("id, pdf_url, is_locked, name") \
            .eq("id", statement_id) \
            .eq("portal", "capital") \
            .execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Saved statement not found")

        stmt = result.data[0]
        return {
            "ok": True,
            "pdf_url": stmt.get("pdf_url"),
            "is_locked": stmt.get("is_locked", True),
            "name": stmt.get("name"),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[get-saved-report-pdf-capital] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/reports/saved/{statement_id}")
async def update_saved_report(statement_id: str, request: Request):
    """Allow renaming saved reports. Report data remains immutable."""
    try:
        body = await request.json()
        name = body.get("name")
        if not name or not name.strip():
            raise HTTPException(status_code=400, detail="name is required")
        result = sb.table("saved_financial_statements") \
            .update({"name": name.strip()}) \
            .eq("id", statement_id) \
            .execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Report not found")
        return {"ok": True, "statement": result.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating saved report name: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# BANK STATEMENT IMPORT — Upload, parse, classify, post (Capital)
# ============================================================================

@router.get("/bank-statements")
async def list_capital_bank_statements():
    """List all Capital bank statements."""
    try:
        result = sb.table("capital_bank_statements") \
            .select("*") \
            .order("created_at", desc=True) \
            .execute()
        return {"ok": True, "statements": result.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/bank-statements/{statement_id}")
async def get_capital_bank_statement(statement_id: str):
    """Get a single statement with its movements."""
    stmt = sb.table("capital_bank_statements").select("*").eq("id", statement_id).execute()
    if not stmt.data:
        raise HTTPException(status_code=404, detail="Statement not found")

    movements = sb.table("capital_statement_movements") \
        .select("*") \
        .eq("statement_id", statement_id) \
        .order("sort_order") \
        .execute()

    return {
        "statement": stmt.data[0],
        "movements": movements.data or [],
    }


@router.post("/bank-statements")
async def upload_capital_bank_statement(
    file: UploadFile = File(...),
    bank_account_id: str = Form(...),
):
    """Upload a bank statement for Capital and parse it with AI."""
    # Resolve bank account
    ba = sb.table("capital_bank_accounts").select("id, name, bank_name").eq("id", bank_account_id).execute()
    if not ba.data:
        raise HTTPException(status_code=400, detail="Bank account not found")
    account_label = ba.data[0]["name"]

    # Validate file type
    ext = (file.filename or "").rsplit(".", 1)[-1].lower() if file.filename else ""
    allowed = {"pdf", "png", "jpg", "jpeg", "xlsx", "xls", "csv"}
    if ext not in allowed:
        raise HTTPException(status_code=400, detail=f"File type .{ext} not supported. Use: {', '.join(allowed)}")

    file_content = await file.read()
    if len(file_content) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    # Upload to Supabase Storage
    import uuid as _uuid
    account_key = account_label.lower().replace(" ", "_")
    storage_path = f"capital-bank-statements/{account_key}/{_uuid.uuid4().hex[:12]}_{file.filename}"
    file_url = None
    try:
        sb.storage.from_("transaction-documents").upload(storage_path, file_content)
        file_url = sb.storage.from_("transaction-documents").get_public_url(storage_path)
    except Exception as e:
        logger.warning(f"[CapitalBankStmt] Storage upload failed: {e}")

    # Create statement record
    result = sb.table("capital_bank_statements").insert({
        "bank_account_id": bank_account_id,
        "account_label": account_label,
        "original_filename": file.filename,
        "file_type": ext,
        "storage_path": storage_path,
        "file_url": file_url,
        "status": "parsing",
    }).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Error creating statement record")

    statement = result.data[0]
    statement_id = statement["id"]

    # Fire-and-forget the AI parsing (same pattern as Homes) — the endpoint
    # returns in ~1-2s and the frontend polls GET /bank-statements/{id}
    # until status is 'parsed'/'review' or 'error'.
    import asyncio
    asyncio.create_task(
        _parse_capital_statement_background(statement_id, file_content, ext, account_key)
    )

    return {
        "statement": statement,
        "movements": [],
        "message": "Archivo subido. Parseando movimientos en segundo plano…",
    }


async def _parse_capital_statement_background(statement_id: str, file_content: bytes, ext: str, account_key: str):
    """Background task: extract + parse movements, then auto-classify."""
    try:
        from api.routes.accounting import _extract_and_parse_statement
        raw_text, movements = await _extract_and_parse_statement(file_content, ext, account_key)

        # Save raw text
        sb.table("capital_bank_statements").update({
            "raw_extracted_text": raw_text[:50000] if raw_text else None,
            "total_movements": len(movements),
        }).eq("id", statement_id).execute()

        # Insert movements
        for i, mv in enumerate(movements):
            mv_data = {
                "statement_id": statement_id,
                "movement_date": mv.get("date", date.today().isoformat()),
                "description": mv.get("description", "")[:500],
                "amount": float(mv.get("amount", 0)),
                "is_credit": mv.get("is_credit", float(mv.get("amount", 0)) > 0),
                "reference": mv.get("reference", "")[:200] if mv.get("reference") else None,
                "payment_method": mv.get("payment_method"),
                "counterparty": mv.get("counterparty", "")[:200] if mv.get("counterparty") else None,
                "sort_order": i,
                "status": "pending",
            }
            mv_data = {k: v for k, v in mv_data.items() if v is not None}
            try:
                sb.table("capital_statement_movements").insert(mv_data).execute()
            except Exception as e:
                logger.warning(f"[CapitalBankStmt] Failed to insert movement {i}: {e}")

        # Update statement status
        sb.table("capital_bank_statements").update({
            "status": "parsed",
            "total_movements": len(movements),
            "bank_name": movements[0].get("bank_name") if movements else None,
            "account_number_last4": movements[0].get("account_last4") if movements else None,
        }).eq("id", statement_id).execute()

        # ── AUTO-CLASSIFY: AI associates movements to Capital accounts ──
        try:
            logger.info(f"[CapitalBankStmt] Auto-classifying {len(movements)} movements...")
            sb.table("capital_bank_statements").update({"status": "classifying"}).eq("id", statement_id).execute()
            classify_result = await classify_capital_statement(statement_id)
            logger.info(f"[CapitalBankStmt] Auto-classify done: {classify_result.get('classified', 0)} movements")
        except Exception as ce:
            logger.warning(f"[CapitalBankStmt] Auto-classify failed (will require manual): {ce}")
            sb.table("capital_bank_statements").update({"status": "parsed"}).eq("id", statement_id).execute()

    except Exception as e:
        logger.error(f"[CapitalBankStmt] Parse error: {e}")
        sb.table("capital_bank_statements").update({
            "status": "error",
            "error_message": str(e)[:500],
        }).eq("id", statement_id).execute()


@router.post("/bank-statements/{statement_id}/reconcile")
async def reconcile_capital_statement_movements(statement_id: str):
    """Auto-match Capital statement movements against existing unreconciled transactions.
    Returns matches with confidence scores for user confirmation."""
    stmt = sb.table("capital_bank_statements").select("*").eq("id", statement_id).execute()
    if not stmt.data:
        raise HTTPException(status_code=404, detail="Statement not found")
    statement = stmt.data[0]
    bank_account_id = statement.get("bank_account_id")

    # Get pending movements from this statement
    movements = (sb.table("capital_statement_movements")
                 .select("*").eq("statement_id", statement_id)
                 .in_("status", ["pending", "suggested"])
                 .order("sort_order").execute())
    if not movements.data:
        return {"matches": [], "unmatched_count": 0, "message": "No hay movimientos pendientes"}

    # Get unreconciled transactions
    unreconciled_txns = []
    if bank_account_id:
        txns = (sb.table("capital_transactions").select("*")
                .in_("status", ["confirmed", "pending"])
                .eq("bank_account_id", bank_account_id)
                .order("transaction_date", desc=True).execute())
        unreconciled_txns = txns.data or []

    # Fallback: also include transactions with NULL bank_account_id
    if not unreconciled_txns or bank_account_id:
        txns_null = (sb.table("capital_transactions").select("*")
                     .in_("status", ["confirmed", "pending"])
                     .is_("bank_account_id", "null")
                     .order("transaction_date", desc=True).execute())
        existing_ids = {t["id"] for t in unreconciled_txns}
        for t in (txns_null.data or []):
            if t["id"] not in existing_ids:
                unreconciled_txns.append(t)

    matches = (_match_capital_movements_to_transactions(movements.data, unreconciled_txns)
               if unreconciled_txns else [])

    # ---- Invoice matching (supports SPLIT / PARTIAL payments) ----
    # Movements not matched to a transaction get a second pass against open
    # invoices, whose balance_due can absorb several movements. Runs even if
    # there were no transactions to match.
    try:
        matched_mv_ids = {m["movement_id"] for m in matches}
        leftover = [mv for mv in movements.data if mv["id"] not in matched_mv_ids]
        if leftover:
            open_invoices = sb.table("capital_invoices").select("*") \
                .in_("status", ["sent", "partial", "overdue"]) \
                .gt("balance_due", 0) \
                .execute().data or []
            if open_invoices:
                matches.extend(_match_capital_movements_to_invoices(leftover, open_invoices))
    except Exception as e:
        logger.warning(f"[capital-reconcile] invoice matching failed: {e}")

    unmatched_count = len(movements.data) - len(matches)
    return {
        "matches": matches,
        "unmatched_count": unmatched_count,
        "message": f"{len(matches)} coincidencias encontradas, {unmatched_count} sin match",
    }


def _normalize_capital_name(name: str) -> str:
    """Normalize a counterparty name for comparison."""
    import re
    name = name.lower().strip()
    for noise in ["zelle payment from ", "wire transfer in - ", "wire transfer - ",
                   "check #", "ach debit - ", "ach credit - ", "transfer from ",
                   "transfer to ", "payment from ", "payment to ",
                   "venta contado - ", "compra propiedad: ", "compra: "]:
        name = name.replace(noise, "")
    name = re.sub(r'[^a-záéíóúñü\s]', '', name).strip()
    return name


def _capital_name_similarity(name1: str, name2: str) -> float:
    """Calculate similarity between two names (0.0 to 1.0)."""
    n1 = _normalize_capital_name(name1)
    n2 = _normalize_capital_name(name2)
    if not n1 or not n2:
        return 0.0
    if n1 == n2:
        return 1.0
    if n1 in n2 or n2 in n1:
        return 0.9
    tokens1 = set(n1.split())
    tokens2 = set(n2.split())
    if not tokens1 or not tokens2:
        return 0.0
    overlap = len(tokens1 & tokens2)
    total = max(len(tokens1), len(tokens2))
    return overlap / total if total > 0 else 0.0


def _match_capital_movements_to_transactions(movements: list, transactions: list) -> list:
    """Match Capital bank statement movements against existing accounting transactions."""
    matches = []
    used_txn_ids = set()

    for mv in movements:
        mv_amount = abs(float(mv.get("amount", 0)))
        mv_is_credit = mv.get("is_credit", False)
        mv_date_str = mv.get("movement_date", "")
        mv_counterparty = mv.get("counterparty") or ""
        mv_description = mv.get("description") or ""

        best_match = None
        best_score = 0
        best_sig = {"amount_exact": False, "diff_days": None, "name_sim": 0.0}

        for txn in transactions:
            if txn["id"] in used_txn_ids:
                continue

            score = 0
            txn_amount = abs(float(txn.get("amount", 0)))
            txn_is_income = txn.get("is_income", False)

            # Direction match
            if mv_is_credit != txn_is_income:
                continue

            # Amount match — like Homes, amount alone is never enough; hard-stop
            # anything worse than a 1% match (no marginal 5% acceptances).
            amount_exact = False
            if mv_amount > 0 and txn_amount > 0:
                diff_pct = abs(mv_amount - txn_amount) / max(mv_amount, txn_amount)
                if abs(mv_amount - txn_amount) < 0.01:
                    score += 50
                    amount_exact = True
                elif diff_pct < 0.01:
                    score += 35
                else:
                    continue

            # Date proximity
            diff_days = None
            try:
                mv_date = datetime.strptime(mv_date_str, "%Y-%m-%d").date() if mv_date_str else None
                txn_date_str = txn.get("transaction_date", "")
                txn_date = datetime.strptime(txn_date_str, "%Y-%m-%d").date() if txn_date_str else None
                if mv_date and txn_date:
                    diff_days = abs((mv_date - txn_date).days)
                    if diff_days == 0:
                        score += 30
                    elif diff_days <= 1:
                        score += 25
                    elif diff_days <= 3:
                        score += 15
                    elif diff_days <= 7:
                        score += 8
                    elif diff_days <= 14:
                        score += 3
            except Exception:
                pass

            # Counterparty similarity
            txn_counterparty = txn.get("counterparty_name") or ""
            txn_description = txn.get("description") or ""
            best_name_sim = 0.0
            for mv_name in [mv_counterparty, mv_description]:
                for txn_name in [txn_counterparty, txn_description]:
                    if mv_name and txn_name:
                        sim = _capital_name_similarity(mv_name, txn_name)
                        best_name_sim = max(best_name_sim, sim)
            score += int(20 * best_name_sim)

            if score > best_score:
                best_score = score
                best_match = txn
                best_sig = {"amount_exact": amount_exact, "diff_days": diff_days, "name_sim": best_name_sim}

        # Corroboration gate (mirror Homes): amount alone is NEVER sufficient —
        # require at least one corroborating signal (name ≥ 0.4 OR date within ±3d).
        if best_match and best_score >= 50:
            name_sim = best_sig["name_sim"]
            dd = best_sig["diff_days"]
            corroborated = (name_sim >= 0.4) or (dd is not None and dd <= 3)
            if not corroborated:
                continue
            used_txn_ids.add(best_match["id"])
            if name_sim >= 0.7 or (name_sim >= 0.4 and best_sig["amount_exact"] and dd == 0):
                confidence = "high"
            elif best_score >= 60:
                confidence = "medium"
            else:
                confidence = "low"
            reason, caveat = _capital_match_reason(best_sig)
            matches.append({
                "movement_id": mv["id"],
                "transaction_id": best_match["id"],
                "score": best_score,
                "confidence": confidence,
                "signals": best_sig,
                "reason": reason,
                "caveat": caveat,
                "movement": mv,
                "transaction": best_match,
            })

    return matches


def _capital_match_reason(sig: dict) -> tuple:
    """Human-readable reason + caveat for a match (mirror Homes' _match_signals)."""
    parts = []
    if sig.get("amount_exact"):
        parts.append("monto coincide")
    else:
        parts.append("monto aproximado")
    name_sim = sig.get("name_sim") or 0.0
    if name_sim > 0:
        parts.append(f"nombre {int(name_sim * 100)}%")
    dd = sig.get("diff_days")
    if dd is not None:
        parts.append("mismo día" if dd == 0 else f"±{dd} días")
    reason = " · ".join(parts)
    caveat = ""
    if name_sim < 0.4:
        caveat = "La app NO está segura: coincide el monto pero el nombre no. Revísalo."
    return reason, caveat


def _match_capital_movements_to_invoices(movements: list, invoices: list) -> list:
    """Match Capital statement movements against open invoices (AR or AP),
    including SPLIT / PARTIAL payments.

    Same algorithm as Homes (_match_movements_to_invoices): each invoice
    keeps a running `remaining` balance so one factura can absorb several
    movements ($500 + $500 = a $1,000 factura). Partial matches (movement
    smaller than the remaining balance) are only offered when corroborated
    by counterparty-name similarity or the invoice number appearing in the
    movement text, and carry a `partial` flag so the UI labels them and
    skips auto-selecting them."""
    matches: list = []
    remaining = {inv["id"]: float(inv.get("balance_due") or 0) for inv in invoices}

    for mv in movements:
        mv_amount = abs(float(mv.get("amount", 0)))
        if mv_amount <= 0:
            continue
        mv_is_credit = mv.get("is_credit", False)  # True=deposit, False=withdrawal
        mv_date_str = mv.get("movement_date", "")
        mv_counterparty = mv.get("counterparty") or ""
        mv_description = mv.get("description") or ""

        best_match = None
        best_score = 0
        best_is_partial = False

        for inv in invoices:
            rem = remaining.get(inv["id"], 0.0)
            if rem <= 0.01:
                continue  # already fully allocated by earlier movements

            # Direction must agree: deposit → receivable, withdrawal → payable
            direction = (inv.get("direction") or "").lower()
            if mv_is_credit and direction != "receivable":
                continue
            if not mv_is_credit and direction != "payable":
                continue

            # Corroboration signals (name similarity / invoice number in text)
            inv_counterparty = inv.get("counterparty_name") or ""
            inv_num = (inv.get("invoice_number") or "").lower()
            best_name_sim = 0.0
            for mv_name in (mv_counterparty, mv_description):
                if mv_name and inv_counterparty:
                    best_name_sim = max(best_name_sim, _capital_name_similarity(mv_name, inv_counterparty))
                if inv_num and mv_name and inv_num in mv_name.lower():
                    best_name_sim = max(best_name_sim, 1.0)

            # ---- Amount scoring against the REMAINING balance ----
            score = 0
            is_partial = False
            diff = abs(mv_amount - rem)
            diff_pct = diff / max(mv_amount, rem)
            if diff < 0.01:
                score += 50            # settles the remaining balance exactly
            elif diff_pct < 0.01:
                score += 35
            elif diff_pct < 0.05:
                score += 15
            elif mv_amount < rem:
                # PARTIAL payment: only when corroborated, so a random small
                # deposit is never glued onto a large unrelated invoice.
                if best_name_sim >= 0.5:
                    score += 25
                    is_partial = True
                else:
                    continue
            else:
                continue  # movement bigger than remaining balance → not this invoice

            # ---- Date proximity vs due_date or issue_date (best of the two) ----
            try:
                mv_date = datetime.strptime(mv_date_str, "%Y-%m-%d").date() if mv_date_str else None
                for cmp_str in (inv.get("due_date"), inv.get("issue_date")):
                    if not cmp_str or not mv_date:
                        continue
                    cmp_date = datetime.strptime(cmp_str, "%Y-%m-%d").date()
                    diff_days = abs((mv_date - cmp_date).days)
                    if diff_days == 0:
                        score += 30; break
                    elif diff_days <= 3:
                        score += 20; break
                    elif diff_days <= 14:
                        score += 10; break
                    elif diff_days <= 30:
                        score += 5; break
            except Exception:
                pass

            score += int(20 * best_name_sim)

            if score > best_score:
                best_score = score
                best_match = inv
                best_is_partial = is_partial

        if best_match and best_score >= 50:
            rem_before = remaining.get(best_match["id"], 0.0)
            remaining[best_match["id"]] = rem_before - mv_amount  # allocate this movement
            confidence = "high" if best_score >= 80 else "medium" if best_score >= 60 else "low"
            matches.append({
                "movement_id": mv["id"],
                "invoice_id": best_match["id"],
                "target_type": "invoice",
                "score": best_score,
                "confidence": confidence,
                "partial": best_is_partial,
                "movement": mv,
                "invoice": best_match,
            })

    return matches


@router.post("/bank-statements/{statement_id}/reconcile/confirm")
async def confirm_capital_reconciliation(statement_id: str, data: dict):
    """Confirm matched pairs. Transaction matches reconcile both ledger legs;
    invoice matches auto-create the payment + ledger pair (like Homes)."""
    pairs = data.get("pairs", [])
    logger.info(f"[capital-reconcile-confirm] Received {len(pairs)} pairs for statement {statement_id}")

    if not pairs:
        raise HTTPException(status_code=400, detail="No pairs provided")

    now_str = datetime.utcnow().isoformat()
    reconciled = 0
    errors = []

    # Pre-fetch the statement (we need bank_account_id for invoice payments)
    stmt_row = sb.table("capital_bank_statements").select("*").eq("id", statement_id).execute().data
    statement_row = stmt_row[0] if stmt_row else {}

    for pair in pairs:
        mv_id = pair.get("movement_id")
        txn_id = pair.get("transaction_id")
        invoice_id = pair.get("invoice_id")
        target_type = pair.get("target_type") or ("invoice" if invoice_id else "transaction")

        if not mv_id:
            errors.append(f"Missing mv_id in pair: {pair}")
            continue

        try:
            if target_type == "invoice" and invoice_id:
                # ---- AUTO-COLLECT / AUTO-PAY invoice branch ----
                mv_row = sb.table("capital_statement_movements").select("*").eq("id", mv_id).single().execute().data
                if not mv_row:
                    errors.append(f"Movement {mv_id} not found")
                    continue
                inv_row = sb.table("capital_invoices").select("*").eq("id", invoice_id).single().execute().data
                if not inv_row:
                    errors.append(f"Invoice {invoice_id} not found")
                    continue

                # Idempotency guard: if this movement was already reconciled
                # (same movement/payment submitted twice), skip — re-posting
                # would double-count the collection and the ledger pair.
                if (mv_row.get("status") == "reconciled") or mv_row.get("matched_transaction_id"):
                    errors.append(f"Movement {mv_id} already reconciled — skipped (idempotent)")
                    continue

                amount = abs(float(mv_row.get("amount") or 0))
                is_receivable = (inv_row.get("direction") or "").lower() == "receivable"

                # POST THE LEDGER PAIR FIRST. Only after it succeeds do we
                # register the payment and mark the invoice paid — otherwise a
                # swallowed post would leave the invoice paid with no pair.
                from api.services.capital_ledger import post_to_capital_ledger
                extra = {k: v for k, v in {
                    "client_id": inv_row.get("client_id"),
                    "investor_id": inv_row.get("investor_id"),
                    "rto_contract_id": inv_row.get("rto_contract_id"),
                    "rto_payment_id": inv_row.get("rto_payment_id"),
                }.items() if v}
                debit_id, credit_id = post_to_capital_ledger(
                    event_type=("invoice_paid_in" if is_receivable else "invoice_paid_out"),
                    amount=amount,
                    bank_account_id=statement_row.get("bank_account_id"),
                    date=mv_row.get("movement_date") or now_str[:10],
                    counterparty_name=inv_row.get("counterparty_name"),
                    counterparty_type=inv_row.get("counterparty_type"),
                    entity_type="invoice",
                    entity_id=invoice_id,
                    property_id=inv_row.get("property_id"),
                    description_data={"invoice_number": inv_row.get("invoice_number", "")},
                    payment_method=mv_row.get("payment_method"),
                    payment_reference=mv_row.get("reference"),
                    notes="Auto-cobrado desde estado de cuenta",
                    status="reconciled",  # pair is born already reconciled
                    extra_fields=extra or None,
                )

                # Pair posted OK — now register the payment and mark paid.
                pay = sb.table("capital_invoice_payments").insert({
                    "invoice_id": invoice_id,
                    "payment_date": mv_row.get("movement_date"),
                    "amount": amount,
                    "payment_method": mv_row.get("payment_method"),
                    "payment_reference": mv_row.get("reference"),
                    "notes": f"Auto-cobrado del estado de cuenta {statement_row.get('id','')[:8]}",
                }).execute()

                new_paid = float(inv_row.get("amount_paid") or 0) + amount
                total = float(inv_row.get("total_amount") or 0)
                new_status = "paid" if new_paid + 0.01 >= total else "partial"
                sb.table("capital_invoices").update({
                    "amount_paid": new_paid,
                    "status": new_status,
                }).eq("id", invoice_id).execute()

                bank_leg_id = debit_id if is_receivable else credit_id
                if pay.data and bank_leg_id:
                    sb.table("capital_invoice_payments").update({
                        "transaction_id": bank_leg_id,
                    }).eq("id", pay.data[0]["id"]).execute()

                sb.table("capital_transactions").update({
                    "reconciled_at": now_str,
                }).in_("id", [debit_id, credit_id]).execute()

                sb.table("capital_statement_movements").update({
                    "status": "reconciled",
                    "matched_transaction_id": bank_leg_id,
                }).eq("id", mv_id).execute()

                try:
                    from api.routes.capital.accounting_invoices import _log_capital_audit
                    _log_capital_audit("capital_invoices", invoice_id, "auto_paid_from_statement",
                                       description=f"Pago auto-conciliado: ${amount:,.2f}")
                except Exception:
                    pass
                reconciled += 1
                continue

            # ---- TRANSACTION branch ----
            if not txn_id:
                errors.append(f"Missing txn_id in pair: {pair}")
                continue

            mv_result = sb.table("capital_statement_movements").update({
                "status": "reconciled",
                "matched_transaction_id": txn_id,
            }).eq("id", mv_id).execute()
            logger.info(f"[capital-reconcile-confirm] Movement update: {len(mv_result.data or [])} rows, mv={mv_id}")

            # Reconcile the matched txn AND its linked counterpart leg.
            txn_row = sb.table("capital_transactions").select("id, linked_transaction_id") \
                       .eq("id", txn_id).single().execute().data or {}
            ids_to_flip = [txn_id]
            if txn_row.get("linked_transaction_id"):
                ids_to_flip.append(txn_row["linked_transaction_id"])
            txn_result = sb.table("capital_transactions").update({
                "status": "reconciled",
                "reconciled_at": now_str,
            }).in_("id", ids_to_flip).execute()
            logger.info(f"[capital-reconcile-confirm] Reconciled {len(txn_result.data or [])} txn rows (target + pair)")

            reconciled += 1
        except Exception as e:
            err_msg = f"mv={mv_id}, target={target_type}: {e}"
            logger.error(f"[capital-reconcile-confirm] Error: {err_msg}")
            errors.append(err_msg)

    return {
        "reconciled": reconciled,
        "message": f"{reconciled} movimientos conciliados",
        "errors": errors[:5] if errors else [],
    }


@router.post("/bank-statements/{statement_id}/classify")
async def classify_capital_statement(statement_id: str):
    """Use AI to suggest accounting accounts for each Capital statement movement."""
    stmt = sb.table("capital_bank_statements").select("*").eq("id", statement_id).execute()
    if not stmt.data:
        raise HTTPException(status_code=404, detail="Statement not found")

    movements = (sb.table("capital_statement_movements")
                 .select("*").eq("statement_id", statement_id)
                 .in_("status", ["pending", "suggested", "reconciled"])
                 .order("sort_order").execute())

    if not movements.data:
        return {"message": "No movements to classify", "classified": 0}

    # For reconciled movements, fetch their matched transaction descriptions
    reconciled_mvs = [m for m in movements.data if m.get("status") == "reconciled" and m.get("matched_transaction_id")]
    matched_txn_map = {}
    if reconciled_mvs:
        txn_ids = [m["matched_transaction_id"] for m in reconciled_mvs]
        txns = sb.table("capital_transactions").select("id, description, counterparty_name, is_income").in_("id", txn_ids).execute()
        txn_by_id = {t["id"]: t for t in (txns.data or [])}
        for mv in reconciled_mvs:
            txn = txn_by_id.get(mv["matched_transaction_id"])
            if txn:
                matched_txn_map[mv["id"]] = txn

    # Enrich movements with matched transaction info for AI context
    for mv in movements.data:
        if mv["id"] in matched_txn_map:
            txn = matched_txn_map[mv["id"]]
            mv["_matched_txn_description"] = txn.get("description", "")
            mv["_matched_txn_counterparty"] = txn.get("counterparty_name", "")

    # Get Capital chart of accounts for AI context — ONLY QuickBooks accounts (with parent_account_id set)
    accounts = sb.table("capital_accounts") \
        .select("id, code, name, account_type, category, is_header, parent_account_id") \
        .eq("is_active", True) \
        .order("display_order").execute()
    all_accounts = accounts.data or []
    qb_root_codes = {"PL_INCOME", "PL_COGS", "PL_EXPENSES", "PL_OTHER_EXPENSES", "BS_ASSETS", "BS_LIABILITIES", "BS_EQUITY"}
    qb_accounts = [a for a in all_accounts if a.get("parent_account_id") or a["code"] in qb_root_codes]
    accounts_list = [a for a in qb_accounts if not a.get("is_header")]
    acct_by_id = {a["id"]: a for a in accounts_list}

    # Build accounts reference for the AI. Capital books several movements to the
    # BALANCE SHEET (investor deposits → 23900 liability, house acquisitions →
    # 14300 asset), so the reference must include those accounts — not just P&L —
    # or the model is forced to mis-book them as income/expense.
    CAPITAL_BS_CLASSIFY_CODES = {"14300", "12000", "23900", "23950"}
    classify_accounts = [
        a for a in accounts_list
        if a["account_type"] in ("income", "expense", "cogs")
        or a["code"] in CAPITAL_BS_CLASSIFY_CODES
    ]
    accounts_ref = "\n".join([
        f"- {a['code']}: {a['name']} (type={a['account_type']}, cat={a.get('category', '')})"
        for a in classify_accounts
    ])

    # --- Learning from human corrections ---
    corrections_ref = ""
    try:
        confirmed = (sb.table("capital_statement_movements")
                     .select("description, counterparty, amount, is_credit, suggested_account_code, suggested_account_id, final_account_id")
                     .in_("status", ["confirmed", "posted"])
                     .not_.is_("final_account_id", "null")
                     .not_.is_("suggested_account_id", "null")
                     .order("updated_at", desc=True)
                     .limit(200)
                     .execute())
        corrections = []
        for cm in (confirmed.data or []):
            if cm.get("final_account_id") and cm.get("suggested_account_id") and cm["final_account_id"] != cm["suggested_account_id"]:
                final_acct = acct_by_id.get(cm["final_account_id"])
                suggested_acct = acct_by_id.get(cm["suggested_account_id"])
                if final_acct:
                    corrections.append({
                        "description": cm.get("description", ""),
                        "counterparty": cm.get("counterparty", ""),
                        "amount": cm.get("amount", 0),
                        "is_credit": cm.get("is_credit", False),
                        "ai_suggested": f"{suggested_acct['code']} {suggested_acct['name']}" if suggested_acct else cm.get("suggested_account_code", "?"),
                        "human_corrected": f"{final_acct['code']} {final_acct['name']}",
                    })

        if corrections:
            lines = []
            for c in corrections[:30]:
                direction = "credit" if c["is_credit"] else "debit"
                lines.append(
                    f"- \"{c['description']}\" ({c['counterparty']}, ${c['amount']}, {direction}) → "
                    f"AI suggested: {c['ai_suggested']} → Human corrected to: {c['human_corrected']}"
                )
            corrections_ref = "\n".join(lines)
    except Exception as e:
        logger.warning(f"Could not load Capital correction history: {e}")

    # Classify in batches
    classified = 0
    batch_size = 20
    mvs = movements.data

    for batch_start in range(0, len(mvs), batch_size):
        batch = mvs[batch_start:batch_start + batch_size]
        suggestions = await _ai_classify_capital_movements(batch, accounts_ref, accounts_list, corrections_ref)

        for mv, suggestion in zip(batch, suggestions):
            update_data = {
                "suggested_account_code": suggestion.get("account_code"),
                "suggested_account_name": suggestion.get("account_name"),
                "suggested_transaction_type": suggestion.get("transaction_type"),
                "ai_confidence": suggestion.get("confidence", 0.5),
                "ai_reasoning": suggestion.get("reasoning", ""),
                "needs_subcategory": suggestion.get("needs_subcategory", False),
            }
            # Keep 'reconciled' status for reconciled movements, set 'suggested' for others
            if mv.get("status") != "reconciled":
                update_data["status"] = "suggested"
            # Try to find account ID
            if suggestion.get("account_code"):
                acct_match = sb.table("capital_accounts").select("id").eq("code", suggestion["account_code"]).execute()
                if acct_match.data:
                    update_data["suggested_account_id"] = acct_match.data[0]["id"]

            sb.table("capital_statement_movements").update(update_data).eq("id", mv["id"]).execute()
            classified += 1

    # Update statement status
    sb.table("capital_bank_statements").update({
        "status": "review",
        "classified_movements": classified,
    }).eq("id", statement_id).execute()

    return {"message": f"Classified {classified} movements", "classified": classified}


@router.patch("/bank-statements/movements/{movement_id}")
async def update_capital_movement(movement_id: str, data: dict):
    """Accountant confirms or changes the classification of a Capital movement."""
    allowed = {"final_account_id", "final_transaction_type", "final_notes", "status", "description", "counterparty"}
    update = {k: v for k, v in data.items() if k in allowed and v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    result = sb.table("capital_statement_movements").update(update).eq("id", movement_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Movement not found")
    return result.data[0]


@router.post("/bank-statements/movements/{movement_id}/split")
async def split_capital_movement(movement_id: str, data: dict):
    """Split a bank-statement movement into multiple child parts.

    Body: {"parts": [{"amount": 100, "description": "Part 1"}, ...]}
    The sum of part amounts must equal the parent movement amount.
    """
    parts = data.get("parts")
    if not parts or not isinstance(parts, list) or len(parts) < 2:
        raise HTTPException(status_code=400, detail="Must provide at least 2 parts")

    # Fetch parent movement
    parent_result = sb.table("capital_statement_movements").select("*").eq("id", movement_id).execute()
    if not parent_result.data:
        raise HTTPException(status_code=404, detail="Movement not found")
    parent = parent_result.data[0]

    # Validate amounts sum (frontend sends positive amounts; compare absolute values)
    parent_amount = float(parent["amount"])
    abs_parent = abs(parent_amount)
    sign = -1 if parent_amount < 0 else 1
    parts_total = sum(abs(float(p["amount"])) for p in parts)
    if abs(parts_total - abs_parent) > 0.01:
        raise HTTPException(
            status_code=400,
            detail=f"Parts total ({parts_total:.2f}) does not match movement amount ({abs_parent:.2f})",
        )

    # Mark parent as split
    sb.table("capital_statement_movements").update({
        "is_split_parent": True,
        "status": "split",
    }).eq("id", movement_id).execute()

    # Determine starting sort_order for children (parent sort_order + fractional)
    base_sort = parent.get("sort_order", 0)

    created_children = []
    for idx, part in enumerate(parts):
        child_data = {
            "statement_id": parent["statement_id"],
            "movement_date": parent["movement_date"],
            "description": part.get("description", parent.get("description", ""))[:500],
            "amount": sign * abs(float(part["amount"])),
            "is_credit": parent["is_credit"],
            "reference": parent.get("reference"),
            "counterparty": part.get("counterparty", parent.get("counterparty")),
            "parent_movement_id": movement_id,
            "sort_order": base_sort + idx + 1,
            "status": "pending",
        }
        child_data = {k: v for k, v in child_data.items() if v is not None}
        try:
            child_result = sb.table("capital_statement_movements").insert(child_data).execute()
            if child_result.data:
                created_children.append(child_result.data[0])
        except Exception as e:
            logger.error(f"[CapitalBankStmt] Failed to create split child {idx}: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to create split part {idx + 1}: {str(e)}")

    return {"message": f"Split into {len(created_children)} parts", "children": created_children}


@router.post("/bank-statements/{statement_id}/post")
async def post_capital_statement(statement_id: str):
    """Create Capital accounting transactions from confirmed movements (double-entry)."""
    stmt = sb.table("capital_bank_statements").select("*").eq("id", statement_id).execute()
    if not stmt.data:
        raise HTTPException(status_code=404, detail="Statement not found")
    statement = stmt.data[0]

    # Get confirmed AND reconciled movements that haven't been posted yet
    movements = (sb.table("capital_statement_movements")
                 .select("*")
                 .eq("statement_id", statement_id)
                 .in_("status", ["confirmed", "reconciled"])
                 .order("sort_order").execute())

    if not movements.data:
        return {"message": "No hay movimientos confirmados para publicar. Primero clasifica y confirma los movimientos.", "posted": 0, "skipped": 0, "errors": []}

    # Look up the bank's accounting_account_id for double-entry
    bank_accounting_account_id = None
    if statement.get("bank_account_id"):
        ba = sb.table("capital_bank_accounts").select("accounting_account_id").eq("id", statement["bank_account_id"]).execute()
        if ba.data and ba.data[0].get("accounting_account_id"):
            bank_accounting_account_id = ba.data[0]["accounting_account_id"]
    if not bank_accounting_account_id:
        logger.warning(f"[CapitalBankStmt] No accounting_account_id linked to bank_account — bank-side entries will be skipped")

    posted = 0
    skipped = 0
    errors = []
    stmt_label = f"{statement.get('account_label', '')} - {statement.get('original_filename', '')}"

    # Pre-load account types for determining bank-side direction
    all_accts = sb.table("capital_accounts").select("id, account_type").eq("is_active", True).execute().data or []
    acct_type_map = {a["id"]: a.get("account_type", "") for a in all_accts}

    for mv in movements.data:
        account_id = mv.get("final_account_id") or mv.get("suggested_account_id")
        txn_type = mv.get("final_transaction_type") or mv.get("suggested_transaction_type") or "adjustment"

        if not account_id:
            skipped += 1
            desc = mv.get("description", "")[:60]
            errors.append(f"'{desc}' — sin cuenta contable asignada")
            logger.warning(f"[CapitalBankStmt] Skipped movement {mv['id']}: no account_id (desc: {desc})")
            continue

        # Determine bank direction from account type, not is_credit
        # Income account → money came in → bank increases (is_income=True)
        # Expense account → money went out → bank decreases (is_income=False)
        pnl_acct_type = acct_type_map.get(account_id, "")
        bank_is_income = pnl_acct_type in ("income",)

        try:
            abs_amount = abs(float(mv["amount"]))
            common_fields = {
                "transaction_date": mv["movement_date"],
                "bank_account_id": statement.get("bank_account_id"),
                "payment_method": mv.get("payment_method"),
                "payment_reference": mv.get("reference"),
                "counterparty_name": mv.get("counterparty"),
                "description": mv.get("description", "")[:500],
                "source": "bank_statement",
            }
            common_fields = {k: v for k, v in common_fields.items() if v is not None}

            pnl_txn_id = None

            # --- Entry 1: P&L side ---
            if mv.get("status") == "reconciled" and mv.get("matched_transaction_id"):
                # Reconciled: update existing transaction
                sb.table("capital_transactions").update({
                    "account_id": account_id,
                    "transaction_type": txn_type,
                    "source": "bank_statement",
                }).eq("id", mv["matched_transaction_id"]).execute()
                pnl_txn_id = mv["matched_transaction_id"]
            else:
                # Non-reconciled: create new P&L transaction
                txn_data = {
                    **common_fields,
                    "transaction_type": txn_type if txn_type in (
                        'rto_payment', 'down_payment', 'late_fee', 'acquisition',
                        'investor_deposit', 'investor_return', 'commission', 'insurance',
                        'tax', 'operating_expense', 'transfer', 'adjustment',
                        'other_income', 'other_expense'
                    ) else "adjustment",
                    "amount": abs_amount,
                    "is_income": mv["is_credit"],
                    "account_id": account_id,
                    "notes": f"Importado de estado de cuenta: {stmt_label}",
                    "status": "confirmed",
                }
                txn_result = sb.table("capital_transactions").insert(txn_data).execute()
                if txn_result.data:
                    pnl_txn_id = txn_result.data[0]["id"]
                else:
                    skipped += 1
                    errors.append(f"'{mv.get('description', '')[:60]}' — error al insertar transacción")
                    continue

            # --- Entry 2: Bank/asset side (double-entry) ---
            if bank_accounting_account_id:
                bank_data = {
                    **common_fields,
                    "transaction_type": txn_type,
                    "amount": abs_amount,
                    "is_income": bank_is_income,
                    "account_id": bank_accounting_account_id,
                    "linked_transaction_id": pnl_txn_id,
                    "notes": f"Contrapartida bancaria: {stmt_label}",
                    "status": "confirmed",
                }
                bank_result = sb.table("capital_transactions").insert(bank_data).execute()
                if bank_result.data:
                    bank_txn_id = bank_result.data[0]["id"]
                    # Link the P&L entry back to the bank entry
                    sb.table("capital_transactions").update({
                        "linked_transaction_id": bank_txn_id,
                    }).eq("id", pnl_txn_id).execute()

            # Mark movement as posted
            sb.table("capital_statement_movements").update({
                "status": "posted",
                "transaction_id": pnl_txn_id,
            }).eq("id", mv["id"]).execute()
            posted += 1

        except Exception as e:
            logger.warning(f"[CapitalBankStmt] Failed to post movement {mv['id']}: {e}")
            skipped += 1
            errors.append(f"'{mv.get('description', '')[:60]}' — {str(e)[:80]}")

    # Update statement stats
    total_posted_result = (sb.table("capital_statement_movements")
                    .select("id", count="exact")
                    .eq("statement_id", statement_id)
                    .eq("status", "posted").execute())
    total_count = total_posted_result.count if hasattr(total_posted_result, 'count') else len(total_posted_result.data or [])

    new_status = "completed" if total_count >= (statement.get("total_movements") or 0) else "partial"
    sb.table("capital_bank_statements").update({
        "posted_movements": total_count,
        "status": new_status,
    }).eq("id", statement_id).execute()

    return {
        "message": f"Publicados {posted} transacciones" + (f", {skipped} omitidos (sin cuenta asignada)" if skipped > 0 else ""),
        "posted": posted,
        "skipped": skipped,
        "errors": errors[:10],
    }


@router.delete("/bank-statements/{statement_id}")
async def delete_capital_bank_statement(statement_id: str):
    """Delete a Capital bank statement and all its movements."""
    sb.table("capital_bank_statements").delete().eq("id", statement_id).execute()
    return {"message": "Statement deleted"}


# ============================================================================
# BUDGETS (Presupuestos)
# ============================================================================

@router.get("/budgets")
async def list_capital_budgets(year: Optional[int] = None):
    """List all Capital budgets for a given year."""
    target_year = year or date.today().year
    try:
        result = sb.table("capital_budgets") \
            .select("*, capital_accounts(code, name, account_type, category)") \
            .eq("period_year", target_year) \
            .order("period_month") \
            .execute()
        return {"ok": True, "budgets": result.data or [], "year": target_year}
    except Exception as e:
        logger.error(f"Error listing capital budgets: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/budgets")
async def create_or_update_capital_budget(data: CapitalBudgetCreate):
    """Create or update a Capital budget (upsert by account + month + year)."""
    try:
        existing = sb.table("capital_budgets") \
            .select("id") \
            .eq("account_id", data.account_id) \
            .eq("period_month", data.period_month) \
            .eq("period_year", data.period_year) \
            .execute()

        insert_data = {k: v for k, v in data.model_dump().items() if v is not None}

        if existing.data:
            result = sb.table("capital_budgets") \
                .update(insert_data) \
                .eq("id", existing.data[0]["id"]) \
                .execute()
        else:
            result = sb.table("capital_budgets").insert(insert_data).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Error saving budget")
        return {"ok": True, "budget": result.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating/updating capital budget: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/budgets/vs-actual")
async def capital_budget_vs_actual(year: Optional[int] = None):
    """Compare budgeted amounts vs actual spending per Capital account per month.

    Handles parent→child aggregation: if a budget is set on a parent account,
    transactions on any child account also count toward that budget.
    """
    target_year = year or date.today().year

    try:
        # Get budgets
        budgets = sb.table("capital_budgets") \
            .select("*, capital_accounts(code, name, account_type, category)") \
            .eq("period_year", target_year) \
            .execute().data or []

        # Get chart of accounts (for parent→child resolution)
        all_accounts = sb.table("capital_accounts") \
            .select("id, parent_account_id") \
            .eq("is_active", True) \
            .execute().data or []

        # Build parent→children map (so we can aggregate child txns into parent budgets)
        children_of: dict[str, set[str]] = {}  # parent_id → {child_ids, grandchild_ids, ...}
        parent_map: dict[str, str | None] = {a["id"]: a.get("parent_account_id") for a in all_accounts}

        def get_all_descendants(account_id: str) -> set[str]:
            """Recursively get all descendant account IDs."""
            descendants: set[str] = set()
            for aid, pid in parent_map.items():
                if pid == account_id:
                    descendants.add(aid)
                    descendants.update(get_all_descendants(aid))
            return descendants

        budget_account_ids = {b["account_id"] for b in budgets}
        for baid in budget_account_ids:
            children_of[baid] = get_all_descendants(baid)

        # Get actual transactions for the year
        start = f"{target_year}-01-01"
        end = f"{target_year}-12-31"
        txns = sb.table("capital_transactions") \
            .select("account_id, amount, is_income, transaction_date") \
            .gte("transaction_date", start) \
            .lte("transaction_date", end) \
            .neq("status", "voided") \
            .execute().data or []

        # Aggregate actuals by account + month (direct account AND parent accounts)
        actuals: dict[str, float] = {}
        for t in txns:
            aid = t.get("account_id")
            if not aid:
                continue
            m = int(str(t["transaction_date"]).split("-")[1])
            amt = float(t["amount"])
            value = abs(amt) if not t.get("is_income") else amt

            # Add to direct account
            key = f"{aid}:{m}"
            actuals[key] = actuals.get(key, 0) + value

            # Also add to any parent account that has a budget
            for baid, child_ids in children_of.items():
                if aid in child_ids:
                    parent_key = f"{baid}:{m}"
                    actuals[parent_key] = actuals.get(parent_key, 0) + value

        # Build comparison
        comparison = []
        for b in budgets:
            aid = b["account_id"]
            m = b["period_month"]
            actual = actuals.get(f"{aid}:{m}", 0)
            budgeted = float(b.get("budgeted_amount") or 0)
            variance = budgeted - actual
            variance_pct = round((variance / budgeted * 100), 1) if budgeted != 0 else 0

            comparison.append({
                "account_id": aid,
                "account": b.get("capital_accounts"),
                "month": m,
                "budgeted": budgeted,
                "actual": round(actual, 2),
                "variance": round(variance, 2),
                "variance_pct": variance_pct,
            })

        return {"ok": True, "comparison": comparison, "year": target_year}
    except Exception as e:
        logger.error(f"Error computing capital budget vs actual: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/budgets/{budget_id}")
async def delete_capital_budget(budget_id: str):
    """Delete a Capital budget entry."""
    try:
        sb.table("capital_budgets").delete().eq("id", budget_id).execute()
        return {"ok": True, "message": "Budget deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# RTO PAYMENTS (accounting view)
# ============================================================================

@router.get("/rto-payments")
async def list_rto_payment_transactions(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=10, le=200),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    search: Optional[str] = None,
):
    """List RTO payment transactions from capital_transactions with reconciliation status."""
    try:
        q = sb.table("capital_transactions") \
            .select("*, capital_accounts(code, name), capital_bank_accounts(name, bank_name)") \
            .eq("transaction_type", "rto_payment") \
            .neq("status", "voided") \
            .order("transaction_date", desc=True)

        if start_date:
            q = q.gte("transaction_date", start_date)
        if end_date:
            q = q.lte("transaction_date", end_date)
        if search:
            q = q.or_(f"description.ilike.%{search}%,counterparty_name.ilike.%{search}%,notes.ilike.%{search}%")

        offset = (page - 1) * per_page
        result = q.range(offset, offset + per_page - 1).execute()
        txns = result.data or []

        # Check reconciliation status: is each transaction_id referenced
        # by any capital_statement_movements.matched_transaction_id?
        txn_ids = [t["id"] for t in txns]
        reconciled_ids: set[str] = set()
        if txn_ids:
            try:
                matched = sb.table("capital_statement_movements") \
                    .select("matched_transaction_id") \
                    .in_("matched_transaction_id", txn_ids) \
                    .execute()
                reconciled_ids = {m["matched_transaction_id"] for m in (matched.data or []) if m.get("matched_transaction_id")}
            except Exception:
                pass  # Table might not exist yet — gracefully degrade

        for t in txns:
            t["is_reconciled"] = t["id"] in reconciled_ids

        return {
            "ok": True,
            "transactions": txns,
            "page": page,
            "per_page": per_page,
            "total_reconciled": sum(1 for t in txns if t["is_reconciled"]),
        }
    except Exception as e:
        logger.error(f"Error listing RTO payment transactions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/rto-payments/register")
async def register_rto_payment(data: RTOPaymentRegister):
    """Manually register an RTO payment in Capital accounting.

    Creates a capital_transaction with transaction_type='rto_payment' and
    auto-assigns the RTO Rental Income account (code 41000).
    """
    try:
        txn_date = data.transaction_date or date.today().isoformat()
        account_id = _resolve_account_id("rto_payment")
        description = data.description or f"Pago RTO — {data.client_name}"

        record: dict = {
            "transaction_date": txn_date,
            "transaction_type": "rto_payment",
            "amount": abs(data.amount),
            "is_income": True,
            "account_id": account_id,
            "description": description,
            "counterparty_name": data.client_name,
            "payment_method": data.payment_method,
            "status": "confirmed",
            "created_by": "admin",
        }

        # Add optional fields
        if data.bank_account_id:
            record["bank_account_id"] = data.bank_account_id
        if data.payment_reference:
            record["payment_reference"] = data.payment_reference
        if data.notes:
            record["notes"] = data.notes

        result = sb.table("capital_transactions").insert(record).execute()
        txn = result.data[0] if result.data else None

        return {"ok": True, "transaction": txn}
    except Exception as e:
        logger.error(f"Error registering RTO payment: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# AI CLASSIFICATION HELPER (for Capital context)
# ============================================================================

async def _ai_classify_capital_movements(
    movements: list,
    accounts_reference: str,
    accounts_list: list,
    corrections_reference: str = "",
) -> list:
    """Use GPT-4 to suggest accounting accounts for Capital bank movements."""
    import os

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not configured")

    from openai import OpenAI
    client = OpenAI(api_key=api_key)

    movements_lines = []
    for i, mv in enumerate(movements):
        line = f"{i+1}. [{mv['movement_date']}] {mv.get('description', '')} | ${mv['amount']} | {mv.get('counterparty', '')}"
        if mv.get("_matched_txn_description"):
            line += f" | RECONCILED with app transaction: \"{mv['_matched_txn_description']}\""
        movements_lines.append(line)
    movements_text = "\n".join(movements_lines)

    prompt = f"""Classify each bank movement into the correct account for Maninos Capital LLC (mobile-home rent-to-own financing, Texas).

CRITICAL: the sign of the movement does NOT decide the account. Some deposits are LIABILITIES and some withdrawals are ASSETS. Match by the MEANING of the description, using the table below.

CHART OF ACCOUNTS (use ONLY these exact codes — no others, never leave empty):
{accounts_reference}

CAPITAL CLASSIFICATION RULES (description → account, most specific wins):

INCOMING MONEY (credits / deposits):
- Investor capital in — "aporte inversionista", "pagaré", "nota", "depósito inversión", "investor deposit/wire" → 23900 Investor Notes Payable. THIS IS A LIABILITY, NOT INCOME — it is money Capital OWES the investor. transaction_type=investor_deposit.
- RTO monthly payment — "pago mensual", "mensualidad", "renta RTO", "rent-to-own payment" → 41000 RTO Rental Income. transaction_type=rto_payment. (Do NOT use "Interest earned" for a monthly RTO payment.)
- Down payment / "enganche" — → 42000 Down Payment Income. transaction_type=down_payment.
- Late fee / "mora" / "cargo por atraso" — → 43000 Late Fee Income. transaction_type=late_fee.
- Anything else clearly income with no better fit → 70000 Other Income. transaction_type=other_income.

OUTGOING MONEY (debits / withdrawals):
- Paying Homes for a financed house — "pago a Homes", "financiamiento", "adquisición", "compra casa/propiedad" → 14300 RTO Properties. THIS IS AN ASSET (the house Capital now owns), NOT an expense. transaction_type=acquisition.
- Interest paid to an investor — "pago intereses inversionista", "interés" → 71400 Interest paid. transaction_type=investor_interest.
- Returning an investor's principal — "devolución capital", "retiro inversionista", "return of principal" → 23900 Investor Notes Payable (reduces the liability). transaction_type=investor_return.
- Commission — "comisión", "commission" → 60100 Commissions & fees. transaction_type=commission.
- Bank fee / "comisión bancaria" / "service charge" → 60600 Bank fees & service charges (or the closest bank-fee account). transaction_type=operating_expense.
- Generic operating expense — software, office, legal, consulting → 60500 Office expenses. transaction_type=operating_expense.
- Anything else clearly an expense with no better fit → 71000 Other Business Expenses. transaction_type=other_expense.

BANK TRANSFERS between Capital's own accounts → transaction_type="transfer".

RECONCILED MOVEMENTS: those marked "RECONCILED with app transaction: ..." carry a known internal description — trust it as the PRIMARY signal and map it with the same rules above.

BUSINESS CONTEXT:
- Capital finances mobile homes for clients via RTO contracts, funded by investors who lend money (promissory notes).
- Investor money in is a LIABILITY (23900), never income. Interest paid to investors is an expense (71400). Houses Capital buys from Homes to finance are ASSETS (14300).
- Client money in is income: monthly RTO = 41000, enganche = 42000, mora = 43000.
- Related party: Maninos Homes (Capital pays Homes for each financed house).

{f"HUMAN CORRECTIONS (the accountant overrode the AI — follow these patterns):{chr(10)}{corrections_reference}{chr(10)}" if corrections_reference else ""}MOVEMENTS:
{movements_text}

Return a JSON array with one object per movement (in order):
{{
  "account_code": "exact code from chart above",
  "account_name": "account name",
  "transaction_type": "rto_payment"|"down_payment"|"late_fee"|"investor_deposit"|"investor_return"|"commission"|"operating_expense"|"other_income"|"other_expense"|"transfer"|"adjustment",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation",
  "needs_subcategory": true/false
}}"""

    response = client.chat.completions.create(
        model="gpt-5",
        messages=[
            {"role": "system", "content": "You are an expert accountant for a mobile-home RTO financing company (Maninos Capital). Investor money in is a LIABILITY (23900), houses bought to finance are ASSETS (14300) — never book those as income/expense. Return valid JSON arrays only."},
            {"role": "user", "content": prompt},
        ],
        max_completion_tokens=8192,
    )

    content = response.choices[0].message.content or "[]"
    content = content.strip()

    import re
    if content.startswith("```"):
        content = re.sub(r'^```(?:json)?\s*', '', content)
        content = re.sub(r'\s*```$', '', content)

    try:
        suggestions = json.loads(content)
        if not isinstance(suggestions, list):
            suggestions = [suggestions]
        while len(suggestions) < len(movements):
            suggestions.append({"account_code": "", "confidence": 0, "reasoning": "AI did not classify"})
        return suggestions[:len(movements)]
    except json.JSONDecodeError:
        logger.error(f"[CapitalClassify] Invalid JSON response: {content[:500]}")
        return [{"account_code": "", "confidence": 0, "reasoning": "AI parse error"}] * len(movements)



# ============================================================================
# ACCOUNTS SUMMARY + REPORT CSV EXPORTS (Homes parity)
# ============================================================================

@router.get("/accounts/summary")
async def get_capital_accounts_summary(
    period: str = Query("month"),
    year: Optional[int] = None,
    month: Optional[int] = None,
):
    """Income/expense totals per account for a period."""
    today = date.today()
    y = year or today.year
    m = month or today.month
    start_date, end_date = _get_period_dates(period, y, m)

    txns = sb.table("capital_transactions") \
        .select("account_id, amount, is_income, status") \
        .gte("transaction_date", start_date) \
        .lte("transaction_date", end_date) \
        .execute().data or []

    accounts = sb.table("capital_accounts").select("id, code, name, account_type").eq("is_active", True).execute().data or []
    by_id = {a["id"]: a for a in accounts}

    summary: dict = {}
    for t in txns:
        if (t.get("status") or "") in ("voided", "pending_confirmation", "draft"):
            continue
        aid = t.get("account_id")
        if not aid or aid not in by_id:
            continue
        entry = summary.setdefault(aid, {
            "account_id": aid,
            "code": by_id[aid]["code"],
            "name": by_id[aid]["name"],
            "account_type": by_id[aid]["account_type"],
            "income": 0.0, "expense": 0.0,
        })
        amt = float(t.get("amount") or 0)
        if t.get("is_income"):
            entry["income"] += amt
        else:
            entry["expense"] += amt

    rows = sorted(summary.values(), key=lambda r: r["code"])
    for r in rows:
        r["income"] = round(r["income"], 2)
        r["expense"] = round(r["expense"], 2)
        r["net"] = round(r["income"] - r["expense"], 2)
    return {"ok": True, "period": {"start": start_date, "end": end_date}, "accounts": rows}


def _flatten_tree_to_csv_rows(nodes: list, depth: int = 0) -> list:
    rows = []
    for n in nodes or []:
        indent = "  " * depth
        rows.append([f"{indent}{n.get('name', '')}", n.get("code", ""),
                     n.get("balance", 0), n.get("subtotal", n.get("balance", 0))])
        rows.extend(_flatten_tree_to_csv_rows(n.get("children") or [], depth + 1))
    return rows


@router.get("/reports/income-statement/export-csv")
async def export_capital_income_statement_csv(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
):
    """Export the P&L tree as CSV (hierarchical indentation, like Homes)."""
    report = await get_profit_loss_tree(start_date=start_date, end_date=end_date)
    output = io.StringIO()
    writer = csv.writer(output)
    period = report.get("period") or {}
    writer.writerow(["Estado de Resultados — Maninos Capital"])
    writer.writerow([f"Periodo: {period.get('start', '')} a {period.get('end', '')}"])
    writer.writerow([])
    writer.writerow(["Cuenta", "Código", "Balance", "Subtotal"])
    for section, label in (("income", "INGRESOS"), ("expenses", "GASTOS"),
                           ("other_income", "OTROS INGRESOS"), ("other_expenses", "OTROS GASTOS")):
        nodes = report.get(section) or []
        if not nodes:
            continue
        writer.writerow([label])
        for row in _flatten_tree_to_csv_rows(nodes, 1):
            writer.writerow(row)
    writer.writerow([])
    writer.writerow(["Ingresos totales", "", report.get("total_income", 0)])
    writer.writerow(["Gastos totales", "", report.get("total_expenses", 0)])
    writer.writerow(["Utilidad neta", "", report.get("net_income", 0)])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=estado_resultados_capital.csv"},
    )


@router.get("/reports/balance-sheet/export-csv")
async def export_capital_balance_sheet_csv():
    """Export the Balance Sheet tree as CSV."""
    report = await get_balance_sheet_tree()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Balance General — Maninos Capital"])
    writer.writerow([f"Al: {report.get('date', '')}"])
    writer.writerow([])
    writer.writerow(["Cuenta", "Código", "Balance", "Subtotal"])
    for section, label in (("assets", "ACTIVOS"), ("liabilities", "PASIVOS"), ("equity", "CAPITAL")):
        nodes = report.get(section) or []
        if not nodes:
            continue
        writer.writerow([label])
        for row in _flatten_tree_to_csv_rows(nodes, 1):
            writer.writerow(row)
    writer.writerow([])
    writer.writerow(["Activos totales", "", report.get("total_assets", 0)])
    writer.writerow(["Pasivos totales", "", report.get("total_liabilities", 0)])
    writer.writerow(["Capital total", "", report.get("total_equity", 0)])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=balance_general_capital.csv"},
    )
