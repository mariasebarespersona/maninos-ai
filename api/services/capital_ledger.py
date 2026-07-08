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

from typing import Any, Optional

from api.services.ledger import (
    BANK,
    EventSpec,
    LedgerConfig,
    get_all_bank_balances as _get_all_bank_balances,
    get_bank_balance as _get_bank_balance,
    post_to_ledger as _post_to_ledger,
)

# Chart codes (capital_accounts.code — numeric, from migrations 042 + 097):
#   12000  Accounts Receivable (A/R)
#   14300  RTO Properties (asset)
#   21000  Accounts Payable (A/P)
#   23900  Investor Notes Payable
#   34000  Opening balance equity
#   41000  RTO Rental Income
#   42000  Down Payment Income
#   43000  Late Fee Income
#   60100  Commissions & fees
#   60600  Bank fees & service charges
#   60900  Operating Expenses (General)
#   70000  OTHER INCOME
#   71400  Interest paid

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
        credit="43000",
        transaction_type="late_fee",
        is_income_on_bank_side=True,
        description_template="Cargo por mora: {counterparty}",
    ),
    "investor_deposit_received": EventSpec(
        debit=BANK,
        credit="23900",
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
        debit="23900",
        credit=BANK,
        transaction_type="investor_return",
        is_income_on_bank_side=False,
        description_template="Retorno a inversionista: {counterparty}",
    ),
    "investor_interest_paid": EventSpec(
        debit="71400",
        credit=BANK,
        transaction_type="investor_return",
        is_income_on_bank_side=False,
        description_template="Interés a inversionista: {counterparty}",
    ),
    "acquisition_paid": EventSpec(
        debit="14300",
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
        debit="60600",
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
        debit="21000",
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
        credit="21000",
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
DEFAULT_EXPENSE_CODE = "60900"   # Operating Expenses (General)
DEFAULT_INCOME_CODE = "70000"    # OTHER INCOME


def post_to_capital_ledger(event_type: str, amount: float, **kwargs: Any) -> tuple[str, str]:
    """post_to_ledger against Capital's tables. Same signature/guarantees."""
    kwargs["config"] = CAPITAL_CONFIG
    return _post_to_ledger(event_type, amount, **kwargs)


def get_capital_bank_balance(bank_account_id: str, *, as_of: Optional[str] = None, db: Any = None) -> float:
    return _get_bank_balance(bank_account_id, as_of=as_of, db=db, config=CAPITAL_CONFIG)


def get_all_capital_bank_balances(*, db: Any = None) -> dict[str, float]:
    return _get_all_bank_balances(db=db, config=CAPITAL_CONFIG)
