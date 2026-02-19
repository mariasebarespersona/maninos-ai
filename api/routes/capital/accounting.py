"""
Capital Accounting — Financial management for Maninos Capital LLC.

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
from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Form
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

    # ---- Bank Accounts ----
    bank_accounts = []
    total_bank_balance = 0
    total_cash_on_hand = 0
    try:
        bank_accounts = sb.table("capital_bank_accounts") \
            .select("*") \
            .eq("is_active", True) \
            .order("is_primary", desc=True) \
            .execute().data or []
        total_bank_balance = sum(float(b.get("current_balance", 0)) for b in bank_accounts
                                 if b.get("account_type") != "cash")
        total_cash_on_hand = sum(float(b.get("current_balance", 0)) for b in bank_accounts
                                  if b.get("account_type") == "cash")
    except Exception as e:
        logger.warning(f"[capital-accounting] Could not fetch bank accounts: {e}")

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
):
    """List capital transactions with filters and pagination."""
    try:
        q = sb.table("capital_transactions") \
            .select("*, capital_accounts(code, name), capital_bank_accounts(name, bank_name)") \
            .neq("status", "voided") \
            .order("transaction_date", desc=True)

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


@router.post("/transactions")
async def create_transaction(data: TransactionCreate):
    """Create a manual capital transaction."""
    try:
        record = {
            "transaction_date": data.transaction_date,
            "transaction_type": data.transaction_type,
            "amount": data.amount,
            "is_income": data.is_income,
            "account_id": data.account_id,
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
        return {"ok": True, "transaction": result.data[0] if result.data else None}
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
    """Void (soft-delete) a transaction."""
    try:
        result = sb.table("capital_transactions") \
            .update({"status": "voided"}) \
            .eq("id", transaction_id) \
            .execute()
        return {"ok": True, "message": "Transaction voided"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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


# ============================================================================
# BANK ACCOUNTS & CASH
# ============================================================================

@router.get("/bank-accounts")
async def list_bank_accounts(include_inactive: bool = False):
    """List Capital bank and cash accounts."""
    try:
        q = sb.table("capital_bank_accounts").select("*")
        if not include_inactive:
            q = q.eq("is_active", True)
        result = q.order("is_primary", desc=True).order("name").execute()
        banks = result.data or []
        total_balance = sum(float(b.get("current_balance", 0)) for b in banks)
        bank_balance = sum(float(b.get("current_balance", 0)) for b in banks
                           if b.get("account_type") not in ("cash",))
        cash_on_hand = sum(float(b.get("current_balance", 0)) for b in banks
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
    """Create a new bank/cash account for Capital."""
    try:
        record = {k: v for k, v in data.model_dump().items() if v is not None}
        result = sb.table("capital_bank_accounts").insert(record).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Error creating bank account")
        return {"ok": True, "bank_account": result.data[0]}
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

        src_balance = float(source.get("current_balance", 0))
        tgt_balance = float(target.get("current_balance", 0))

        # Update balances
        sb.table("capital_bank_accounts") \
            .update({"current_balance": round(src_balance - amount, 2)}) \
            .eq("id", bank_id).execute()
        sb.table("capital_bank_accounts") \
            .update({"current_balance": round(tgt_balance + amount, 2)}) \
            .eq("id", target_id).execute()

        # Record two transactions (outgoing + incoming)
        base_txn = {
            "transaction_date": date.today().isoformat(),
            "transaction_type": "transfer",
            "amount": amount,
            "status": "confirmed",
            "created_by": "admin",
            "payment_method": "bank_transfer",
        }
        sb.table("capital_transactions").insert({
            **base_txn,
            "bank_account_id": bank_id,
            "is_income": False,
            "description": f"Transferencia a {target['name']}: {description}",
            "counterparty_name": target["name"],
        }).execute()
        sb.table("capital_transactions").insert({
            **base_txn,
            "bank_account_id": target_id,
            "is_income": True,
            "description": f"Transferencia desde {source['name']}: {description}",
            "counterparty_name": source["name"],
        }).execute()

        return {
            "ok": True,
            "message": f"Transferencia de ${amount:,.2f} completada",
            "source_balance": round(src_balance - amount, 2),
            "target_balance": round(tgt_balance + amount, 2),
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
    """
    imported = 0

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
                "status": "confirmed",
                "created_by": "auto-sync",
            }
            record = {k: v for k, v in record.items() if v is not None}
            sb.table("capital_transactions").insert(record).execute()
            imported += 1

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
                "status": "confirmed",
                "created_by": "auto-sync",
            }
            record = {k: v for k, v in record.items() if v is not None}
            sb.table("capital_transactions").insert(record).execute()
            imported += 1

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
                    "status": "confirmed",
                    "created_by": "auto-sync",
                }
                fee_record = {k: v for k, v in fee_record.items() if v is not None}
                sb.table("capital_transactions").insert(fee_record).execute()
                imported += 1

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
                    "notes": tag,
                    "status": "confirmed",
                    "created_by": "auto-sync",
                }
                record = {k: v for k, v in record.items() if v is not None}
                sb.table("capital_transactions").insert(record).execute()
                imported += 1
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
                    "notes": tag,
                    "status": "confirmed",
                    "created_by": "auto-sync",
                }
                record = {k: v for k, v in record.items() if v is not None}
                sb.table("capital_transactions").insert(record).execute()
                imported += 1
        except Exception as pn_err:
            logger.warning(f"Could not sync promissory note payments: {pn_err}")

    except Exception as e:
        logger.error(f"Error syncing capital transactions: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    return {"ok": True, "imported": imported, "message": f"{imported} transacciones importadas"}


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
    """Save a snapshot of the current Balance Sheet or P&L for Capital."""
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
        else:
            raise HTTPException(status_code=400, detail="report_type must be 'balance_sheet' or 'profit_loss'")

        record = {k: v for k, v in record.items() if v is not None}
        result = sb.table("saved_financial_statements").insert(record).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Error saving statement")

        return {"ok": True, "statement": result.data[0], "message": f"Estado financiero '{data.name}' guardado exitosamente"}

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
                    "net_income, notes, saved_by, status, created_at") \
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

    # Extract text + parse movements (reuse Homes helpers)
    try:
        from routes.accounting import _extract_and_parse_statement
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
        classify_message = ""
        try:
            logger.info(f"[CapitalBankStmt] Auto-classifying {len(movements)} movements...")
            sb.table("capital_bank_statements").update({"status": "classifying"}).eq("id", statement_id).execute()
            classify_result = await classify_capital_statement(statement_id)
            classify_message = f" → AI classified {classify_result.get('classified', 0)} movements"
            logger.info(f"[CapitalBankStmt] Auto-classify done: {classify_message}")
        except Exception as ce:
            logger.warning(f"[CapitalBankStmt] Auto-classify failed (will require manual): {ce}")
            sb.table("capital_bank_statements").update({"status": "parsed"}).eq("id", statement_id).execute()
            classify_message = " → Auto-clasificación falló, usa el botón 'Clasificar con IA'"

        # Refresh
        stmt_refresh = sb.table("capital_bank_statements").select("*").eq("id", statement_id).execute()
        mvs = sb.table("capital_statement_movements").select("*").eq("statement_id", statement_id).order("sort_order").execute()

        return {
            "statement": stmt_refresh.data[0] if stmt_refresh.data else statement,
            "movements": mvs.data or [],
            "message": f"Parsed {len(movements)} movements from statement{classify_message}",
        }

    except Exception as e:
        logger.error(f"[CapitalBankStmt] Parse error: {e}")
        sb.table("capital_bank_statements").update({
            "status": "error",
            "error_message": str(e)[:500],
        }).eq("id", statement_id).execute()
        raise HTTPException(status_code=500, detail=f"Error parsing statement: {str(e)}")


@router.post("/bank-statements/{statement_id}/classify")
async def classify_capital_statement(statement_id: str):
    """Use AI to suggest accounting accounts for each Capital statement movement."""
    stmt = sb.table("capital_bank_statements").select("*").eq("id", statement_id).execute()
    if not stmt.data:
        raise HTTPException(status_code=404, detail="Statement not found")

    movements = (sb.table("capital_statement_movements")
                 .select("*").eq("statement_id", statement_id)
                 .in_("status", ["pending", "suggested"])
                 .order("sort_order").execute())

    if not movements.data:
        return {"message": "No movements to classify", "classified": 0}

    # Get Capital chart of accounts for AI context
    accounts = sb.table("capital_accounts") \
        .select("id, code, name, account_type, category, is_header") \
        .eq("is_active", True) \
        .order("display_order").execute()
    accounts_list = [a for a in (accounts.data or []) if not a.get("is_header")]

    accounts_ref = "\n".join([
        f"- {a['code']}: {a['name']} (type={a['account_type']}, cat={a.get('category', '')})"
        for a in accounts_list
    ])

    # Classify in batches
    classified = 0
    batch_size = 20
    mvs = movements.data

    for batch_start in range(0, len(mvs), batch_size):
        batch = mvs[batch_start:batch_start + batch_size]
        suggestions = await _ai_classify_capital_movements(batch, accounts_ref, accounts_list)

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
    allowed = {"final_account_id", "final_transaction_type", "final_notes", "status"}
    update = {k: v for k, v in data.items() if k in allowed and v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    result = sb.table("capital_statement_movements").update(update).eq("id", movement_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Movement not found")
    return result.data[0]


@router.post("/bank-statements/{statement_id}/post")
async def post_capital_statement(statement_id: str):
    """Create Capital accounting transactions from confirmed movements."""
    stmt = sb.table("capital_bank_statements").select("*").eq("id", statement_id).execute()
    if not stmt.data:
        raise HTTPException(status_code=404, detail="Statement not found")
    statement = stmt.data[0]

    movements = (sb.table("capital_statement_movements")
                 .select("*")
                 .eq("statement_id", statement_id)
                 .eq("status", "confirmed")
                 .order("sort_order").execute())

    if not movements.data:
        return {"message": "No hay movimientos confirmados para publicar.", "posted": 0, "skipped": 0, "errors": []}

    posted = 0
    skipped = 0
    errors = []
    for mv in movements.data:
        account_id = mv.get("final_account_id") or mv.get("suggested_account_id")
        txn_type = mv.get("final_transaction_type") or mv.get("suggested_transaction_type") or "adjustment"

        if not account_id:
            skipped += 1
            desc = mv.get("description", "")[:60]
            errors.append(f"'{desc}' — sin cuenta contable asignada")
            continue

        txn_data = {
            "transaction_date": mv["movement_date"],
            "transaction_type": txn_type if txn_type in (
                'rto_payment', 'down_payment', 'late_fee', 'acquisition',
                'investor_deposit', 'investor_return', 'commission', 'insurance',
                'tax', 'operating_expense', 'transfer', 'adjustment',
                'other_income', 'other_expense'
            ) else "adjustment",
            "amount": abs(float(mv["amount"])),
            "is_income": mv["is_credit"],
            "account_id": account_id,
            "bank_account_id": statement.get("bank_account_id"),
            "payment_method": mv.get("payment_method"),
            "payment_reference": mv.get("reference"),
            "counterparty_name": mv.get("counterparty"),
            "description": mv.get("description", "")[:500],
            "notes": f"Importado de estado de cuenta: {statement.get('account_label', '')} - {statement.get('original_filename', '')}",
            "status": "confirmed",
            "created_by": "bank-import",
        }
        txn_data = {k: v for k, v in txn_data.items() if v is not None}

        try:
            txn_result = sb.table("capital_transactions").insert(txn_data).execute()
            if txn_result.data:
                sb.table("capital_statement_movements").update({
                    "status": "posted",
                    "transaction_id": txn_result.data[0]["id"],
                }).eq("id", mv["id"]).execute()
                posted += 1
            else:
                skipped += 1
                errors.append(f"'{mv.get('description', '')[:60]}' — error al insertar")
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
        "message": f"Publicados {posted} transacciones" + (f", {skipped} omitidos" if skipped > 0 else ""),
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
# AI CLASSIFICATION HELPER (for Capital context)
# ============================================================================

async def _ai_classify_capital_movements(
    movements: list,
    accounts_reference: str,
    accounts_list: list,
) -> list:
    """Use GPT-4 to suggest accounting accounts for Capital bank movements."""
    import os

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not configured")

    from openai import OpenAI
    client = OpenAI(api_key=api_key)

    movements_text = "\n".join([
        f"{i+1}. [{mv['movement_date']}] {mv.get('description', '')} | ${mv['amount']} | {mv.get('counterparty', '')}"
        for i, mv in enumerate(movements)
    ])

    prompt = f"""You are an expert accountant for Maninos Capital LLC, a mobile home rent-to-own (RTO) financing company in Texas.

For each bank movement below, suggest the most appropriate accounting account from our Chart of Accounts.

IMPORTANT RULES:
- For INCOME movements (deposits/credits), classify to INCOME accounts (codes 4xxxx, 7xxxx).
- For EXPENSE movements (withdrawals/debits), classify to EXPENSE accounts (codes 6xxxx, 71xxx).
- For balance-sheet related items (loans, transfers), use the appropriate asset/liability account.
- Use EXACT account codes from the chart below. Do NOT invent codes.

CHART OF ACCOUNTS:
{accounts_reference}

CONTEXT about Maninos Capital:
- They finance mobile homes through rent-to-own (RTO) contracts
- Main income: interest earned on RTO loans, down payments
- They have investors who lend money (VALTO, SGZ entities)
- Common expenses: consulting services, legal fees, office expenses, commissions, interest paid to investors
- Related parties: Maninos Homes, SGZ, La Agustedad
- Banks: Bank of America, BOA Capital 9197, PNC, Monex Bank
- They use Zelle extensively for payments

MOVEMENTS TO CLASSIFY:
{movements_text}

For EACH movement (numbered), respond with a JSON array of objects:
{{
  "account_code": "the EXACT account code",
  "account_name": "account name",
  "transaction_type": one of ["rto_payment", "down_payment", "late_fee", "investor_deposit", "investor_return", "commission", "operating_expense", "other_income", "other_expense", "transfer", "adjustment"],
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation",
  "needs_subcategory": true/false
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
    except json.JSONDecodeError:
        logger.error(f"[CapitalClassify] Invalid JSON response: {content[:500]}")
        suggestions = [{"account_code": "", "account_name": "", "transaction_type": "adjustment",
                        "confidence": 0, "reasoning": "Error parsing AI response"}] * len(movements)

    # Ensure we have one suggestion per movement
    while len(suggestions) < len(movements):
        suggestions.append({"account_code": "", "account_name": "", "transaction_type": "adjustment",
                            "confidence": 0, "reasoning": "No suggestion"})

    return suggestions[:len(movements)]

