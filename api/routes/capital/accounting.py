"""
Capital Accounting — Financial management for Maninos Capital LLC.

Features:
  - Dashboard: P&L overview, cash flow, KPIs
  - Transactions journal (auto + manual)
  - Financial Statements (Income Statement, Balance Sheet, Cash Flow)
  - Chart of Accounts (Capital-specific, user-provided)
  - Sync from existing capital_flows / rto_payments / investments
  - Export CSV
"""

import csv
import io
import logging
from datetime import date, datetime, timedelta
from calendar import monthrange
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query
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
        record = {
            "code": data.code,
            "name": data.name,
            "account_type": data.account_type,
            "category": data.category,
            "parent_account_id": data.parent_account_id,
            "is_header": data.is_header,
            "description": data.description,
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

