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


class InvoicePaymentCreate(BaseModel):
    invoice_id: str
    amount: float
    payment_date: Optional[str] = None
    payment_method: Optional[str] = None
    payment_reference: Optional[str] = None
    notes: Optional[str] = None


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
    total_sales_income = 0
    sales_by_type = {"contado": 0, "rto": 0}
    for sale in sales:
        if sale.get("status") in ("paid", "completed", "rto_approved", "rto_active"):
            amount = float(sale.get("sale_price") or 0)
            total_sales_income += amount
            st = sale.get("sale_type", "contado")
            sales_by_type[st] = sales_by_type.get(st, 0) + amount

    total_purchases = sum(float(p.get("purchase_price") or 0) for p in properties if p.get("purchase_price"))
    total_renovations = sum(float(r.get("total_cost") or 0) for r in renovations)
    total_commissions = sum(float(s.get("commission_amount") or 0) for s in sales)

    manual_income = sum(float(t["amount"]) for t in transactions if t["is_income"])
    manual_expense = sum(float(t["amount"]) for t in transactions if not t["is_income"])

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

    # ---- Cash flow (12 months) ----
    cash_flow = []
    for i in range(12):
        m = now.month - i
        y = now.year
        while m < 1:
            m += 12
            y -= 1
        ym = f"{y:04d}-{m:02d}"
        mi = sum(float(s.get("sale_price") or 0) for s in sales
                 if s.get("created_at", "")[:7] == ym and s.get("status") in ("paid", "completed", "rto_approved", "rto_active"))
        me = sum(float(p.get("purchase_price") or 0) for p in properties if p.get("created_at", "")[:7] == ym)
        for t in transactions:
            if t.get("transaction_date", "")[:7] == ym:
                if t["is_income"]:
                    mi += float(t["amount"])
                else:
                    me += float(t["amount"])
        cash_flow.append({"month": ym, "label": f"{m:02d}/{y}", "income": mi, "expense": me, "net": mi - me})
    cash_flow.reverse()

    # ---- Bank balances ----
    bank_accounts = []
    try:
        bank_accounts = (sb.table("bank_accounts").select("*").eq("is_active", True).execute()).data or []
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
    yard_id: Optional[str] = None,
    property_id: Optional[str] = None,
    is_income: Optional[bool] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    search: Optional[str] = None,
    status: Optional[str] = None,
):
    q = sb.table("accounting_transactions") \
        .select("*, accounting_accounts(code, name, account_type, category), bank_accounts(name, bank_name)") \
        .order("transaction_date", desc=True) \
        .order("created_at", desc=True)
    if transaction_type:
        q = q.eq("transaction_type", transaction_type)
    if account_id:
        q = q.eq("account_id", account_id)
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

    insert_data = {
        "transaction_number": txn_number, "transaction_date": data.transaction_date,
        "transaction_type": data.transaction_type, "amount": data.amount,
        "is_income": data.is_income, "account_id": account_id,
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

    _log_audit("accounting_transactions", result.data[0]["id"], "create",
               description=f"Created {txn_number}: ${data.amount}")
    return result.data[0]


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
    category: Optional[str] = None
    parent_account_id: Optional[str] = None
    is_header: Optional[bool] = None
    description: Optional[str] = None
    current_balance: Optional[float] = None


@router.get("/accounts")
async def list_accounts():
    result = sb.table("accounting_accounts").select("*").eq("is_active", True).order("display_order, code").execute()
    return {"accounts": result.data or []}


@router.get("/accounts/tree")
async def get_accounts_tree(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
):
    """Get full hierarchical chart of accounts with computed balances from transactions."""
    try:
        accounts = (sb.table("accounting_accounts").select("*")
                    .eq("is_active", True).order("display_order, code").execute()).data or []
    except Exception:
        # Fallback if display_order column doesn't exist yet
        accounts = (sb.table("accounting_accounts").select("*")
                    .eq("is_active", True).order("code").execute()).data or []

    # Compute balances from transactions
    balances = {}
    try:
        q = sb.table("accounting_transactions").select("account_id, amount, is_income").neq("status", "voided")
        if start_date:
            q = q.gte("transaction_date", start_date)
        if end_date:
            q = q.lte("transaction_date", end_date)
        txns = (q.execute()).data or []
        for t in txns:
            aid = t.get("account_id")
            if aid:
                amt = float(t["amount"])
                if aid not in balances:
                    balances[aid] = 0
                # Income/Revenue: credit (+), Expenses/COGS: debit (+)
                if t["is_income"]:
                    balances[aid] += amt
                else:
                    balances[aid] += amt
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

    accounts = sb.table("accounting_accounts").select("*").eq("is_active", True).order("code").execute()
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
    for acc in (accounts.data or []):
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
    result = sb.table("bank_accounts").select("*").eq("is_active", True).order("is_primary", desc=True).execute()
    return {"bank_accounts": result.data or []}


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
    _log_audit("accounting_invoices", result.data[0]["id"], "create",
               description=f"Created invoice {inv_number}")
    return result.data[0]


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

    # Also create a transaction for this payment
    is_income = invoice["direction"] == "receivable"
    txn_data = {
        "transaction_number": _generate_transaction_number(),
        "transaction_date": data.payment_date or date.today().isoformat(),
        "transaction_type": "sale_cash" if is_income else "other_expense",
        "amount": data.amount,
        "is_income": is_income,
        "entity_type": "invoice",
        "entity_id": invoice_id,
        "property_id": invoice.get("property_id"),
        "yard_id": invoice.get("yard_id"),
        "payment_method": data.payment_method,
        "payment_reference": data.payment_reference,
        "counterparty_name": invoice.get("counterparty_name"),
        "description": f"Pago {'recibido' if is_income else 'realizado'}: {invoice.get('invoice_number', '')}",
        "status": "confirmed",
    }
    txn_data = {k: v for k, v in txn_data.items() if v is not None}
    txn_result = sb.table("accounting_transactions").insert(txn_data).execute()

    # Link transaction
    if txn_result.data and pay_result.data:
        sb.table("accounting_invoice_payments").update({
            "transaction_id": txn_result.data[0]["id"]
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
    """Compare budgeted amounts vs actual spending per account per month."""
    target_year = year or date.today().year

    # Get budgets
    bq = sb.table("accounting_budgets") \
        .select("*, accounting_accounts(code, name, account_type, category)") \
        .eq("period_year", target_year)
    if yard_id:
        bq = bq.eq("yard_id", yard_id)
    budgets = (bq.execute()).data or []

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

    # Build comparison
    comparison = []
    for b in budgets:
        aid = b["account_id"]
        m = b["period_month"]
        actual = actuals.get(f"{aid}:{m}", 0)
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

    # Fetch all accounts
    try:
        accounts = (sb.table("accounting_accounts").select("*")
                    .eq("is_active", True).order("display_order, code").execute()).data or []
    except Exception:
        accounts = (sb.table("accounting_accounts").select("*")
                    .eq("is_active", True).order("code").execute()).data or []

    # Compute balances from transactions in period
    balances = {}
    try:
        q = sb.table("accounting_transactions").select("account_id, amount, is_income") \
            .neq("status", "voided") \
            .gte("transaction_date", sd).lte("transaction_date", ed)
        if yard_id:
            q = q.eq("yard_id", yard_id)
        txns = (q.execute()).data or []
        for t in txns:
            aid = t.get("account_id")
            if aid:
                balances[aid] = balances.get(aid, 0) + float(t["amount"])
    except Exception as e:
        logger.warning(f"[income-statement] Error fetching transactions: {e}")

    # Build trees for each P&L section
    income_tree = _build_report_tree(accounts, balances, ["PL_INCOME"])
    cogs_tree = _build_report_tree(accounts, balances, ["PL_COGS"])
    expenses_tree = _build_report_tree(accounts, balances, ["PL_EXPENSES"])
    other_expenses_tree = _build_report_tree(accounts, balances, ["PL_OTHER_EXPENSES"])

    total_income = sum(n["total"] for n in income_tree)
    total_cogs = sum(n["total"] for n in cogs_tree)
    gross_profit = total_income - total_cogs
    total_expenses = sum(n["total"] for n in expenses_tree)
    total_other_expenses = sum(n["total"] for n in other_expenses_tree)
    net_operating_income = gross_profit - total_expenses
    net_other_income = -total_other_expenses
    net_income = net_operating_income + net_other_income

    return {
        "format": "quickbooks",
        "period": {"start": sd, "end": ed},
        "sections": {
            "income": income_tree,
            "cost_of_goods_sold": cogs_tree,
            "gross_profit": gross_profit,
            "expenses": expenses_tree,
            "total_expenses": total_expenses,
            "net_operating_income": net_operating_income,
            "other_expenses": other_expenses_tree,
            "total_other_expenses": total_other_expenses,
            "net_other_income": net_other_income,
            "net_income": net_income,
        },
    }


@router.get("/reports/balance-sheet")
async def get_balance_sheet(as_of_date: Optional[str] = None, yard_id: Optional[str] = None):
    """QuickBooks-style hierarchical Balance Sheet (Balance General)."""
    as_of = as_of_date or date.today().isoformat()

    # Fetch all accounts
    try:
        accounts = (sb.table("accounting_accounts").select("*")
                    .eq("is_active", True).order("display_order, code").execute()).data or []
    except Exception:
        accounts = (sb.table("accounting_accounts").select("*")
                    .eq("is_active", True).order("code").execute()).data or []

    # Compute cumulative balances from ALL transactions up to as_of_date
    balances = {}
    try:
        q = sb.table("accounting_transactions").select("account_id, amount, is_income") \
            .neq("status", "voided") \
            .lte("transaction_date", as_of)
        if yard_id:
            q = q.eq("yard_id", yard_id)
        txns = (q.execute()).data or []
        for t in txns:
            aid = t.get("account_id")
            if aid:
                amt = float(t["amount"])
                # For assets: debits increase; for liabilities/equity: credits increase
                if t["is_income"]:
                    balances[aid] = balances.get(aid, 0) + amt
                else:
                    balances[aid] = balances.get(aid, 0) + amt
    except Exception as e:
        logger.warning(f"[balance-sheet] Error fetching transactions: {e}")

    # Build trees
    assets_tree = _build_report_tree(accounts, balances, ["BS_ASSETS"])
    liabilities_tree = _build_report_tree(accounts, balances, ["BS_LIABILITIES"])
    equity_tree = _build_report_tree(accounts, balances, ["BS_EQUITY"])

    total_assets = sum(n["total"] for n in assets_tree)
    total_liabilities = sum(n["total"] for n in liabilities_tree)
    total_equity = sum(n["total"] for n in equity_tree)

    # Add Net Income line to equity (calculated from P&L accounts)
    net_income = 0
    try:
        ytd_start = date(date.today().year, 1, 1).isoformat()
        income_accts = [a["id"] for a in accounts if a["account_type"] == "income"]
        expense_accts = [a["id"] for a in accounts if a["account_type"] in ("expense", "cogs")]
        for t in txns:
            aid = t.get("account_id")
            if not aid:
                continue
            amt = float(t["amount"])
            if aid in income_accts:
                net_income += amt
            elif aid in expense_accts:
                net_income -= amt
    except Exception:
        pass

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

    txns = (sb.table("accounting_transactions")
            .select("*, accounting_accounts(account_type, category)")
            .gte("transaction_date", sd).lte("transaction_date", ed)
            .neq("status", "voided").execute()).data or []

    sales = (sb.table("sales")
             .select("sale_price, sale_type, status, created_at")
             .gte("created_at", sd).lte("created_at", ed + "T23:59:59").execute()).data or []
    props = (sb.table("properties")
             .select("purchase_price, created_at")
             .gte("created_at", sd).lte("created_at", ed + "T23:59:59").execute()).data or []

    # OPERATING
    operating_in = sum(float(s.get("sale_price") or 0) for s in sales
                       if s.get("status") in ("paid", "completed", "rto_approved", "rto_active"))
    operating_in += sum(float(t["amount"]) for t in txns
                        if t["is_income"] and t.get("transaction_type") not in ("bank_transfer",))
    operating_out = sum(float(t["amount"]) for t in txns
                        if not t["is_income"] and t.get("transaction_type") not in
                        ("purchase_house", "bank_transfer"))
    operating_net = operating_in - operating_out

    # INVESTING (property purchases)
    investing_out = sum(float(p.get("purchase_price") or 0) for p in props if p.get("purchase_price"))
    investing_net = -investing_out

    # FINANCING (bank transfers, loans)
    financing = sum(float(t["amount"]) * (1 if t["is_income"] else -1) for t in txns
                    if t.get("transaction_type") == "bank_transfer")

    net_change = operating_net + investing_net + financing

    return {
        "period": {"start": sd, "end": ed},
        "operating_activities": {"inflows": operating_in, "outflows": operating_out, "net": operating_net},
        "investing_activities": {"property_purchases": investing_out, "net": investing_net},
        "financing_activities": {"net": financing},
        "net_change_in_cash": net_change,
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
        cat = acc.get("category", txn.get("transaction_type", "other"))
        acc_name = acc.get("name", cat)
        amount = float(txn["amount"])
        target = income_categories if txn["is_income"] else expense_categories
        if cat not in target:
            target[cat] = {"name": acc_name, "total": 0, "count": 0}
        target[cat]["total"] += amount
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

    income = sum(float(t["amount"]) for t in transactions if t["is_income"])
    expenses = sum(float(t["amount"]) for t in transactions if not t["is_income"])

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


@router.post("/bank-statements/upload")
async def upload_bank_statement(
    file: UploadFile = File(...),
    bank_account_id: str = Form(None),
    account_key: str = Form(None),
):
    """Upload a bank statement file (PDF, PNG, JPG, Excel, CSV).
    Stores the file and immediately starts AI-powered parsing.
    Accepts bank_account_id (preferred) or account_key (legacy)."""

    # Resolve the bank account
    account_label = "Unknown Account"
    resolved_account_key = account_key or "unknown"

    if bank_account_id:
        # Look up bank account from DB
        ba = sb.table("bank_accounts").select("id, name, bank_name").eq("id", bank_account_id).execute()
        if not ba.data:
            raise HTTPException(status_code=400, detail="Bank account not found")
        account_label = ba.data[0]["name"]
        resolved_account_key = ba.data[0]["name"].lower().replace(" ", "_")
    elif not account_key:
        raise HTTPException(status_code=400, detail="Either bank_account_id or account_key is required")

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

    # Create DB record
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

    # Extract text + parse movements
    try:
        raw_text, movements = await _extract_and_parse_statement(file_content, ext, account_key)

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

        # Update statement status
        sb.table("bank_statements").update({
            "status": "parsed",
            "total_movements": len(movements),
            "bank_name": movements[0].get("bank_name") if movements else None,
            "account_number_last4": movements[0].get("account_last4") if movements else None,
        }).eq("id", statement_id).execute()

        # Refresh statement from DB
        stmt_refresh = sb.table("bank_statements").select("*").eq("id", statement_id).execute()
        mvs = sb.table("statement_movements").select("*").eq("statement_id", statement_id).order("sort_order").execute()

        return {
            "statement": stmt_refresh.data[0] if stmt_refresh.data else statement,
            "movements": mvs.data or [],
            "message": f"Parsed {len(movements)} movements from statement",
        }

    except Exception as e:
        logger.error(f"[BankStmt] Parse error: {e}")
        sb.table("bank_statements").update({
            "status": "error",
            "error_message": str(e)[:500],
        }).eq("id", statement_id).execute()
        raise HTTPException(status_code=500, detail=f"Error parsing statement: {str(e)}")


@router.post("/bank-statements/{statement_id}/classify")
async def classify_statement_movements(statement_id: str):
    """Use AI to suggest accounting accounts for each movement."""
    # Get statement + movements
    stmt = sb.table("bank_statements").select("*").eq("id", statement_id).execute()
    if not stmt.data:
        raise HTTPException(status_code=404, detail="Statement not found")

    movements = (sb.table("statement_movements")
                 .select("*").eq("statement_id", statement_id)
                 .in_("status", ["pending", "suggested"])
                 .order("sort_order").execute())

    if not movements.data:
        return {"message": "No movements to classify", "classified": 0}

    # Get chart of accounts for AI context
    accounts = sb.table("accounting_accounts").select("id, code, name, account_type, category, is_header").eq("is_active", True).order("display_order").execute()
    accounts_list = [a for a in (accounts.data or []) if not a.get("is_header")]

    # Build accounts reference for the AI
    accounts_ref = "\n".join([
        f"- {a['code']}: {a['name']} (type={a['account_type']}, cat={a.get('category','')})"
        for a in accounts_list
    ])

    # Classify in batches
    classified = 0
    batch_size = 20
    mvs = movements.data

    for batch_start in range(0, len(mvs), batch_size):
        batch = mvs[batch_start:batch_start + batch_size]
        suggestions = await _ai_classify_movements(batch, accounts_ref, accounts_list)

        for mv, suggestion in zip(batch, suggestions):
            update_data = {
                "suggested_account_code": suggestion.get("account_code"),
                "suggested_account_name": suggestion.get("account_name"),
                "suggested_transaction_type": suggestion.get("transaction_type"),
                "ai_confidence": suggestion.get("confidence", 0.5),
                "ai_reasoning": suggestion.get("reasoning", ""),
                "needs_subcategory": suggestion.get("needs_subcategory", False),
                "status": "suggested",
            }
            # Try to find account ID
            if suggestion.get("account_code"):
                acct_match = sb.table("accounting_accounts").select("id").eq("code", suggestion["account_code"]).execute()
                if acct_match.data:
                    update_data["suggested_account_id"] = acct_match.data[0]["id"]

            sb.table("statement_movements").update(update_data).eq("id", mv["id"]).execute()
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


@router.post("/bank-statements/{statement_id}/post")
async def post_confirmed_movements(statement_id: str):
    """Create accounting transactions from confirmed movements."""
    stmt = sb.table("bank_statements").select("*").eq("id", statement_id).execute()
    if not stmt.data:
        raise HTTPException(status_code=404, detail="Statement not found")
    statement = stmt.data[0]

    # Get confirmed movements that haven't been posted yet
    movements = (sb.table("statement_movements")
                 .select("*")
                 .eq("statement_id", statement_id)
                 .eq("status", "confirmed")
                 .order("sort_order").execute())

    if not movements.data:
        return {"message": "No confirmed movements to post", "posted": 0}

    posted = 0
    for mv in movements.data:
        account_id = mv.get("final_account_id") or mv.get("suggested_account_id")
        txn_type = mv.get("final_transaction_type") or mv.get("suggested_transaction_type") or "adjustment"

        if not account_id:
            continue

        txn_data = {
            "transaction_number": _generate_transaction_number(),
            "transaction_date": mv["movement_date"],
            "transaction_type": txn_type,
            "amount": abs(float(mv["amount"])),
            "is_income": mv["is_credit"],
            "account_id": account_id,
            "payment_method": mv.get("payment_method"),
            "payment_reference": mv.get("reference"),
            "counterparty_name": mv.get("counterparty"),
            "description": mv.get("description", "")[:500],
            "notes": f"Importado de estado de cuenta: {statement.get('account_label', '')} - {statement.get('original_filename', '')}",
            "status": "confirmed",
        }
        txn_data = {k: v for k, v in txn_data.items() if v is not None}

        try:
            txn_result = sb.table("accounting_transactions").insert(txn_data).execute()
            if txn_result.data:
                # Update movement as posted
                sb.table("statement_movements").update({
                    "status": "posted",
                    "transaction_id": txn_result.data[0]["id"],
                }).eq("id", mv["id"]).execute()
                posted += 1
        except Exception as e:
            logger.warning(f"[BankStmt] Failed to post movement {mv['id']}: {e}")

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

    return {"message": f"Posted {posted} transactions", "posted": posted}


@router.delete("/bank-statements/{statement_id}")
async def delete_bank_statement(statement_id: str):
    """Delete a bank statement and all its movements."""
    # Movements cascade-delete via FK
    sb.table("bank_statements").delete().eq("id", statement_id).execute()
    return {"message": "Statement deleted"}


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

    from openai import OpenAI
    client = OpenAI(api_key=api_key)

    b64 = base64.b64encode(file_content).decode("utf-8")
    mime = f"image/{ext}" if ext in ("png", "jpg", "jpeg") else "image/png"

    response = client.chat.completions.create(
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
        max_tokens=4096,
        temperature=0.0,
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


async def _ai_parse_movements(raw_text: str, account_key: str) -> list:
    """Use GPT-4 to parse raw bank statement text into structured movements.
    Splits long statements into chunks and processes each separately."""
    import os
    import re

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not configured")

    from openai import OpenAI
    client = OpenAI(api_key=api_key)

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

        prompt = f"""You are parsing a bank statement for Maninos Homes LLC ({account_key}).

Extract EVERY financial movement/transaction from this bank statement text chunk.

For EACH movement, return a JSON object with these fields:
- "date": string in "YYYY-MM-DD" format
- "description": the full description of the transaction (combine multi-line descriptions)
- "amount": number (POSITIVE for deposits/credits, NEGATIVE for withdrawals/debits)
- "is_credit": boolean (true for deposits/money in, false for withdrawals/money out)
- "reference": confirmation number, check number, wire TRN, etc. (if found)
- "payment_method": one of "zelle", "wire", "check", "card", "ach", "transfer", "merchant", "other"
- "counterparty": the name of the person/company involved (if identifiable)
{metadata_instruction}

RULES:
- Include ALL movements, don't skip any
- Amounts for withdrawals/debits MUST be NEGATIVE
- Amounts for deposits/credits MUST be POSITIVE
- Skip summary lines, totals, running balance columns, headers, legal/regulatory text, ads — only extract actual transactions
- If a section says "continued on the next page" or similar, just extract what's on this chunk

BANK STATEMENT FORMAT INTELLIGENCE:
Different banks format statements differently. You must adapt to ANY format:
- **Date formats**: MM/DD/YY, MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD, "Dec 01, 2025", "01 Dec 25", etc. Always output "YYYY-MM-DD".
- **Amount formats**: Some banks show positive amounts with a minus sign for debits (-1,500.00). Some use parentheses for debits (1,500.00). Some have separate Debit/Credit columns. Some show all amounts positive and indicate direction with a D/C code or separate sections. Always normalize to signed numbers.
- **Section layouts**: Bank of America uses "Deposits and other credits" / "Withdrawals and other debits" sections. Chase uses a single chronological list with +/- amounts. Wells Fargo uses "Additions" / "Subtractions". Citi uses "Credits" / "Debits". Capital One uses a running ledger. Adapt to whatever layout you see.
- **Multi-line transactions**: Wire transfers, ACH payments, and card transactions often span 2-3 lines. Merge them into one description.
- **Transaction types to detect**: Zelle, wire transfer (in/out), ACH/direct deposit, check (with #), debit card purchase, credit card refund, merchant services, online transfer, mobile deposit, service fee, interest, overdraft fee, ATM.
- **Running balance column**: Some statements show a running balance after each transaction — do NOT include that as a separate movement.
- **Check images / daily balances**: Skip these sections entirely.

Return ONLY a valid JSON array. No other text, no markdown fences.

BANK STATEMENT TEXT (chunk {i+1}/{len(chunks)}):
{chunk}"""

        try:
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are an expert bank statement parser with deep knowledge of every US bank's statement format "
                            "(Bank of America, Chase, Wells Fargo, Citi, Capital One, BBVA, PNC, TD Bank, US Bank, Regions, "
                            "credit unions, etc.). You can parse statements in English or Spanish. "
                            "You understand that bank statements come in wildly different formats: some use tables, some use "
                            "running text, some separate debits/credits into sections, some use a single chronological list. "
                            "You always return valid JSON arrays. Never wrap output in markdown code fences. "
                            "You never skip transactions and never confuse running balances with transaction amounts."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                max_tokens=8192,
                temperature=0.0,
            )

            content = response.choices[0].message.content or "[]"
            content = content.strip()

            # Clean markdown code fences
            if content.startswith("```"):
                content = re.sub(r'^```(?:json)?\s*', '', content)
                content = re.sub(r'\s*```$', '', content)

            chunk_movements = json.loads(content)
            if isinstance(chunk_movements, dict):
                chunk_movements = [chunk_movements]
            if isinstance(chunk_movements, list):
                all_movements.extend(chunk_movements)
                logger.info(f"[BankStmt] Chunk {i+1}: parsed {len(chunk_movements)} movements")
            is_first_chunk = False

        except json.JSONDecodeError as e:
            logger.warning(f"[BankStmt] Chunk {i+1} JSON error: {e}")
            # Continue with other chunks instead of failing
            continue
        except Exception as e:
            logger.warning(f"[BankStmt] Chunk {i+1} error: {e}")
            continue

    if not all_movements:
        raise ValueError("Could not parse any movements from the statement")

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
) -> list:
    """Use GPT-4 to suggest accounting accounts for a batch of movements."""
    import os

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not configured")

    from openai import OpenAI
    client = OpenAI(api_key=api_key)

    movements_text = "\n".join([
        f"{i+1}. [{mv['movement_date']}] {mv.get('description','')} | ${mv['amount']} | {mv.get('counterparty','')}"
        for i, mv in enumerate(movements)
    ])

    prompt = f"""You are an expert accountant for Maninos Homes LLC, a mobile home sales company in Texas.

For each bank movement below, suggest the most appropriate accounting account from our Chart of Accounts.

CHART OF ACCOUNTS:
{accounts_reference}

CONTEXT about Maninos Homes:
- They buy, renovate, and sell mobile homes (manufactured homes)
- Locations: Conroe, Houston, Dallas
- Common expenses: house purchases, renovations, moving/transport, commissions, yard rent, insurance, marketing
- Common income: house sales (cash), RTO sales to Capital, client deposits
- They use Zelle extensively for payments
- Wire transfers are often for house purchases from counties (Brazoria County, Liberty County)
- "Movida" = moving a mobile home to a new location
- "Comisión" = sales commission to an employee
- "Semana" / "Quincena" = weekly/biweekly employee payment

MOVEMENTS TO CLASSIFY:
{movements_text}

For EACH movement (numbered), respond with a JSON array of objects:
{{
  "account_code": "the best matching account code from the chart",
  "account_name": "account name",
  "transaction_type": one of ["sale_cash", "sale_rto_capital", "deposit_received", "other_income", "purchase_house", "renovation", "moving_transport", "commission", "operating_expense", "other_expense", "bank_transfer", "adjustment"],
  "confidence": 0.0-1.0 (how confident you are),
  "reasoning": "brief explanation of why this account was chosen",
  "needs_subcategory": true/false (if more detail is needed from the accountant)
}}

Return ONLY the JSON array with one object per movement in order. No other text."""

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "You are an expert accountant. Always return valid JSON arrays."},
            {"role": "user", "content": prompt},
        ],
        max_tokens=4096,
        temperature=0.1,
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
        # Pad or trim to match movements count
        while len(suggestions) < len(movements):
            suggestions.append({"account_code": "", "confidence": 0, "reasoning": "AI did not classify"})
        return suggestions[:len(movements)]
    except json.JSONDecodeError:
        return [{"account_code": "", "confidence": 0, "reasoning": "AI parse error"}] * len(movements)
