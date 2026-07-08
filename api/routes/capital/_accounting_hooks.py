"""
Accounting Hooks — Auto-create capital_transactions from financial events.

Every financial event (RTO payment, investor deposit, investor return, commission,
promissory note payment, acquisition, etc.) should call the appropriate hook so
that capital_transactions becomes the **single source of truth** for Capital's
accounting and reports.

As of the Capital/Homes accounting parity work, this posts a BALANCED
DOUBLE-ENTRY PAIR via the shared ledger engine whenever a bank account is
known (bank leg + P&L/balance leg, linked via linked_transaction_id).
When no bank is known yet, it falls back to the legacy single-row insert —
the reconciliation flow matches it against a statement later.

By default rows start as 'pending_confirmation' and must be approved via the
Notificaciones page (which confirms BOTH legs of a pair). Derived bank
balances only count confirmed/reconciled rows.

Usage:
    from api.routes.capital._accounting_hooks import record_txn

    record_txn(
        txn_type="rto_payment",
        amount=1500.00,
        is_income=True,
        description="Pago RTO Mensualidad #3 — Juan Pérez",
        txn_date="2026-02-15",
        client_id="...",
        property_id="...",
        rto_contract_id="...",
        rto_payment_id="...",
        payment_method="zelle",
        payment_reference="REF-123",
    )
"""

import logging
from datetime import date
from typing import Optional
from tools.supabase_client import sb

logger = logging.getLogger(__name__)


# transaction_type → capital ledger event (income side / expense side)
_INCOME_EVENT_BY_TYPE = {
    "rto_payment": "rto_payment_received",
    "down_payment": "down_payment_received",
    "late_fee": "late_fee_received",
    "investor_deposit": "investor_deposit_received",
    "other_income": "manual_income_received",
    "adjustment": "manual_income_received",
}

_EXPENSE_EVENT_BY_TYPE = {
    "investor_return": "investor_return_paid",
    "acquisition": "acquisition_paid",
    "commission": "commission_paid",
    "operating_expense": "manual_expense_paid",
    "insurance": "manual_expense_paid",
    "tax": "manual_expense_paid",
    "other_expense": "manual_expense_paid",
    "adjustment": "manual_expense_paid",
}


def record_txn(
    *,
    txn_type: str,
    amount: float,
    is_income: bool,
    description: str,
    txn_date: Optional[str] = None,
    # Linked entities
    account_id: Optional[str] = None,
    bank_account_id: Optional[str] = None,
    investor_id: Optional[str] = None,
    property_id: Optional[str] = None,
    rto_contract_id: Optional[str] = None,
    client_id: Optional[str] = None,
    capital_flow_id: Optional[str] = None,
    rto_payment_id: Optional[str] = None,
    # Payment details
    payment_method: Optional[str] = None,
    payment_reference: Optional[str] = None,
    counterparty_name: Optional[str] = None,
    notes: Optional[str] = None,
    created_by: str = "auto",
    status: str = "pending_confirmation",
) -> Optional[dict]:
    """
    Record a Capital accounting entry.

    With a bank_account_id: posts a balanced double-entry pair via the shared
    ledger engine and returns the BANK leg row (callers store its id, and
    reconciliation matches against the bank side).

    Without a bank: legacy single-row insert (account auto-assigned by type).

    Returns the inserted row dict, or None on failure (non-blocking).
    Failures are logged but never raise — the calling endpoint should
    still succeed even if the accounting hook fails.
    """
    when = txn_date or date.today().isoformat()

    # ---- Double-entry path (bank known) -----------------------------------
    if bank_account_id:
        try:
            from api.services.capital_ledger import (
                DEFAULT_EXPENSE_CODE,
                DEFAULT_INCOME_CODE,
                post_to_capital_ledger,
            )
            event = (_INCOME_EVENT_BY_TYPE if is_income else _EXPENSE_EVENT_BY_TYPE).get(txn_type)
            if event:
                extra = {k: v for k, v in {
                    "investor_id": investor_id,
                    "rto_contract_id": rto_contract_id,
                    "client_id": client_id,
                    "capital_flow_id": capital_flow_id,
                    "rto_payment_id": rto_payment_id,
                }.items() if v}
                kwargs = dict(
                    event_type=event,
                    amount=abs(amount),
                    date=when,
                    bank_account_id=bank_account_id,
                    counterparty_name=counterparty_name,
                    property_id=property_id,
                    description_override=description,
                    payment_method=payment_method,
                    payment_reference=payment_reference,
                    notes=notes,
                    status=status,
                    created_by=created_by,
                    extra_fields=extra or None,
                )
                if event == "manual_income_received":
                    kwargs["income_account_code"] = DEFAULT_INCOME_CODE
                if event == "manual_expense_paid":
                    kwargs["expense_account_code"] = DEFAULT_EXPENSE_CODE
                debit_id, credit_id = post_to_capital_ledger(**kwargs)
                bank_leg_id = debit_id if is_income else credit_id
                row = sb.table("capital_transactions").select("*").eq("id", bank_leg_id).execute()
                logger.info(f"[accounting-hook] recorded PAIR {txn_type} ${abs(amount):,.2f} (income={is_income})")
                return row.data[0] if row.data else None
        except Exception as exc:
            logger.warning(f"[accounting-hook] pair post failed for {txn_type}, falling back to single row: {exc}")

    # ---- Legacy single-row path (no bank / pair failed) --------------------
    try:
        if account_id is None:
            try:
                from api.routes.capital.accounting import _resolve_account_id
                account_id = _resolve_account_id(txn_type)
            except Exception:
                account_id = None

        record = {
            "transaction_date": when,
            "transaction_type": txn_type,
            "amount": abs(amount),
            "is_income": is_income,
            "description": description,
            "status": status,
            "created_by": created_by,
        }

        optional = {
            "account_id": account_id,
            "bank_account_id": bank_account_id,
            "investor_id": investor_id,
            "property_id": property_id,
            "rto_contract_id": rto_contract_id,
            "client_id": client_id,
            "capital_flow_id": capital_flow_id,
            "rto_payment_id": rto_payment_id,
            "payment_method": payment_method,
            "payment_reference": payment_reference,
            "counterparty_name": counterparty_name,
            "notes": notes,
        }
        for k, v in optional.items():
            if v is not None:
                record[k] = v

        result = sb.table("capital_transactions").insert(record).execute()
        row = result.data[0] if result.data else None
        logger.info(f"[accounting-hook] recorded {txn_type} ${amount:,.2f} (income={is_income})")
        return row

    except Exception as exc:
        logger.warning(f"[accounting-hook] FAILED to record {txn_type}: {exc}")
        return None
