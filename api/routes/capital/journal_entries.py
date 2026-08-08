"""
Journal Entries — manual balanced multi-line accounting entries (QuickBooks-style).

Not every transaction touches the bank or flows through cash: reclassifications,
accruals, opening balances, inter-account moves, corrections. A journal entry
lets the accountant pick each chart account and its Debit/Credit amount; the two
columns must sum equal. Each JE can be tied to a company (Maninos Capital or
Maninos Homes) and, optionally, to a specific property (or left general).

Design:
  - Every line becomes one row in the entity's transactions table, all sharing a
    `journal_entry_id` (Capital) so the entry can be listed/edited/voided as a unit.
  - `is_income` per row is derived from the account's NATURAL BALANCE (debit/credit)
    and the side of the line, so the Balance Sheet / P&L reflect the increase or
    decrease correctly (debit grows debit-natured accounts; credit grows
    credit-natured accounts — including contra accounts via normal_balance).
  - If a line hits a bank's chart account, the row is stamped with that bank's
    `bank_account_id` so the derived bank balance stays correct.

Capital is the primary target (this module lives under the Capital router).
Homes entries are additive: they post to accounting_transactions with the
DB-allowed 'adjustment' type and carry the group id in payment_reference — no
change to any existing Homes write path.
"""
from __future__ import annotations

import logging
import uuid
from datetime import date as _date
from typing import Any, Literal, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from tools.supabase_client import sb
from api.services.capital_ledger import CAPITAL_CONFIG
from api.services.ledger import HOMES_CONFIG, _persist_created_by

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/accounting", tags=["Capital - Journal Entries"])

_CENTS = 0.01


class JELine(BaseModel):
    account_id: Optional[str] = None
    account_code: Optional[str] = None
    debit: float = 0.0
    credit: float = 0.0
    property_id: Optional[str] = None
    description: Optional[str] = None


class JournalEntryCreate(BaseModel):
    date: str
    memo: str
    entity: Literal["capital", "homes"] = "capital"
    lines: list[JELine]
    created_by: Optional[str] = "auto"


def _normal_balance(account_type: str, stored: Optional[str]) -> str:
    if stored in ("debit", "credit"):
        return stored
    return "debit" if (account_type or "").lower() in ("asset", "expense", "cogs") else "credit"


def _je_is_income(account_type: str, normal_balance: str, side: str) -> bool:
    """Return the is_income flag so the derived balance moves in the right
    direction. Debit grows debit-natured accounts; credit grows credit-natured.
    Expense/COGS use the inverted convention the reports expect (is_income=False
    means the expense grew)."""
    increases = (side == "debit" and normal_balance == "debit") or (
        side == "credit" and normal_balance == "credit"
    )
    if (account_type or "").lower() in ("expense", "cogs"):
        return not increases
    return increases


def _cfg_for(entity: str):
    return CAPITAL_CONFIG if entity == "capital" else HOMES_CONFIG


@router.post("/journal-entries")
async def create_journal_entry(payload: JournalEntryCreate):
    """Create a balanced multi-line journal entry. Σdebit must equal Σcredit."""
    cfg = _cfg_for(payload.entity)
    lines = payload.lines or []
    if len(lines) < 2:
        raise HTTPException(status_code=400, detail="Un asiento necesita al menos 2 líneas.")

    # Validate each line: exactly one non-zero side, positive.
    total_debit = 0.0
    total_credit = 0.0
    norm_lines: list[dict[str, Any]] = []
    for i, ln in enumerate(lines):
        d = round(float(ln.debit or 0), 2)
        c = round(float(ln.credit or 0), 2)
        if d < 0 or c < 0:
            raise HTTPException(status_code=400, detail=f"Línea {i+1}: montos no pueden ser negativos.")
        if (d > 0) == (c > 0):
            raise HTTPException(status_code=400, detail=f"Línea {i+1}: pon un monto en Débito O en Crédito (no ambos ni ninguno).")
        if not ln.account_id and not ln.account_code:
            raise HTTPException(status_code=400, detail=f"Línea {i+1}: falta la cuenta contable.")
        total_debit += d
        total_credit += c
        norm_lines.append({"d": d, "c": c, "line": ln})

    total_debit = round(total_debit, 2)
    total_credit = round(total_credit, 2)
    if abs(total_debit - total_credit) > _CENTS:
        raise HTTPException(
            status_code=400,
            detail=f"El asiento no cuadra: débitos ${total_debit:,.2f} ≠ créditos ${total_credit:,.2f}.",
        )
    if total_debit <= 0:
        raise HTTPException(status_code=400, detail="El asiento no tiene montos.")

    # Resolve accounts (id, type, normal_balance, code, name).
    def _resolve_account(ln: JELine) -> dict:
        q = sb.table(cfg.accounts_table).select("id, code, name, account_type, normal_balance")
        if ln.account_id:
            r = q.eq("id", ln.account_id).limit(1).execute()
        else:
            r = q.eq("code", ln.account_code).limit(1).execute()
        if not r.data:
            raise HTTPException(status_code=400, detail=f"Cuenta no encontrada: {ln.account_id or ln.account_code}")
        return r.data[0]

    # Bank chart account → bank_account_id map (so bank JE lines affect balances).
    bank_by_chart: dict[str, str] = {}
    try:
        banks = sb.table(cfg.banks_table).select("id, accounting_account_id").execute().data or []
        bank_by_chart = {b["accounting_account_id"]: b["id"] for b in banks if b.get("accounting_account_id")}
    except Exception:
        bank_by_chart = {}

    je_id = str(uuid.uuid4())
    when = payload.date or _date.today().isoformat()
    created_by = _persist_created_by(sb, payload.created_by) if cfg.created_by_is_user_fk else payload.created_by
    txn_type = "journal_entry" if payload.entity == "capital" else "adjustment"

    rows: list[dict] = []
    for nl in norm_lines:
        ln: JELine = nl["line"]
        acct = _resolve_account(ln)
        side = "debit" if nl["d"] > 0 else "credit"
        amount = nl["d"] if side == "debit" else nl["c"]
        nb = _normal_balance(acct.get("account_type"), acct.get("normal_balance"))
        is_income = _je_is_income(acct.get("account_type"), nb, side)
        row = {
            "transaction_date": when,
            "transaction_type": txn_type,
            "amount": amount,
            "is_income": is_income,
            "account_id": acct["id"],
            "description": (ln.description or payload.memo or "Asiento contable"),
            "status": "confirmed",
            "created_by": created_by,
            "notes": f"Asiento: {payload.memo}" if payload.memo else None,
        }
        if ln.property_id:
            row["property_id"] = ln.property_id
        # Stamp bank id if this chart account is a bank account.
        bid = bank_by_chart.get(acct["id"])
        if bid:
            row["bank_account_id"] = bid
        # Group id: real column on Capital; payment_reference tag on Homes.
        if payload.entity == "capital":
            row["journal_entry_id"] = je_id
        else:
            row["payment_reference"] = f"JE-{je_id[:8]}"
        rows.append({k: v for k, v in row.items() if v is not None})

    try:
        res = sb.table(cfg.transactions_table).insert(rows).execute()
    except Exception as e:
        logger.error(f"[capital-JE] insert failed entity={payload.entity}: {e!r}")
        raise HTTPException(status_code=500, detail=f"No se pudo guardar el asiento: {type(e).__name__}: {e}")

    logger.info(f"[capital-JE] created journal_entry {je_id} entity={payload.entity} lines={len(rows)} total=${total_debit:,.2f}")
    return {
        "ok": True,
        "journal_entry_id": je_id,
        "entity": payload.entity,
        "lines": len(rows),
        "total": total_debit,
        "rows": res.data or [],
    }


@router.get("/journal-entries")
async def list_journal_entries(limit: int = Query(100, le=500)):
    """List Capital journal entries grouped by journal_entry_id."""
    rows = (
        sb.table("capital_transactions")
        .select("id, journal_entry_id, transaction_date, amount, is_income, account_id, description, notes, property_id, status")
        .eq("transaction_type", "journal_entry")
        .not_.is_("journal_entry_id", "null")
        .order("transaction_date", desc=True)
        .limit(limit * 6)
        .execute()
        .data
        or []
    )
    groups: dict[str, dict] = {}
    for r in rows:
        jid = r["journal_entry_id"]
        g = groups.setdefault(jid, {
            "journal_entry_id": jid,
            "date": r["transaction_date"],
            "memo": (r.get("notes") or "").replace("Asiento: ", "") or r.get("description"),
            "status": r.get("status"),
            "lines": [],
            "total": 0.0,
        })
        g["lines"].append(r)
        # total = sum of debits (rows where the account grew on the debit side)
        g["total"] += float(r["amount"] or 0) if r.get("is_income") else 0.0
    out = sorted(groups.values(), key=lambda x: x["date"], reverse=True)[:limit]
    return {"journal_entries": out, "count": len(out)}


@router.delete("/journal-entries/{journal_entry_id}")
async def delete_journal_entry(journal_entry_id: str):
    """Void a Capital journal entry (deletes all its lines)."""
    rows = sb.table("capital_transactions").select("id").eq("journal_entry_id", journal_entry_id).execute().data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Asiento no encontrado")
    sb.table("capital_transactions").delete().eq("journal_entry_id", journal_entry_id).execute()
    return {"ok": True, "deleted_lines": len(rows)}
