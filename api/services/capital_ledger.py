"""
Capital-side ledger configuration.

Same double-entry engine as Homes (api/services/ledger.py), pointed at
Capital's tables: capital_transactions / capital_accounts /
capital_bank_accounts.

Differences from Homes, encoded in CAPITAL_CONFIG:
  - Chart codes are NUMERIC QuickBooks codes ('12000' = A/R) — Homes uses
    account names. Seeded by migrations 042 + 097.
  - created_by is free TEXT (no users FK).
  - No per-property inventory sub-accounts, no yard_id column.
  - Derived bank balances exclude pending_confirmation/draft rows — a
    Capital pair only counts once approved in Notificaciones.

Usage:

    from api.services.capital_ledger import post_to_capital_ledger

    bank_leg, income_leg = post_to_capital_ledger(
        event_type="rto_payment_received",
        amount=850,
        date="2026-07-01",
        bank_account_id=capital_bank_uuid,
        counterparty_name="Juan Pérez",
        entity_type="rto_payment",
        entity_id=rto_payment_uuid,
        extra_fields={"rto_contract_id": contract_uuid, "client_id": client_uuid},
    )
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from api.services.ledger import (
    BANK,
    EventSpec,
    LedgerConfig,
    get_all_bank_balances as _get_all_bank_balances,
    get_bank_balance as _get_bank_balance,
    post_to_ledger as _post_to_ledger,
)

logger = logging.getLogger(__name__)

# Chart codes (capital_accounts.code — numeric QuickBooks codes).
# SOURCE OF TRUTH: Maninos_Capital_Model_Account_List_updated.xlsx (migration 107).
#   12000  Accounts Receivable (A/R)
#   12100  Rents Receivable
#   13010  Properties:Mobile Homes (RTO property asset — was 14300)
#   20000  Accounts Payable A/P (was 21000)
#   20100  Accrued Expenses (accrued-interest payable — was 23950)
#   21000  Deferred Rents        21100  Downpayment (liability, unused in cash-basis)
#   23000  Debt Securities (parent) — investor notes live in per-investor children 23001..
#   34000  Opening balance equity
#   41000  Rent Income (RTO)
#   42000  Operating Income:Sales (RTO enganche, cash-basis)
#   60100  Commissions & fees
#   65010  Bank fees & service charges (was 60600)
#   70000  OTHER INCOME          71000  Other Business Expenses
#   71400  Interest paid         72200  OTHER INCOME:Late Payment Fee (mora — was 43000)
#
# Investor notes are NO LONGER a single 23900 account. Each investor/pagaré has
# its OWN child account under 23000 Debt Securities. The investor_deposit /
# investor_return events resolve that account at post time and pass it via
# debit/credit_account_id_override — the spec code below is only a safe fallback.
INVESTOR_NOTES_PARENT = "23000"   # Debt Securities (header); children are per-investor

CAPITAL_EVENT_REGISTRY: dict[str, EventSpec] = {
    # ---- Inbound (cash enters a Capital bank) ------------------------------
    "rto_payment_received": EventSpec(
        debit=BANK,
        credit="41000",
        transaction_type="rto_payment",
        is_income_on_bank_side=True,
        description_template="Pago RTO {concept}: {counterparty}",
    ),
    "down_payment_received": EventSpec(
        debit=BANK,
        credit="42000",
        transaction_type="down_payment",
        is_income_on_bank_side=True,
        description_template="Enganche RTO {address}: {counterparty}",
    ),
    "late_fee_received": EventSpec(
        debit=BANK,
        credit="72200",   # OTHER INCOME:Late Payment Fee (source of truth)
        transaction_type="late_fee",
        is_income_on_bank_side=True,
        description_template="Cargo por mora: {counterparty}",
    ),
    "investor_deposit_received": EventSpec(
        debit=BANK,
        # Per-investor child under 23000 Debt Securities; the route passes
        # credit_account_id_override to the specific investor account. 23000
        # (header) is only a safe fallback if the override is ever missing.
        credit=INVESTOR_NOTES_PARENT,
        transaction_type="investor_deposit",
        is_income_on_bank_side=True,
        description_template="Depósito inversionista: {counterparty}",
    ),
    "manual_income_received": EventSpec(
        debit=BANK,
        credit="__caller__",
        transaction_type="other_income",
        is_income_on_bank_side=True,
        description_template="Ingreso: {concept}",
    ),
    "invoice_paid_in": EventSpec(
        debit=BANK,
        credit="12000",
        transaction_type="invoice_ar",
        is_income_on_bank_side=True,
        description_template="Cobro factura {invoice_number}: {counterparty}",
    ),
    # ---- Outbound (cash leaves a Capital bank) -----------------------------
    "investor_return_paid": EventSpec(
        # Per-investor child under 23000; route passes debit_account_id_override.
        debit=INVESTOR_NOTES_PARENT,
        credit=BANK,
        transaction_type="investor_return",
        is_income_on_bank_side=False,
        description_template="Retorno a inversionista: {counterparty}",
    ),
    "investor_interest_paid": EventSpec(
        debit="71400",
        credit=BANK,
        # Keep the DB-allowed 'investor_return' type (the constraint has no
        # 'investor_interest'); interest is separated by its ACCOUNT (71400),
        # which is what drives the P&L, balance sheet and reconciliation.
        transaction_type="investor_return",
        is_income_on_bank_side=False,
        description_template="Interés a inversionista: {counterparty}",
    ),
    # ---- Accrual-basis interest (no bank) ----------------------------------
    "interest_accrued": EventSpec(
        debit="71400",              # Interest expense recognized over time
        credit="20100",             # Accrued Expenses (accrued-interest payable)
        transaction_type="adjustment",   # DB-allowed; distinguished by account 20100
        is_income_on_bank_side=False,
        description_template="Interés devengado: {counterparty}",
        requires_bank=False,
    ),
    "interest_settled": EventSpec(
        debit="20100",              # settle the accrued liability
        credit=BANK,                # cash leaves the bank
        transaction_type="investor_return",   # DB-allowed; distinguished by account 20100
        is_income_on_bank_side=False,
        description_template="Pago interés devengado: {counterparty}",
    ),
    "acquisition_paid": EventSpec(
        debit="13010",              # Properties:Mobile Homes (source of truth)
        credit=BANK,
        transaction_type="acquisition",
        is_income_on_bank_side=False,
        description_template="Adquisición propiedad {address}: {counterparty}",
    ),
    "commission_paid": EventSpec(
        debit="60100",
        credit=BANK,
        transaction_type="commission",
        is_income_on_bank_side=False,
        description_template="Comisión: {counterparty}",
    ),
    "bank_fee_paid": EventSpec(
        debit="65010",   # General business expenses:Bank fees & service charges
        credit=BANK,
        transaction_type="bank_fee",
        is_income_on_bank_side=False,
        description_template="Cargo bancario: {concept}",
    ),
    "manual_expense_paid": EventSpec(
        debit="__caller__",
        credit=BANK,
        transaction_type="other_expense",
        is_income_on_bank_side=False,
        description_template="Gasto: {concept}",
    ),
    "invoice_paid_out": EventSpec(
        debit="20000",   # Accounts Payable A/P (source of truth)
        credit=BANK,
        transaction_type="invoice_ap",
        is_income_on_bank_side=False,
        description_template="Pago factura {invoice_number}: {counterparty}",
    ),
    # ---- Cashless / no-bank-side -------------------------------------------
    "invoice_issued_ar": EventSpec(
        debit="12000",
        credit="__caller__",   # income account; defaults to 41000 (RTO Rental Income)
        transaction_type="invoice_ar",
        is_income_on_bank_side=False,
        description_template="Factura emitida {invoice_number}: {counterparty}",
        requires_bank=False,
    ),
    "invoice_received_ap": EventSpec(
        debit="__caller__",    # expense account chosen by caller
        credit="20000",   # Accounts Payable A/P (source of truth)
        transaction_type="invoice_ap",
        is_income_on_bank_side=False,
        description_template="Factura recibida {invoice_number}: {counterparty}",
        requires_bank=False,
    ),
    # ---- Internal ----------------------------------------------------------
    "bank_transfer": EventSpec(
        debit=BANK,            # bank_to
        credit=BANK,           # bank_from — caller passes both as kwargs
        transaction_type="bank_transfer",
        is_income_on_bank_side=False,
        description_template="Transferencia: {concept}",
    ),
    "opening_balance": EventSpec(
        debit=BANK,
        credit="34000",
        transaction_type="opening_balance",
        is_income_on_bank_side=True,
        description_template="Saldo de apertura: {concept}",
    ),
}


CAPITAL_CONFIG = LedgerConfig(
    transactions_table="capital_transactions",
    accounts_table="capital_accounts",
    banks_table="capital_bank_accounts",
    registry=CAPITAL_EVENT_REGISTRY,
    default_ar_income_code="41000",
    created_by_is_user_fk=False,
    property_subaccount_routing=False,
    supports_yard=False,
    balance_excluded_statuses=("voided", "pending_confirmation", "draft"),
)

# Default posting accounts for caller-chosen legs when the route has nothing
# better (keeps auto-flows working even without explicit classification).
DEFAULT_EXPENSE_CODE = "69000"   # Uncategorized Expense (source of truth leaf)
DEFAULT_INCOME_CODE = "49000"    # Uncategorized Income (source of truth leaf)


def post_to_capital_ledger(event_type: str, amount: float, **kwargs: Any) -> tuple[str, str]:
    """post_to_ledger against Capital's tables. Same signature/guarantees."""
    kwargs["config"] = CAPITAL_CONFIG
    return _post_to_ledger(event_type, amount, **kwargs)


def resolve_investor_note_account_id(
    investor_id: Optional[str] = None,
    note_id: Optional[str] = None,
    *,
    db: Any = None,
) -> Optional[str]:
    """Return capital_accounts.id of the investor's / pagaré's own Debt Securities
    child account (child of 23000). Resolves via `chart_account_code` stored on
    promissory_notes / investors (populated by the WS7 data-fix and by new-note
    creation). Returns None if the investor isn't linked yet — callers then fall
    back to the 23000 header from the EventSpec."""
    if db is None:
        from tools.supabase_client import sb
        db = sb
    code = None
    try:
        if note_id:
            r = db.table("promissory_notes").select("chart_account_code").eq("id", note_id).limit(1).execute()
            code = (r.data[0].get("chart_account_code") if r.data else None)
        if not code and investor_id:
            r = db.table("investors").select("chart_account_code").eq("id", investor_id).limit(1).execute()
            code = (r.data[0].get("chart_account_code") if r.data else None)
        if not code:
            return None
        a = db.table("capital_accounts").select("id").eq("code", code).limit(1).execute()
        return a.data[0]["id"] if a.data else None
    except Exception as e:
        logger.warning(f"resolve_investor_note_account_id failed (investor={investor_id}, note={note_id}): {e}")
        return None


def ensure_investor_note_account(
    investor_name: str,
    *,
    investor_id: Optional[str] = None,
    note_id: Optional[str] = None,
    db: Any = None,
) -> Optional[str]:
    """Controlled creation of a per-investor Debt Securities child account under
    23000 — the ONLY sanctioned way to add a Capital account outside migration
    107. Uses the next free 23xxx code, names it 'Debt Securities:<NAME>', links
    it back onto promissory_notes/investors.chart_account_code, and returns the
    code. Never invents accounts elsewhere in the tree."""
    if db is None:
        from tools.supabase_client import sb
        db = sb
    try:
        parent = db.table("capital_accounts").select("id").eq("code", INVESTOR_NOTES_PARENT).limit(1).execute()
        parent_id = parent.data[0]["id"] if parent.data else None
        existing = (
            db.table("capital_accounts").select("code")
            .gte("code", "23001").lte("code", "23999").execute().data or []
        )
        used = {c["code"] for c in existing}
        next_code = None
        for n in range(23001, 24000):
            if str(n) not in used:
                next_code = str(n)
                break
        if not next_code:
            logger.error("ensure_investor_note_account: no free 23xxx code left")
            return None
        row = {
            "code": next_code,
            "name": (investor_name or "Investor").strip(),
            "account_type": "liability",
            "category": "investor_debt",
            "subtype": "Long Term Liabilities",
            "detail_type": "Notes Payable",
            "normal_balance": "credit",
            "report_section": "balance_sheet",
            "statement_group": "Balance General - Pasivo No Circulante",
            "is_header": False,
            "is_active": True,
            "parent_account_id": parent_id,
            "description": f"Pagaré / nota de inversionista: {investor_name}.",
        }
        db.table("capital_accounts").insert(row).execute()
        if note_id:
            db.table("promissory_notes").update({"chart_account_code": next_code}).eq("id", note_id).execute()
        if investor_id:
            db.table("investors").update({"chart_account_code": next_code}).eq("id", investor_id).execute()
        logger.info(f"ensure_investor_note_account created {next_code} for {investor_name}")
        return next_code
    except Exception as e:
        logger.error(f"ensure_investor_note_account failed for {investor_name}: {e}")
        return None


def get_capital_bank_balance(bank_account_id: str, *, as_of: Optional[str] = None, db: Any = None) -> float:
    return _get_bank_balance(bank_account_id, as_of=as_of, db=db, config=CAPITAL_CONFIG)


def get_all_capital_bank_balances(*, db: Any = None) -> dict[str, float]:
    return _get_all_bank_balances(db=db, config=CAPITAL_CONFIG)
