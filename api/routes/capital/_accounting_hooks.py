"""
Accounting Hooks — Auto-create capital_transactions from financial events.

Every financial event (RTO payment, investor deposit, investor return, commission,
promissory note payment, acquisition, etc.) should call the appropriate hook so
that capital_transactions becomes the **single source of truth** for Capital's
accounting and reports.

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
) -> Optional[dict]:
    """
    Insert a row into capital_transactions.

    Returns the inserted row dict, or None on failure (non-blocking).
    Failures are logged but never raise — the calling endpoint should
    still succeed even if the accounting hook fails.
    """
    try:
        record = {
            "transaction_date": txn_date or date.today().isoformat(),
            "transaction_type": txn_type,
            "amount": abs(amount),
            "is_income": is_income,
            "description": description,
            "status": "confirmed",
            "created_by": created_by,
        }

        # Add optional fields only when provided
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

