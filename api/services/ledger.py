"""
Unified accounting ledger writer for Maninos (Homes + Capital).

The ONLY function any other code should call to create accounting rows is
`post_to_ledger`. This guarantees:

  - Every money-movement event lands as a balanced double-entry pair in
    the entity's transactions table (linked via `linked_transaction_id`).
  - The chart account (`account_id`) and bank (`bank_account_id`) are filled
    consistently — never NULL on rows that should have them.
  - Descriptions are produced by a single template per event type, so the
    text shown in "Transacciones" matches what shows in "Por Conciliar".
  - Bank-side postings resolve to the correct QuickBooks chart account via
    `<banks_table>.accounting_account_id` (see migration 089 / 061).

The module is parameterized by `LedgerConfig`: Homes (default) writes to
accounting_transactions / accounting_accounts / bank_accounts; Capital
(see api/services/capital_ledger.py) writes to capital_transactions /
capital_accounts / capital_bank_accounts with its own event registry.
Calling `post_to_ledger` without a config keeps the exact pre-refactor
Homes behavior.

This module does NOT update `bank_accounts.current_balance` — balances are
DERIVED on read via get_bank_balance / get_all_bank_balances.

Usage:

    from api.services.ledger import post_to_ledger

    pnl_id, bank_id = post_to_ledger(
        event_type="property_purchase_paid",
        amount=25000,
        bank_account_id=bank_uuid,
        date="2026-05-20",
        counterparty_name="John Seller",
        entity_type="property",
        entity_id=property_uuid,
        description_data={"address": "123 Test St"},
        payment_method="transferencia",
        payment_reference="WIRE-12345",
        created_by="abigail@maninos.com",
    )
"""
from __future__ import annotations

import logging
import re
import threading
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Optional

_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE)

logger = logging.getLogger(__name__)


def _persist_created_by(db, value: Optional[str]) -> Optional[str]:
    """accounting_transactions.created_by is a UUID FK → users(id). Two ways
    a value can fail the INSERT:
      1) Not a UUID at all (e.g. 'staff', 'e2e-test') → Postgres 22P02
      2) UUID but the user doesn't exist → Postgres 23503 (FK violation)
    Either way we drop the value rather than fail the whole ledger pair.
    Human-readable attribution lives in counterparty_name / notes / description.
    """
    if not value or not isinstance(value, str) or not _UUID_RE.match(value):
        return None
    try:
        res = db.table("users").select("id").eq("id", value).limit(1).execute()
        if res.data:
            return value
    except Exception:
        pass
    return None


# ---------------------------------------------------------------------------
# Event registry
# ---------------------------------------------------------------------------
#
# Each event spec describes a balanced double-entry pair:
#   - debit: which account is debited (chart code or the literal "bank")
#   - credit: which account is credited (chart code or the literal "bank")
#   - transaction_type: stored on both rows (CHECK constraint enforced)
#   - is_income_on_bank_side: True if money lands in our bank; used to set
#       is_income correctly on whichever leg is the bank leg.
#   - description: f-string template called with description_data kwargs.
#   - requires_bank: False for purely internal entries (AR, AP, COGS) that
#       have no cash leg.
#
# When `debit == "bank"` or `credit == "bank"`, the bank's chart account is
# resolved at post time via `<banks_table>.accounting_account_id`.

BANK = "bank"


@dataclass(frozen=True)
class EventSpec:
    debit: str
    credit: str
    transaction_type: str
    is_income_on_bank_side: bool
    description_template: str
    requires_bank: bool = True


#
# IMPORTANT: the `code` column on accounting_accounts in this production
# database holds the QuickBooks account NAME (e.g. "Inventory",
# "House Sales", "Accounts Payable (A/P)"), not a numeric code. That's how
# the chart of accounts got imported via the app's "Mapear Cuentas" flow.
# Migration 028 declares the numeric codes (11000, 40000, ...) but the
# live DB never used those — it's the names. The registry below uses the
# live names so post_to_ledger can resolve them. If the chart is ever
# re-seeded with numeric codes, update this table accordingly.
# (Capital's chart DOES use numeric codes — see capital_ledger.py.)

EVENT_REGISTRY: dict[str, EventSpec] = {
    # ---- Outbound (cash leaves a bank) -----------------------------------
    "property_purchase_paid": EventSpec(
        debit="Inventory",
        credit=BANK,
        transaction_type="purchase_house",
        is_income_on_bank_side=False,
        description_template="Compra propiedad: {address} — Pago a {counterparty}",
    ),
    "renovation_paid": EventSpec(
        debit="Supplies & materials",
        credit=BANK,
        transaction_type="renovation",
        is_income_on_bank_side=False,
        description_template="Renovación {address}: {concept}",
    ),
    "moving_transport_paid": EventSpec(
        debit="Other Contractors",
        credit=BANK,
        transaction_type="moving_transport",
        is_income_on_bank_side=False,
        description_template="Movida casa {address}: {counterparty}",
    ),
    "commission_paid": EventSpec(
        debit="Commissions & fees",
        credit=BANK,
        transaction_type="commission",
        is_income_on_bank_side=False,
        description_template="Comisión venta {address}: {counterparty}",
    ),
    "invoice_paid_out": EventSpec(
        debit="Accounts Payable (A/P)",
        credit=BANK,
        transaction_type="invoice_ap",
        is_income_on_bank_side=False,
        description_template="Pago factura {invoice_number}: {counterparty}",
    ),
    "bank_fee_paid": EventSpec(
        debit="Bank fees & service charges",
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
    # ---- Inbound (cash enters a bank) ------------------------------------
    "sale_contado_received": EventSpec(
        debit=BANK,
        credit="House Sales",
        transaction_type="sale_cash",
        is_income_on_bank_side=True,
        description_template="Venta contado {address}: {counterparty}",
    ),
    "sale_down_payment_received": EventSpec(
        debit=BANK,
        credit="House Sales",
        transaction_type="sale_cash",
        is_income_on_bank_side=True,
        description_template="Enganche venta {address}: {counterparty}",
    ),
    "sale_remaining_received": EventSpec(
        debit=BANK,
        credit="House Sales",
        transaction_type="sale_cash",
        is_income_on_bank_side=True,
        description_template="Resto venta {address}: {counterparty}",
    ),
    "invoice_paid_in": EventSpec(
        debit=BANK,
        credit="Accounts receivable (A/R)",
        transaction_type="invoice_ar",
        is_income_on_bank_side=True,
        description_template="Cobro factura {invoice_number}: {counterparty}",
    ),
    "manual_income_received": EventSpec(
        debit=BANK,
        credit="__caller__",
        transaction_type="other_income",
        is_income_on_bank_side=True,
        description_template="Ingreso: {concept}",
    ),
    # ---- Cashless / no-bank-side -----------------------------------------
    "invoice_issued_ar": EventSpec(
        debit="Accounts receivable (A/R)",
        credit="__caller__",   # income account chosen by caller (defaults per config)
        transaction_type="invoice_ar",
        is_income_on_bank_side=False,
        description_template="Factura emitida {invoice_number}: {counterparty}",
        requires_bank=False,
    ),
    "invoice_received_ap": EventSpec(
        debit="__caller__",
        credit="Accounts Payable (A/P)",
        transaction_type="invoice_ap",
        is_income_on_bank_side=False,
        description_template="Factura recibida {invoice_number}: {counterparty}",
        requires_bank=False,
    ),
    "sale_contado_cogs": EventSpec(
        debit="House Sales - COGS",
        credit="Inventory",
        transaction_type="cogs",
        is_income_on_bank_side=False,
        description_template="COGS venta {address}",
        requires_bank=False,
    ),
    # ---- Internal cash movement ------------------------------------------
    "bank_transfer": EventSpec(
        debit=BANK,              # bank_to
        credit=BANK,             # bank_from — caller passes both as kwargs
        transaction_type="bank_transfer",
        is_income_on_bank_side=False,  # neutral; logic handled specially
        description_template="Transferencia: {concept}",
    ),
}


# ---------------------------------------------------------------------------
# Entity configuration — Homes (default) vs Capital
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class LedgerConfig:
    transactions_table: str
    accounts_table: str
    banks_table: str
    registry: dict[str, EventSpec] = field(default_factory=dict)
    # Default income account for invoice_issued_ar when the caller omits one.
    default_ar_income_code: Optional[str] = None
    # Homes: created_by is a UUID FK → users(id) and must be validated.
    # Capital: created_by is free TEXT — persist as given.
    created_by_is_user_fk: bool = True
    # Homes-only: route capitalized costs to per-property sub-accounts.
    property_subaccount_routing: bool = True
    # Homes' transactions table has yard_id; Capital's doesn't.
    supports_yard: bool = True
    # Statuses excluded from derived bank balances.
    balance_excluded_statuses: tuple = ("voided",)


HOMES_CONFIG = LedgerConfig(
    transactions_table="accounting_transactions",
    accounts_table="accounting_accounts",
    banks_table="bank_accounts",
    registry=EVENT_REGISTRY,
    default_ar_income_code="House Sales",
    created_by_is_user_fk=True,
    property_subaccount_routing=True,
    supports_yard=True,
    balance_excluded_statuses=("voided",),
)


# ---------------------------------------------------------------------------
# Lookup helpers (with tiny in-process cache — these tables are tiny)
# ---------------------------------------------------------------------------
# Caches are keyed by (table, key) so Homes and Capital never collide.
_lock = threading.Lock()
_account_by_code_cache: dict[tuple[str, str], str] = {}   # (accounts_table, code) -> id
_bank_chart_cache: dict[tuple[str, str], str] = {}         # (banks_table, bank_id) -> chart_account_id
_account_type_cache: dict[tuple[str, str], str] = {}       # (accounts_table, account_id) -> account_type


def _get_account_type_by_id(db, account_id: str, accounts_table: str) -> str:
    """Return the account_type of a chart account (cached)."""
    if not account_id:
        return ""
    key = (accounts_table, account_id)
    with _lock:
        cached = _account_type_cache.get(key)
    if cached is not None:
        return cached
    try:
        res = db.table(accounts_table).select("account_type").eq("id", account_id).limit(1).execute()
        at = (res.data[0].get("account_type") if res.data else "") or ""
    except Exception:
        at = ""
    with _lock:
        _account_type_cache[key] = at
    return at


# Inventory sub-account routing — when a transaction touches a property,
# we prefer the per-property capitalized cost bucket over the generic
# parent. Falls back to None if the property has no sub-accounts yet
# (legacy data created before _create_inventory_account_for_property
# existed) — callers must keep the existing behavior in that case.
# Homes-only (config.property_subaccount_routing).
_PROPERTY_SUBACCOUNT_BY_EVENT: dict[str, str] = {
    "property_purchase_paid": "Compra",
    "renovation_paid": "Renovación",
    "moving_transport_paid": "Movida",
    "commission_paid": "Comisión",
}


def _resolve_property_subaccount(db, property_id: Optional[str], sub_label: str, accounts_table: str) -> Optional[str]:
    """Look up the inventory sub-account id for `<sub_label> <property_code>`.
    Returns None if the property doesn't exist, has no code, or no sub-account
    was provisioned for it (legacy houses created before per-property
    accounts existed)."""
    if not property_id:
        return None
    try:
        prop = (
            db.table("properties")
            .select("property_code")
            .eq("id", property_id)
            .limit(1)
            .execute()
        )
        code = (prop.data[0] or {}).get("property_code") if prop.data else None
        if not code:
            return None
        target = f"{sub_label} {code}"
        res = (
            db.table(accounts_table)
            .select("id")
            .eq("code", target)
            .limit(1)
            .execute()
        )
        if res.data:
            return res.data[0]["id"]
    except Exception as e:
        logger.warning(f"_resolve_property_subaccount lookup failed: {e}")
    return None


def _get_account_id_by_code(db, code: str, accounts_table: str) -> str:
    key = (accounts_table, code)
    with _lock:
        cached = _account_by_code_cache.get(key)
    if cached:
        return cached
    res = db.table(accounts_table).select("id").eq("code", code).limit(1).execute()
    if not res.data:
        raise ValueError(
            f"Chart account with code '{code}' not found in {accounts_table}. "
            f"This event cannot be posted until the chart of accounts is seeded."
        )
    aid = res.data[0]["id"]
    with _lock:
        _account_by_code_cache[key] = aid
    return aid


def _get_bank_chart_account_id(db, bank_account_id: str, banks_table: str) -> str:
    key = (banks_table, bank_account_id)
    with _lock:
        cached = _bank_chart_cache.get(key)
    if cached:
        return cached
    res = (
        db.table(banks_table)
        .select("id, name, accounting_account_id")
        .eq("id", bank_account_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise ValueError(f"{banks_table} row {bank_account_id} does not exist.")
    row = res.data[0]
    chart_id = row.get("accounting_account_id")
    if not chart_id:
        raise ValueError(
            f"Bank '{row.get('name')}' (id={bank_account_id}) has no "
            f"accounting_account_id set. Link it to a chart account in the "
            f"Cuentas Bancarias UI before posting ledger entries against it."
        )
    with _lock:
        _bank_chart_cache[key] = chart_id
    return chart_id


def _generate_transaction_number(db, transactions_table: str) -> str:
    """Match the convention in api/routes/accounting.py:217."""
    today = date.today().strftime("%y%m%d")
    prefix = f"TXN-{today}-"
    try:
        existing = (
            db.table(transactions_table)
            .select("transaction_number")
            .like("transaction_number", f"{prefix}%")
            .execute()
        )
        count = len(existing.data) if existing.data else 0
    except Exception:
        count = 0
    return f"{prefix}{count + 1:03d}"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def post_to_ledger(
    event_type: str,
    amount: float,
    *,
    date: str,
    bank_account_id: Optional[str] = None,
    bank_account_id_from: Optional[str] = None,   # bank_transfer only
    bank_account_id_to: Optional[str] = None,     # bank_transfer only
    counterparty_name: Optional[str] = None,
    counterparty_type: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    property_id: Optional[str] = None,
    yard_id: Optional[str] = None,
    description_data: Optional[dict[str, Any]] = None,
    description_override: Optional[str] = None,
    expense_account_code: Optional[str] = None,   # for manual_expense / invoice_received_ap
    income_account_code: Optional[str] = None,    # for manual_income
    debit_account_id_override: Optional[str] = None,   # bypass spec.debit lookup
    credit_account_id_override: Optional[str] = None,  # bypass spec.credit lookup
    payment_method: Optional[str] = None,
    payment_reference: Optional[str] = None,
    notes: Optional[str] = None,
    status: str = "confirmed",
    created_by: Optional[str] = None,
    extra_fields: Optional[dict[str, Any]] = None,  # entity-specific columns (e.g. Capital's investor_id)
    db: Any = None,
    config: Optional[LedgerConfig] = None,
) -> tuple[str, str]:
    """
    Post a balanced double-entry pair to the ledger.

    Returns: (debit_txn_id, credit_txn_id)

    Raises ValueError on misuse (unknown event, missing required bank, etc.).
    """
    if db is None:
        from tools.supabase_client import sb
        db = sb
    cfg = config or HOMES_CONFIG

    spec = cfg.registry.get(event_type)
    if spec is None:
        raise ValueError(
            f"Unknown event_type '{event_type}'. "
            f"Valid: {sorted(cfg.registry.keys())}"
        )

    if amount is None or float(amount) <= 0:
        raise ValueError(f"amount must be positive, got {amount!r}")

    # ---- Resolve the two chart account IDs --------------------------------
    if event_type == "bank_transfer":
        if not (bank_account_id_from and bank_account_id_to):
            raise ValueError("bank_transfer requires bank_account_id_from and bank_account_id_to")
        debit_account_id = _get_bank_chart_account_id(db, bank_account_id_to, cfg.banks_table)
        credit_account_id = _get_bank_chart_account_id(db, bank_account_id_from, cfg.banks_table)
        debit_bank_id = bank_account_id_to
        credit_bank_id = bank_account_id_from
    else:
        # Resolve debit
        if spec.debit == BANK:
            if not bank_account_id:
                raise ValueError(f"event '{event_type}' requires bank_account_id (debit side is bank).")
            debit_account_id = _get_bank_chart_account_id(db, bank_account_id, cfg.banks_table)
            debit_bank_id = bank_account_id
        elif spec.debit == "__caller__":
            code = expense_account_code if "expense" in event_type or event_type == "invoice_received_ap" else (income_account_code or expense_account_code)
            if not code:
                raise ValueError(f"event '{event_type}' requires expense_account_code or income_account_code.")
            debit_account_id = _get_account_id_by_code(db, code, cfg.accounts_table)
            debit_bank_id = None
        else:
            debit_account_id = _get_account_id_by_code(db, spec.debit, cfg.accounts_table)
            debit_bank_id = None

        # Resolve credit
        if spec.credit == BANK:
            if not bank_account_id:
                raise ValueError(f"event '{event_type}' requires bank_account_id (credit side is bank).")
            credit_account_id = _get_bank_chart_account_id(db, bank_account_id, cfg.banks_table)
            credit_bank_id = bank_account_id
        elif spec.credit == "__caller__":
            code = income_account_code
            if not code and event_type == "invoice_issued_ar":
                code = cfg.default_ar_income_code  # backward-compatible default when caller omits the income account
            if not code:
                raise ValueError(f"event '{event_type}' requires income_account_code.")
            credit_account_id = _get_account_id_by_code(db, code, cfg.accounts_table)
            credit_bank_id = None
        else:
            credit_account_id = _get_account_id_by_code(db, spec.credit, cfg.accounts_table)
            credit_bank_id = None

        # Per-property inventory routing: for capitalized-cost events
        # (purchase / renovation / movida), prefer the per-property
        # sub-account (Compra/Renovación/Movida <CODE>) so each house
        # accumulates its own cost basis in Balance Sheet → Inventory.
        # If no sub-account exists (legacy data), fall through to the
        # generic parent account from the EventSpec. Homes-only.
        sub_label = _PROPERTY_SUBACCOUNT_BY_EVENT.get(event_type) if cfg.property_subaccount_routing else None
        if sub_label and property_id and not debit_account_id_override:
            sub_acct_id = _resolve_property_subaccount(db, property_id, sub_label, cfg.accounts_table)
            if sub_acct_id:
                debit_account_id = sub_acct_id
                logger.info(
                    f"post_to_ledger event={event_type} property={property_id} "
                    f"routed to per-property sub-account {sub_acct_id}"
                )

    # Caller-supplied overrides win over everything else (used by the COGS
    # zero-out helper to credit specific sub-accounts on sale).
    if debit_account_id_override:
        debit_account_id = debit_account_id_override
    if credit_account_id_override:
        credit_account_id = credit_account_id_override

    # ---- Build description --------------------------------------------------
    if description_override:
        description = description_override
    else:
        try:
            description = spec.description_template.format(
                address=(description_data or {}).get("address", "—"),
                counterparty=counterparty_name or (description_data or {}).get("counterparty", "—"),
                concept=(description_data or {}).get("concept", ""),
                invoice_number=(description_data or {}).get("invoice_number", ""),
            ).strip()
        except KeyError as e:
            raise ValueError(f"description_template for '{event_type}' needs key {e!s}; pass it in description_data.") from e

    # ---- Build the two rows -------------------------------------------------
    amt = float(amount)
    # is_income convention (the column the reports & balance derivation read):
    #
    # The report helper _signed_balance(amt, account_type, is_income) returns:
    #   - +amt for EXPENSE/COGS accounts when is_income=False (debit grows)
    #   - +amt for everything else (asset/income/liability/equity/Bank) when
    #     is_income=True
    #
    # So per leg we set is_income such that _signed_balance(this row) is
    # +amt when the account's balance NATURALLY GROWS due to this entry.
    #
    # Double-entry sides:
    #   - DEBIT side grows assets+expenses, shrinks income/liability/equity
    #   - CREDIT side grows income/liability/equity, shrinks assets+expenses
    #
    # Combining: for the DEBIT leg, asset accounts → is_income=True.
    # For the CREDIT leg, every non-asset account → is_income=True.
    # That's the rule below.
    debit_acct_type = _get_account_type_by_id(db, debit_account_id, cfg.accounts_table) or ""
    credit_acct_type = _get_account_type_by_id(db, credit_account_id, cfg.accounts_table) or ""

    def _is_asset_like(at: str) -> bool:
        at = (at or "").strip().lower()
        return at in (
            "asset", "bank", "other current assets", "fixed assets",
            "other assets", "accounts receivable (a/r)",
        )

    # Debit leg: is_income=True for asset-like, False otherwise.
    debit_is_income = _is_asset_like(debit_acct_type)
    # Credit leg: is_income=False for asset-like (asset shrinks), True otherwise.
    credit_is_income = not _is_asset_like(credit_acct_type)

    base = {
        "transaction_date": date,
        "transaction_type": spec.transaction_type,
        "amount": amt,
        "description": description,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "property_id": property_id,
        "counterparty_name": counterparty_name,
        "counterparty_type": counterparty_type,
        "payment_method": payment_method,
        "payment_reference": payment_reference,
        "notes": notes,
        "status": status,
        "created_by": _persist_created_by(db, created_by) if cfg.created_by_is_user_fk else created_by,
    }
    if cfg.supports_yard:
        base["yard_id"] = yard_id
    if extra_fields:
        base.update(extra_fields)

    # One serial per *pair*, with -D / -C suffix so the two legs are unique
    # within the pair AND visibly linked when an operator scans the ledger.
    # Calling _generate_transaction_number twice in a row would race on the
    # COUNT query and produce duplicates that hit the UNIQUE constraint.
    base_serial = _generate_transaction_number(db, cfg.transactions_table)
    debit_row = {
        **base,
        "transaction_number": f"{base_serial}-D",
        "account_id": debit_account_id,
        "bank_account_id": debit_bank_id,
        "is_income": debit_is_income,
    }
    credit_row = {
        **base,
        "transaction_number": f"{base_serial}-C",
        "account_id": credit_account_id,
        "bank_account_id": credit_bank_id,
        "is_income": credit_is_income,
    }
    debit_row = {k: v for k, v in debit_row.items() if v is not None}
    credit_row = {k: v for k, v in credit_row.items() if v is not None}

    # ---- Insert + link, rolling back on any failure of the second leg ----
    debit_res = db.table(cfg.transactions_table).insert(debit_row).execute()
    if not debit_res.data:
        raise RuntimeError("Failed to insert debit leg of ledger entry.")
    debit_id = debit_res.data[0]["id"]

    credit_row["linked_transaction_id"] = debit_id
    try:
        credit_res = db.table(cfg.transactions_table).insert(credit_row).execute()
        if not credit_res.data:
            raise RuntimeError("credit leg insert returned no data")
        credit_id = credit_res.data[0]["id"]
    except Exception as e:
        # Roll back the orphan debit so half-pair rows never live in the
        # ledger. Swallow rollback failures (best-effort cleanup).
        try:
            db.table(cfg.transactions_table).delete().eq("id", debit_id).execute()
        except Exception as cleanup_err:
            logger.error(f"post_to_ledger rollback failed for debit {debit_id}: {cleanup_err}")
        raise RuntimeError(f"Failed to insert credit leg of ledger entry; debit rolled back. cause={e}") from e

    db.table(cfg.transactions_table).update({"linked_transaction_id": credit_id}).eq("id", debit_id).execute()

    logger.info(
        "post_to_ledger table=%s event=%s amount=%s pair=(%s, %s) bank=%s entity=%s/%s",
        cfg.transactions_table, event_type, amt, debit_id, credit_id, bank_account_id, entity_type, entity_id,
    )
    return debit_id, credit_id


def reset_caches() -> None:
    """Test hook — clear the in-process account/bank lookup caches."""
    with _lock:
        _account_by_code_cache.clear()
        _bank_chart_cache.clear()
        _account_type_cache.clear()


def get_bank_balance(
    bank_account_id: str,
    *,
    as_of: Optional[str] = None,
    db: Any = None,
    config: Optional[LedgerConfig] = None,
) -> float:
    """
    QuickBooks-style derived balance for a bank account:
        balance = Σ(amount on rows where is_income=true)
                − Σ(amount on rows where is_income=false)
    over the entity's transactions table filtered by bank_account_id.

    `as_of` is an ISO date — if given, only rows with transaction_date <=
    as_of are summed (use to reconcile against a statement's period_end).

    Excludes rows whose status is in config.balance_excluded_statuses
    (Homes: voided; Capital also excludes pending_confirmation/draft).

    This function is intentionally pure: it does NOT write to
    <banks_table>.current_balance. The stored column is decoupled
    from the ledger — callers compute on read.
    """
    if db is None:
        from tools.supabase_client import sb
        db = sb
    cfg = config or HOMES_CONFIG
    q = (
        db.table(cfg.transactions_table)
        .select("amount,is_income,status")
        .eq("bank_account_id", bank_account_id)
    )
    if as_of:
        q = q.lte("transaction_date", as_of)
    rows = (q.execute().data or [])
    bal = 0.0
    for r in rows:
        if (r.get("status") or "") in cfg.balance_excluded_statuses:
            continue
        amt = float(r.get("amount") or 0)
        bal += amt if r.get("is_income") else -amt
    return round(bal, 2)


def get_all_bank_balances(*, db: Any = None, config: Optional[LedgerConfig] = None) -> dict[str, float]:
    """Return {bank_account_id → derived balance} for every active bank.
    One query instead of one per bank — used by the dashboard."""
    if db is None:
        from tools.supabase_client import sb
        db = sb
    cfg = config or HOMES_CONFIG
    rows = (
        db.table(cfg.transactions_table)
        .select("bank_account_id,amount,is_income,status")
        .not_.is_("bank_account_id", "null")
        .execute()
        .data or []
    )
    out: dict[str, float] = {}
    for r in rows:
        if (r.get("status") or "") in cfg.balance_excluded_statuses:
            continue
        bid = r.get("bank_account_id")
        if not bid:
            continue
        amt = float(r.get("amount") or 0)
        out[bid] = out.get(bid, 0.0) + (amt if r.get("is_income") else -amt)
    return {k: round(v, 2) for k, v in out.items()}
