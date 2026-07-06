"""
Accounting Routes V2 — Full AppFolio-level financial management for Maninos Homes.

Features:
  - Dashboard: P&L, cash flow, balances, KPIs
  - Transactions journal with CRUD + audit trail
  - Bank accounts management
  - Invoices & Bills (AR / AP)
  - Financial Statements (Balance Sheet, Income Statement, Cash Flow)
  - Budget vs Actual
  - Bank Reconciliation
  - Per-property P&L
  - Per-yard (Conroe/Houston/Dallas) breakdown
  - Auto-sync from existing sales/purchases/renovations
  - Recurring expenses
  - Audit log
  - Export CSV
"""

import csv
import io
import json
import logging
from datetime import date, datetime, timedelta
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query, Request, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from tools.supabase_client import sb

# ── Canonical account type sets (used everywhere for consistent sign logic) ──
INCOME_TYPES = {"Income", "Other Income", "income"}
EXPENSE_TYPES = {"Expenses", "Other Expense", "Cost of Goods Sold", "expense", "cogs"}
BS_TYPES = {"Bank", "Accounts receivable (A/R)", "Other Current Assets", "Fixed Assets",
            "Other Assets", "Accounts payable (A/P)", "Other Current Liabilities",
            "Long Term Liabilities", "Equity", "asset", "liability", "equity"}
PL_TYPES = INCOME_TYPES | EXPENSE_TYPES


def _signed_balance(amt: float, account_type: str, is_income: bool) -> float:
    """Single source of truth for transaction sign logic across all reports.

    Double-entry rules:
    - Income accounts: credits (is_income=True) increase, debits decrease
    - Expense/COGS accounts: debits (is_income=False) increase, credits decrease (contra-expense)
    - BS accounts (Bank/Assets/Liabilities/Equity): credits increase, debits decrease
    """
    if account_type in EXPENSE_TYPES:
        return amt if not is_income else -amt   # debit increases expense
    else:
        return amt if is_income else -amt       # credit increases income/asset


def _net_income_sign(amt: float, account_type: str, is_income: bool) -> float:
    """Compute contribution to Net Income from a single transaction.
    Income credits add, expense debits subtract."""
    if account_type in INCOME_TYPES:
        return amt if is_income else -amt       # credit = +income
    elif account_type in EXPENSE_TYPES:
        return -amt if not is_income else amt   # debit = -expense (reduces NI), credit = +contra
    return 0.0  # BS accounts don't affect NI directly


def _fetch_all_accounts(active_only: bool = True) -> list:
    """Fetch all accounting_accounts, paginating past Supabase's 1000-row limit."""
    rows: list = []
    offset = 0
    page_size = 1000
    while True:
        try:
            q = sb.table("accounting_accounts").select("*")
            if active_only:
                q = q.eq("is_active", True)
            batch = q.order("display_order, code").range(offset, offset + page_size - 1).execute().data or []
        except Exception:
            q = sb.table("accounting_accounts").select("*")
            if active_only:
                q = q.eq("is_active", True)
            batch = q.order("code").range(offset, offset + page_size - 1).execute().data or []
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return rows


def _fetch_all_transactions(extra_filters: dict = None) -> list:
    """Fetch all accounting_transactions (non-voided), paginating past 1000-row limit."""
    rows: list = []
    offset = 0
    page_size = 1000
    while True:
        q = sb.table("accounting_transactions").select("account_id, amount, is_income, property_id").neq("status", "voided")
        if extra_filters:
            for k, v in extra_filters.items():
                if k == "gte_date":
                    q = q.gte("transaction_date", v)
                elif k == "lte_date":
                    q = q.lte("transaction_date", v)
                elif k == "yard_id":
                    q = q.eq("yard_id", v)
        batch = q.range(offset, offset + page_size - 1).execute().data or []
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return rows

logger = logging.getLogger(__name__)
router = APIRouter()


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
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    yard_id: Optional[str] = None
    property_id: Optional[str] = None
    payment_method: Optional[str] = None
    payment_reference: Optional[str] = None
    counterparty_name: Optional[str] = None
    counterparty_type: Optional[str] = None
    description: str
    notes: Optional[str] = None


class TransactionUpdate(BaseModel):
    transaction_date: Optional[str] = None
    amount: Optional[float] = None
    account_id: Optional[str] = None
    bank_account_id: Optional[str] = None
    yard_id: Optional[str] = None
    payment_method: Optional[str] = None
    payment_reference: Optional[str] = None
    counterparty_name: Optional[str] = None
    description: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None


class BankAccountCreate(BaseModel):
    name: str
    bank_name: Optional[str] = None
    account_number_last4: Optional[str] = None
    routing_number: Optional[str] = None
    account_type: str = "checking"
    current_balance: float = 0
    is_primary: bool = False
    zelle_email: Optional[str] = None
    zelle_phone: Optional[str] = None
    notes: Optional[str] = None


class RecurringExpenseCreate(BaseModel):
    name: str
    amount: float
    frequency: str = "monthly"
    account_id: Optional[str] = None
    bank_account_id: Optional[str] = None
    yard_id: Optional[str] = None
    counterparty_name: Optional[str] = None
    description: Optional[str] = None
    next_due_date: Optional[str] = None


class InvoiceCreate(BaseModel):
    direction: str  # 'receivable' or 'payable'
    counterparty_name: str
    counterparty_type: Optional[str] = None
    client_id: Optional[str] = None
    property_id: Optional[str] = None
    sale_id: Optional[str] = None
    yard_id: Optional[str] = None
    issue_date: Optional[str] = None
    due_date: Optional[str] = None
    subtotal: float = 0
    tax_amount: float = 0
    total_amount: float = 0
    description: Optional[str] = None
    line_items: Optional[list] = None
    notes: Optional[str] = None
    payment_terms: Optional[str] = None
    # For 'payable' invoices the caller can override which expense account
    # to debit (defaults to 69000 Other Operating Expenses if not given).
    expense_account_code: Optional[str] = None
    # The accounting account (chart code) the invoice posts to: for 'receivable'
    # it's the income account credited, for 'payable' the expense/COGS account
    # debited. Falls back to sensible defaults when not provided.
    account_code: Optional[str] = None


class InvoicePaymentCreate(BaseModel):
    invoice_id: str
    amount: float
    payment_date: Optional[str] = None
    payment_method: Optional[str] = None
    payment_reference: Optional[str] = None
    notes: Optional[str] = None
    # NEW: which bank received (receivable) or paid (payable) the money.
    # Required for the payment to land in the ledger correctly.
    bank_account_id: Optional[str] = None


class BudgetCreate(BaseModel):
    account_id: str
    yard_id: Optional[str] = None
    period_month: int
    period_year: int
    budgeted_amount: float
    notes: Optional[str] = None


# ============================================================================
# HELPERS
# ============================================================================

def _generate_transaction_number() -> str:
    today = date.today().strftime("%y%m%d")
    prefix = f"TXN-{today}-"
    try:
        existing = sb.table("accounting_transactions") \
            .select("transaction_number") \
            .like("transaction_number", f"{prefix}%") \
            .execute()
        count = len(existing.data) if existing.data else 0
    except Exception:
        count = 0
    return f"{prefix}{count + 1:03d}"


def _generate_invoice_number(direction: str) -> str:
    prefix_map = {"receivable": "FAC", "payable": "BILL"}
    p = prefix_map.get(direction, "DOC")
    today = date.today().strftime("%y%m%d")
    full_prefix = f"{p}-{today}-"
    try:
        existing = sb.table("accounting_invoices") \
            .select("invoice_number") \
            .like("invoice_number", f"{full_prefix}%") \
            .execute()
        count = len(existing.data) if existing.data else 0
    except Exception:
        count = 0
    return f"{full_prefix}{count + 1:03d}"


def _get_account_by_category(category: str) -> Optional[str]:
    try:
        result = sb.table("accounting_accounts") \
            .select("id") \
            .eq("category", category) \
            .eq("is_active", True) \
            .limit(1) \
            .execute()
        if result.data:
            return result.data[0]["id"]
    except Exception:
        pass
    return None


# ============================================================================
# ACCOUNT MAPPING — transaction_type → accounting account (code-based)
# ============================================================================
# Mirrors the Capital mapping system.  Each transaction_type maps to an
# account code in accounting_accounts.  When new accounts are added,
# only these maps need updating.
# ============================================================================

HOMES_INCOME_MAP: dict[str, str] = {
    "sale_cash":         "PL_INCOME",   # Uses root code for ventas
    "sale_rto_capital":  "PL_INCOME",
    "deposit_received":  "PL_INCOME",
    "other_income":      "PL_INCOME",
}

HOMES_EXPENSE_MAP: dict[str, str] = {
    "purchase_house":    "PL_COGS",
    "renovation":        "PL_EXPENSES",
    "moving_transport":  "PL_EXPENSES",
    "commission":        "PL_EXPENSES",
    "operating_expense": "PL_EXPENSES",
    "other_expense":     "PL_OTHER_EXPENSES",
}

# Combined: transaction_type → category fallback (used by legacy sync)
HOMES_TYPE_TO_CATEGORY: dict[str, str] = {
    "sale_cash": "ventas_contado",
    "sale_rto_capital": "ventas_capital",
    "deposit_received": "depositos",
    "other_income": "otros_ingresos",
    "purchase_house": "compras_casas",
    "renovation": "renovaciones",
    "moving_transport": "transporte",
    "commission": "comisiones",
    "operating_expense": "operativos",
    "other_expense": "otros_gastos",
}

_homes_account_cache: dict[str, str | None] = {}


def _resolve_homes_account_id(transaction_type: str) -> str | None:
    """Resolve transaction_type to account_id via category lookup.

    Uses category-based resolution (Homes uses `category` field on accounts).
    Falls back gracefully if no matching account exists.
    """
    cat = HOMES_TYPE_TO_CATEGORY.get(transaction_type)
    if not cat:
        return None

    if cat in _homes_account_cache:
        return _homes_account_cache[cat]

    account_id = _get_account_by_category(cat)
    _homes_account_cache[cat] = account_id
    return account_id


def _clear_homes_account_cache():
    """Clear the Homes account mapping cache."""
    _homes_account_cache.clear()


def _log_audit(table_name: str, record_id: str, action: str, changes: dict = None,
               description: str = None, user_id: str = None, user_email: str = None):
    """Write to audit log. Fire-and-forget."""
    try:
        sb.table("accounting_audit_log").insert({
            "table_name": table_name,
            "record_id": record_id,
            "action": action,
            "changes": json.dumps(changes) if changes else None,
            "description": description,
            "user_id": user_id,
            "user_email": user_email,
        }).execute()
    except Exception as e:
        logger.warning(f"[audit] Failed to log: {e}")


# ============================================================================
# DASHBOARD
# ============================================================================

@router.get("/dashboard")
async def get_accounting_dashboard(
    period: str = Query("month", description="month, quarter, year, all"),
    year: Optional[int] = None,
    month: Optional[int] = None,
    yard_id: Optional[str] = None,
):
    now = date.today()
    target_year = year or now.year
    target_month = month or now.month

    # Date range
    if period == "month":
        start_date = date(target_year, target_month, 1)
        end_date = date(target_year + (1 if target_month == 12 else 0),
                        1 if target_month == 12 else target_month + 1, 1) - timedelta(days=1)
    elif period == "quarter":
        q = (target_month - 1) // 3
        start_date = date(target_year, q * 3 + 1, 1)
        em = q * 3 + 4
        end_date = date(target_year + (1 if em > 12 else 0),
                        1 if em > 12 else em, 1) - timedelta(days=1)
    elif period == "year":
        start_date = date(target_year, 1, 1)
        end_date = date(target_year, 12, 31)
    else:
        start_date = date(2020, 1, 1)
        end_date = date(2030, 12, 31)

    start_str = start_date.isoformat()
    end_str = end_date.isoformat()

    # ---- Fetch accounting_transactions ----
    transactions = []
    try:
        q_txn = sb.table("accounting_transactions") \
            .select("*") \
            .gte("transaction_date", start_str) \
            .lte("transaction_date", end_str) \
            .neq("status", "voided")
        if yard_id:
            q_txn = q_txn.eq("yard_id", yard_id)
        txn_result = q_txn.execute()
        transactions = txn_result.data or []
    except Exception as e:
        logger.warning(f"[accounting] Could not fetch accounting_transactions: {e}")

    # ---- Pull from existing tables ----
    sales_q = sb.table("sales") \
        .select("id, sale_price, sale_type, status, payment_method, created_at, property_id, commission_amount, clients(name), properties(address, city, yard_id, purchase_price)") \
        .gte("created_at", start_str) \
        .lte("created_at", end_str + "T23:59:59")
    sales = (sales_q.execute()).data or []

    props_q = sb.table("properties") \
        .select("id, address, city, purchase_price, sale_price, status, yard_id, created_at") \
        .gte("created_at", start_str) \
        .lte("created_at", end_str + "T23:59:59")
    properties = (props_q.execute()).data or []

    reno_q = sb.table("renovations") \
        .select("id, property_id, total_cost, status, created_at") \
        .gte("created_at", start_str) \
        .lte("created_at", end_str + "T23:59:59")
    renovations = (reno_q.execute()).data or []

    # ---- Financials ----
    # Sales income comes from the LEDGER, not the sales table's status filter
    # (which excluded rto_pending / partially-paid sales, so the Resumen showed
    # $0 even after money was received). Count the bank leg of each sale entry =
    # money actually received — same cash basis as manual_income and consistent
    # with the P&L. RTO down payments / partial payments show as they arrive.
    total_sales_income = 0.0
    sales_by_type = {"contado": 0.0, "rto": 0.0}
    for t in transactions:
        tt = t.get("transaction_type")
        if tt in ("sale_cash", "sale_rto_capital") and t.get("is_income") and t.get("bank_account_id"):
            amount = float(t.get("amount") or 0)
            total_sales_income += amount
            sales_by_type["rto" if tt == "sale_rto_capital" else "contado"] += amount

    # total_purchases sums confirmed (non-voided) purchase_house transactions.
    # This is the single source of truth — properties.purchase_price is not used
    # so that "Vaciar Cifras" (which voids transactions) is reflected here.
    # Each purchase_house transaction is a double-entry pair (inventory debit +
    # bank/cash-out credit), BOTH rows tagged transaction_type='purchase_house'.
    # Count only the cash-out leg (is_income=False) so we don't double the total.
    total_purchases = sum(
        float(t.get("amount") or 0) for t in transactions
        if t.get("transaction_type") == "purchase_house" and not t.get("is_income")
    )
    total_renovations = sum(float(r.get("total_cost") or 0) for r in renovations)
    total_commissions = sum(float(s.get("commission_amount") or 0) for s in sales)

    # manual_income / manual_expense are the "Otros" buckets — exclude
    # transaction types that are already counted in the categorized totals
    # above (purchases, sales) to prevent double-counting.
    CATEGORIZED_INCOME_TYPES = {"sale_cash", "sale_rto_capital"}
    CATEGORIZED_EXPENSE_TYPES = {"purchase_house", "renovation", "commission"}
    # Count only the bank leg (bank_account_id set) so two-legged transactions
    # are not double-counted, and exclude balance-sheet movements (opening
    # balances, transfers between own accounts) which are NOT P&L income/expense.
    BALANCE_SHEET_ENTITY = {"opening_balance", "bank_transfer"}
    manual_income = sum(
        float(t["amount"]) for t in transactions
        if t["is_income"] and t.get("bank_account_id")
        and t.get("transaction_type") not in CATEGORIZED_INCOME_TYPES
        and t.get("entity_type") not in BALANCE_SHEET_ENTITY
    )
    manual_expense = sum(
        float(t["amount"]) for t in transactions
        if not t["is_income"] and t.get("bank_account_id")
        and t.get("transaction_type") not in CATEGORIZED_EXPENSE_TYPES
        and t.get("entity_type") not in BALANCE_SHEET_ENTITY
    )

    total_income = total_sales_income + manual_income
    total_expenses = total_purchases + total_renovations + total_commissions + manual_expense
    net_profit = total_income - total_expenses

    # ---- Yard breakdown ----
    yard_breakdown = {}
    try:
        yards_result = sb.table("yards").select("id, name, city").eq("is_active", True).execute()
        yards_map = {y["id"]: y for y in (yards_result.data or [])}
    except Exception:
        yards_map = {}

    for yid, yard_info in yards_map.items():
        yi, ye, yh = 0, 0, 0
        for sale in sales:
            prop = sale.get("properties") or {}
            if prop.get("yard_id") == yid and sale.get("status") in ("paid", "completed", "rto_approved", "rto_active"):
                yi += float(sale.get("sale_price") or 0)
        for prop in properties:
            if prop.get("yard_id") == yid:
                ye += float(prop.get("purchase_price") or 0)
                yh += 1
        yard_breakdown[yid] = {"yard_id": yid, "name": yard_info.get("name", "?"),
                               "city": yard_info.get("city", "?"), "income": yi, "expense": ye,
                               "houses": yh, "profit": yi - ye}

    # ---- Property P&L ----
    property_pnl = []
    for prop in properties:
        pid = prop["id"]
        pp = float(prop.get("purchase_price") or 0)
        sp = float(prop.get("sale_price") or 0)
        reno_cost = sum(float(r.get("total_cost") or 0) for r in renovations if r.get("property_id") == pid)
        sale_match = next((s for s in sales if s.get("property_id") == pid and s.get("status") in ("paid", "completed", "rto_approved")), None)
        if sale_match:
            sp = float(sale_match.get("sale_price") or sp)
        total_cost = pp + reno_cost
        profit = sp - total_cost if sp > 0 else 0
        margin = (profit / sp * 100) if sp > 0 else 0
        property_pnl.append({"property_id": pid, "address": prop.get("address", "?"),
                             "city": prop.get("city", "?"), "status": prop.get("status", "?"),
                             "yard_id": prop.get("yard_id"), "purchase_price": pp,
                             "renovation_cost": reno_cost, "total_cost": total_cost,
                             "sale_price": sp, "profit": profit, "margin": round(margin, 1)})
    property_pnl.sort(key=lambda x: x["profit"], reverse=True)

    # ---- Property inventory (per-house cost breakdown for ALL houses, not
    # period-filtered) — powers the "Inventario por casa" table on the Overview.
    property_inventory = []
    try:
        all_props = (sb.table("properties")
                     .select("id, property_code, address, status, purchase_price, "
                             "renovation_cost, move_cost, commission, sale_price")
                     .order("property_code").execute()).data or []
        for p in all_props:
            compra = float(p.get("purchase_price") or 0)
            reno = float(p.get("renovation_cost") or 0)
            movida = float(p.get("move_cost") or 0)
            comision = float(p.get("commission") or 0)
            venta = float(p.get("sale_price") or 0)
            invertido = round(compra + reno + movida + comision, 2)
            property_inventory.append({
                "property_id": p["id"],
                "code": p.get("property_code") or "—",
                "address": p.get("address") or "—",
                "status": p.get("status") or "—",
                "compra": compra, "renovacion": reno, "movida": movida,
                "comision": comision, "invertido": invertido,
                "venta": venta,
                "ganancia": round(venta - invertido, 2) if venta > 0 else 0,
            })
    except Exception as e:
        logger.warning(f"[dashboard] property_inventory failed: {e}")

    # ---- Cash flow (12 months) ----
    cash_flow = []
    for i in range(12):
        m = now.month - i
        y = now.year
        while m < 1:
            m += 12
            y -= 1
        ym = f"{y:04d}-{m:02d}"
        # Cash flow = actual money in/out of bank accounts. Count only the bank
        # leg of each transaction (bank_account_id set) so two-legged entries
        # aren't double-counted, and exclude balance-sheet movements (opening
        # balances, transfers between own accounts) that aren't operating cash flow.
        mi = 0.0
        me = 0.0
        for t in transactions:
            if (t.get("transaction_date", "")[:7] == ym and t.get("bank_account_id")
                    and t.get("entity_type") not in ("opening_balance", "bank_transfer")):
                if t["is_income"]:
                    mi += float(t["amount"])
                else:
                    me += float(t["amount"])
        cash_flow.append({"month": ym, "label": f"{m:02d}/{y}", "income": mi, "expense": me, "net": mi - me})
    cash_flow.reverse()

    # ---- Bank balances (derived from the ledger, see PR 3) ----
    # Stop trusting bank_accounts.current_balance — it's a stored mirror that
    # only the ledger writer touches. The source of truth is the sum of
    # accounting_transactions per bank.
    bank_accounts = []
    try:
        from api.services.ledger import get_all_bank_balances
        bank_accounts = (sb.table("bank_accounts").select("*").eq("is_active", True).execute()).data or []
        derived = get_all_bank_balances(db=sb)
        for b in bank_accounts:
            d = derived.get(b["id"], 0.0)
            b["derived_balance"] = d
            b["current_balance"] = d
    except Exception:
        pass

    # ---- Recent transactions ----
    recent_data = []
    try:
        recent_data = (sb.table("accounting_transactions").select("*")
                       .order("transaction_date", desc=True).order("created_at", desc=True)
                       .limit(20).execute()).data or []
    except Exception:
        pass

    # ---- AR/AP summary ----
    ar_total = 0
    ap_total = 0
    ar_overdue = 0
    ap_overdue = 0
    try:
        invoices_result = sb.table("accounting_invoices") \
            .select("direction, total_amount, amount_paid, balance_due, status, due_date") \
            .in_("status", ["draft", "sent", "partial", "overdue"]) \
            .execute()
        for inv in (invoices_result.data or []):
            bal = float(inv.get("balance_due") or 0)
            if inv["direction"] == "receivable":
                ar_total += bal
                if inv.get("due_date") and inv["due_date"] < now.isoformat():
                    ar_overdue += bal
            else:
                ap_total += bal
                if inv.get("due_date") and inv["due_date"] < now.isoformat():
                    ap_overdue += bal
    except Exception:
        pass

    return {
        "period": {"type": period, "start_date": start_str, "end_date": end_str,
                   "year": target_year, "month": target_month},
        "summary": {
            "total_income": total_income,
            "total_expenses": total_expenses,
            "net_profit": net_profit,
            "margin_percent": round((net_profit / total_income * 100) if total_income > 0 else 0, 1),
            "sales_by_type": sales_by_type,
            "total_purchases": total_purchases,
            "total_renovations": total_renovations,
            "total_commissions": total_commissions,
            "manual_income": manual_income,
            "manual_expense": manual_expense,
            "accounts_receivable": ar_total,
            "accounts_receivable_overdue": ar_overdue,
            "accounts_payable": ap_total,
            "accounts_payable_overdue": ap_overdue,
            "total_bank_balance": sum(b.get("current_balance", 0) for b in bank_accounts),
        },
        "cash_flow": cash_flow,
        "bank_accounts": bank_accounts,
        "yard_breakdown": list(yard_breakdown.values()),
        "property_pnl": property_pnl[:20],
        "property_inventory": property_inventory,
        "recent_transactions": recent_data,
        "totals": {
            "properties_count": len(properties),
            "sales_count": len(sales),
            "renovations_count": len(renovations),
            "transactions_count": len(transactions),
        },
    }


# ============================================================================
# TRANSACTIONS CRUD
# ============================================================================

@router.get("/transactions")
async def list_transactions(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=10, le=200),
    transaction_type: Optional[str] = None,
    account_id: Optional[str] = None,
    bank_account_id: Optional[str] = None,
    yard_id: Optional[str] = None,
    property_id: Optional[str] = None,
    is_income: Optional[bool] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    search: Optional[str] = None,
    status: Optional[str] = None,
):
    q = sb.table("accounting_transactions") \
        .select("*, accounting_accounts(code, name, account_type, category), bank_accounts(name, bank_name), properties(property_code, address)") \
        .order("transaction_date", desc=True) \
        .order("created_at", desc=True)
    if transaction_type:
        q = q.eq("transaction_type", transaction_type)
    if account_id:
        q = q.eq("account_id", account_id)
    if bank_account_id:
        q = q.eq("bank_account_id", bank_account_id)
    if yard_id:
        q = q.eq("yard_id", yard_id)
    if property_id:
        q = q.eq("property_id", property_id)
    if is_income is not None:
        q = q.eq("is_income", is_income)
    if start_date:
        q = q.gte("transaction_date", start_date)
    if end_date:
        q = q.lte("transaction_date", end_date)
    if status:
        q = q.eq("status", status)
    if search:
        q = q.or_(f"description.ilike.%{search}%,counterparty_name.ilike.%{search}%,payment_reference.ilike.%{search}%")

    offset = (page - 1) * per_page
    q = q.range(offset, offset + per_page - 1)
    result = q.execute()

    count_q = sb.table("accounting_transactions").select("id", count="exact")
    if transaction_type:
        count_q = count_q.eq("transaction_type", transaction_type)
    if is_income is not None:
        count_q = count_q.eq("is_income", is_income)
    if status:
        count_q = count_q.eq("status", status)
    count_result = count_q.execute()
    total = count_result.count if hasattr(count_result, 'count') and count_result.count else len(result.data or [])

    return {"transactions": result.data or [], "pagination": {"page": page, "per_page": per_page, "total": total}}


@router.post("/transactions")
async def create_transaction(data: TransactionCreate):
    txn_number = _generate_transaction_number()
    account_id = data.account_id

    # Per-property job-costing: when the operator creates a manual
    # transaction tied to a property AND the transaction is a capitalized
    # cost type (purchase / renovation / movida), prefer the per-property
    # inventory sub-account (Compra/Renovación/Movida <CODE>) over the
    # generic category lookup below. Same behavior as the ledger-driven
    # path in api/services/ledger.py.
    sub_label_by_type = {
        "purchase_house": "Compra",
        "renovation": "Renovación",
        "moving_transport": "Movida",
        "commission": "Comisión",
    }
    # When the routing kicks in, we also need to fix the sign on the row:
    # these are asset-side sub-accounts and an operator paying for a
    # purchase/reno/etc is DEBITING the asset (the inventory bucket
    # grows). In this codebase's convention, an asset growth is stored
    # as is_income=True (so _signed_balance returns +amt). The manual
    # transaction modal sends is_income=False because the operator
    # thinks "this is money going out" — but once we route to the asset
    # sub-account, the sign has to flip.
    routed_to_inventory_subaccount = False
    if not account_id and data.property_id and data.transaction_type in sub_label_by_type:
        try:
            prop = sb.table("properties").select("property_code").eq("id", data.property_id).limit(1).execute()
            code = (prop.data[0] or {}).get("property_code") if prop.data else None
            if code:
                target = f"{sub_label_by_type[data.transaction_type]} {code}"
                acc = sb.table("accounting_accounts").select("id").eq("code", target).limit(1).execute()
                if acc.data:
                    account_id = acc.data[0]["id"]
                    routed_to_inventory_subaccount = True
        except Exception as e:
            logger.warning(f"[transactions] per-property routing failed: {e}")

    if not account_id:
        type_to_cat = {
            "sale_cash": "ventas_contado", "sale_rto_capital": "ventas_capital",
            "deposit_received": "depositos", "other_income": "otros_ingresos",
            "purchase_house": "compras_casas", "renovation": "renovaciones",
            "moving_transport": "transporte", "commission": "comisiones",
            "operating_expense": "operativos", "other_expense": "otros_gastos",
        }
        cat = type_to_cat.get(data.transaction_type)
        if cat:
            account_id = _get_account_by_category(cat)

    # Flip is_income to TRUE for routed inventory sub-account entries —
    # asset debits store is_income=True in this codebase so
    # _signed_balance returns +amt (the asset grows). Without this the
    # routed row would shrink the bucket instead of capitalizing into it.
    effective_is_income = True if routed_to_inventory_subaccount else data.is_income

    insert_data = {
        "transaction_number": txn_number, "transaction_date": data.transaction_date,
        "transaction_type": data.transaction_type, "amount": data.amount,
        "is_income": effective_is_income, "account_id": account_id,
        "bank_account_id": data.bank_account_id, "entity_type": data.entity_type,
        "entity_id": data.entity_id, "yard_id": data.yard_id,
        "property_id": data.property_id, "payment_method": data.payment_method,
        "payment_reference": data.payment_reference, "counterparty_name": data.counterparty_name,
        "counterparty_type": data.counterparty_type, "description": data.description,
        "notes": data.notes, "status": "confirmed",
    }
    insert_data = {k: v for k, v in insert_data.items() if v is not None}
    result = sb.table("accounting_transactions").insert(insert_data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Error creating transaction")

    pnl_txn = result.data[0]
    pnl_txn_id = pnl_txn["id"]
    _log_audit("accounting_transactions", pnl_txn_id, "create",
               description=f"Created {txn_number}: ${data.amount}")

    # Double-entry: if a bank_account_id is provided, create the bank-side counterpart
    if data.bank_account_id:
        # Look up the accounting_account_id linked to this bank account
        ba = sb.table("bank_accounts").select("accounting_account_id").eq("id", data.bank_account_id).execute()
        bank_accounting_id = ba.data[0].get("accounting_account_id") if ba.data else None
        if bank_accounting_id:
            bank_data = {
                "transaction_number": _generate_transaction_number(),
                "transaction_date": data.transaction_date,
                "transaction_type": data.transaction_type,
                "amount": data.amount,
                "is_income": data.is_income,  # deposits increase bank, withdrawals decrease
                "account_id": bank_accounting_id,
                "bank_account_id": data.bank_account_id,
                "linked_transaction_id": pnl_txn_id,
                "counterparty_name": data.counterparty_name,
                "description": data.description,
                "notes": f"Contrapartida bancaria de {txn_number}",
                "status": "confirmed",
            }
            bank_data = {k: v for k, v in bank_data.items() if v is not None}
            bank_result = sb.table("accounting_transactions").insert(bank_data).execute()
            if bank_result.data:
                # Link back
                sb.table("accounting_transactions").update(
                    {"linked_transaction_id": bank_result.data[0]["id"]}
                ).eq("id", pnl_txn_id).execute()

    return pnl_txn


@router.patch("/transactions/{transaction_id}")
async def update_transaction(transaction_id: str, data: TransactionUpdate):
    # Get old values for audit
    old = sb.table("accounting_transactions").select("*").eq("id", transaction_id).execute()
    old_data = old.data[0] if old.data else {}

    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = sb.table("accounting_transactions").update(update_data).eq("id", transaction_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Audit
    changes = {}
    for k, v in update_data.items():
        if old_data.get(k) != v:
            changes[k] = {"old": old_data.get(k), "new": v}
    if changes:
        _log_audit("accounting_transactions", transaction_id, "update", changes=changes)

    return result.data[0]


@router.post("/transactions/{transaction_id}/split")
async def split_transaction(transaction_id: str, data: dict):
    """Split a transaction into multiple parts. Sum of parts must equal original amount."""
    parts = data.get("parts")
    if not parts or not isinstance(parts, list) or len(parts) < 2:
        raise HTTPException(status_code=400, detail="Must provide at least 2 parts")

    parent = sb.table("accounting_transactions").select("*").eq("id", transaction_id).execute()
    if not parent.data:
        raise HTTPException(status_code=404, detail="Transaction not found")
    p = parent.data[0]

    parent_amount = float(p["amount"])
    parts_total = sum(abs(float(pt["amount"])) for pt in parts)
    if abs(parts_total - abs(parent_amount)) > 0.01:
        raise HTTPException(status_code=400, detail=f"Parts total ({parts_total:.2f}) != transaction ({abs(parent_amount):.2f})")

    # Void original P&L transaction
    sb.table("accounting_transactions").update({"status": "voided"}).eq("id", transaction_id).execute()
    # Also void linked bank-side transaction (double-entry pair)
    if p.get("linked_transaction_id"):
        sb.table("accounting_transactions").update({"status": "voided"}).eq("id", p["linked_transaction_id"]).execute()
    _log_audit("accounting_transactions", transaction_id, "split", description=f"Split into {len(parts)} parts")

    # Look up bank accounting account for double-entry on children
    bank_accounting_id = None
    if p.get("bank_account_id"):
        ba = sb.table("bank_accounts").select("accounting_account_id").eq("id", p["bank_account_id"]).execute()
        if ba.data and ba.data[0].get("accounting_account_id"):
            bank_accounting_id = ba.data[0]["accounting_account_id"]

    created = []
    for pt in parts:
        child = {
            "transaction_number": _generate_transaction_number(),
            "transaction_date": p["transaction_date"],
            "transaction_type": p["transaction_type"],
            "amount": float(pt["amount"]),
            "is_income": p["is_income"],
            "account_id": pt.get("account_id") or p.get("account_id"),
            "description": pt.get("description", p.get("description", ""))[:500],
            "counterparty_name": p.get("counterparty_name"),
            "bank_account_id": p.get("bank_account_id"),
            "property_id": pt.get("property_id") or p.get("property_id"),
            "entity_type": p.get("entity_type"),
            "entity_id": p.get("entity_id"),
            "payment_method": p.get("payment_method"),
            "status": "confirmed",
        }
        child = {k: v for k, v in child.items() if v is not None}
        try:
            r = sb.table("accounting_transactions").insert(child).execute()
            if r.data:
                pnl_id = r.data[0]["id"]
                created.append(r.data[0])
                # Double-entry: create bank-side counterpart
                if bank_accounting_id:
                    bank_child = {
                        "transaction_number": _generate_transaction_number(),
                        "transaction_date": p["transaction_date"],
                        "transaction_type": p["transaction_type"],
                        "amount": float(pt["amount"]),
                        "is_income": p["is_income"],
                        "account_id": bank_accounting_id,
                        "linked_transaction_id": pnl_id,
                        "description": pt.get("description", p.get("description", ""))[:500],
                        "bank_account_id": p.get("bank_account_id"),
                        "notes": f"Contrapartida bancaria (split)",
                        "status": "confirmed",
                    }
                    bank_r = sb.table("accounting_transactions").insert(bank_child).execute()
                    if bank_r.data:
                        sb.table("accounting_transactions").update(
                            {"linked_transaction_id": bank_r.data[0]["id"]}
                        ).eq("id", pnl_id).execute()
        except Exception as e:
            logger.error(f"[accounting] Split child error: {e}")

    return {"ok": True, "message": f"Split into {len(created)} parts", "children": created}


@router.delete("/transactions/{transaction_id}")
async def void_transaction(transaction_id: str):
    result = sb.table("accounting_transactions").update({"status": "voided"}).eq("id", transaction_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Transaction not found")
    _log_audit("accounting_transactions", transaction_id, "void", description="Transaction voided")
    return {"message": "Transaction voided", "id": transaction_id}


# ============================================================================
# ACCOUNTS
# ============================================================================

class AccountCreate(BaseModel):
    code: str
    name: str
    account_type: str
    category: str = "general"
    parent_account_id: Optional[str] = None
    is_header: bool = False
    description: Optional[str] = None


class AccountUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    account_type: Optional[str] = None
    category: Optional[str] = None
    parent_account_id: Optional[str] = None
    is_header: Optional[bool] = None
    description: Optional[str] = None
    current_balance: Optional[float] = None


@router.get("/accounts")
async def list_accounts():
    return {"accounts": _fetch_all_accounts()}


@router.get("/accounts/tree")
async def get_accounts_tree(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
):
    """Get full hierarchical chart of accounts with computed balances from transactions."""
    accounts = _fetch_all_accounts()

    # Compute balances from transactions
    balances = {}
    try:
        filters = {}
        if start_date:
            filters["gte_date"] = start_date
        if end_date:
            filters["lte_date"] = end_date
        txns = _fetch_all_transactions(filters)
        _atype_map = {a["id"]: a.get("account_type", "") for a in accounts}
        for t in txns:
            aid = t.get("account_id")
            if aid:
                atype = _atype_map.get(aid, "")
                balances[aid] = balances.get(aid, 0) + _signed_balance(
                    float(t["amount"]), atype, t.get("is_income", False)
                )
    except Exception as e:
        logger.warning(f"[accounts/tree] Could not compute balances: {e}")

    # Also add manual current_balance from accounts table
    for acc in accounts:
        acc_id = acc["id"]
        manual_bal = float(acc.get("current_balance") or 0)
        if manual_bal != 0:
            balances[acc_id] = balances.get(acc_id, 0) + manual_bal

    # Build tree
    by_id = {}
    for a in accounts:
        by_id[a["id"]] = {
            "id": a["id"], "code": a["code"], "name": a["name"],
            "account_type": a["account_type"], "category": a.get("category", ""),
            "is_header": a.get("is_header", False), "is_system": a.get("is_system", False),
            "parent_account_id": a.get("parent_account_id"),
            "display_order": a.get("display_order", 0),
            "current_balance": float(a.get("current_balance") or 0),
            "balance": balances.get(a["id"], 0),
            "total": 0,
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

    def calc_total(node):
        if node["children"]:
            child_sum = sum(calc_total(c) for c in node["children"])
            node["total"] = child_sum + node["balance"]
        else:
            node["total"] = node["balance"]
        return node["total"]

    for r in roots:
        calc_total(r)

    return {"tree": roots, "flat": list(by_id.values())}


@router.post("/accounts")
async def create_account(data: AccountCreate):
    """Create a new account in the chart of accounts."""
    insert_data = {
        "code": data.code, "name": data.name, "account_type": data.account_type,
        "category": data.category, "is_header": data.is_header,
        "parent_account_id": data.parent_account_id, "description": data.description,
        "is_system": False, "is_active": True,
    }
    insert_data = {k: v for k, v in insert_data.items() if v is not None}
    try:
        result = sb.table("accounting_accounts").insert(insert_data).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Error creating account")
        _log_audit("accounting_accounts", result.data[0]["id"], "create",
                   description=f"Created account {data.code}: {data.name}")
        return result.data[0]
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/accounts/{account_id}")
async def update_account(account_id: str, data: AccountUpdate):
    """Update an existing account."""
    update_data = data.dict(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="Nothing to update")
    result = sb.table("accounting_accounts").update(update_data).eq("id", account_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Account not found")
    _log_audit("accounting_accounts", account_id, "update",
               description=f"Updated account: {result.data[0].get('name')}")
    return result.data[0]


@router.delete("/accounts/{account_id}")
async def deactivate_account(account_id: str):
    """Deactivate an account (soft delete). System accounts cannot be deleted."""
    acc = sb.table("accounting_accounts").select("is_system, name").eq("id", account_id).execute()
    if not acc.data:
        raise HTTPException(status_code=404, detail="Account not found")
    if acc.data[0].get("is_system"):
        raise HTTPException(status_code=400, detail="System accounts cannot be deleted")
    sb.table("accounting_accounts").update({"is_active": False}).eq("id", account_id).execute()
    _log_audit("accounting_accounts", account_id, "delete",
               description=f"Deactivated account: {acc.data[0].get('name')}")
    return {"message": "Account deactivated"}


@router.get("/accounts/summary")
async def get_accounts_summary(
    start_date: Optional[str] = None, end_date: Optional[str] = None,
    yard_id: Optional[str] = None,
):
    now = date.today()
    sd = start_date or date(now.year, now.month, 1).isoformat()
    ed = end_date or now.isoformat()

    accounts_data = _fetch_all_accounts()
    q = sb.table("accounting_transactions") \
        .select("account_id, amount, is_income") \
        .gte("transaction_date", sd).lte("transaction_date", ed) \
        .neq("status", "voided")
    if yard_id:
        q = q.eq("yard_id", yard_id)
    txn_result = q.execute()

    account_totals = {}
    for txn in (txn_result.data or []):
        aid = txn.get("account_id")
        if aid:
            if aid not in account_totals:
                account_totals[aid] = {"income": 0, "expense": 0}
            if txn["is_income"]:
                account_totals[aid]["income"] += float(txn["amount"])
            else:
                account_totals[aid]["expense"] += float(txn["amount"])

    summary = []
    for acc in accounts_data:
        totals = account_totals.get(acc["id"], {"income": 0, "expense": 0})
        summary.append({**acc, "total_income": totals["income"],
                        "total_expense": totals["expense"],
                        "balance": totals["income"] - totals["expense"]})
    return {"accounts": summary, "period": {"start": sd, "end": ed}}


# ============================================================================
# BANK ACCOUNTS
# ============================================================================

@router.get("/bank-accounts")
async def list_bank_accounts():
    """
    Returns the 6 active bank accounts with a QuickBooks-style derived
    balance (sum of ledger transactions for that bank). The stored
    `current_balance` column is no longer the source of truth — it is
    kept in the row for reference but `derived_balance` is what the UI
    should show. Also includes `latest_statement_ending` and
    `discrepancy` so the operator can spot drift at a glance.
    """
    from api.services.ledger import get_all_bank_balances

    result = sb.table("bank_accounts").select("*").eq("is_active", True).order("is_primary", desc=True).execute()
    banks = result.data or []
    derived = get_all_bank_balances(db=sb)

    # Pull each bank's most-recent statement ending_balance for the discrepancy field.
    latest_endings: dict[str, float] = {}
    if banks:
        bank_ids = [b["id"] for b in banks]
        try:
            stmts = (
                sb.table("bank_statements")
                .select("bank_account_id, ending_balance, statement_period_end")
                .in_("bank_account_id", bank_ids)
                .not_.is_("ending_balance", "null")
                .not_.is_("statement_period_end", "null")
                .order("statement_period_end", desc=True)
                .execute()
                .data or []
            )
            for s in stmts:
                bid = s["bank_account_id"]
                if bid not in latest_endings:
                    latest_endings[bid] = float(s["ending_balance"] or 0)
        except Exception:
            pass

    enriched = []
    for b in banks:
        bid = b["id"]
        d = derived.get(bid, 0.0)
        b = dict(b)
        b["derived_balance"] = d
        # Keep `current_balance` populated for legacy UI; mirror the derived value.
        b["current_balance"] = d
        latest = latest_endings.get(bid)
        b["latest_statement_ending"] = latest
        b["discrepancy"] = round((latest - d), 2) if latest is not None else None
        enriched.append(b)
    return {"bank_accounts": enriched}


@router.post("/transfers")
async def transfer_between_banks(data: dict):
    """Move money between two Maninos bank/cash accounts.

    Posts a single balanced double-entry pair via post_to_ledger:
      DEBIT  → destination bank (cash comes IN)
      CREDIT → source bank      (cash goes OUT)

    Net impact on Balance Sheet: $0 (asset shuffles between two asset
    accounts). Zero impact on P&L. Uses the same ledger plumbing as
    purchases / sales / commissions so reports stay consistent."""

    from_bank_id = data.get("from_bank_id")
    to_bank_id = data.get("to_bank_id")
    amount = data.get("amount")
    txn_date = data.get("date") or date.today().isoformat()
    description = (data.get("description") or "").strip()
    notes = (data.get("notes") or "").strip()

    if not from_bank_id or not to_bank_id:
        raise HTTPException(status_code=400, detail="Se requieren from_bank_id y to_bank_id")
    if from_bank_id == to_bank_id:
        raise HTTPException(status_code=400, detail="No puedes transferir a la misma cuenta")
    try:
        amount_f = float(amount or 0)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="amount inválido")
    if amount_f <= 0:
        raise HTTPException(status_code=400, detail="El monto debe ser mayor a 0")

    # Fetch labels for the description so reports show source/destination.
    banks_res = sb.table("bank_accounts").select("id, name").in_("id", [from_bank_id, to_bank_id]).execute()
    bank_map = {b["id"]: b.get("name") or "Cuenta" for b in (banks_res.data or [])}
    if from_bank_id not in bank_map or to_bank_id not in bank_map:
        raise HTTPException(status_code=404, detail="Una o ambas cuentas no existen")
    from_name = bank_map[from_bank_id]
    to_name = bank_map[to_bank_id]

    final_desc = description or f"Transferencia: {from_name} → {to_name}"

    try:
        from api.services.ledger import post_to_ledger
        debit_id, credit_id = post_to_ledger(
            event_type="bank_transfer",
            amount=amount_f,
            date=txn_date,
            bank_account_id_from=from_bank_id,
            bank_account_id_to=to_bank_id,
            description_override=final_desc,
            description_data={"concept": description or f"{from_name} → {to_name}"},
            counterparty_name=f"Transferencia interna",
            counterparty_type="internal",
            entity_type="bank_transfer",
            notes=notes or None,
            payment_method="bank_transfer",
            status="confirmed",
        )
        logger.info(
            f"[transfers] {from_name} → {to_name} ${amount_f:.2f} pair=({debit_id},{credit_id})"
        )
        return {
            "ok": True,
            "debit_transaction_id": debit_id,
            "credit_transaction_id": credit_id,
            "from_bank": from_name,
            "to_bank": to_name,
            "amount": amount_f,
            "date": txn_date,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"[transfers] failed: {e!r}")
        raise HTTPException(status_code=500, detail=f"Error al transferir: {e}")


@router.post("/bank-accounts")
async def create_bank_account(data: BankAccountCreate):
    insert_data = {k: v for k, v in data.model_dump().items() if v is not None}
    result = sb.table("bank_accounts").insert(insert_data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Error creating bank account")
    _log_audit("bank_accounts", result.data[0]["id"], "create", description=f"Created bank: {data.name}")
    return result.data[0]


@router.patch("/bank-accounts/{bank_id}")
async def update_bank_account(bank_id: str, data: dict):
    result = sb.table("bank_accounts").update(data).eq("id", bank_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Bank account not found")
    _log_audit("bank_accounts", bank_id, "update", changes=data)
    return result.data[0]


@router.delete("/bank-accounts/{bank_id}")
async def delete_bank_account(bank_id: str):
    """Soft-delete a bank account (set is_active = false)."""
    # Check if there are statements linked to this account
    stmts = sb.table("bank_statements").select("id", count="exact").eq("bank_account_id", bank_id).execute()
    stmt_count = stmts.count if hasattr(stmts, 'count') and stmts.count else len(stmts.data or [])

    # Also check by account_key (some statements use the key, not the id)
    acct = sb.table("bank_accounts").select("name").eq("id", bank_id).execute()
    if not acct.data:
        raise HTTPException(status_code=404, detail="Bank account not found")

    # Soft delete — mark as inactive
    result = sb.table("bank_accounts").update({"is_active": False}).eq("id", bank_id).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Error deleting bank account")

    _log_audit("bank_accounts", bank_id, "delete",
               description=f"Deactivated bank account: {acct.data[0]['name']}")

    return {"success": True, "message": f"Cuenta eliminada{f' ({stmt_count} estados de cuenta asociados)' if stmt_count > 0 else ''}"}


# ============================================================================
# RECURRING EXPENSES
# ============================================================================

@router.get("/recurring-expenses")
async def list_recurring_expenses():
    result = sb.table("recurring_expenses") \
        .select("*, accounting_accounts(code, name), bank_accounts(name)") \
        .eq("is_active", True).order("next_due_date").execute()
    return {"expenses": result.data or []}


@router.post("/recurring-expenses")
async def create_recurring_expense(data: RecurringExpenseCreate):
    insert_data = {k: v for k, v in data.model_dump().items() if v is not None}
    result = sb.table("recurring_expenses").insert(insert_data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Error creating recurring expense")
    return result.data[0]


@router.delete("/recurring-expenses/{expense_id}")
async def delete_recurring_expense(expense_id: str):
    result = sb.table("recurring_expenses").update({"is_active": False}).eq("id", expense_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Recurring expense not found")
    return {"message": "Recurring expense deactivated"}


# ============================================================================
# INVOICES (AR / AP)
# ============================================================================

@router.get("/invoices")
async def list_invoices(
    direction: Optional[str] = None,
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=10, le=200),
):
    q = sb.table("accounting_invoices") \
        .select("*") \
        .order("issue_date", desc=True)
    if direction:
        q = q.eq("direction", direction)
    if status:
        q = q.eq("status", status)
    offset = (page - 1) * per_page
    q = q.range(offset, offset + per_page - 1)
    result = q.execute()
    return {"invoices": result.data or []}


@router.post("/invoices")
async def create_invoice(data: InvoiceCreate):
    inv_number = _generate_invoice_number(data.direction)
    insert_data = {
        "invoice_number": inv_number,
        "direction": data.direction,
        "counterparty_name": data.counterparty_name,
        "counterparty_type": data.counterparty_type,
        "client_id": data.client_id,
        "property_id": data.property_id,
        "sale_id": data.sale_id,
        "yard_id": data.yard_id,
        "issue_date": data.issue_date or date.today().isoformat(),
        "due_date": data.due_date,
        "subtotal": data.subtotal,
        "tax_amount": data.tax_amount,
        "total_amount": data.total_amount or (data.subtotal + data.tax_amount),
        "amount_paid": 0,
        "description": data.description,
        "line_items": json.dumps(data.line_items or []),
        "notes": data.notes,
        "payment_terms": data.payment_terms,
        "status": "draft",
    }
    insert_data = {k: v for k, v in insert_data.items() if v is not None}
    result = sb.table("accounting_invoices").insert(insert_data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Error creating invoice")
    invoice_row = result.data[0]
    _log_audit("accounting_invoices", invoice_row["id"], "create",
               description=f"Created invoice {inv_number}")

    # Write the AR/AP ledger pair at ISSUANCE so unpaid invoices appear in
    # "Por Conciliar". (Today's accounting only wrote a row at payment time,
    # which is why facturas never showed up in the conciliation queue.)
    try:
        from api.services.ledger import post_to_ledger
        total = float(invoice_row.get("total_amount") or 0)
        if total > 0:
            if data.direction == "receivable":
                post_to_ledger(
                    event_type="invoice_issued_ar",
                    income_account_code=data.account_code or "House Sales",
                    amount=total,
                    date=invoice_row.get("issue_date") or date.today().isoformat(),
                    counterparty_name=data.counterparty_name,
                    counterparty_type=data.counterparty_type or "client",
                    entity_type="invoice",
                    entity_id=invoice_row["id"],
                    property_id=data.property_id,
                    yard_id=data.yard_id,
                    description_data={"invoice_number": inv_number},
                    notes=data.notes,
                    status="confirmed",
                )
            elif data.direction == "payable":
                post_to_ledger(
                    event_type="invoice_received_ap",
                    amount=total,
                    date=invoice_row.get("issue_date") or date.today().isoformat(),
                    counterparty_name=data.counterparty_name,
                    counterparty_type=data.counterparty_type or "vendor",
                    entity_type="invoice",
                    entity_id=invoice_row["id"],
                    property_id=data.property_id,
                    yard_id=data.yard_id,
                    description_data={"invoice_number": inv_number},
                    expense_account_code=data.account_code or data.expense_account_code or "Other Operating Expenses",
                    notes=data.notes,
                    status="confirmed",
                )
    except Exception as e:
        # Don't fail the invoice create if ledger posting fails — log loud.
        logger.warning(f"[accounting] Could not post AR/AP ledger pair for invoice {inv_number}: {e}")

    return invoice_row


@router.patch("/invoices/{invoice_id}")
async def update_invoice(invoice_id: str, data: dict):
    allowed = {"status", "due_date", "notes", "description", "payment_terms",
               "counterparty_name", "subtotal", "tax_amount", "total_amount", "line_items"}
    update = {k: v for k, v in data.items() if k in allowed}
    if "line_items" in update and isinstance(update["line_items"], list):
        update["line_items"] = json.dumps(update["line_items"])
    if not update:
        raise HTTPException(status_code=400, detail="No valid fields")
    result = sb.table("accounting_invoices").update(update).eq("id", invoice_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Invoice not found")
    _log_audit("accounting_invoices", invoice_id, "update", changes=update)
    return result.data[0]


@router.delete("/invoices/{invoice_id}")
async def delete_invoice(invoice_id: str):
    """Delete an invoice and everything linked to it: its ledger entries
    (issuance + payment legs, all tagged entity_type='invoice'), its payment
    records, and any statement_movements links. Powers the Facturas delete
    button so staff can remove invoices without leaving orphaned ledger rows."""
    inv = sb.table("accounting_invoices").select("*").eq("id", invoice_id).execute()
    if not inv.data:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    invoice = inv.data[0]

    # 1. All ledger rows tied to this invoice (issuance AR/AP pair + payment legs)
    legs = sb.table("accounting_transactions").select("id") \
        .eq("entity_type", "invoice").eq("entity_id", invoice_id).execute().data or []
    leg_ids = [r["id"] for r in legs]

    if leg_ids:
        # 2. Release FKs before deleting: statement reconciliation links + the
        #    self-referential linked_transaction_id between the two legs. Any
        #    bank-statement movement that was reconciled against one of these
        #    rows is returned to the unmatched queue (status -> 'pending'), so
        #    it doesn't linger as 'posted'/matched pointing to a deleted row.
        try:
            sb.table("statement_movements").update({"transaction_id": None, "status": "pending"}) \
                .in_("transaction_id", leg_ids).execute()
            sb.table("statement_movements").update({"matched_transaction_id": None, "status": "pending"}) \
                .in_("matched_transaction_id", leg_ids).execute()
        except Exception as e:
            logger.warning(f"[accounting] Could not clear statement_movements for invoice {invoice_id}: {e}")
        sb.table("accounting_transactions").update({"linked_transaction_id": None}) \
            .in_("id", leg_ids).execute()
        # 3. Delete the ledger rows
        sb.table("accounting_transactions").delete().in_("id", leg_ids).execute()

    # 4. Delete payment records
    try:
        sb.table("accounting_invoice_payments").delete().eq("invoice_id", invoice_id).execute()
    except Exception as e:
        logger.warning(f"[accounting] Could not delete payments for invoice {invoice_id}: {e}")

    # 5. Delete the invoice itself
    sb.table("accounting_invoices").delete().eq("id", invoice_id).execute()

    _log_audit("accounting_invoices", invoice_id, "delete",
               description=f"Deleted invoice {invoice.get('invoice_number')} (${invoice.get('total_amount')})")
    return {"message": "Factura eliminada",
            "invoice_number": invoice.get("invoice_number"),
            "deleted_ledger_rows": len(leg_ids)}


@router.post("/invoices/{invoice_id}/payments")
async def add_invoice_payment(invoice_id: str, data: InvoicePaymentCreate):
    # Get invoice
    inv = sb.table("accounting_invoices").select("*").eq("id", invoice_id).execute()
    if not inv.data:
        raise HTTPException(status_code=404, detail="Invoice not found")
    invoice = inv.data[0]

    # Create payment record
    payment_data = {
        "invoice_id": invoice_id,
        "payment_date": data.payment_date or date.today().isoformat(),
        "amount": data.amount,
        "payment_method": data.payment_method,
        "payment_reference": data.payment_reference,
        "notes": data.notes,
    }
    payment_data = {k: v for k, v in payment_data.items() if v is not None}
    pay_result = sb.table("accounting_invoice_payments").insert(payment_data).execute()

    # Update invoice amount_paid and status
    new_paid = float(invoice.get("amount_paid") or 0) + data.amount
    total = float(invoice.get("total_amount") or 0)
    new_status = "paid" if new_paid >= total else "partial"

    sb.table("accounting_invoices").update({
        "amount_paid": new_paid,
        "status": new_status,
    }).eq("id", invoice_id).execute()

    # Write the bank-side leg of the payment via the unified writer. This
    # clears AR (receivable) or AP (payable), and lands money in the named
    # bank. Requires bank_account_id — if missing we log loud and skip the
    # ledger write to avoid creating unlinked rows that pollute reconciliation.
    is_income = invoice["direction"] == "receivable"
    bank_txn_id = None
    if data.bank_account_id:
        try:
            from api.services.ledger import post_to_ledger
            event_type = "invoice_paid_in" if is_income else "invoice_paid_out"
            debit_id, credit_id = post_to_ledger(
                event_type=event_type,
                amount=float(data.amount),
                bank_account_id=data.bank_account_id,
                date=data.payment_date or date.today().isoformat(),
                counterparty_name=invoice.get("counterparty_name"),
                counterparty_type=invoice.get("counterparty_type"),
                entity_type="invoice",
                entity_id=invoice_id,
                property_id=invoice.get("property_id"),
                yard_id=invoice.get("yard_id"),
                description_data={"invoice_number": invoice.get("invoice_number", "")},
                payment_method=data.payment_method,
                payment_reference=data.payment_reference,
                notes=data.notes,
                status="confirmed",
            )
            # The bank leg id is what the invoice_payments row links to so
            # the reconciliation wizard can match against the right side.
            bank_txn_id = debit_id if is_income else credit_id
        except ValueError as e:
            logger.error(f"[accounting] Cannot post invoice payment ledger: {e}")
            raise HTTPException(status_code=400, detail=f"No se puede registrar en contabilidad: {e}")
        except Exception as e:
            logger.warning(f"[accounting] Invoice payment ledger post failed: {e}")
    else:
        logger.warning(
            f"[accounting] Invoice payment for {invoice_id} registered WITHOUT "
            f"bank_account_id — no ledger pair written. Update the UI."
        )

    # Link the invoice_payment row to the ledger row (bank leg) for traceability.
    if bank_txn_id and pay_result.data:
        sb.table("accounting_invoice_payments").update({
            "transaction_id": bank_txn_id
        }).eq("id", pay_result.data[0]["id"]).execute()

    _log_audit("accounting_invoices", invoice_id, "update",
               description=f"Payment of ${data.amount} on invoice {invoice.get('invoice_number')}")

    return {"payment": pay_result.data[0] if pay_result.data else None,
            "invoice_status": new_status, "new_amount_paid": new_paid}


@router.get("/invoices/{invoice_id}")
async def get_invoice_detail(invoice_id: str):
    inv = sb.table("accounting_invoices").select("*").eq("id", invoice_id).execute()
    if not inv.data:
        raise HTTPException(status_code=404, detail="Invoice not found")
    payments = sb.table("accounting_invoice_payments") \
        .select("*").eq("invoice_id", invoice_id).order("payment_date").execute()
    return {"invoice": inv.data[0], "payments": payments.data or []}


@router.get("/invoices/aging/summary")
async def get_aging_summary(direction: str = Query("receivable")):
    """Aging report: current, 1-30, 31-60, 61-90, 90+ days."""
    today = now = date.today()
    invoices = sb.table("accounting_invoices") \
        .select("id, invoice_number, counterparty_name, total_amount, amount_paid, balance_due, due_date, status, direction") \
        .eq("direction", direction) \
        .in_("status", ["sent", "partial", "overdue"]) \
        .execute()

    buckets = {"current": 0, "1_30": 0, "31_60": 0, "61_90": 0, "over_90": 0}
    items = {"current": [], "1_30": [], "31_60": [], "61_90": [], "over_90": []}

    for inv in (invoices.data or []):
        bal = float(inv.get("balance_due") or 0)
        if bal <= 0:
            continue
        due = inv.get("due_date")
        if not due:
            buckets["current"] += bal
            items["current"].append(inv)
            continue
        days = (today - date.fromisoformat(due)).days
        if days <= 0:
            bucket = "current"
        elif days <= 30:
            bucket = "1_30"
        elif days <= 60:
            bucket = "31_60"
        elif days <= 90:
            bucket = "61_90"
        else:
            bucket = "over_90"
        buckets[bucket] += bal
        items[bucket].append(inv)

    total = sum(buckets.values())
    return {"direction": direction, "total": total, "buckets": buckets, "items": items}


# ============================================================================
# BUDGET
# ============================================================================

@router.get("/budgets")
async def list_budgets(
    year: Optional[int] = None,
    yard_id: Optional[str] = None,
):
    target_year = year or date.today().year
    q = sb.table("accounting_budgets") \
        .select("*, accounting_accounts(code, name, account_type, category)") \
        .eq("period_year", target_year) \
        .order("period_month")
    if yard_id:
        q = q.eq("yard_id", yard_id)
    result = q.execute()
    return {"budgets": result.data or [], "year": target_year}


@router.post("/budgets")
async def create_or_update_budget(data: BudgetCreate):
    # Upsert by unique constraint
    existing = sb.table("accounting_budgets") \
        .select("id") \
        .eq("account_id", data.account_id) \
        .eq("period_month", data.period_month) \
        .eq("period_year", data.period_year)
    if data.yard_id:
        existing = existing.eq("yard_id", data.yard_id)
    else:
        existing = existing.is_("yard_id", "null")
    existing_result = existing.execute()

    insert_data = data.model_dump()
    insert_data = {k: v for k, v in insert_data.items() if v is not None}

    if existing_result.data:
        result = sb.table("accounting_budgets") \
            .update(insert_data) \
            .eq("id", existing_result.data[0]["id"]) \
            .execute()
    else:
        result = sb.table("accounting_budgets").insert(insert_data).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Error saving budget")
    return result.data[0]


@router.get("/budgets/vs-actual")
async def budget_vs_actual(
    year: Optional[int] = None,
    yard_id: Optional[str] = None,
):
    """Compare budgeted amounts vs actual spending per account per month.

    When a budget is set on a parent/header account, the actual amount
    aggregates transactions from that account AND all its children.
    """
    target_year = year or date.today().year

    # Get budgets
    bq = sb.table("accounting_budgets") \
        .select("*, accounting_accounts(code, name, account_type, category)") \
        .eq("period_year", target_year)
    if yard_id:
        bq = bq.eq("yard_id", yard_id)
    budgets = (bq.execute()).data or []

    # Get all accounts to build parent→children map
    all_accounts = sb.table("accounting_accounts") \
        .select("id, parent_account_id") \
        .eq("is_active", True) \
        .execute().data or []

    children_map: dict[str, list[str]] = {}  # parent_id → [child_ids]
    for acc in all_accounts:
        pid = acc.get("parent_account_id")
        if pid:
            children_map.setdefault(pid, []).append(acc["id"])

    def _get_all_descendants(account_id: str) -> list[str]:
        """Get all descendant account IDs (recursive)."""
        result = [account_id]
        for child_id in children_map.get(account_id, []):
            result.extend(_get_all_descendants(child_id))
        return result

    # Get actual transactions for the year
    start = f"{target_year}-01-01"
    end = f"{target_year}-12-31"
    tq = sb.table("accounting_transactions") \
        .select("account_id, amount, is_income, transaction_date") \
        .gte("transaction_date", start) \
        .lte("transaction_date", end) \
        .neq("status", "voided")
    if yard_id:
        tq = tq.eq("yard_id", yard_id)
    txns = (tq.execute()).data or []

    # Sum actuals by account+month
    actuals = {}  # "account_id:month" -> amount
    for t in txns:
        aid = t.get("account_id")
        if not aid:
            continue
        m = int(t["transaction_date"][5:7])
        key = f"{aid}:{m}"
        actuals[key] = actuals.get(key, 0) + float(t["amount"])

    # Build comparison — aggregate children for parent budgets
    comparison = []
    for b in budgets:
        aid = b["account_id"]
        m = b["period_month"]

        # Sum actuals from this account + all descendants
        all_ids = _get_all_descendants(aid)
        actual = sum(actuals.get(f"{a}:{m}", 0) for a in all_ids)

        budgeted = float(b.get("budgeted_amount") or 0)
        variance = budgeted - actual
        comparison.append({
            "account_id": aid,
            "account": b.get("accounting_accounts"),
            "month": m,
            "budgeted": budgeted,
            "actual": actual,
            "variance": variance,
            "variance_pct": round((variance / budgeted * 100) if budgeted > 0 else 0, 1),
        })

    return {"year": target_year, "comparison": comparison}


# ============================================================================
# BANK RECONCILIATION
# ============================================================================

@router.post("/reconciliation/mark")
async def mark_reconciled(transaction_ids: List[str]):
    """Mark transactions as reconciled."""
    now_str = datetime.utcnow().isoformat()
    reconciled = 0
    for tid in transaction_ids:
        try:
            sb.table("accounting_transactions").update({
                "status": "reconciled",
                "reconciled_at": now_str,
            }).eq("id", tid).execute()
            _log_audit("accounting_transactions", tid, "reconcile")
            reconciled += 1
        except Exception as e:
            logger.warning(f"[reconcile] Error for {tid}: {e}")
    return {"reconciled": reconciled}


@router.post("/reconciliation/reset-all")
async def reset_all_reconciliation():
    """Reset all reconciled transactions back to confirmed (for demo / testing)."""
    try:
        result = sb.table("accounting_transactions").update({
            "status": "confirmed",
            "reconciled_at": None,
        }).eq("status", "reconciled").execute()
        count = len(result.data) if result.data else 0
        logger.info(f"[reconcile] Reset {count} reconciled transactions back to confirmed")
        return {"ok": True, "reset_count": count}
    except Exception as e:
        logger.error(f"[reconcile] Reset error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/reconciliation/unreconciled")
async def get_unreconciled(
    bank_account_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
):
    """Get unreconciled transactions for a bank account."""
    q = sb.table("accounting_transactions") \
        .select("*") \
        .in_("status", ["confirmed", "pending"]) \
        .order("transaction_date", desc=True)
    if bank_account_id:
        q = q.eq("bank_account_id", bank_account_id)
    if start_date:
        q = q.gte("transaction_date", start_date)
    if end_date:
        q = q.lte("transaction_date", end_date)
    result = q.execute()
    return {"transactions": result.data or []}


# ============================================================================
# FINANCIAL STATEMENTS
# ============================================================================

# P&L location columns — derived from the property_code prefix (the yards table
# is unused). H→Houston, B→Conroe, DFW→Dallas; anything else → Not specified.
PL_LOCATIONS = ["Conroe", "DFW", "Houston", "Not specified"]


def _location_for_code(code: str) -> str:
    c = (code or "").strip().upper()
    if c.startswith("DFW"):
        return "DFW"
    if c.startswith("H"):
        return "Houston"
    if c.startswith("B"):
        return "Conroe"
    return "Not specified"


def _tree_totals(accounts, balances, root_codes):
    """Return {account_id: rolled-up total} for one balances dict (pure
    transaction balances, no current_balance), summing children into parents
    under the given root codes. Used to compute per-location column totals."""
    by_id = {
        a["id"]: {
            "id": a["id"], "parent": a.get("parent_account_id"),
            "bal": float(balances.get(a["id"], 0) or 0),
            "children": [], "is_root": a["code"] in root_codes,
        }
        for a in accounts
    }
    for a in accounts:
        pid = a.get("parent_account_id")
        if pid and pid in by_id:
            by_id[pid]["children"].append(by_id[a["id"]])
    totals: dict = {}

    def calc(n):
        t = n["bal"] + sum(calc(c) for c in n["children"])
        totals[n["id"]] = t
        return t

    for n in by_id.values():
        if n["is_root"]:
            calc(n)
    return totals


def _build_report_tree(accounts, balances, root_codes):
    """Build hierarchical report tree from accounts and transaction balances."""
    by_id = {}
    by_code = {}
    for a in accounts:
        node = {
            "id": a["id"], "code": a["code"], "name": a["name"],
            "account_type": a["account_type"], "is_header": a.get("is_header", False),
            "parent_account_id": a.get("parent_account_id"),
            "display_order": a.get("display_order", 0),
            "balance": balances.get(a["id"], 0) + float(a.get("current_balance") or 0),
            "total": 0, "children": [],
        }
        by_id[a["id"]] = node
        by_code[a["code"]] = node

    # Build parent→children
    roots = []
    for a in accounts:
        node = by_id[a["id"]]
        pid = a.get("parent_account_id")
        if pid and pid in by_id:
            by_id[pid]["children"].append(node)
        elif a["code"] in root_codes:
            roots.append(node)

    def calc_total(node):
        if node["children"]:
            child_sum = sum(calc_total(c) for c in node["children"])
            node["total"] = child_sum + node["balance"]
        else:
            node["total"] = node["balance"]
        return node["total"]

    for r in roots:
        calc_total(r)

    return roots


@router.get("/reports/income-statement")
async def get_income_statement(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    yard_id: Optional[str] = None,
):
    """QuickBooks-style hierarchical Income Statement (Estado de Resultados / P&L)."""
    now = date.today()
    sd = start_date or date(now.year, 1, 1).isoformat()
    ed = end_date or now.isoformat()

    accounts = _fetch_all_accounts()

    # Compute balances from transactions in period — P&L accounts only
    pl_account_ids = set(a["id"] for a in accounts if a.get("account_type") in PL_TYPES)
    acct_type_by_id = {a["id"]: a.get("account_type", "") for a in accounts}
    # property_id -> location (via property_code prefix; the yards table is unused)
    try:
        props = sb.table("properties").select("id, property_code").execute().data or []
    except Exception:
        props = []
    loc_by_prop = {p["id"]: _location_for_code(p.get("property_code")) for p in props}

    balances = {}
    bal_by_loc = {loc: {} for loc in PL_LOCATIONS}
    try:
        filters = {"gte_date": sd, "lte_date": ed}
        if yard_id:
            filters["yard_id"] = yard_id
        txns = _fetch_all_transactions(filters)
        for t in txns:
            aid = t.get("account_id")
            if aid and aid in pl_account_ids:
                atype = acct_type_by_id.get(aid, "")
                amt = _signed_balance(float(t["amount"]), atype, t.get("is_income", False))
                balances[aid] = balances.get(aid, 0) + amt
                loc = loc_by_prop.get(t.get("property_id")) or "Not specified"
                bal_by_loc[loc][aid] = bal_by_loc[loc].get(aid, 0) + amt
    except Exception as e:
        logger.warning(f"[income-statement] Error fetching transactions: {e}")

    # Build trees for each P&L section
    income_tree = _build_report_tree(accounts, balances, ["PL_INCOME"])
    other_income_tree = _build_report_tree(accounts, balances, ["PL_OTHER_INCOME"])
    cogs_tree = _build_report_tree(accounts, balances, ["PL_COGS"])
    expenses_tree = _build_report_tree(accounts, balances, ["PL_EXPENSES"])
    other_expenses_tree = _build_report_tree(accounts, balances, ["PL_OTHER_EXPENSES"])

    # Per-location column totals, attached to every tree node as `by_location`.
    _all_pl_roots = ["PL_INCOME", "PL_OTHER_INCOME", "PL_COGS", "PL_EXPENSES", "PL_OTHER_EXPENSES"]
    _loc_totals = {loc: _tree_totals(accounts, bal_by_loc[loc], _all_pl_roots) for loc in PL_LOCATIONS}

    def _attach_loc(nodes):
        for n in nodes:
            n["by_location"] = {loc: round(_loc_totals[loc].get(n["id"], 0.0), 2) for loc in PL_LOCATIONS}
            _attach_loc(n["children"])

    for _tree in (income_tree, other_income_tree, cogs_tree, expenses_tree, other_expenses_tree):
        _attach_loc(_tree)

    def _sec_loc(tree):
        return {loc: round(sum(n["by_location"][loc] for n in tree), 2) for loc in PL_LOCATIONS}

    income_loc = _sec_loc(income_tree)
    other_income_loc = _sec_loc(other_income_tree)
    cogs_loc = _sec_loc(cogs_tree)
    expenses_loc = _sec_loc(expenses_tree)
    other_expenses_loc = _sec_loc(other_expenses_tree)
    gross_profit_loc = {loc: round(income_loc[loc] + other_income_loc[loc] - cogs_loc[loc], 2) for loc in PL_LOCATIONS}
    net_income_loc = {loc: round(gross_profit_loc[loc] - expenses_loc[loc] - other_expenses_loc[loc], 2) for loc in PL_LOCATIONS}

    total_income = sum(n["total"] for n in income_tree)
    total_other_income = sum(n["total"] for n in other_income_tree)
    total_cogs = sum(n["total"] for n in cogs_tree)
    gross_profit = total_income + total_other_income - total_cogs
    total_expenses = sum(n["total"] for n in expenses_tree)
    total_other_expenses = sum(n["total"] for n in other_expenses_tree)
    net_operating_income = gross_profit - total_expenses
    net_other_income = -total_other_expenses
    net_income = net_operating_income + net_other_income

    return {
        "format": "quickbooks",
        "period": {"start": sd, "end": ed},
        "locations": PL_LOCATIONS,
        "sections": {
            "income": income_tree,
            "total_income": total_income,
            "other_income": other_income_tree,
            "total_other_income": total_other_income,
            "cost_of_goods_sold": cogs_tree,
            "total_cogs": total_cogs,
            "gross_profit": gross_profit,
            "expenses": expenses_tree,
            "total_expenses": total_expenses,
            "net_operating_income": net_operating_income,
            "other_expenses": other_expenses_tree,
            "total_other_expenses": total_other_expenses,
            "net_other_income": net_other_income,
            "net_income": net_income,
            "by_location": {
                "total_income": income_loc,
                "total_other_income": other_income_loc,
                "total_cogs": cogs_loc,
                "gross_profit": gross_profit_loc,
                "total_expenses": expenses_loc,
                "total_other_expenses": other_expenses_loc,
                "net_income": net_income_loc,
            },
        },
    }


@router.get("/reports/balance-sheet")
async def get_balance_sheet(as_of_date: Optional[str] = None, yard_id: Optional[str] = None):
    """QuickBooks-style hierarchical Balance Sheet (Balance General)."""
    as_of = as_of_date or date.today().isoformat()

    accounts = _fetch_all_accounts()

    # Compute cumulative balances — separate BS and P&L accounts to avoid double-counting
    acct_type_by_id = {a["id"]: a.get("account_type", "") for a in accounts}
    bs_account_ids = set(a["id"] for a in accounts if a.get("account_type") in BS_TYPES)

    balances = {}
    net_income = 0
    try:
        filters = {"lte_date": as_of}
        if yard_id:
            filters["yard_id"] = yard_id
        txns = _fetch_all_transactions(filters)
        for t in txns:
            aid = t.get("account_id")
            if not aid:
                continue
            amt = float(t["amount"])
            atype = acct_type_by_id.get(aid, "")
            is_inc = t.get("is_income", False)
            # BS accounts: add to balances
            if aid in bs_account_ids:
                balances[aid] = balances.get(aid, 0) + _signed_balance(amt, atype, is_inc)
            # P&L accounts: contribute to net income
            net_income += _net_income_sign(amt, atype, is_inc)
    except Exception as e:
        logger.warning(f"[balance-sheet] Error fetching transactions: {e}")

    # Build trees
    assets_tree = _build_report_tree(accounts, balances, ["BS_ASSETS"])
    liabilities_tree = _build_report_tree(accounts, balances, ["BS_LIABILITIES"])
    equity_tree = _build_report_tree(accounts, balances, ["BS_EQUITY"])

    total_assets = sum(n["total"] for n in assets_tree)
    total_liabilities = sum(n["total"] for n in liabilities_tree)
    raw_total_equity = sum(n["total"] for n in equity_tree)

    # Equity sign normalization. Migrations 090 / 092 seeded opening
    # balances with is_income=FALSE on the equity contra side, which
    # _signed_balance interprets as a DEBIT to equity (decrease). The
    # rest of the ledger writes equity credits as is_income=TRUE
    # (post_to_ledger), so equity computed off the raw rows can land
    # with the sign flipped depending on the data mix.
    #
    # The accounting equation A = L + E + NI must always hold for a
    # balanced double-entry ledger, so we derive the displayed equity
    # total from the OTHER three quantities — that's the single source
    # of truth and guarantees the Balance Sheet balances on screen no
    # matter what historical convention each row was written with.
    # If the raw equity total has the wrong sign (its absolute value
    # matches the expected E = A - L - NI but with opposite sign), we
    # flip the sign on every equity tree node so the detail rows match
    # the total — otherwise leave the nodes as-is.
    expected_equity = total_assets - total_liabilities - net_income
    if abs(raw_total_equity + expected_equity) < 0.01 and abs(raw_total_equity - expected_equity) > 0.01:
        # raw is exactly the negative of expected → legacy-sign data;
        # flip the tree so the displayed numbers match the equation.
        def _flip(nodes):
            for n in nodes:
                n["balance"] = -n.get("balance", 0)
                n["total"] = -n.get("total", 0)
                if n.get("children"):
                    _flip(n["children"])
        _flip(equity_tree)
    total_equity = expected_equity

    return {
        "format": "quickbooks",
        "as_of_date": as_of,
        "sections": {
            "assets": assets_tree,
            "total_assets": total_assets,
            "liabilities": liabilities_tree,
            "total_liabilities": total_liabilities,
            "equity": equity_tree,
            "total_equity": total_equity,
            "net_income": net_income,
            "total_liabilities_and_equity": total_liabilities + total_equity + net_income,
        },
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
    """Save an immutable snapshot of the current Balance Sheet, P&L, or Cash Flow for Homes."""
    try:
        if data.report_type == "balance_sheet":
            report = await get_balance_sheet()
            record = {
                "portal": "homes",
                "report_type": "balance_sheet",
                "name": data.name,
                "as_of_date": report.get("as_of_date", date.today().isoformat()),
                "report_data": json.dumps(report),
                "total_assets": report.get("sections", {}).get("total_assets", 0),
                "total_liabilities": report.get("sections", {}).get("total_liabilities", 0),
                "total_equity": report.get("sections", {}).get("total_equity", 0),
                "net_income": report.get("sections", {}).get("net_income", 0),
                "notes": data.notes,
                "saved_by": data.saved_by,
            }
            period_start = None
            period_end = report.get("as_of_date", date.today().isoformat())
        elif data.report_type == "profit_loss":
            report = await get_income_statement()
            sections = report.get("sections", {})
            record = {
                "portal": "homes",
                "report_type": "profit_loss",
                "name": data.name,
                "period_start": report.get("period", {}).get("start"),
                "period_end": report.get("period", {}).get("end"),
                "report_data": json.dumps(report),
                "total_income": sum(n.get("total", 0) for n in sections.get("income", [])),
                "total_expenses": sections.get("total_expenses", 0),
                "net_income": sections.get("net_income", 0),
                "notes": data.notes,
                "saved_by": data.saved_by,
            }
            period_start = report.get("period", {}).get("start")
            period_end = report.get("period", {}).get("end")
        elif data.report_type == "cash_flow":
            report = await get_cash_flow_statement()
            record = {
                "portal": "homes",
                "report_type": "cash_flow",
                "name": data.name,
                "period_start": report.get("period", {}).get("start"),
                "period_end": report.get("period", {}).get("end"),
                "report_data": json.dumps(report),
                "net_income": report.get("net_change_in_cash", 0),
                "notes": data.notes,
                "saved_by": data.saved_by,
            }
            period_start = report.get("period", {}).get("start")
            period_end = report.get("period", {}).get("end")
        else:
            raise HTTPException(status_code=400, detail="report_type must be 'balance_sheet', 'profit_loss', or 'cash_flow'")

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
                portal="homes",
            )
            timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            filename = f"{data.report_type}_{timestamp}.pdf"
            pdf_url = _upload_to_storage(pdf_bytes, "financial-reports/homes", filename)
        except Exception as pdf_err:
            logger.warning(f"[save-financial-statement-homes] PDF generation failed: {pdf_err}")

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

        # Auto-reset: clear bank_statement transactions after saving snapshot
        try:
            # Clear ALL FK references on statement_movements
            sb.table("statement_movements") \
                .update({"transaction_id": None, "matched_transaction_id": None}) \
                .neq("status", "pending") \
                .execute()
            sb.table("statement_movements") \
                .update({"status": "confirmed"}) \
                .eq("status", "posted") \
                .execute()
            sb.table("bank_statements") \
                .update({"posted_movements": 0, "status": "review"}) \
                .in_("status", ["completed", "partial"]) \
                .execute()
            # Clear linked_transaction_id self-references before deleting (avoid FK constraint)
            sb.table("accounting_transactions") \
                .update({"linked_transaction_id": None}) \
                .eq("source", "bank_statement") \
                .execute()
            # Delete bank_statement transactions
            sb.table("accounting_transactions") \
                .delete() \
                .eq("source", "bank_statement") \
                .execute()
            logger.info(f"[save-financial-statement-homes] Auto-reset: cleared bank_statement transactions after saving report")
        except Exception as reset_err:
            logger.warning(f"[save-financial-statement-homes] Auto-reset failed: {reset_err}")

        return {
            "ok": True,
            "statement": result.data[0],
            "pdf_url": pdf_url,
            "message": f"Estado financiero '{data.name}' guardado. Cifras reseteadas automáticamente."
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[save-financial-statement-homes] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/reports/saved")
async def list_saved_statements(report_type: Optional[str] = None):
    """List all saved financial statements for Homes."""
    try:
        q = sb.table("saved_financial_statements") \
            .select("id, portal, report_type, name, as_of_date, period_start, period_end, "
                    "total_assets, total_liabilities, total_equity, total_income, total_expenses, "
                    "net_income, notes, saved_by, status, created_at, is_locked, pdf_url, locked_at") \
            .eq("portal", "homes") \
            .neq("status", "archived") \
            .order("created_at", desc=True)

        if report_type:
            q = q.eq("report_type", report_type)

        result = q.execute()
        return {"ok": True, "statements": result.data or []}

    except Exception as e:
        logger.error(f"[list-saved-statements-homes] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/reports/saved/{statement_id}")
async def get_saved_statement(statement_id: str):
    """Get a specific saved financial statement with full report data."""
    try:
        result = sb.table("saved_financial_statements") \
            .select("*") \
            .eq("id", statement_id) \
            .eq("portal", "homes") \
            .execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Saved statement not found")

        stmt = result.data[0]
        if isinstance(stmt.get("report_data"), str):
            stmt["report_data"] = json.loads(stmt["report_data"])

        return {"ok": True, "statement": stmt}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[get-saved-statement-homes] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/reports/saved/{statement_id}")
async def delete_saved_statement(statement_id: str):
    """Archive (soft-delete) a saved financial statement."""
    try:
        result = sb.table("saved_financial_statements") \
            .update({"status": "archived"}) \
            .eq("id", statement_id) \
            .eq("portal", "homes") \
            .execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Saved statement not found")

        return {"ok": True, "message": "Estado financiero archivado"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[delete-saved-statement-homes] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/reports/saved/{statement_id}/pdf")
async def get_saved_report_pdf(statement_id: str):
    """Get the PDF URL for a saved financial report."""
    try:
        result = sb.table("saved_financial_statements") \
            .select("id, pdf_url, is_locked, name") \
            .eq("id", statement_id) \
            .eq("portal", "homes") \
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
        logger.error(f"[get-saved-report-pdf-homes] Error: {e}")
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


# ── CSV Export Helpers ──────────────────────────────────────────────────────
def _flatten_tree_to_csv_rows(nodes, depth=0):
    """Recursively flatten a report tree into CSV rows with indented names."""
    rows = []
    for node in nodes:
        indent = "  " * depth
        rows.append({
            "code": node["code"],
            "account": f"{indent}{node['name']}",
            "balance": round(node["total"], 2) if node.get("is_header") or node.get("children") else round(node["balance"], 2),
            "total": round(node["total"], 2),
        })
        if node.get("children"):
            rows.extend(_flatten_tree_to_csv_rows(node["children"], depth + 1))
            # After children, add a "Total" row for this header
            rows.append({
                "code": "",
                "account": f"{indent}Total {node['name']}",
                "balance": "",
                "total": round(node["total"], 2),
            })
    return rows


@router.get("/reports/income-statement/export-csv")
async def export_income_statement_csv(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    yard_id: Optional[str] = None,
):
    """Export the hierarchical Income Statement (P&L) as a CSV file."""
    report = await get_income_statement(start_date=start_date, end_date=end_date, yard_id=yard_id)
    sections = report["sections"]
    period = report["period"]

    output = io.StringIO()
    writer = csv.writer(output)

    # Header
    writer.writerow(["MANINOS HOMES LLC"])
    writer.writerow(["Profit & Loss (Estado de Resultados)"])
    writer.writerow([f"{period['start']} through {period['end']}"])
    writer.writerow([])

    # Income section
    writer.writerow(["Code", "Account", "Amount"])
    writer.writerow(["", "INCOME", ""])
    for row in _flatten_tree_to_csv_rows(sections.get("income", [])):
        writer.writerow([row["code"], row["account"], row["total"]])
    writer.writerow(["", "Total Income", round(sum(n["total"] for n in sections.get("income", [])), 2)])
    writer.writerow([])

    # COGS section
    writer.writerow(["", "COST OF GOODS SOLD", ""])
    for row in _flatten_tree_to_csv_rows(sections.get("cost_of_goods_sold", [])):
        writer.writerow([row["code"], row["account"], row["total"]])
    writer.writerow(["", "Total COGS", round(sum(n["total"] for n in sections.get("cost_of_goods_sold", [])), 2)])
    writer.writerow([])

    # Gross Profit
    writer.writerow(["", "GROSS PROFIT", round(sections.get("gross_profit", 0), 2)])
    writer.writerow([])

    # Expenses section
    writer.writerow(["", "EXPENSES", ""])
    for row in _flatten_tree_to_csv_rows(sections.get("expenses", [])):
        writer.writerow([row["code"], row["account"], row["total"]])
    writer.writerow(["", "Total Expenses", round(sections.get("total_expenses", 0), 2)])
    writer.writerow([])

    # Net Operating Income
    writer.writerow(["", "NET OPERATING INCOME", round(sections.get("net_operating_income", 0), 2)])
    writer.writerow([])

    # Other Expenses
    writer.writerow(["", "OTHER EXPENSES", ""])
    for row in _flatten_tree_to_csv_rows(sections.get("other_expenses", [])):
        writer.writerow([row["code"], row["account"], row["total"]])
    writer.writerow(["", "Total Other Expenses", round(sections.get("total_other_expenses", 0), 2)])
    writer.writerow([])

    # Net Income
    writer.writerow(["", "NET INCOME", round(sections.get("net_income", 0), 2)])

    output.seek(0)
    filename = f"PnL_{period['start']}_to_{period['end']}.csv"
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/reports/balance-sheet/export-csv")
async def export_balance_sheet_csv(
    as_of_date: Optional[str] = None,
    yard_id: Optional[str] = None,
):
    """Export the hierarchical Balance Sheet as a CSV file."""
    report = await get_balance_sheet(as_of_date=as_of_date, yard_id=yard_id)
    sections = report["sections"]
    as_of = report["as_of_date"]

    output = io.StringIO()
    writer = csv.writer(output)

    # Header
    writer.writerow(["MANINOS HOMES LLC"])
    writer.writerow(["Balance Sheet (Balance General)"])
    writer.writerow([f"As of {as_of}"])
    writer.writerow([])

    writer.writerow(["Code", "Account", "Amount"])

    # Assets
    writer.writerow(["", "ASSETS", ""])
    for row in _flatten_tree_to_csv_rows(sections.get("assets", [])):
        writer.writerow([row["code"], row["account"], row["total"]])
    writer.writerow(["", "TOTAL ASSETS", round(sections.get("total_assets", 0), 2)])
    writer.writerow([])

    # Liabilities
    writer.writerow(["", "LIABILITIES", ""])
    for row in _flatten_tree_to_csv_rows(sections.get("liabilities", [])):
        writer.writerow([row["code"], row["account"], row["total"]])
    writer.writerow(["", "TOTAL LIABILITIES", round(sections.get("total_liabilities", 0), 2)])
    writer.writerow([])

    # Equity
    writer.writerow(["", "EQUITY", ""])
    for row in _flatten_tree_to_csv_rows(sections.get("equity", [])):
        writer.writerow([row["code"], row["account"], row["total"]])
    writer.writerow(["", "Net Income", round(sections.get("net_income", 0), 2)])
    writer.writerow(["", "TOTAL EQUITY", round(sections.get("total_equity", 0) + sections.get("net_income", 0), 2)])
    writer.writerow([])

    # Total Liabilities & Equity
    writer.writerow(["", "TOTAL LIABILITIES & EQUITY", round(sections.get("total_liabilities_and_equity", 0), 2)])

    output.seek(0)
    filename = f"Balance_Sheet_{as_of}.csv"
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/reports/cash-flow")
async def get_cash_flow_statement(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
):
    """Cash Flow Statement (Estado de Flujo de Efectivo)."""
    now = date.today()
    sd = start_date or date(now.year, 1, 1).isoformat()
    ed = end_date or now.isoformat()

    # Use bank-side transactions (type Bank) for cash flow — they represent actual cash movements
    accounts = _fetch_all_accounts()
    acct_type_by_id = {a["id"]: a.get("account_type", "") for a in accounts}
    bank_acct_ids = set(a["id"] for a in accounts if a.get("account_type") in ("Bank", "asset"))

    txns = _fetch_all_transactions({"gte_date": sd, "lte_date": ed})

    # Separate P&L transactions by type for categorization
    operating_in = 0.0
    operating_out = 0.0
    investing = 0.0
    financing = 0.0

    for t in txns:
        aid = t.get("account_id")
        if not aid or aid in bank_acct_ids:
            continue  # Skip bank-side entries (we use P&L side for categorization)
        amt = float(t["amount"])
        atype = acct_type_by_id.get(aid, "")
        if atype not in PL_TYPES:
            continue
        txn_type = t.get("transaction_type", "")
        is_inc = t.get("is_income", False)

        if txn_type == "bank_transfer":
            financing += amt if is_inc else -amt
        elif txn_type == "purchase_house":
            investing -= amt  # house purchases are investing outflows
        else:
            # Operating activities — use correct sign
            contribution = _net_income_sign(amt, atype, is_inc)
            if contribution > 0:
                operating_in += abs(contribution)
            else:
                operating_out += abs(contribution)

    operating_net = operating_in - operating_out
    net_change = operating_net + investing + financing

    return {
        "period": {"start": sd, "end": ed},
        "operating_activities": {"inflows": round(operating_in, 2), "outflows": round(operating_out, 2), "net": round(operating_net, 2)},
        "investing_activities": {"property_purchases": round(abs(investing), 2), "net": round(investing, 2)},
        "financing_activities": {"net": round(financing, 2)},
        "net_change_in_cash": round(net_change, 2),
    }


@router.get("/reports/pnl")
async def get_profit_and_loss(
    start_date: Optional[str] = None, end_date: Optional[str] = None,
    yard_id: Optional[str] = None,
):
    now = date.today()
    sd = start_date or date(now.year, now.month, 1).isoformat()
    ed = end_date or now.isoformat()

    q = sb.table("accounting_transactions") \
        .select("*, accounting_accounts(code, name, account_type, category)") \
        .gte("transaction_date", sd).lte("transaction_date", ed) \
        .neq("status", "voided")
    if yard_id:
        q = q.eq("yard_id", yard_id)
    transactions = (q.execute()).data or []

    income_categories = {}
    expense_categories = {}
    for txn in transactions:
        acc = txn.get("accounting_accounts") or {}
        atype = acc.get("account_type", "")
        # Only P&L accounts contribute to the income statement. This excludes
        # the balance-sheet leg of every double-entry pair (bank, inventory,
        # A/R, A/P, equity), so legs are neither double-counted nor miscategorized.
        if atype not in PL_TYPES:
            continue
        cat = acc.get("category") or txn.get("transaction_type", "other")
        acc_name = acc.get("name", cat)
        signed = _signed_balance(float(txn["amount"]), atype, txn.get("is_income", False))
        target = income_categories if atype in INCOME_TYPES else expense_categories
        if cat not in target:
            target[cat] = {"name": acc_name, "total": 0, "count": 0}
        target[cat]["total"] += signed
        target[cat]["count"] += 1

    total_income = sum(c["total"] for c in income_categories.values())
    total_expenses = sum(c["total"] for c in expense_categories.values())

    return {
        "period": {"start": sd, "end": ed},
        "income": {"categories": income_categories, "total": total_income},
        "expenses": {"categories": expense_categories, "total": total_expenses},
        "net_profit": total_income - total_expenses,
        "margin_percent": round((total_income - total_expenses) / total_income * 100, 1) if total_income > 0 else 0,
    }


@router.get("/reports/property/{property_id}")
async def get_property_pnl(property_id: str):
    prop = sb.table("properties").select("*").eq("id", property_id).execute()
    if not prop.data:
        raise HTTPException(status_code=404, detail="Property not found")
    property_data = prop.data[0]

    txn = sb.table("accounting_transactions") \
        .select("*").eq("property_id", property_id) \
        .neq("status", "voided").order("transaction_date").execute()
    transactions = txn.data or []

    # Count only the bank (cash) leg so the inventory/asset leg of each
    # double-entry pair isn't double-counted into the wrong bucket.
    income = sum(float(t["amount"]) for t in transactions if t["is_income"] and t.get("bank_account_id"))
    expenses = sum(float(t["amount"]) for t in transactions if not t["is_income"] and t.get("bank_account_id"))

    return {
        "property": {
            "id": property_data["id"], "address": property_data.get("address"),
            "city": property_data.get("city"), "status": property_data.get("status"),
            "purchase_price": float(property_data.get("purchase_price") or 0),
            "sale_price": float(property_data.get("sale_price") or 0),
        },
        "transactions": transactions,
        "summary": {"total_income": income, "total_expenses": expenses, "net_profit": income - expenses},
    }


# ============================================================================
# AUDIT LOG
# ============================================================================

@router.get("/audit-log")
async def list_audit_log(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=10, le=200),
    table_name: Optional[str] = None,
):
    q = sb.table("accounting_audit_log") \
        .select("*") \
        .order("created_at", desc=True)
    if table_name:
        q = q.eq("table_name", table_name)
    offset = (page - 1) * per_page
    q = q.range(offset, offset + per_page - 1)
    result = q.execute()
    return {"entries": result.data or []}


# ============================================================================
# EXPORT CSV
# ============================================================================

@router.get("/export/transactions")
async def export_transactions_csv(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    is_income: Optional[bool] = None,
):
    """Export transactions as CSV."""
    now = date.today()
    sd = start_date or date(now.year, 1, 1).isoformat()
    ed = end_date or now.isoformat()

    q = sb.table("accounting_transactions") \
        .select("transaction_number, transaction_date, transaction_type, amount, is_income, description, counterparty_name, payment_method, payment_reference, status") \
        .gte("transaction_date", sd).lte("transaction_date", ed) \
        .neq("status", "voided") \
        .order("transaction_date", desc=True)
    if is_income is not None:
        q = q.eq("is_income", is_income)
    txns = (q.execute()).data or []

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Número", "Fecha", "Tipo", "Monto", "Ingreso/Gasto", "Descripción",
                     "Contraparte", "Método Pago", "Referencia", "Estado"])
    for t in txns:
        writer.writerow([
            t.get("transaction_number", ""),
            t.get("transaction_date", ""),
            t.get("transaction_type", ""),
            t.get("amount", 0),
            "Ingreso" if t.get("is_income") else "Gasto",
            t.get("description", ""),
            t.get("counterparty_name", ""),
            t.get("payment_method", ""),
            t.get("payment_reference", ""),
            t.get("status", ""),
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=transacciones_{sd}_{ed}.csv"},
    )


@router.get("/export/invoices")
async def export_invoices_csv(direction: Optional[str] = None):
    q = sb.table("accounting_invoices") \
        .select("invoice_number, direction, issue_date, due_date, counterparty_name, total_amount, amount_paid, balance_due, status") \
        .order("issue_date", desc=True)
    if direction:
        q = q.eq("direction", direction)
    invoices = (q.execute()).data or []

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Número", "Tipo", "Fecha Emisión", "Vencimiento", "Contraparte",
                     "Total", "Pagado", "Pendiente", "Estado"])
    for inv in invoices:
        writer.writerow([
            inv.get("invoice_number", ""),
            "Cobrar" if inv.get("direction") == "receivable" else "Pagar",
            inv.get("issue_date", ""),
            inv.get("due_date", ""),
            inv.get("counterparty_name", ""),
            inv.get("total_amount", 0),
            inv.get("amount_paid", 0),
            inv.get("balance_due", 0),
            inv.get("status", ""),
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=facturas.csv"},
    )


# ============================================================================
# SYNC FROM EXISTING DATA
# ============================================================================

@router.post("/accounts/ensure-property/{property_id}")
async def ensure_property_accounts(property_id: str):
    """Auto-create sub-accounts under 11000 Inventory for a property.
    Creates: HOME #N <serial> header + sub-accounts for Sencilla/Double Wide, 
    Comisión de Venta, Movida, Remodelación, Título, Impuestos."""
    
    # Fetch property
    prop = sb.table("properties").select("id, address, serial_number, property_type").eq("id", property_id).execute()
    if not prop.data:
        raise HTTPException(status_code=404, detail="Property not found")
    p = prop.data[0]
    
    # Get inventory parent account
    inv_acct = sb.table("accounting_accounts").select("id").eq("code", "11000").execute()
    if not inv_acct.data:
        return {"message": "11000 Inventory account not found, skipping"}
    inv_id = inv_acct.data[0]["id"]
    
    # Generate home number
    serial = p.get("serial_number", "")[:12] if p.get("serial_number") else ""
    addr_short = (p.get("address") or "")[:20].strip()
    home_label = f"HOME {addr_short}" if addr_short else f"HOME {property_id[:8]}"
    if serial:
        home_label += f" {serial}"
    
    # Check if already exists
    home_code = f"HOME_{property_id[:8]}"
    existing = sb.table("accounting_accounts").select("id").eq("code", home_code).execute()
    if existing.data:
        return {"message": "Property accounts already exist", "header_id": existing.data[0]["id"]}
    
    ptype = (p.get("property_type") or "sencilla").lower()
    type_label = "Double Wide" if "double" in ptype else "Sencilla"
    
    # Create header
    header = sb.table("accounting_accounts").insert({
        "code": home_code, "name": home_label, "account_type": "asset",
        "category": "inventory", "is_header": True, "is_system": False,
        "parent_account_id": inv_id, "display_order": 1135,
    }).execute()
    
    if not header.data:
        raise HTTPException(status_code=500, detail="Could not create property header account")
    header_id = header.data[0]["id"]
    
    # Create sub-accounts
    subs = [
        (f"{home_code}_TIPO", f"{home_label} {type_label}", "inventory"),
        (f"{home_code}_COMV", f"Comisión de Venta", "commission"),
        (f"{home_code}_MOVIDA", f"Movida", "transport"),
        (f"{home_code}_REMOD", f"Remodelación", "renovation"),
        (f"{home_code}_TITULO", f"Título", "title"),
        (f"{home_code}_IMPUESTOS", f"Impuestos", "tax"),
    ]
    created = 0
    for code, name, cat in subs:
        try:
            sb.table("accounting_accounts").insert({
                "code": code, "name": name, "account_type": "asset",
                "category": cat, "is_header": False, "is_system": False,
                "parent_account_id": header_id, "display_order": 1136,
            }).execute()
            created += 1
        except Exception:
            pass
    
    return {"message": f"Created {created + 1} accounts for property", "header_id": header_id}


@router.post("/sync")
async def sync_from_existing_data():
    created = 0
    skipped = 0

    existing = sb.table("accounting_transactions") \
        .select("entity_type, entity_id").neq("status", "voided").execute()
    existing_keys = set()
    for t in (existing.data or []):
        if t.get("entity_type") and t.get("entity_id"):
            existing_keys.add(f"{t['entity_type']}:{t['entity_id']}")

    account_cache = {}

    def get_account(cat):
        if cat not in account_cache:
            account_cache[cat] = _get_account_by_category(cat)
        return account_cache[cat]

    # 1. Purchases + auto-create per-property inventory sub-accounts
    props = (sb.table("properties")
             .select("id, address, city, purchase_price, status, yard_id, created_at")
             .not_.is_("purchase_price", "null").execute()).data or []
    for prop in props:
        # Auto-create inventory sub-accounts for this property (idempotent)
        try:
            await ensure_property_accounts(prop["id"])
        except Exception:
            pass  # Non-critical: skip if it fails

        key = f"property:{prop['id']}"
        if key in existing_keys:
            skipped += 1
            continue
        pp = float(prop.get("purchase_price") or 0)
        if pp <= 0:
            continue
        txn_data = {
            "transaction_number": _generate_transaction_number(),
            "transaction_date": prop.get("created_at", "")[:10] or date.today().isoformat(),
            "transaction_type": "purchase_house", "amount": pp, "is_income": False,
            "account_id": get_account("compras_casas"),
            "entity_type": "property", "entity_id": prop["id"], "property_id": prop["id"],
            "yard_id": prop.get("yard_id"), "counterparty_name": "Vendedor",
            "counterparty_type": "seller",
            "description": f"Compra: {prop.get('address', '?')}", "status": "confirmed",
        }
        txn_data = {k: v for k, v in txn_data.items() if v is not None}
        try:
            sb.table("accounting_transactions").insert(txn_data).execute()
            created += 1
        except Exception:
            skipped += 1

    # 2. Sales
    sales = (sb.table("sales")
             .select("id, property_id, client_id, sale_price, sale_type, status, payment_method, created_at, commission_amount, clients(name), properties(address, yard_id)")
             .in_("status", ["paid", "completed", "rto_approved", "rto_active"]).execute()).data or []
    for sale in sales:
        key = f"sale:{sale['id']}"
        if key in existing_keys:
            skipped += 1
            continue
        sp = float(sale.get("sale_price") or 0)
        if sp <= 0:
            continue
        client_name = (sale.get("clients") or {}).get("name", "Cliente")
        prop_data = sale.get("properties") or {}
        is_rto = sale.get("sale_type") == "rto"
        txn_data = {
            "transaction_number": _generate_transaction_number(),
            "transaction_date": sale.get("created_at", "")[:10] or date.today().isoformat(),
            "transaction_type": "sale_rto_capital" if is_rto else "sale_cash",
            "amount": sp, "is_income": True,
            "account_id": get_account("ventas_capital" if is_rto else "ventas_contado"),
            "entity_type": "sale", "entity_id": sale["id"],
            "property_id": sale.get("property_id"), "yard_id": prop_data.get("yard_id"),
            "payment_method": sale.get("payment_method"),
            "counterparty_name": "Capital LLC" if is_rto else client_name,
            "counterparty_type": "capital" if is_rto else "client",
            "description": f"{'Venta RTO (Capital)' if is_rto else 'Venta Contado'}: {prop_data.get('address', '?')} → {client_name}",
            "status": "confirmed",
        }
        txn_data = {k: v for k, v in txn_data.items() if v is not None}
        try:
            sb.table("accounting_transactions").insert(txn_data).execute()
            created += 1
        except Exception:
            skipped += 1

        comm = float(sale.get("commission_amount") or 0)
        if comm > 0 and f"commission:{sale['id']}" not in existing_keys:
            comm_data = {
                "transaction_number": _generate_transaction_number(),
                "transaction_date": sale.get("created_at", "")[:10] or date.today().isoformat(),
                "transaction_type": "commission", "amount": comm, "is_income": False,
                "account_id": get_account("comisiones"),
                "entity_type": "commission", "entity_id": sale["id"],
                "property_id": sale.get("property_id"), "yard_id": prop_data.get("yard_id"),
                "counterparty_type": "employee",
                "description": f"Comisión venta: {prop_data.get('address', '?')}",
                "status": "confirmed",
            }
            comm_data = {k: v for k, v in comm_data.items() if v is not None}
            try:
                sb.table("accounting_transactions").insert(comm_data).execute()
                created += 1
            except Exception:
                pass

    # 3. Renovations
    renos = (sb.table("renovations")
             .select("id, property_id, total_cost, created_at, properties(address, yard_id)")
             .execute()).data or []
    for reno in renos:
        key = f"renovation:{reno['id']}"
        if key in existing_keys:
            skipped += 1
            continue
        cost = float(reno.get("total_cost") or 0)
        if cost <= 0:
            continue
        prop_data = reno.get("properties") or {}
        txn_data = {
            "transaction_number": _generate_transaction_number(),
            "transaction_date": reno.get("created_at", "")[:10] or date.today().isoformat(),
            "transaction_type": "renovation", "amount": cost, "is_income": False,
            "account_id": get_account("renovaciones"),
            "entity_type": "renovation", "entity_id": reno["id"],
            "property_id": reno.get("property_id"), "yard_id": prop_data.get("yard_id"),
            "counterparty_name": "Contratista", "counterparty_type": "contractor",
            "description": f"Renovación: {prop_data.get('address', '?')}",
            "status": "confirmed",
        }
        txn_data = {k: v for k, v in txn_data.items() if v is not None}
        try:
            sb.table("accounting_transactions").insert(txn_data).execute()
            created += 1
        except Exception:
            skipped += 1

    return {"created": created, "skipped": skipped, "message": f"Sync complete: {created} new transactions"}


@router.post("/backfill-accounts")
async def backfill_transaction_accounts():
    """Assign account_id to existing Homes transactions that don't have one.

    Uses the category-based mapping to look up the correct account.
    Useful after adding new accounts to the chart.
    """
    _clear_homes_account_cache()

    try:
        orphans = sb.table("accounting_transactions") \
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
            account_id = _resolve_homes_account_id(txn["transaction_type"])
            if account_id:
                sb.table("accounting_transactions") \
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
            msg += f" — {skipped} sin asignar (tipos faltantes: {missing})"

        return {
            "ok": True,
            "updated": updated,
            "skipped": skipped,
            "skipped_types": skipped_types,
            "message": msg,
        }

    except Exception as e:
        logger.error(f"Error backfilling Homes transaction accounts: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/account-mapping")
async def get_homes_account_mapping():
    """Return the current transaction_type → account mapping with resolution status."""
    _clear_homes_account_cache()

    mapping = []
    for txn_type, cat in HOMES_TYPE_TO_CATEGORY.items():
        account_id = _resolve_homes_account_id(txn_type)
        is_income = txn_type in HOMES_INCOME_MAP
        mapping.append({
            "transaction_type": txn_type,
            "category": cat,
            "account_id": account_id,
            "resolved": account_id is not None,
            "flow": "income" if is_income else "expense",
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


@router.post("/accounts/reset-balances")
async def reset_homes_account_balances(request: Request):
    """Reset financial statements by deleting bank_statement transactions and resetting movements.

    Body: { "scope": "all" | "profit_loss" | "balance_sheet" }
    """
    try:
        body = await request.json()
        scope = body.get("scope", "all")

        # 1. Reset current_balance on accounts
        accounts = _fetch_all_accounts()

        # QuickBooks + legacy account type sets
        PL_TYPES = {"Income", "Other Income", "Cost of Goods Sold", "Expenses", "Other Expense",
                     "income", "expense", "cogs"}
        BS_TYPES = {"Bank", "Accounts receivable (A/R)", "Other Current Assets", "Fixed Assets",
                     "Other Assets", "Accounts payable (A/P)", "Other Current Liabilities",
                     "Long Term Liabilities", "Equity", "asset", "liability", "equity"}

        reset_count = 0
        for acc in accounts:
            bal = float(acc.get("current_balance") or 0)
            if bal == 0:
                continue
            atype = acc.get("account_type", "")
            if scope == "profit_loss" and atype not in PL_TYPES:
                continue
            if scope == "balance_sheet" and atype not in BS_TYPES:
                continue
            sb.table("accounting_accounts") \
                .update({"current_balance": 0}) \
                .eq("id", acc["id"]) \
                .execute()
            reset_count += 1

        # Void transactions so financial statements show $0.
        # IMPORTANT: We do NOT touch statement_movements or bank_statements —
        # uploaded statements, reconciliation matches, and classification data survive.
        # This allows the user to re-reconcile and re-publish without re-uploading.
        deleted_count = 0
        if scope == "all":
            for _ in range(20):
                remaining = sb.table("accounting_transactions") \
                    .select("id", count="exact") \
                    .neq("status", "voided").execute()
                if not remaining.data:
                    break
                voided = sb.table("accounting_transactions") \
                    .update({"status": "voided", "amount": 0}) \
                    .neq("status", "voided") \
                    .execute()
                batch = len(voided.data or [])
                deleted_count += batch
                if batch == 0:
                    break
        else:
            scope_types = {
                "profit_loss": PL_TYPES,
                "balance_sheet": BS_TYPES,
            }
            target_types = scope_types.get(scope, set())
            scope_account_ids = [a["id"] for a in accounts if a.get("account_type") in target_types]
            if scope_account_ids:
                for _ in range(20):
                    voided = sb.table("accounting_transactions") \
                        .update({"status": "voided", "amount": 0}) \
                        .in_("account_id", scope_account_ids) \
                        .neq("status", "voided") \
                        .execute()
                    batch = len(voided.data or [])
                    deleted_count += batch
                    if batch == 0:
                        break

        # Reset posted movements back so they can be re-published
        sb.table("statement_movements") \
            .update({"status": "confirmed", "transaction_id": None}) \
            .eq("status", "posted") \
            .execute()

        scope_labels = {"all": "todas", "profit_loss": "P&L", "balance_sheet": "Balance Sheet"}
        return {
            "ok": True,
            "reset_count": reset_count,
            "deleted_transactions": deleted_count,
            "scope": scope,
            "message": f"Cifras vaciadas: {deleted_count} transacciones eliminadas, {reset_count} cuentas reseteadas ({scope_labels.get(scope, scope)})",
        }

    except Exception as e:
        logger.error(f"Error resetting Homes account balances: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# BANK STATEMENTS — Upload, Parse, Classify, Post
# ============================================================================

@router.get("/bank-statements")
async def list_bank_statements(account_key: Optional[str] = None, bank_account_id: Optional[str] = None):
    """List all uploaded bank statements, optionally filtered by account."""
    q = sb.table("bank_statements").select("*").order("created_at", desc=True)
    if bank_account_id:
        q = q.eq("bank_account_id", bank_account_id)
    elif account_key:
        q = q.eq("account_key", account_key)
    result = q.execute()
    return {"statements": result.data or []}


@router.get("/bank-statements/{statement_id}")
async def get_bank_statement(statement_id: str):
    """Get a statement with all its movements."""
    stmt = sb.table("bank_statements").select("*").eq("id", statement_id).execute()
    if not stmt.data:
        raise HTTPException(status_code=404, detail="Statement not found")

    movements = (sb.table("statement_movements")
                 .select("*")
                 .eq("statement_id", statement_id)
                 .order("sort_order").order("movement_date")
                 .execute())

    return {
        "statement": stmt.data[0],
        "movements": movements.data or [],
    }


async def _parse_statement_background(
    statement_id: str,
    file_content: bytes,
    ext: str,
    account_key: str,
    bank_account_id: Optional[str] = None,
) -> None:
    """Run the GPT-5 parsing of a bank statement off the request path.

    Vercel's serverless functions cap at 10s on Hobby and 60s on Pro —
    well below the 15-30s the AI parser routinely takes for a multi-page
    statement. We fire-and-forget this so the upload request returns in
    <2s and the frontend polls /bank-statements/{id} until status flips
    from 'parsing' to 'parsed' or 'error'."""
    try:
        raw_text, movements = await _extract_and_parse_statement(file_content, ext, account_key)

        if not movements:
            # AI couldn't find any movements. Surface a diagnostic with
            # length of text extracted so the operator can tell whether
            # the PDF was image-only / extraction failed vs. AI just
            # couldn't find structure.
            text_len = len(raw_text or "")
            if text_len < 50:
                raise ValueError(
                    f"El archivo no tiene capa de texto extraíble "
                    f"({text_len} caracteres detectados). Si es un PDF escaneado, "
                    f"súbelo como imagen (PNG/JPG) para que el OCR lo lea."
                )
            raise ValueError(
                f"No se detectaron movimientos en el texto del estado de cuenta "
                f"(se extrajeron {text_len} caracteres pero el parser no encontró "
                f"transacciones estructuradas). Verifica que el archivo sea un "
                f"estado de cuenta real, no un resumen ni un comprobante suelto."
            )

        # Save raw text
        sb.table("bank_statements").update({
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
                sb.table("statement_movements").insert(mv_data).execute()
            except Exception as e:
                logger.warning(f"[BankStmt] Failed to insert movement {i}: {e}")

        # Extract period + balance metadata from first movement (set there by the AI parser)
        meta = movements[0] if movements else {}
        period_start = meta.get("period_start") or None
        period_end = meta.get("period_end") or None
        beginning_balance = meta.get("beginning_balance")
        ending_balance = meta.get("ending_balance")

        stmt_update = {
            "status": "parsed",
            "total_movements": len(movements),
            "bank_name": meta.get("bank_name") or None,
            "account_number_last4": meta.get("account_last4") or None,
            "statement_period_start": period_start,
            "statement_period_end": period_end,
            "beginning_balance": float(beginning_balance) if beginning_balance is not None else None,
            "ending_balance": float(ending_balance) if ending_balance is not None else None,
        }
        stmt_update = {k: v for k, v in stmt_update.items() if v is not None}
        sb.table("bank_statements").update(stmt_update).eq("id", statement_id).execute()

        # NOTE: we no longer overwrite bank_accounts.current_balance from the
        # statement's ending_balance. The bank's true balance is the sum of
        # the ledger (see api.services.ledger.get_bank_balance). The
        # statement is now a verification artifact only: GET /bank-accounts
        # surfaces a `discrepancy` field = statement.ending_balance −
        # derived_ledger_balance, so an operator can see drift at a glance
        # but the saldo itself never gets clobbered by an old/wrong
        # statement upload.
        if bank_account_id and ending_balance is not None:
            try:
                from api.services.ledger import get_bank_balance
                ledger_bal = get_bank_balance(
                    bank_account_id,
                    as_of=period_end,
                    db=sb,
                )
                diff = float(ending_balance) - ledger_bal
                logger.info(
                    f"[BankStmt] {bank_account_id} period_end={period_end} "
                    f"ledger=${ledger_bal:.2f} statement_ending=${float(ending_balance):.2f} "
                    f"discrepancy=${diff:.2f}"
                )
            except Exception as audit_err:
                logger.warning(f"[BankStmt] Discrepancy check failed: {audit_err}")

        logger.info(f"[BankStmt] background parse complete for {statement_id}: {len(movements)} movements")

    except Exception as e:
        logger.error(f"[BankStmt] Parse error: {e}")
        sb.table("bank_statements").update({
            "status": "error",
            "error_message": str(e)[:500],
        }).eq("id", statement_id).execute()


@router.post("/bank-statements")
async def upload_bank_statement(
    file: UploadFile = File(...),
    bank_account_id: str = Form(None),
    account_key: str = Form(None),
):
    """Upload a bank statement file (PDF, PNG, JPG, Excel, CSV).
    Stores the file + DB record synchronously (~1-2s) then launches the
    AI parsing as a background task. The frontend polls
    /api/accounting/bank-statements/{id} until status flips from
    'parsing' to 'parsed' (or 'error'). This keeps the HTTP request well
    under the Vercel serverless function timeout (10s on Hobby)."""

    # Resolve the bank account
    account_label = "Unknown Account"
    resolved_account_key = account_key or "unknown"

    if bank_account_id:
        ba = sb.table("bank_accounts").select("id, name, bank_name").eq("id", bank_account_id).execute()
        if not ba.data:
            raise HTTPException(status_code=400, detail="Bank account not found")
        account_label = ba.data[0]["name"]
        resolved_account_key = ba.data[0]["name"].lower().replace(" ", "_")
    elif not account_key:
        raise HTTPException(status_code=400, detail="Either bank_account_id or account_key is required")

    ext = (file.filename or "").rsplit(".", 1)[-1].lower() if file.filename else ""
    allowed = {"pdf", "png", "jpg", "jpeg", "xlsx", "xls", "csv"}
    if ext not in allowed:
        raise HTTPException(status_code=400, detail=f"File type .{ext} not supported. Use: {', '.join(allowed)}")

    file_content = await file.read()
    if len(file_content) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    import uuid as _uuid
    storage_path = f"bank-statements/{resolved_account_key}/{_uuid.uuid4().hex[:12]}_{file.filename}"
    file_url = None
    try:
        sb.storage.from_("transaction-documents").upload(
            storage_path, file_content,
            {"content-type": file.content_type or "application/octet-stream"}
        )
        file_url = sb.storage.from_("transaction-documents").get_public_url(storage_path)
        if file_url and file_url.endswith("?"):
            file_url = file_url[:-1]
    except Exception as e:
        logger.warning(f"[BankStmt] Storage upload failed: {e}")

    stmt_data = {
        "account_key": resolved_account_key,
        "account_label": account_label,
        "original_filename": file.filename or "unknown",
        "file_type": ext,
        "storage_path": storage_path,
        "file_url": file_url,
        "status": "parsing",
    }
    if bank_account_id:
        stmt_data["bank_account_id"] = bank_account_id
    result = sb.table("bank_statements").insert(stmt_data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Could not save statement record")
    statement = result.data[0]
    statement_id = statement["id"]

    # Fire-and-forget the AI parsing. Railway keeps the worker alive even
    # after we return the response, so the task finishes server-side.
    import asyncio
    asyncio.create_task(
        _parse_statement_background(
            statement_id, file_content, ext, resolved_account_key, bank_account_id,
        )
    )

    return {
        "statement": statement,
        "movements": [],
        "message": "Archivo subido. Parseando movimientos en segundo plano…",
    }


@router.post("/bank-statements/{statement_id}/reconcile")
async def reconcile_statement_movements(statement_id: str):
    """Auto-match statement movements against existing unreconciled accounting transactions.
    Returns matches with confidence scores for user confirmation."""
    stmt = sb.table("bank_statements").select("*").eq("id", statement_id).execute()
    if not stmt.data:
        raise HTTPException(status_code=404, detail="Statement not found")
    statement = stmt.data[0]
    bank_account_id = statement.get("bank_account_id")

    # Get pending movements from this statement
    movements = (sb.table("statement_movements")
                 .select("*").eq("statement_id", statement_id)
                 .in_("status", ["pending", "suggested"])
                 .order("sort_order").execute())
    if not movements.data:
        return {"matches": [], "unmatched_count": 0, "message": "No hay movimientos pendientes"}

    # Get unreconciled transactions to match the statement movements against.
    # CRITICAL: only consider rows WITH bank_account_id set — those are the
    # bank legs of double-entry pairs. The non-bank legs (e.g. the AR side
    # of a factura issuance, the Inventory side of a purchase) are cashless
    # by definition; a bank statement movement cannot correspond to them.
    # Without this filter the matcher would happily pair a deposit with the
    # AR row from an invoice issuance, blocking the auto-invoice-match
    # feature from firing (user's Test 3 bug 2026-05-22: factura stayed
    # unpaid because the matcher locked onto the AR-leg of the issuance).
    unreconciled_txns = []
    if bank_account_id:
        txns = (sb.table("accounting_transactions").select("*")
                .in_("status", ["confirmed", "pending"])
                .eq("bank_account_id", bank_account_id)
                .order("transaction_date", desc=True).execute())
        unreconciled_txns = txns.data or []

    if not unreconciled_txns:
        return {
            "matches": [],
            "unmatched_count": len(movements.data),
            "message": "No hay transacciones existentes para conciliar",
        }

    matches = _match_movements_to_transactions(movements.data, unreconciled_txns)

    # Also look for OPEN INVOICES that could match a movement. This lets the
    # operator auto-cobrar a factura from a bank deposit (or auto-pay an AP
    # from a withdrawal) without manually clicking "registrar pago" on each
    # invoice — the reconcile-confirm step will create the invoice payment
    # and the proper double-entry pair automatically.
    matched_movement_ids = {m["movement_id"] for m in matches}
    remaining_movements = [m for m in movements.data if m["id"] not in matched_movement_ids]
    invoice_matches: list = []
    if remaining_movements:
        try:
            inv_res = (sb.table("accounting_invoices").select("*")
                       .in_("status", ["draft", "sent", "partial", "overdue"])
                       .execute())
            open_invoices = [i for i in (inv_res.data or [])
                             if float(i.get("balance_due") or 0) > 0]
            if open_invoices:
                invoice_matches = _match_movements_to_invoices(remaining_movements, open_invoices)
        except Exception as e:
            logger.warning(f"[reconcile] invoice match scan failed: {e}")

    all_matches = matches + invoice_matches
    unmatched_count = len(movements.data) - len(all_matches)
    return {
        "matches": all_matches,
        "unmatched_count": unmatched_count,
        "message": f"{len(all_matches)} coincidencias ({len(matches)} con transacciones, "
                   f"{len(invoice_matches)} con facturas), {unmatched_count} sin match",
    }


def _normalize_name(name: str) -> str:
    """Normalize a counterparty name for comparison."""
    import re
    name = name.lower().strip()
    # Remove common prefixes/suffixes
    for noise in ["zelle payment from ", "wire transfer in - ", "wire transfer - ",
                   "check #", "ach debit - ", "ach credit - ", "transfer from ",
                   "transfer to ", "payment from ", "payment to ",
                   "venta contado - ", "compra propiedad: ", "compra: "]:
        name = name.replace(noise, "")
    # Remove non-alphanumeric except spaces
    name = re.sub(r'[^a-záéíóúñü\s]', '', name).strip()
    return name


def _name_similarity(name1: str, name2: str) -> float:
    """Calculate similarity between two names (0.0 to 1.0)."""
    n1 = _normalize_name(name1)
    n2 = _normalize_name(name2)
    if not n1 or not n2:
        return 0.0

    # Exact match after normalization
    if n1 == n2:
        return 1.0

    # One contains the other
    if n1 in n2 or n2 in n1:
        return 0.9

    # Token overlap
    tokens1 = set(n1.split())
    tokens2 = set(n2.split())
    if not tokens1 or not tokens2:
        return 0.0

    overlap = len(tokens1 & tokens2)
    total = max(len(tokens1), len(tokens2))
    return overlap / total if total > 0 else 0.0


def _match_movements_to_transactions(movements: list, transactions: list) -> list:
    """Match bank statement movements against existing accounting transactions.
    Returns list of match dicts with scores."""
    matches = []
    used_txn_ids = set()

    for mv in movements:
        mv_amount = abs(float(mv.get("amount", 0)))
        mv_is_credit = mv.get("is_credit", False)
        mv_date_str = mv.get("movement_date", "")
        mv_counterparty = mv.get("counterparty") or ""
        # Also check description for counterparty clues
        mv_description = mv.get("description") or ""

        best_match = None
        best_score = 0

        for txn in transactions:
            if txn["id"] in used_txn_ids:
                continue

            score = 0
            txn_amount = abs(float(txn.get("amount", 0)))
            txn_is_income = txn.get("is_income", False)

            # Direction match — must agree (credit=income, debit=expense)
            if mv_is_credit != txn_is_income:
                continue

            # Amount match (exact = 50 pts, within 1% = 35 pts, within 5% = 15 pts)
            if mv_amount > 0 and txn_amount > 0:
                diff_pct = abs(mv_amount - txn_amount) / max(mv_amount, txn_amount)
                if abs(mv_amount - txn_amount) < 0.01:
                    score += 50
                elif diff_pct < 0.01:
                    score += 35
                elif diff_pct < 0.05:
                    score += 15
                else:
                    continue  # Amount too different, skip

            # Date proximity (max 30 pts)
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

            # Counterparty similarity (max 20 pts)
            txn_counterparty = txn.get("counterparty_name") or ""
            txn_description = txn.get("description") or ""

            # Try matching movement counterparty against transaction counterparty
            best_name_sim = 0.0
            for mv_name in [mv_counterparty, mv_description]:
                for txn_name in [txn_counterparty, txn_description]:
                    if mv_name and txn_name:
                        sim = _name_similarity(mv_name, txn_name)
                        best_name_sim = max(best_name_sim, sim)

            score += int(20 * best_name_sim)

            if score > best_score:
                best_score = score
                best_match = txn

        # Threshold: amount match (50) alone is enough for a candidate
        if best_match and best_score >= 50:
            used_txn_ids.add(best_match["id"])
            confidence = "high" if best_score >= 80 else "medium" if best_score >= 60 else "low"
            matches.append({
                "movement_id": mv["id"],
                "transaction_id": best_match["id"],
                "target_type": "transaction",
                "score": best_score,
                "confidence": confidence,
                "movement": mv,
                "transaction": best_match,
            })

    return matches


def _match_movements_to_invoices(movements: list, invoices: list) -> list:
    """Match bank statement movements against open invoices (AR or AP).
    Used by the reconcile wizard to surface auto-collect / auto-pay
    candidates: a deposit that matches an unpaid receivable, or a
    withdrawal that matches an unpaid payable.
    Returns list of match dicts with `target_type='invoice'` and
    `invoice_id` so reconcile-confirm can branch on it.
    """
    matches: list = []
    used_invoice_ids: set = set()

    for mv in movements:
        mv_amount = abs(float(mv.get("amount", 0)))
        mv_is_credit = mv.get("is_credit", False)  # True=deposit, False=withdrawal
        mv_date_str = mv.get("movement_date", "")
        mv_counterparty = mv.get("counterparty") or ""
        mv_description = mv.get("description") or ""

        best_match = None
        best_score = 0

        for inv in invoices:
            if inv["id"] in used_invoice_ids:
                continue

            # Direction must agree:
            #   deposit (is_credit=True)  → receivable (we get paid)
            #   withdrawal (is_credit=False) → payable (we pay a bill)
            direction = (inv.get("direction") or "").lower()
            if mv_is_credit and direction != "receivable":
                continue
            if not mv_is_credit and direction != "payable":
                continue

            balance_due = float(inv.get("balance_due") or 0)
            if balance_due <= 0:
                continue

            score = 0
            # Amount match against balance_due (exact, 1%, 5%)
            if mv_amount > 0 and balance_due > 0:
                diff_pct = abs(mv_amount - balance_due) / max(mv_amount, balance_due)
                if abs(mv_amount - balance_due) < 0.01:
                    score += 50
                elif diff_pct < 0.01:
                    score += 35
                elif diff_pct < 0.05:
                    score += 15
                else:
                    continue

            # Date proximity vs invoice due_date or issue_date (best of the two)
            try:
                mv_date = datetime.strptime(mv_date_str, "%Y-%m-%d").date() if mv_date_str else None
                for cmp_str in (inv.get("due_date"), inv.get("issue_date")):
                    if not cmp_str or not mv_date:
                        continue
                    cmp_date = datetime.strptime(cmp_str, "%Y-%m-%d").date()
                    diff_days = abs((mv_date - cmp_date).days)
                    if diff_days == 0:
                        score = max(score, score + 30); break
                    elif diff_days <= 3:
                        score = max(score, score + 20); break
                    elif diff_days <= 14:
                        score = max(score, score + 10); break
                    elif diff_days <= 30:
                        score = max(score, score + 5); break
            except Exception:
                pass

            # Counterparty similarity
            inv_counterparty = inv.get("counterparty_name") or ""
            best_name_sim = 0.0
            for mv_name in [mv_counterparty, mv_description]:
                if mv_name and inv_counterparty:
                    best_name_sim = max(best_name_sim, _name_similarity(mv_name, inv_counterparty))
                # also try matching invoice_number in movement description (e.g. "PAGO FAC-XXX")
                inv_num = (inv.get("invoice_number") or "").lower()
                if inv_num and mv_name and inv_num in mv_name.lower():
                    best_name_sim = max(best_name_sim, 1.0)
            score += int(20 * best_name_sim)

            if score > best_score:
                best_score = score
                best_match = inv

        if best_match and best_score >= 50:
            used_invoice_ids.add(best_match["id"])
            confidence = "high" if best_score >= 80 else "medium" if best_score >= 60 else "low"
            matches.append({
                "movement_id": mv["id"],
                "invoice_id": best_match["id"],
                "target_type": "invoice",
                "score": best_score,
                "confidence": confidence,
                "movement": mv,
                "invoice": best_match,
            })

    return matches


@router.post("/bank-statements/{statement_id}/reconcile/confirm")
async def confirm_reconciliation(statement_id: str, data: dict):
    """Confirm matched movement-transaction pairs. Marks both as reconciled."""
    pairs = data.get("pairs", [])
    logger.info(f"[reconcile-confirm] Received {len(pairs)} pairs for statement {statement_id}")

    if not pairs:
        raise HTTPException(status_code=400, detail="No pairs provided")

    now_str = datetime.utcnow().isoformat()
    reconciled = 0
    errors = []

    # Pre-fetch the statement (we need bank_account_id for invoice payments)
    stmt_row = sb.table("bank_statements").select("*").eq("id", statement_id).execute().data
    statement = stmt_row[0] if stmt_row else {}

    for pair in pairs:
        mv_id = pair.get("movement_id")
        txn_id = pair.get("transaction_id")
        invoice_id = pair.get("invoice_id")
        target_type = pair.get("target_type") or ("invoice" if invoice_id else "transaction")
        logger.info(f"[reconcile-confirm] Processing pair: mv={mv_id}, target={target_type}, txn={txn_id}, invoice={invoice_id}")

        if not mv_id:
            errors.append(f"Missing mv_id in pair: {pair}")
            continue

        try:
            if target_type == "invoice" and invoice_id:
                # ---- AUTO-COLLECT / AUTO-PAY invoice branch ----
                # Fetch the movement so we know the amount/date for the payment.
                mv_row = sb.table("statement_movements").select("*").eq("id", mv_id).single().execute().data
                if not mv_row:
                    errors.append(f"Movement {mv_id} not found")
                    continue
                inv_row = sb.table("accounting_invoices").select("*").eq("id", invoice_id).single().execute().data
                if not inv_row:
                    errors.append(f"Invoice {invoice_id} not found")
                    continue

                amount = abs(float(mv_row.get("amount") or 0))
                is_receivable = (inv_row.get("direction") or "").lower() == "receivable"

                # Create accounting_invoice_payments row
                pay = sb.table("accounting_invoice_payments").insert({
                    "invoice_id": invoice_id,
                    "payment_date": mv_row.get("movement_date"),
                    "amount": amount,
                    "payment_method": mv_row.get("payment_method"),
                    "payment_reference": mv_row.get("reference"),
                    "notes": f"Auto-cobrado del estado de cuenta {statement.get('id','')[:8]}",
                }).execute()

                # Update invoice balance + status
                new_paid = float(inv_row.get("amount_paid") or 0) + amount
                total = float(inv_row.get("total_amount") or 0)
                new_status = "paid" if new_paid + 0.01 >= total else "partial"
                sb.table("accounting_invoices").update({
                    "amount_paid": new_paid,
                    "status": new_status,
                }).eq("id", invoice_id).execute()

                # Post the double-entry pair via the unified writer
                from api.services.ledger import post_to_ledger
                debit_id, credit_id = post_to_ledger(
                    event_type=("invoice_paid_in" if is_receivable else "invoice_paid_out"),
                    amount=amount,
                    bank_account_id=statement.get("bank_account_id"),
                    date=mv_row.get("movement_date") or now_str[:10],
                    counterparty_name=inv_row.get("counterparty_name"),
                    counterparty_type=inv_row.get("counterparty_type"),
                    entity_type="invoice",
                    entity_id=invoice_id,
                    property_id=inv_row.get("property_id"),
                    yard_id=inv_row.get("yard_id"),
                    description_data={"invoice_number": inv_row.get("invoice_number", "")},
                    payment_method=mv_row.get("payment_method"),
                    payment_reference=mv_row.get("reference"),
                    notes=f"Auto-cobrado desde estado de cuenta",
                    status="reconciled",  # pair is born already reconciled
                )

                # Link the invoice_payment to the bank leg of the pair
                bank_leg_id = debit_id if is_receivable else credit_id
                if pay.data and bank_leg_id:
                    sb.table("accounting_invoice_payments").update({
                        "transaction_id": bank_leg_id,
                    }).eq("id", pay.data[0]["id"]).execute()

                # Stamp reconciled_at on both legs
                sb.table("accounting_transactions").update({
                    "reconciled_at": now_str,
                }).in_("id", [debit_id, credit_id]).execute()

                # Mark the movement as reconciled + link it to the bank leg
                sb.table("statement_movements").update({
                    "status": "reconciled",
                    "matched_transaction_id": bank_leg_id,
                }).eq("id", mv_id).execute()

                _log_audit("accounting_invoices", invoice_id, "auto_paid_from_statement",
                           description=f"Pago auto-conciliado: ${amount:,.2f}")
                reconciled += 1
                continue

            # ---- TRANSACTION branch (existing logic) ----
            if not txn_id:
                errors.append(f"Missing txn_id in pair: {pair}")
                continue

            # Update movement: mark as reconciled and link to matched transaction
            mv_result = sb.table("statement_movements").update({
                "status": "reconciled",
                "matched_transaction_id": txn_id,
            }).eq("id", mv_id).execute()
            logger.info(f"[reconcile-confirm] Movement update result: {len(mv_result.data or [])} rows")

            # Mark the matched txn AND its linked counterpart leg as reconciled.
            txn_row = sb.table("accounting_transactions").select("id, linked_transaction_id") \
                       .eq("id", txn_id).single().execute().data or {}
            ids_to_flip = [txn_id]
            linked = txn_row.get("linked_transaction_id")
            if linked:
                ids_to_flip.append(linked)
            txn_result = sb.table("accounting_transactions").update({
                "status": "reconciled",
                "reconciled_at": now_str,
            }).in_("id", ids_to_flip).execute()
            logger.info(f"[reconcile-confirm] Reconciled {len(txn_result.data or [])} txn rows (target + pair)")

            _log_audit("accounting_transactions", txn_id, "reconcile")
            reconciled += 1
        except Exception as e:
            err_msg = f"mv={mv_id}, target={target_type}: {e}"
            logger.error(f"[reconcile-confirm] Error: {err_msg}", exc_info=True)
            errors.append(err_msg)

    logger.info(f"[reconcile-confirm] Done: {reconciled} reconciled, {len(errors)} errors")
    return {
        "reconciled": reconciled,
        "message": f"{reconciled} movimientos conciliados",
        "errors": errors[:5] if errors else [],
    }


@router.post("/bank-statements/{statement_id}/classify")
async def classify_statement_movements(statement_id: str):
    """Use AI to suggest accounting accounts for each movement."""
    try:
        return await _do_classify(statement_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[classify] Unhandled error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Classification error: {str(e)[:200]}")


async def _do_classify(statement_id: str):
    # Get statement + movements
    stmt = sb.table("bank_statements").select("*").eq("id", statement_id).execute()
    if not stmt.data:
        raise HTTPException(status_code=404, detail="Statement not found")

    movements = (sb.table("statement_movements")
                 .select("*").eq("statement_id", statement_id)
                 .in_("status", ["pending", "suggested", "reconciled"])
                 .order("sort_order").execute())

    if not movements.data:
        return {"message": "No movements to classify", "classified": 0}

    # For reconciled movements, fetch their matched transaction descriptions
    reconciled_mvs = [m for m in movements.data if m.get("status") == "reconciled" and m.get("matched_transaction_id")]
    matched_txn_map = {}  # movement_id -> transaction info
    if reconciled_mvs:
        txn_ids = [m["matched_transaction_id"] for m in reconciled_mvs]
        txns = sb.table("accounting_transactions").select("id, description, counterparty_name, is_income").in_("id", txn_ids).execute()
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

    # Get chart of accounts for AI context — ONLY QuickBooks accounts (with parent_account_id set)
    all_accounts = _fetch_all_accounts()
    # Only use accounts that are part of the QuickBooks hierarchy (have a parent, or are QB roots)
    qb_root_codes = {"PL_INCOME", "PL_COGS", "PL_EXPENSES", "PL_OTHER_EXPENSES", "BS_ASSETS", "BS_LIABILITIES", "BS_EQUITY"}
    qb_accounts = [a for a in all_accounts if a.get("parent_account_id") or a["code"] in qb_root_codes]
    accounts_list = [a for a in qb_accounts if not a.get("is_header")]
    acct_by_id = {a["id"]: a for a in accounts_list}

    # Build accounts reference for the AI — only leaf P&L accounts (income/expense/cogs)
    PL_CLASSIFY_TYPES = {"Income", "Other Income", "Cost of Goods Sold", "Expenses", "Other Expense", "income", "expense", "cogs"}
    pl_accounts = [a for a in accounts_list if a["account_type"] in PL_CLASSIFY_TYPES]
    accounts_ref = "\n".join([
        f"- {a['code']}: {a['name']} (type={a['account_type']}, cat={a.get('category','')})"
        for a in pl_accounts
    ])

    # --- Learning from human corrections ---
    # Query past confirmed movements where the human changed the AI suggestion
    corrections_ref = ""
    try:
        confirmed = (sb.table("statement_movements")
                     .select("description, counterparty, amount, is_credit, suggested_account_code, suggested_account_id, final_account_id")
                     .in_("status", ["confirmed", "posted"])
                     .not_.is_("final_account_id", "null")
                     .not_.is_("suggested_account_id", "null")
                     .order("updated_at", desc=True)
                     .limit(200)
                     .execute())
        # Filter where human chose a different account than AI
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
            for c in corrections[:30]:  # Limit to 30 most recent corrections
                direction = "credit" if c["is_credit"] else "debit"
                lines.append(
                    f"- \"{c['description']}\" ({c['counterparty']}, ${c['amount']}, {direction}) → "
                    f"AI suggested: {c['ai_suggested']} → Human corrected to: {c['human_corrected']}"
                )
            corrections_ref = "\n".join(lines)
    except Exception as e:
        logger.warning(f"Could not load correction history: {e}")

    # Pre-load properties for property_id detection
    try:
        props_raw = sb.table("properties").select("id, property_code, address").execute()
        properties_list = props_raw.data or []
    except Exception:
        properties_list = []
    prop_by_code = {p["property_code"].upper(): p["id"] for p in properties_list if p.get("property_code")}

    # Classify in small batches to avoid token limits
    classified = 0
    batch_size = 5
    mvs = movements.data

    for batch_start in range(0, len(mvs), batch_size):
        batch = mvs[batch_start:batch_start + batch_size]
        suggestions = await _ai_classify_movements(batch, accounts_ref, accounts_list, corrections_ref)

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
                acct_match = sb.table("accounting_accounts").select("id").eq("code", suggestion["account_code"]).execute()
                if acct_match.data:
                    update_data["suggested_account_id"] = acct_match.data[0]["id"]

            # Detect property_id from AI suggestion or movement description
            detected_property_id = None
            prop_code = suggestion.get("property_code", "")
            if prop_code:
                detected_property_id = prop_by_code.get(prop_code.upper())
            if not detected_property_id:
                desc = (mv.get("description") or "").upper()
                for code, pid in prop_by_code.items():
                    if code in desc:
                        detected_property_id = pid
                        break

            sb.table("statement_movements").update(update_data).eq("id", mv["id"]).execute()
            # Try to set property_id separately (column may not exist yet)
            if detected_property_id:
                try:
                    sb.table("statement_movements").update({"property_id": detected_property_id}).eq("id", mv["id"]).execute()
                except Exception:
                    pass  # Column doesn't exist yet — migration 087 pending
            classified += 1

    # Update statement status
    sb.table("bank_statements").update({
        "status": "review",
        "classified_movements": classified,
    }).eq("id", statement_id).execute()

    return {"message": f"Classified {classified} movements", "classified": classified}


@router.patch("/bank-statements/movements/{movement_id}")
async def update_movement_classification(movement_id: str, data: dict):
    """Accountant confirms or changes the classification of a movement."""
    allowed = {"final_account_id", "final_transaction_type", "final_notes", "status"}
    update = {k: v for k, v in data.items() if k in allowed and v is not None}

    if not update:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    result = sb.table("statement_movements").update(update).eq("id", movement_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Movement not found")

    return result.data[0]


@router.post("/bank-statements/movements/{movement_id}/split")
async def split_movement(movement_id: str, data: dict):
    """Split a bank-statement movement into multiple child parts.

    Body: {"parts": [{"amount": 100, "description": "Part 1"}, ...]}
    The sum of part amounts must equal the parent movement amount.
    """
    parts = data.get("parts")
    if not parts or not isinstance(parts, list) or len(parts) < 2:
        raise HTTPException(status_code=400, detail="Must provide at least 2 parts")

    parent_result = sb.table("statement_movements").select("*").eq("id", movement_id).execute()
    if not parent_result.data:
        raise HTTPException(status_code=404, detail="Movement not found")
    parent = parent_result.data[0]

    parent_amount = float(parent["amount"])
    abs_parent = abs(parent_amount)
    sign = -1 if parent_amount < 0 else 1
    parts_total = sum(abs(float(p["amount"])) for p in parts)
    if abs(parts_total - abs_parent) > 0.01:
        raise HTTPException(
            status_code=400,
            detail=f"Parts total ({parts_total:.2f}) does not match movement amount ({abs_parent:.2f})",
        )

    sb.table("statement_movements").update({
        "is_split_parent": True,
        "status": "split",
    }).eq("id", movement_id).execute()

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
            child_result = sb.table("statement_movements").insert(child_data).execute()
            if child_result.data:
                created_children.append(child_result.data[0])
        except Exception as e:
            logger.error(f"[BankStmt] Failed to create split child {idx}: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to create split part {idx + 1}: {str(e)}")

    return {"message": f"Split into {len(created_children)} parts", "children": created_children}


@router.post("/bank-statements/{statement_id}/post")
async def post_confirmed_movements(statement_id: str):
    """Create accounting transactions from confirmed movements."""
    stmt = sb.table("bank_statements").select("*").eq("id", statement_id).execute()
    if not stmt.data:
        raise HTTPException(status_code=404, detail="Statement not found")
    statement = stmt.data[0]

    # Get confirmed AND reconciled movements that haven't been posted yet
    movements = (sb.table("statement_movements")
                 .select("*")
                 .eq("statement_id", statement_id)
                 .in_("status", ["confirmed", "reconciled"])
                 .order("sort_order").execute())

    if not movements.data:
        return {"message": "No hay movimientos confirmados para publicar. Primero clasifica y confirma los movimientos.", "posted": 0, "skipped": 0, "errors": []}

    # Look up the bank's accounting_account_id for double-entry
    bank_accounting_account_id = None
    if statement.get("bank_account_id"):
        ba = sb.table("bank_accounts").select("accounting_account_id").eq("id", statement["bank_account_id"]).execute()
        if ba.data and ba.data[0].get("accounting_account_id"):
            bank_accounting_account_id = ba.data[0]["accounting_account_id"]
    if not bank_accounting_account_id:
        logger.warning(f"[BankStmt] No accounting_account_id linked to bank_account — bank-side entries will be skipped")

    posted = 0
    skipped = 0
    errors = []
    stmt_label = f"{statement.get('account_label', '')} - {statement.get('original_filename', '')}"

    # Pre-load account types for determining bank-side direction
    all_accts = _fetch_all_accounts()
    acct_type_map = {a["id"]: a.get("account_type", "") for a in all_accts}

    # Valid transaction_types per DB CHECK constraint
    VALID_TXN_TYPES = {
        'sale_cash', 'sale_rto_capital', 'deposit_received', 'other_income',
        'purchase_house', 'renovation', 'moving_transport', 'commission',
        'operating_expense', 'other_expense', 'bank_transfer', 'adjustment',
    }
    # Map AI-invented types to valid ones
    TXN_TYPE_MAP = {
        'sale_income': 'sale_cash', 'income_sale': 'sale_cash', 'income_sale_deposit': 'deposit_received',
        'commission_expense': 'commission', 'expense_commission': 'commission',
        'down_payment_income': 'deposit_received', 'down_payment': 'deposit_received',
        'capital_transfer_income': 'sale_rto_capital', 'income_capital_transfer': 'sale_rto_capital',
        'capital_transfer': 'sale_rto_capital', 'internal_transfer': 'bank_transfer',
        'expense_office_supplies': 'operating_expense', 'office_supplies': 'operating_expense',
        'expense_bank_fee': 'operating_expense', 'bank_fee': 'operating_expense',
        'purchase': 'purchase_house', 'house_purchase': 'purchase_house',
        'cogs': 'purchase_house', 'cost_of_goods': 'purchase_house',
        'expense': 'other_expense', 'income': 'other_income',
    }

    for mv in movements.data:
        account_id = mv.get("final_account_id") or mv.get("suggested_account_id")
        raw_txn_type = mv.get("final_transaction_type") or mv.get("suggested_transaction_type") or "adjustment"
        # Normalize to valid type
        txn_type = raw_txn_type if raw_txn_type in VALID_TXN_TYPES else TXN_TYPE_MAP.get(raw_txn_type, "adjustment")

        if not account_id:
            skipped += 1
            desc = mv.get("description", "")[:60]
            errors.append(f"'{desc}' — sin cuenta contable asignada")
            logger.warning(f"[BankStmt] Skipped movement {mv['id']}: no account_id (desc: {desc})")
            continue

        # Bank-side direction: deposits (credits) increase bank balance,
        # withdrawals (debits) decrease it — use the movement's is_credit flag directly
        bank_is_income = mv.get("is_credit", False)

        try:
            abs_amount = abs(float(mv["amount"]))
            # `common_fields` is shared between the two legs of the pair but
            # MUST NOT include bank_account_id — that belongs ONLY to the
            # bank leg below. Otherwise the bank balance derivation counts
            # every movement twice (pre-fix bug: 2x effect on Cuenta Dallas).
            common_fields = {
                "transaction_date": mv["movement_date"],
                "payment_method": mv.get("payment_method"),
                "payment_reference": mv.get("reference"),
                "counterparty_name": mv.get("counterparty"),
                "description": mv.get("description", "")[:500],
                "property_id": mv.get("property_id"),
                "source": "bank_statement",
            }
            common_fields = {k: v for k, v in common_fields.items() if v is not None}

            pnl_txn_id = None

            # is_income on the P&L leg must reflect the NATURAL direction
            # of that account so the reports (_signed_balance) give it a
            # positive contribution:
            #   - Deposit → income account credited → is_income=True so
            #     House Sales etc. show +amt in the P&L.
            #   - Withdrawal → expense account debited → is_income=False so
            #     Office Supplies etc. show +amt (debit grows expense).
            # In both cases this happens to equal the movement's is_credit
            # flag — i.e., the P&L leg's is_income mirrors the bank leg's,
            # because each leg independently asks: "is my account being
            # grown by this entry?" and for a deposit both bank-side and
            # income-side grow (+); for a withdrawal both bank-side and
            # expense-side shrink/grow in opposite senses such that
            # _signed_balance still returns +amt for the expense.
            pnl_is_income = bank_is_income
            if mv.get("status") == "reconciled" and mv.get("matched_transaction_id"):
                # Reconciled: the movement was MATCHED to an existing
                # transaction from a prior flow (Test 1 sale, factura
                # issuance, etc.). That transaction already has its own
                # correct account_id (Inventory for purchases, House Sales
                # for sales, etc.). We do NOT overwrite it with the
                # wizard's classification — doing that previously caused
                # purchases to silently move to "Cost of Goods Sold-1"
                # and renovations to "Labor Costs" in the user's reports.
                # We only stamp source='bank_statement' so the audit
                # trail shows this transaction now has a statement match.
                sb.table("accounting_transactions").update({
                    "source": "bank_statement",
                }).eq("id", mv["matched_transaction_id"]).execute()
                pnl_txn_id = mv["matched_transaction_id"]
            else:
                # Non-reconciled: create new P&L transaction
                txn_data = {
                    **common_fields,
                    "transaction_number": _generate_transaction_number(),
                    "transaction_type": txn_type,
                    "amount": abs_amount,
                    "is_income": pnl_is_income,
                    "account_id": account_id,
                    "notes": f"Importado de estado de cuenta: {stmt_label}",
                    "status": "confirmed",
                }
                txn_result = sb.table("accounting_transactions").insert(txn_data).execute()
                if txn_result.data:
                    pnl_txn_id = txn_result.data[0]["id"]
                else:
                    skipped += 1
                    errors.append(f"'{mv.get('description', '')[:60]}' — error al insertar transacción")
                    continue

            # --- Entry 2: Bank/asset side (double-entry) ---
            # Only this leg carries bank_account_id — the balance derivation
            # (api.services.ledger.get_bank_balance) sums signed amounts on
            # rows where bank_account_id = X. If the P&L leg also had
            # bank_account_id set, every movement would be counted twice.
            #
            # SKIP this entry for RECONCILED movements: the matched
            # transaction (pnl_txn_id) was created by post_to_ledger earlier
            # and ALREADY has its bank leg linked via linked_transaction_id.
            # Inserting another bank-side row here would duplicate the cash
            # effect on the bank (the bug that drove Cuenta Dallas from the
            # expected $61,675.60 to the observed $83,125 in the lifecycle
            # test). For reconciled movements we just stamp reconciled_at
            # on the existing pair below.
            bank_txn_id = None
            already_paired = (mv.get("status") == "reconciled" and mv.get("matched_transaction_id"))
            if bank_accounting_account_id and not already_paired:
                bank_data = {
                    **common_fields,
                    "transaction_number": _generate_transaction_number(),
                    "transaction_type": txn_type,
                    "amount": abs_amount,
                    "is_income": bank_is_income,
                    "account_id": bank_accounting_account_id,
                    "bank_account_id": statement.get("bank_account_id"),
                    "linked_transaction_id": pnl_txn_id,
                    "notes": f"Contrapartida bancaria: {stmt_label}",
                    "status": "confirmed",
                }
                bank_result = sb.table("accounting_transactions").insert(bank_data).execute()
                if bank_result.data:
                    bank_txn_id = bank_result.data[0]["id"]
                    # Link the P&L entry back to the bank entry
                    sb.table("accounting_transactions").update({
                        "linked_transaction_id": bank_txn_id,
                    }).eq("id", pnl_txn_id).execute()

            # Mark movement as posted
            sb.table("statement_movements").update({
                "status": "posted",
                "transaction_id": pnl_txn_id,
            }).eq("id", mv["id"]).execute()

            # Flip reconciled_at on BOTH legs of the double-entry pair. This is
            # what removes the matched txn from "Por Conciliar" — without it,
            # the bank leg of the pair would keep showing up forever.
            try:
                ids_to_flip: list[str] = []
                if pnl_txn_id:
                    ids_to_flip.append(pnl_txn_id)
                if bank_txn_id:
                    ids_to_flip.append(bank_txn_id)
                # Also pick up the writer-created pair via linked_transaction_id
                for tid in list(ids_to_flip):
                    row = (sb.table("accounting_transactions")
                           .select("linked_transaction_id")
                           .eq("id", tid).single().execute().data) or {}
                    linked = row.get("linked_transaction_id")
                    if linked and linked not in ids_to_flip:
                        ids_to_flip.append(linked)
                if ids_to_flip:
                    sb.table("accounting_transactions").update({
                        "status": "reconciled",
                        "reconciled_at": datetime.utcnow().isoformat(),
                    }).in_("id", ids_to_flip).execute()
            except Exception as flip_err:
                logger.warning(f"[BankStmt] Could not flip reconciled flag: {flip_err}")

            posted += 1

        except Exception as e:
            full_err = str(e)
            logger.error(f"[BankStmt] Failed to post movement {mv['id']}: {full_err}")
            skipped += 1
            errors.append(f"'{mv.get('description', '')[:60]}' — {full_err[:200]}")

    # Update statement stats
    total_posted = (sb.table("statement_movements")
                    .select("id", count="exact")
                    .eq("statement_id", statement_id)
                    .eq("status", "posted").execute())
    total_count = total_posted.count if hasattr(total_posted, 'count') else len(total_posted.data or [])

    new_status = "completed" if total_count >= (statement.get("total_movements") or 0) else "partial"
    sb.table("bank_statements").update({
        "posted_movements": total_count,
        "status": new_status,
    }).eq("id", statement_id).execute()

    return {
        "message": f"Publicados {posted} transacciones" + (f", {skipped} omitidos (sin cuenta asignada)" if skipped > 0 else ""),
        "posted": posted,
        "skipped": skipped,
        "errors": errors[:10],  # Limit to first 10 errors
    }


@router.delete("/bank-statements/{statement_id}")
async def delete_bank_statement(statement_id: str):
    """
    Delete a bank statement AND undo everything it caused, so the bank's
    derived saldo returns to exactly what it was before this statement
    was uploaded.

    For each movement of the statement:
      - If it matched an existing transaction (status='reconciled'), we
        revert that transaction's status back to 'confirmed' and clear
        reconciled_at on BOTH legs of its pair. The transaction itself
        is NOT deleted (it was already in the ledger before this
        statement; it just goes back to "pending reconciliation").
      - If it created a new pair (status='posted'), we delete BOTH legs
        of that pair. The bank-side row disappears, so the bank's
        derived saldo automatically drops back.
      - If it auto-collected an open invoice (target_type='invoice' on
        confirm), we also delete the invoice_payment row, subtract from
        invoice.amount_paid, and bump the invoice's status back from
        'paid'/'partial' to whatever it was before.

    After all that, the bank_statement and its statement_movements are
    deleted (cascade).
    """
    # Fetch the statement first to know which bank it touched
    stmt_row = sb.table("bank_statements").select("*").eq("id", statement_id).execute().data
    if not stmt_row:
        # Already gone — idempotent no-op
        return {"message": "Statement not found (already deleted)", "rolled_back": 0}
    statement = stmt_row[0]

    # Pull all movements of this statement to know what to revert
    movs = (sb.table("statement_movements").select("*")
            .eq("statement_id", statement_id).execute()).data or []

    # statement_movements has FKs to accounting_transactions
    # (transaction_id and matched_transaction_id). Before we can delete any
    # accounting_transactions row that those columns reference, we MUST
    # clear the FK first or Postgres rejects with 23503.
    if movs:
        try:
            sb.table("statement_movements").update({
                "transaction_id": None,
                "matched_transaction_id": None,
            }).eq("statement_id", statement_id).execute()
        except Exception as e:
            logger.warning(f"[delete-statement] could not clear FKs on statement_movements: {e!r}")

    reverted_existing = 0   # matched-with-existing rows that got un-reconciled
    deleted_new_pairs = 0   # new pairs that got fully deleted
    reverted_invoices = 0   # invoices that lost an auto-collected payment
    errors: list[str] = []

    for mv in movs:
        try:
            matched_txn_id = mv.get("matched_transaction_id")
            posted_txn_id = mv.get("transaction_id")

            # Was this an invoice auto-collect? Look for an invoice_payment
            # whose transaction_id is the matched_transaction_id (which we
            # set to the bank leg of the pair we created in reconcile-confirm).
            target_txn_id_for_inv_check = matched_txn_id or posted_txn_id
            if target_txn_id_for_inv_check:
                inv_pay_res = (sb.table("accounting_invoice_payments")
                               .select("*").eq("transaction_id", target_txn_id_for_inv_check)
                               .execute()).data or []
                for pay in inv_pay_res:
                    # Revert the invoice
                    inv_id = pay.get("invoice_id")
                    if inv_id:
                        inv_row = sb.table("accounting_invoices").select("*").eq("id", inv_id).single().execute().data
                        if inv_row:
                            new_paid = max(0.0, float(inv_row.get("amount_paid") or 0) - float(pay.get("amount") or 0))
                            total = float(inv_row.get("total_amount") or 0)
                            if new_paid <= 0.01:
                                new_status = "sent"
                            elif new_paid + 0.01 < total:
                                new_status = "partial"
                            else:
                                new_status = "paid"
                            sb.table("accounting_invoices").update({
                                "amount_paid": new_paid,
                                "status": new_status,
                            }).eq("id", inv_id).execute()
                            reverted_invoices += 1
                    # Delete the payment row itself
                    sb.table("accounting_invoice_payments").delete().eq("id", pay["id"]).execute()

            # Distinguish "matched with a pre-existing transaction"
            # (e.g. Test 1 purchase that this movement reconciled against)
            # from "this statement created a brand new pair" (bank fee
            # classified manually, or invoice auto-collect that created a
            # new payment pair). Source semantics:
            #   - matched_transaction_id is set → was matched at reconcile
            #     step. Could be either a pre-existing txn OR a brand-new
            #     pair created by the invoice-auto-collect path.
            #   - Check the matched row's `source`: if 'bank_statement'
            #     the pair was CREATED by this statement's wizard (delete
            #     it). Otherwise it's a pre-existing txn (un-reconcile).
            #   - If no matched_transaction_id at all, posted_txn_id is a
            #     brand-new pair from a classified-only movement (delete).
            #
            # The previous logic used `matched_txn_id and not posted_txn_id`
            # for the un-reconcile path, but `post_confirmed_movements`
            # always sets transaction_id = matched_transaction_id when
            # publishing, so this check could never fire after publish.
            # Net effect of the old bug: every matched movement was
            # incorrectly treated as a "new pair" and DELETED on rollback.
            target_for_classification = matched_txn_id or posted_txn_id
            target_source = None
            if target_for_classification:
                target_row = sb.table("accounting_transactions") \
                    .select("id, linked_transaction_id, source") \
                    .eq("id", target_for_classification).single().execute().data or {}
                target_source = target_row.get("source")
                linked = target_row.get("linked_transaction_id")
            else:
                target_row = {}
                linked = None

            # Case 1: matched with a PRE-EXISTING transaction (source is
            # not 'bank_statement'). Un-reconcile, do NOT delete.
            if matched_txn_id and target_source != "bank_statement":
                ids_to_unflip = [matched_txn_id]
                if linked:
                    ids_to_unflip.append(linked)
                sb.table("accounting_transactions").update({
                    "status": "confirmed",
                    "reconciled_at": None,
                }).in_("id", ids_to_unflip).execute()
                reverted_existing += 1
                continue

            # Case 2: pair was born from this statement (either an
            # invoice-auto-collect new pair, or a classified-only new
            # pair). Delete it.
            target_txn_id = posted_txn_id or matched_txn_id
            if target_txn_id:
                ids_to_delete = [target_txn_id]
                if linked:
                    ids_to_delete.append(linked)
                sb.table("accounting_transactions").delete().in_("id", ids_to_delete).execute()
                deleted_new_pairs += 1
        except Exception as e:
            errors.append(f"mv={mv.get('id')}: {type(e).__name__}: {str(e)[:120]}")
            logger.error(f"[delete-statement] revert error mv={mv.get('id')}: {e!r}")

    # Now actually delete the statement (cascade removes statement_movements)
    sb.table("bank_statements").delete().eq("id", statement_id).execute()

    _log_audit("bank_statements", statement_id, "delete_with_rollback",
               description=(f"Reverted {reverted_existing} existing-txn reconciliations, "
                            f"deleted {deleted_new_pairs} new pairs, "
                            f"reverted {reverted_invoices} invoice payments"))

    return {
        "message": (f"Estado de cuenta eliminado. Saldo restaurado. "
                    f"Reverti {reverted_existing} conciliaciones, borre {deleted_new_pairs} pares nuevos, "
                    f"reverti {reverted_invoices} cobros de factura."),
        "reverted_existing": reverted_existing,
        "deleted_new_pairs": deleted_new_pairs,
        "reverted_invoices": reverted_invoices,
        "errors": errors[:5],
        "bank_account_id": statement.get("bank_account_id"),
    }


# ============================================================================
# RECEIPTS
# ============================================================================

@router.get("/receipts")
async def list_receipts(transaction_id: Optional[str] = Query(None)):
    """List receipts, optionally filtered by transaction_id."""
    q = sb.table("receipts").select("*")
    if transaction_id:
        q = q.eq("transaction_id", transaction_id)
    result = q.order("created_at", desc=True).execute()
    return result.data or []


@router.post("/receipts")
async def upload_receipt(
    file: UploadFile = File(...),
    transaction_id: str = Form(None),
    vendor_name: str = Form(None),
    amount: float = Form(None),
    receipt_date: str = Form(None),
    description: str = Form(None),
    property_id: str = Form(None),
    notes: str = Form(None),
):
    """Upload a receipt file (image or PDF) attached to a transaction."""
    import uuid as _uuid

    ext = (file.filename or "").rsplit(".", 1)[-1].lower() if file.filename else ""
    allowed = {"jpg", "jpeg", "png", "pdf", "heic", "webp"}
    if ext not in allowed:
        raise HTTPException(status_code=400, detail=f"File type .{ext} not supported. Use: {', '.join(allowed)}")

    file_content = await file.read()
    if len(file_content) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    storage_path = f"receipts/{_uuid.uuid4().hex[:12]}_{file.filename}"
    file_url = None
    try:
        sb.storage.from_("transaction-documents").upload(
            storage_path, file_content,
            {"content-type": file.content_type or "application/octet-stream"}
        )
        file_url = sb.storage.from_("transaction-documents").get_public_url(storage_path)
        if file_url and file_url.endswith("?"):
            file_url = file_url[:-1]
    except Exception as e:
        logger.error(f"[Receipts] Storage upload failed: {e}")
        raise HTTPException(status_code=500, detail="Could not upload file to storage")

    receipt_data = {
        "file_url": file_url,
        "storage_path": storage_path,
        "file_type": ext,
        "original_filename": file.filename or "unknown",
    }
    if transaction_id:
        receipt_data["transaction_id"] = transaction_id
    if vendor_name:
        receipt_data["vendor_name"] = vendor_name
    if amount is not None:
        receipt_data["amount"] = amount
    if receipt_date:
        receipt_data["receipt_date"] = receipt_date
    if description:
        receipt_data["description"] = description
    if property_id:
        receipt_data["property_id"] = property_id
    if notes:
        receipt_data["notes"] = notes

    result = sb.table("receipts").insert(receipt_data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Could not save receipt record")

    return result.data[0]


@router.delete("/receipts/{receipt_id}")
async def delete_receipt(receipt_id: str):
    """Delete a receipt record and its file from storage."""
    # Get the receipt to find storage path
    receipt = sb.table("receipts").select("storage_path").eq("id", receipt_id).execute()
    if not receipt.data:
        raise HTTPException(status_code=404, detail="Receipt not found")

    storage_path = receipt.data[0].get("storage_path")
    if storage_path:
        try:
            sb.storage.from_("transaction-documents").remove([storage_path])
        except Exception as e:
            logger.warning(f"[Receipts] Could not delete file from storage: {e}")

    sb.table("receipts").delete().eq("id", receipt_id).execute()
    return {"message": "Receipt deleted"}


# ============================================================================
# INTERNAL: Extract text and parse movements from bank statement files
# ============================================================================

async def _extract_and_parse_statement(
    file_content: bytes,
    file_type: str,
    account_key: str,
) -> tuple:
    """Extract text from file and parse into structured movements.
    Returns (raw_text, list_of_movements)."""
    import os

    raw_text = ""

    if file_type == "pdf":
        raw_text = _extract_text_from_pdf(file_content)
    elif file_type in ("png", "jpg", "jpeg"):
        raw_text = await _extract_text_from_image(file_content, file_type)
    elif file_type in ("xlsx", "xls"):
        raw_text, _ = _parse_excel_statement(file_content)
    elif file_type == "csv":
        raw_text, _ = _parse_csv_statement(file_content)

    if not raw_text or len(raw_text.strip()) < 50:
        raise ValueError("Could not extract meaningful text from the file")

    # Use GPT-4 to parse the raw text into structured movements
    movements = await _ai_parse_movements(raw_text, account_key)
    return (raw_text, movements)


def _extract_text_from_pdf(file_content: bytes) -> str:
    """Extract text from a PDF file using pypdf or PyPDF2."""
    import io as _io
    try:
        try:
            from pypdf import PdfReader
        except ImportError:
            from PyPDF2 import PdfReader
        reader = PdfReader(_io.BytesIO(file_content))
        pages_text = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                pages_text.append(text)
        return "\n\n".join(pages_text)
    except Exception as e:
        logger.error(f"[BankStmt] PDF extraction error: {e}")
        raise ValueError(f"Could not read PDF: {e}")


async def _extract_text_from_image(file_content: bytes, ext: str) -> str:
    """Use GPT-4 Vision to OCR a bank statement image."""
    import os
    import base64

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not configured")

    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=api_key, timeout=120.0)

    b64 = base64.b64encode(file_content).decode("utf-8")
    mime = f"image/{ext}" if ext in ("png", "jpg", "jpeg") else "image/png"

    response = await client.chat.completions.create(
        # gpt-4o has vision and answers in 3-6s for a 1-page image. gpt-5
        # is a reasoning model that thinks 30-60s even for trivial OCR —
        # not useful here since the only output we want is verbatim text.
        model="gpt-4o",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are an expert OCR system specialized in reading bank statements. "
                    "You understand every US bank's statement layout (Bank of America, Chase, Wells Fargo, "
                    "Citi, Capital One, BBVA, PNC, credit unions, etc.) and can also read statements in Spanish. "
                    "Extract ALL text exactly as it appears, preserving table structure, columns, dates, "
                    "descriptions, and amounts. Do NOT summarize, do NOT skip any transaction. "
                    "Include section headers (e.g., 'Deposits', 'Withdrawals') to help identify transaction types. "
                    "For multi-column layouts, preserve column alignment. For amounts, include the sign (+ or -)."
                ),
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Extract ALL text from this bank statement image. This is a photo or scan of a bank statement. "
                            "Include every single transaction line with date, description, and amount. "
                            "Preserve the structure — if there are separate sections for deposits and withdrawals, "
                            "keep those section headers. Include check numbers, confirmation numbers, and any reference codes."
                        ),
                    },
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}", "detail": "high"}},
                ],
            },
        ],
        max_completion_tokens=4096,
    )

    return response.choices[0].message.content or ""


def _parse_excel_statement(file_content: bytes) -> tuple:
    """Parse an Excel bank statement."""
    try:
        import openpyxl
        import io as _io
        wb = openpyxl.load_workbook(_io.BytesIO(file_content), read_only=True)
        ws = wb.active

        rows_text = []
        movements = []
        for row in ws.iter_rows(values_only=True):
            row_str = " | ".join([str(c) if c is not None else "" for c in row])
            rows_text.append(row_str)

        raw_text = "\n".join(rows_text)

        # Try to auto-detect columns by looking at headers
        # We'll let AI parse it since formats vary
        return (raw_text, [])  # Will be parsed by AI in caller
    except ImportError:
        raise ValueError("openpyxl not installed. Run: pip install openpyxl")
    except Exception as e:
        raise ValueError(f"Could not read Excel file: {e}")


def _parse_csv_statement(file_content: bytes) -> tuple:
    """Parse a CSV bank statement."""
    try:
        text = file_content.decode("utf-8", errors="replace")
        return (text, [])  # Will be parsed by AI
    except Exception as e:
        raise ValueError(f"Could not read CSV file: {e}")


def _coerce_json(content: str):
    """Best-effort parse of an LLM JSON response that may have minor defects.

    Handles: markdown code fences, leading/trailing prose, // and /* */
    comments, and trailing commas before } or ]. Returns the parsed object/list,
    or raises json.JSONDecodeError if it truly can't be salvaged. This is the
    safety net behind OpenAI's json_object mode so a single malformed token
    never sinks a whole statement upload.
    """
    s = (content or "").strip()
    if s.startswith("```"):
        s = re.sub(r'^```(?:json)?\s*', '', s)
        s = re.sub(r'\s*```$', '', s)
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        pass
    # Slice the outermost object or array, then repair common LLM defects.
    candidates = []
    for op, cl in (('{', '}'), ('[', ']')):
        a, b = s.find(op), s.rfind(cl)
        if a != -1 and b != -1 and b > a:
            candidates.append((a, s[a:b + 1]))
    for _, cand in sorted(candidates):
        cand = re.sub(r'//[^\n\r]*', '', cand)
        cand = re.sub(r'/\*.*?\*/', '', cand, flags=re.DOTALL)
        cand = re.sub(r',(\s*[}\]])', r'\1', cand)
        try:
            return json.loads(cand)
        except json.JSONDecodeError:
            continue
    return json.loads(s)  # re-raise the original error for the caller


def _movements_from_parsed(parsed):
    """Normalize a parsed JSON payload into a list of movement dicts, whether
    the model returned a bare array, a {"movements": [...]} wrapper, or a
    single object."""
    if isinstance(parsed, list):
        return parsed
    if isinstance(parsed, dict):
        for key in ("movements", "transactions", "data", "items"):
            val = parsed.get(key)
            if isinstance(val, list):
                return val
        # A single movement object
        if any(k in parsed for k in ("date", "amount", "description")):
            return [parsed]
    return []


async def _ai_parse_movements(raw_text: str, account_key: str) -> list:
    """Use GPT-4 to parse raw bank statement text into structured movements.
    Splits long statements into chunks and processes each separately."""
    import os
    import re

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not configured")

    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=api_key, timeout=120.0)

    # Split long text into chunks of ~6000 chars (enough for ~1 page of transactions)
    chunk_size = 6000
    if len(raw_text) <= chunk_size:
        chunks = [raw_text]
    else:
        # Try to split at page boundaries or double newlines
        chunks = []
        remaining = raw_text
        while remaining:
            if len(remaining) <= chunk_size:
                chunks.append(remaining)
                break
            # Find a good break point
            break_at = remaining.rfind("\n\n", 0, chunk_size)
            if break_at < chunk_size // 2:
                break_at = remaining.rfind("\n", 0, chunk_size)
            if break_at < chunk_size // 2:
                break_at = chunk_size
            chunks.append(remaining[:break_at])
            remaining = remaining[break_at:].lstrip()

    logger.info(f"[BankStmt] Parsing {len(raw_text)} chars in {len(chunks)} chunks")

    all_movements = []
    is_first_chunk = True
    _ai_parse_errors: list[str] = []

    for i, chunk in enumerate(chunks):
        metadata_instruction = ""
        if is_first_chunk:
            metadata_instruction = """
Also extract these metadata fields (include them in the FIRST movement only):
- "bank_name": the bank (e.g., "Bank of America")
- "account_last4": last 4 digits of the account number
- "period_start": statement start date "YYYY-MM-DD"
- "period_end": statement end date "YYYY-MM-DD"
- "beginning_balance": number
- "ending_balance": number"""

        prompt = f"""Parse this bank statement for Maninos Homes LLC ({account_key}).
Output one JSON object PER TRANSACTION with these fields:
- "date": "YYYY-MM-DD"
- "description": the transaction description
- "amount": the amount as a number, signed (negative for withdrawals, positive for deposits)
- "is_credit": true for deposits / money in, false for withdrawals / money out
- "reference": check #, confirmation #, wire TRN (if found)
- "payment_method": "zelle"|"wire"|"check"|"card"|"ach"|"transfer"|"merchant"|"other"
- "counterparty": person/company name (if identifiable)
{metadata_instruction}

RULES:
- One object per transaction row. Each row that has its OWN date and amount is a SEPARATE transaction — NEVER merge distinct transactions into one. Only merge a continuation line that clearly belongs to the SAME transaction (e.g. a wire reference on the next line that has no date/amount of its own).
- Do NOT create an entry for summary or total lines ("Total withdrawals", "Beginning balance", "Ending balance"), column headers, running balances, legal text, ads, or check images.
- Sign of amount: a value written with a leading minus (-1234.56), in parentheses ((1234.56) or ($1,234.56)), in a DEBIT/Withdrawals column, or marked "DR" is a WITHDRAWAL → is_credit=false. A value with no sign, in a CREDIT/Deposits column, or marked "CR" is a DEPOSIT → is_credit=true.
- The sign of "amount" MUST agree with is_credit: a negative number when is_credit=false, a positive number when is_credit=true.
- Strip currency symbols and thousand separators ($ and commas) from the number.
- Normalize any date format to YYYY-MM-DD.

Return a JSON object with a single key "movements" whose value is the array of
transaction objects (e.g. {{"movements": [ {{...}}, {{...}} ]}}). No markdown fences.

BANK STATEMENT TEXT (chunk {i+1}/{len(chunks)}):
{chunk}"""

        chunk_movements: list = []
        try:
            response = await client.chat.completions.create(
                # gpt-4o-mini handles structured extraction from bank
                # statement tables in 2-5s with the same accuracy as the
                # heavier models for this task. gpt-5 added 30+ seconds
                # of "thinking" with no measurable accuracy gain.
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a bank statement parser. Parse any US bank format (BOA, Chase, Wells Fargo, Citi, Capital One, BBVA, PNC, credit unions, etc.) in English or Spanish. Return valid JSON arrays only — no markdown, no commentary."},
                    {"role": "user", "content": prompt},
                ],
                max_completion_tokens=8192,
                temperature=0,
                response_format={"type": "json_object"},
            )

            content = response.choices[0].message.content or ""
            content_stripped = content.strip()
            finish_reason = response.choices[0].finish_reason if response.choices else "?"
            logger.info(
                f"[BankStmt] Chunk {i+1}/{len(chunks)} GPT response: finish={finish_reason} "
                f"content_len={len(content_stripped)} first200={content_stripped[:200]!r}"
            )

            if not content_stripped:
                _ai_parse_errors.append(
                    f"chunk {i+1}: respuesta vacía del modelo (finish_reason={finish_reason})"
                )
                continue

            # Clean markdown code fences
            if content_stripped.startswith("```"):
                content_stripped = re.sub(r'^```(?:json)?\s*', '', content_stripped)
                content_stripped = re.sub(r'\s*```$', '', content_stripped)

            parsed = _coerce_json(content_stripped)
            chunk_movements = _movements_from_parsed(parsed)
            if chunk_movements:
                all_movements.extend(chunk_movements)
                logger.info(f"[BankStmt] Chunk {i+1}: parsed {len(chunk_movements)} movements")
            is_first_chunk = False

        except json.JSONDecodeError as e:
            preview = (content_stripped or "")[:300]
            logger.warning(f"[BankStmt] Chunk {i+1} JSON error: {e} :: response was {preview!r}")
            _ai_parse_errors.append(
                f"chunk {i+1}: respuesta del modelo no era JSON válido ({str(e)[:80]}); empezaba con {preview[:80]!r}"
            )
            continue
        except Exception as e:
            logger.warning(f"[BankStmt] Chunk {i+1} error: {e!r}")
            _ai_parse_errors.append(f"chunk {i+1}: {type(e).__name__}: {str(e)[:160]}")
            continue

    if not all_movements:
        # Surface the underlying AI failure so we know whether it's an
        # OpenAI quota issue, a finish_reason=length truncation, a JSON
        # parse failure, etc. — instead of pretending the statement is bad.
        if _ai_parse_errors:
            raise RuntimeError("AI parser falló: " + " | ".join(_ai_parse_errors[:3]))
        return []

    # Deduplicate by (date, amount, description[:50])
    seen = set()
    unique = []
    for mv in all_movements:
        key = (mv.get("date", ""), mv.get("amount", 0), mv.get("description", "")[:50])
        if key not in seen:
            seen.add(key)
            unique.append(mv)

    logger.info(f"[BankStmt] Total: {len(all_movements)} raw → {len(unique)} unique movements")
    return unique


async def _ai_classify_movements(
    movements: list,
    accounts_reference: str,
    accounts_list: list,
    corrections_reference: str = "",
) -> list:
    """Use GPT-4 to suggest accounting accounts for a batch of movements."""
    import os

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not configured")

    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=api_key, timeout=120.0)

    movements_lines = []
    for i, mv in enumerate(movements):
        line = f"{i+1}. [{mv['movement_date']}] {mv.get('description','')} | ${mv['amount']} | {mv.get('counterparty','')}"
        # Add matched transaction context for reconciled movements
        if mv.get("_matched_txn_description"):
            line += f" | RECONCILED with app transaction: \"{mv['_matched_txn_description']}\""
        movements_lines.append(line)
    movements_text = "\n".join(movements_lines)

    prompt = f"""You are the staff accountant for Maninos Homes LLC, a company that buys, renovates, and sells mobile homes in Texas (yards in Conroe, Houston, and Dallas).

YOUR TASK: Classify each bank movement below into the correct account from our QuickBooks Chart of Accounts.

CRITICAL: The Chart of Accounts below is the ONLY source of truth. You MUST use ONLY account codes that exist in this chart. Do NOT invent codes. Every movement MUST get an account_code — never leave it empty.

BUSINESS CONTEXT (use this to pick the right account):
- We buy mobile homes cheap, renovate them, and resell them.
- We have TWO companies: Maninos Homes LLC (operations) and Maninos Capital LLC (financing/investors).
- We sell houses in two ways:
  1. CONTADO (cash sale) — buyer pays Homes directly. Classify as House Sales (Income).
  2. RTO (Rent-to-Own) — buyer makes a down payment (enganche) + monthly payments. Maninos Capital finances the deal and pays Homes the remaining balance. "RTO" always means Rent-to-Own.
- "ENGANCHE" means down payment from a buyer. It is INCOME (House Sales).
- "PAGO TOTAL" means full cash payment for a house. It is INCOME (House Sales).
- "INTERNAL TRANSFER - MANINOS CAPITAL - RTO" = Capital paying Homes for an RTO sale. This is INCOME for Homes (House Sales or similar), NOT a balance sheet transfer. Capital is paying Homes the sale price minus the enganche.
- Renovation materials (lumber, plumbing, paint, flooring, drywall, electrical supplies from Home Depot, Lowes, Sherwin Williams, Menards, Harbor Freight, etc.) are COST OF GOODS SOLD — direct costs of the product we sell.
- "WIRE OUT - VANDERBILT", "WIRE OUT - 21ST MORTGAGE", "PURCHASE WIRE" = buying a mobile home from a seller/lender. These are COST OF GOODS SOLD (house purchases).
- "COMISION" = commission payment to a salesperson. Operating expense (Commissions & fees).
- Bank fees, insurance, phone, internet, fuel, office supplies are operating expenses.
- "PURCHASE HOUSE - ZELLE" with small amounts ($10) = minor transaction fees, classify as operating expense or bank fees.

CHART OF ACCOUNTS (QuickBooks — source of truth):
{accounts_reference}

{f"HUMAN CORRECTIONS (these override the chart when there is a conflict — follow these patterns):{chr(10)}{corrections_reference}{chr(10)}" if corrections_reference else ""}BANK MOVEMENTS TO CLASSIFY:
{movements_text}

PROPERTY TRACKING: If a movement clearly relates to a specific property (house purchase, renovation materials, move, sale), include a "property_code" field with the house code (e.g., "H1", "B5", "DFW3"). Look for property codes, addresses, or serial numbers in the description. If unsure, omit the field.

Return a JSON array with EXACTLY {len(movements)} objects (one per movement, in same order):
[{{"account_code":"exact code from chart","account_name":"account name","transaction_type":"descriptive_type","confidence":0.9,"reasoning":"one line explaining why","property_code":"H1 or omit if unknown"}}]

Remember: ONLY use account codes from the chart above. If you cannot find a perfect match, use the closest one."""

    try:
        response = await client.chat.completions.create(
            # Same reasoning as the parser model swap above — pick a
            # speed-optimized model for the mechanical mapping of
            # movement → account_code.
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are an expert staff accountant for Maninos Homes LLC. Return ONLY a valid JSON array. Every movement MUST have an account_code that exists in the QuickBooks Chart of Accounts provided — that chart is the single source of truth. Never invent account codes. Never return empty account_code."},
                {"role": "user", "content": prompt},
            ],
            max_completion_tokens=8192,
            temperature=0,
        )
    except Exception as api_err:
        logger.error(f"[AI Classify] OpenAI API error: {api_err}")
        return [{"account_code": "", "confidence": 0, "reasoning": f"OpenAI error: {str(api_err)[:100]}"}] * len(movements)

    content = response.choices[0].message.content or "[]"
    finish_reason = response.choices[0].finish_reason
    content = content.strip()
    logger.info(f"[AI Classify] GPT response: finish_reason={finish_reason}, content_len={len(content)}, first_100={content[:100]}")

    import re
    if content.startswith("```"):
        content = re.sub(r'^```(?:json)?\s*', '', content)
        content = re.sub(r'\s*```$', '', content)

    try:
        suggestions = json.loads(content)
        if not isinstance(suggestions, list):
            suggestions = [suggestions]
        logger.info(f"[AI Classify] Parsed {len(suggestions)} suggestions for {len(movements)} movements")
        # Pad or trim to match movements count
        while len(suggestions) < len(movements):
            suggestions.append({"account_code": "", "confidence": 0, "reasoning": "AI did not classify"})
        return suggestions[:len(movements)]
    except json.JSONDecodeError as je:
        logger.error(f"[AI Classify] JSON parse error: {je}. Content: {content[:200]}")
        return [{"account_code": "", "confidence": 0, "reasoning": f"AI parse error: {str(je)[:50]}"}] * len(movements)
