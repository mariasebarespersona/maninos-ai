"""
Capital — Auto-invoicing for RTO monthly payments.

Two halves:

1. generate_rto_receivable_invoices() — creates one receivable invoice
   (capital_invoices) per scheduled RTO payment due this month or overdue,
   idempotent via capital_invoices.rto_payment_id. Posts the AR pair at
   issuance (invoice_issued_ar → debit A/R 12000, credit RTO Rental Income
   41000). Run daily by the scheduler; also callable on demand.

2. settle_rto_invoice() — called when an RTO payment is recorded. If an
   auto-invoice exists for that rto_payment, registers the payment against
   it and posts invoice_paid_in (debit bank, credit A/R) instead of
   rto_payment_received — otherwise income would be recognized TWICE (once
   at invoice issuance, once at collection) and A/R would never clear.

Accounting identity per RTO month:
    issuance: A/R +amount, income +amount
    payment:  bank +amount, A/R -amount   → net: bank +, income + (once)
"""

import calendar
import logging
from datetime import date
from typing import Optional

from tools.supabase_client import sb

logger = logging.getLogger(__name__)

_TAG_PREFIX = "[RTO:"


def _primary_capital_bank_id() -> Optional[str]:
    try:
        res = sb.table("capital_bank_accounts").select("id").eq("is_active", True) \
            .eq("is_primary", True).limit(1).execute()
        if res.data:
            return res.data[0]["id"]
    except Exception:
        pass
    return None


def generate_rto_receivable_invoices() -> dict:
    """Create receivable invoices for RTO payments due up to the end of the
    current month (including overdue ones) that don't have one yet."""
    today = date.today()
    horizon = date(today.year, today.month, calendar.monthrange(today.year, today.month)[1]).isoformat()

    created, skipped, errors = 0, 0, []
    try:
        payments = sb.table("rto_payments") \
            .select("id, rto_contract_id, amount, paid_amount, due_date, payment_number, status") \
            .in_("status", ["scheduled", "pending", "late", "partial"]) \
            .lte("due_date", horizon) \
            .order("due_date") \
            .limit(500) \
            .execute().data or []
        if not payments:
            return {"ok": True, "created": 0, "skipped": 0}

        pay_ids = [p["id"] for p in payments]
        existing = sb.table("capital_invoices").select("rto_payment_id") \
            .in_("rto_payment_id", pay_ids).execute().data or []
        already = {e["rto_payment_id"] for e in existing if e.get("rto_payment_id")}

        # Contract + client context in one pass
        contract_ids = list({p["rto_contract_id"] for p in payments if p.get("rto_contract_id")})
        contracts = {}
        if contract_ids:
            rows = sb.table("rto_contracts") \
                .select("id, client_id, property_id, clients(name)") \
                .in_("id", contract_ids).execute().data or []
            contracts = {r["id"]: r for r in rows}

        from api.routes.capital.accounting_invoices import _generate_capital_invoice_number
        from api.services.capital_ledger import post_to_capital_ledger

        for p in payments:
            if p["id"] in already:
                skipped += 1
                continue
            try:
                contract = contracts.get(p.get("rto_contract_id")) or {}
                client_name = ((contract.get("clients") or {}).get("name")) or "Cliente RTO"
                amount = float(p.get("amount") or 0)
                if amount <= 0:
                    skipped += 1
                    continue
                already_paid = float(p.get("paid_amount") or 0)

                inv_number = _generate_capital_invoice_number("receivable")
                status = "paid" if already_paid + 0.01 >= amount else ("partial" if already_paid > 0 else "sent")
                insert = {
                    "invoice_number": inv_number,
                    "direction": "receivable",
                    "counterparty_name": client_name,
                    "counterparty_type": "client",
                    "client_id": contract.get("client_id"),
                    "property_id": contract.get("property_id"),
                    "rto_contract_id": p.get("rto_contract_id"),
                    "rto_payment_id": p["id"],
                    "issue_date": today.isoformat(),
                    "due_date": p.get("due_date"),
                    "subtotal": amount,
                    "tax_amount": 0,
                    "total_amount": amount,
                    "amount_paid": already_paid,
                    "description": f"Mensualidad RTO #{p.get('payment_number', '?')} — {client_name}",
                    "notes": f"{_TAG_PREFIX}{p['id']}] Factura generada automáticamente para el pago RTO programado.",
                    "status": status,
                }
                insert = {k: v for k, v in insert.items() if v is not None}
                res = sb.table("capital_invoices").insert(insert).execute()
                if not res.data:
                    errors.append(f"{p['id']}: insert returned no data")
                    continue
                invoice = res.data[0]

                # AR pair at issuance (income recognized once, here). Must be
                # ATOMIC with the invoice row: if the accrual can't be posted,
                # roll back the just-created invoice so we never end up with an
                # invoice that has no accrual behind it.
                try:
                    post_to_capital_ledger(
                        event_type="invoice_issued_ar",
                        income_account_code="41000",
                        amount=amount,
                        date=today.isoformat(),
                        counterparty_name=client_name,
                        counterparty_type="client",
                        entity_type="invoice",
                        entity_id=invoice["id"],
                        property_id=contract.get("property_id"),
                        description_data={"invoice_number": inv_number},
                        status="confirmed",
                        extra_fields={k: v for k, v in {
                            "client_id": contract.get("client_id"),
                            "rto_contract_id": p.get("rto_contract_id"),
                            "rto_payment_id": p["id"],
                        }.items() if v},
                    )
                except Exception as le:
                    # Roll back the orphaned invoice — no accrual, no invoice.
                    try:
                        sb.table("capital_invoices").delete().eq("id", invoice["id"]).execute()
                    except Exception as de:
                        logger.error(f"[rto-invoicing] AR accrual failed AND rollback failed "
                                     f"for invoice {inv_number}: post={le} rollback={de}")
                    errors.append(f"{p['id']}: AR accrual failed, invoice {inv_number} rolled back: {le}")
                    continue

                created += 1
            except Exception as e:
                errors.append(f"{p['id']}: {e}")

    except Exception as e:
        logger.error(f"[rto-invoicing] generate failed: {e}")
        return {"ok": False, "error": str(e), "created": created, "skipped": skipped}

    if created:
        logger.info(f"[rto-invoicing] Generated {created} RTO invoices ({skipped} already existed)")
    return {"ok": True, "created": created, "skipped": skipped, "errors": errors[:5]}


def settle_rto_invoice(
    rto_payment_id: str,
    amount: float,
    *,
    bank_account_id: Optional[str] = None,
    payment_method: Optional[str] = None,
    payment_reference: Optional[str] = None,
    paid_date: Optional[str] = None,
    created_by: Optional[str] = None,
    status: str = "pending_confirmation",
) -> bool:
    """Register a collection against the auto-invoice for this RTO payment.

    Returns True if an open invoice existed and was settled (the caller must
    then SKIP its own rto_payment_received posting — the ledger entry here is
    invoice_paid_in, clearing A/R). Returns False when no invoice exists
    (caller falls back to the legacy direct posting).

    Without an explicit bank the primary Capital bank is used; if none is
    configured, no ledger pair is posted (document-only settle) and a loud
    warning is logged.
    """
    try:
        inv_res = sb.table("capital_invoices").select("*") \
            .eq("rto_payment_id", rto_payment_id) \
            .eq("direction", "receivable") \
            .in_("status", ["sent", "partial", "overdue"]) \
            .limit(1).execute()
        if not inv_res.data:
            return False
        invoice = inv_res.data[0]
        when = paid_date or date.today().isoformat()
        amount = abs(float(amount))

        bank = bank_account_id or _primary_capital_bank_id()

        # POST THE LEDGER PAIR FIRST. Only if it succeeds do we register the
        # payment row and bump amount_paid/status. This prevents an invoice
        # being marked paid with no ledger pair behind it — if the post fails
        # we return False so the caller runs its fallback (direct rto_payment
        # posting) and the collection is not lost.
        debit_id = None
        if bank:
            try:
                from api.services.capital_ledger import post_to_capital_ledger
                debit_id, _credit_id = post_to_capital_ledger(
                    event_type="invoice_paid_in",
                    amount=amount,
                    bank_account_id=bank,
                    date=when,
                    counterparty_name=invoice.get("counterparty_name"),
                    counterparty_type="client",
                    entity_type="invoice",
                    entity_id=invoice["id"],
                    property_id=invoice.get("property_id"),
                    description_data={"invoice_number": invoice.get("invoice_number", "")},
                    payment_method=payment_method,
                    payment_reference=payment_reference,
                    status=status,
                    created_by=created_by,
                    extra_fields={k: v for k, v in {
                        "client_id": invoice.get("client_id"),
                        "rto_contract_id": invoice.get("rto_contract_id"),
                        "rto_payment_id": rto_payment_id,
                    }.items() if v},
                )
            except Exception as le:
                # Ledger post failed — do NOT mark the invoice paid. Signal the
                # caller (return False) so its fallback posting runs.
                logger.error(f"[rto-invoicing] invoice_paid_in FAILED for "
                             f"{invoice.get('invoice_number')} — settle aborted, caller falls back: {le}")
                return False
        else:
            logger.warning(
                f"[rto-invoicing] No bank for RTO payment {rto_payment_id} and no primary Capital bank — "
                f"invoice settled as document only (no ledger pair)."
            )

        # Ledger pair is safely posted (or no bank at all → document-only by
        # design). Now register the payment and update the invoice.
        pay = sb.table("capital_invoice_payments").insert({
            "invoice_id": invoice["id"],
            "payment_date": when,
            "amount": amount,
            "payment_method": payment_method,
            "payment_reference": payment_reference,
            "notes": "Registrado desde pago RTO",
            **({"transaction_id": debit_id} if debit_id else {}),
        }).execute()

        new_paid = float(invoice.get("amount_paid") or 0) + amount
        total = float(invoice.get("total_amount") or 0)
        sb.table("capital_invoices").update({
            "amount_paid": new_paid,
            "status": "paid" if new_paid + 0.01 >= total else "partial",
        }).eq("id", invoice["id"]).execute()

        return True
    except Exception as e:
        logger.warning(f"[rto-invoicing] settle failed for {rto_payment_id}: {e}")
        return False
