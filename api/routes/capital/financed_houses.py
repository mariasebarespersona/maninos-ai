"""
Capital — Casas Financiadas (financed-house portfolio).

A read-only, PROPERTY-centric view of every Homes sale that became a financed
(RTO) deal, from the moment the sale is created (rto_pending) through payoff.
It only AGGREGATES data that already exists — sales, properties, clients,
rto_contracts, rto_payments, investments and the CAPITAL ledger
(capital_transactions) — into one card per house.

Guardrails:
  • NEVER writes to Homes tables or the Homes chart of accounts. It reads
    sales / properties / clients (same Supabase) but only for display.
  • The ONLY write is earmarking an EXISTING investor ticket to a house: an
    UPDATE of investments.property_id / rto_contract_id. No money moves → no
    ledger entry, so the 23900 reconciliation invariant is preserved (a ticket's
    amount already sits in 23900 whether or not it is earmarked to a house).
"""
import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from tools.supabase_client import sb

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/financed-houses", tags=["Capital - Financed Houses"])

# sales.status → UI bucket for the section
_STATUS_BUCKET = {
    "rto_pending": "por_revisar",
    "rto_approved": "aprobada",
    "rto_active": "activa",
    "completed": "liquidada",
    "cancelled": "cancelada",
}

# Capital chart accounts that describe a financed house's position.
_ACCT_AR = "12000"          # client receivable accrued (what the client still owes)
_ACCT_RTO_ASSET = "14300"   # what Capital paid Homes to acquire the house
_ACCT_RENTAL = "41000"      # monthly RTO income collected
_ACCT_DOWN = "42000"        # enganche (down payment) income
_ACCT_LATE = "43000"        # late-fee income

_ASSIGNABLE_STATUSES = ("active", "partial_return")

_acct_code_cache: dict[str, str] = {}


def _yard_from_code(code: Optional[str]) -> Optional[str]:
    """property_code prefix → yard (H=Houston, B=Conroe, DFW=Dallas)."""
    if not code:
        return None
    c = code.strip().upper()
    if c.startswith("DFW"):
        return "Dallas"
    if c.startswith("H"):
        return "Houston"
    if c.startswith("B"):
        return "Conroe"
    return None


def _account_code_map() -> dict:
    """{account_id: code} for the Capital chart (cached)."""
    if not _acct_code_cache:
        try:
            rows = sb.table("capital_accounts").select("id, code").execute().data or []
            for r in rows:
                if r.get("id") and r.get("code"):
                    _acct_code_cache[r["id"]] = r["code"]
        except Exception as e:
            logger.warning(f"[financed-houses] could not load account map: {e}")
    return _acct_code_cache


def _chunks(items: list, size: int = 100):
    for i in range(0, len(items), size):
        yield items[i:i + size]


def _ledger_sums_by_property(property_ids: list) -> dict:
    """{property_id: {account_code: signed_balance}} from CONFIRMED capital_transactions.

    Best-effort: some legacy postings may not carry property_id, so callers treat
    these figures as supplementary and rely on sales/rto_payments for headline
    numbers. Signed balance = Σ(amount if is_income else -amount)."""
    out: dict = {pid: {} for pid in property_ids}
    if not property_ids:
        return out
    codes = _account_code_map()
    try:
        for chunk in _chunks(property_ids, 100):
            page = 0
            while True:
                q = sb.table("capital_transactions") \
                    .select("property_id, account_id, amount, is_income, status") \
                    .in_("property_id", chunk) \
                    .range(page * 1000, page * 1000 + 999).execute()
                rows = q.data or []
                for r in rows:
                    if r.get("status") != "confirmed":
                        continue
                    pid = r.get("property_id")
                    code = codes.get(r.get("account_id"))
                    if not pid or not code:
                        continue
                    amt = float(r.get("amount", 0) or 0)
                    signed = amt if r.get("is_income") else -amt
                    bucket = out.setdefault(pid, {})
                    bucket[code] = round(bucket.get(code, 0.0) + signed, 2)
                if len(rows) < 1000:
                    break
                page += 1
    except Exception as e:
        logger.warning(f"[financed-houses] ledger sums failed: {e}")
    return out


def _aggregate_payments(payments: list) -> dict:
    """Collapse a contract's rto_payments into headline collection stats."""
    today = date.today().isoformat()
    agg = {"payments_made": 0, "total_payments": 0, "total_paid": 0.0,
           "next_due": None, "overdue": 0}
    for p in payments:
        agg["total_payments"] += 1
        st = p.get("status")
        if st == "paid":
            agg["payments_made"] += 1
            agg["total_paid"] += float(p.get("paid_amount") or p.get("amount") or 0)
        else:
            due = p.get("due_date")
            if due:
                if agg["next_due"] is None or due < agg["next_due"]:
                    agg["next_due"] = due
                if due < today and st in ("scheduled", "pending", "late", "partial"):
                    agg["overdue"] += 1
    agg["total_paid"] = round(agg["total_paid"], 2)
    return agg


def _house_card(sale: dict, contract: Optional[dict], pay: Optional[dict],
                invs: list, led: dict) -> dict:
    """Assemble one financed-house card from its already-fetched parts."""
    prop = sale.get("properties") or {}
    client = sale.get("clients") or {}
    photos = prop.get("photos") or []
    pay = pay or {}
    led = led or {}

    financed = float(sale.get("financed_remaining") or 0)
    down = float(sale.get("rto_down_payment") or sale.get("financed_down_payment") or 0)
    monthly = float(sale.get("rto_monthly_payment") or (contract or {}).get("monthly_rent") or 0)
    term = int(sale.get("rto_term_months") or (contract or {}).get("term_months") or 0)
    made = pay.get("payments_made", 0)
    total_pmts = pay.get("total_payments", 0)
    pct = round(100.0 * made / total_pmts, 1) if total_pmts else 0.0

    return {
        "sale_id": sale["id"],
        "status": sale.get("status"),
        "bucket": _STATUS_BUCKET.get(sale.get("status"), "por_revisar"),
        "created_at": sale.get("created_at"),
        "capital_payment_status": sale.get("capital_payment_status"),
        "property": {
            "id": prop.get("id"),
            "code": prop.get("property_code"),
            "address": prop.get("address"),
            "city": prop.get("city"),
            "state": prop.get("state"),
            "yard": _yard_from_code(prop.get("property_code")),
            "photo": photos[0] if photos else None,
        },
        "client": {
            "id": client.get("id"),
            "name": client.get("name"),
            "email": client.get("email"),
            "phone": client.get("phone"),
        },
        "terms": {
            "sale_price": float(sale.get("sale_price") or 0),
            "down_payment": down,
            "financed_remaining": financed,
            "monthly_payment": monthly,
            "term_months": term,
        },
        "contract": ({
            "id": contract.get("id"),
            "status": contract.get("status"),
            "start_date": contract.get("start_date"),
            "end_date": contract.get("end_date"),
        } if contract else None),
        "collection": {
            "payments_made": made,
            "total_payments": total_pmts,
            "total_paid": pay.get("total_paid", 0.0),
            "next_due": pay.get("next_due"),
            "overdue": pay.get("overdue", 0),
            "percentage": pct,
        },
        "investors": [
            {
                "investment_id": i.get("id"),
                "investor_id": i.get("investor_id"),
                "investor_name": (i.get("investors") or {}).get("name"),
                "amount": float(i.get("amount") or 0),
                "rate": float(i.get("expected_return_rate") or 0),
                "status": i.get("status"),
                "note_backed": bool(i.get("promissory_note_id")),
            }
            for i in invs
        ],
        "investor_funded_total": round(sum(float(i.get("amount") or 0) for i in invs), 2),
        "capital_position": {
            "capital_invested_house": round(led.get(_ACCT_RTO_ASSET, 0.0), 2),
            "down_payment_income": round(abs(led.get(_ACCT_DOWN, 0.0)), 2),
            "rental_income": round(abs(led.get(_ACCT_RENTAL, 0.0)), 2),
            "late_fee_income": round(abs(led.get(_ACCT_LATE, 0.0)), 2),
            "ar_outstanding": round(led.get(_ACCT_AR, 0.0), 2),
        },
    }


_SALE_SELECT = (
    "id, status, sale_type, sale_price, rto_down_payment, rto_monthly_payment, "
    "rto_term_months, financed_remaining, financed_down_payment, capital_payment_status, "
    "rto_contract_id, created_at, property_id, client_id, "
    "properties(id, property_code, address, city, state, photos), "
    "clients(id, name, email, phone)"
)


def _fetch_contracts(contract_ids: list) -> dict:
    by_id: dict = {}
    for chunk in _chunks(contract_ids, 100):
        rows = sb.table("rto_contracts").select(
            "id, status, monthly_rent, purchase_price, down_payment, "
            "term_months, start_date, end_date"
        ).in_("id", chunk).execute().data or []
        for r in rows:
            by_id[r["id"]] = r
    return by_id


def _fetch_payment_aggs(contract_ids: list) -> dict:
    """{contract_id: aggregate stats} from rto_payments."""
    by_contract: dict = {}
    for chunk in _chunks(contract_ids, 100):
        page = 0
        rows: list = []
        while True:
            p = sb.table("rto_payments").select(
                "rto_contract_id, amount, paid_amount, due_date, status"
            ).in_("rto_contract_id", chunk).range(page * 1000, page * 1000 + 999).execute().data or []
            rows.extend(p)
            if len(p) < 1000:
                break
            page += 1
        grouped: dict = {}
        for p in rows:
            grouped.setdefault(p.get("rto_contract_id"), []).append(p)
        for cid, pmts in grouped.items():
            by_contract[cid] = _aggregate_payments(pmts)
    return by_contract


def _fetch_investments(prop_ids: list, contract_ids: list):
    """Investor tickets earmarked to these houses, keyed by property_id and contract_id."""
    by_prop: dict = {}
    by_contract: dict = {}
    sel = ("id, investor_id, property_id, rto_contract_id, amount, expected_return_rate, "
           "status, promissory_note_id, investors!investments_investor_id_fkey(name)")

    def load(col: str, ids: list, target: dict):
        for chunk in _chunks(ids, 100):
            rows = sb.table("investments").select(sel).in_(col, chunk).execute().data or []
            for r in rows:
                target.setdefault(r.get(col), []).append(r)

    load("property_id", prop_ids, by_prop)
    load("rto_contract_id", contract_ids, by_contract)
    return by_prop, by_contract


@router.get("")
async def list_financed_houses(status: Optional[str] = None):
    """One card per financed (RTO) house. `status` filters by bucket
    (por_revisar | aprobada | activa | liquidada | cancelada)."""
    try:
        sales: list = []
        page = 0
        while True:
            q = sb.table("sales").select(_SALE_SELECT).eq("sale_type", "rto") \
                .order("created_at", desc=True).range(page * 1000, page * 1000 + 999).execute()
            rows = q.data or []
            sales.extend(rows)
            if len(rows) < 1000:
                break
            page += 1

        prop_ids = [s["property_id"] for s in sales if s.get("property_id")]
        contract_ids = [s["rto_contract_id"] for s in sales if s.get("rto_contract_id")]

        contracts = _fetch_contracts(contract_ids)
        pay_aggs = _fetch_payment_aggs(contract_ids)
        inv_by_prop, inv_by_contract = _fetch_investments(prop_ids, contract_ids)
        ledger = _ledger_sums_by_property(prop_ids)

        houses = []
        for s in sales:
            pid = s.get("property_id")
            cid = s.get("rto_contract_id")
            invs: dict = {}
            for i in inv_by_prop.get(pid, []):
                invs[i["id"]] = i
            for i in inv_by_contract.get(cid, []):
                invs[i["id"]] = i
            houses.append(_house_card(
                s,
                contracts.get(cid) if cid else None,
                pay_aggs.get(cid) if cid else None,
                list(invs.values()),
                ledger.get(pid, {}),
            ))

        buckets: dict = {}
        for h in houses:
            buckets[h["bucket"]] = buckets.get(h["bucket"], 0) + 1

        if status:
            houses = [h for h in houses if h["bucket"] == status]

        return {"ok": True, "houses": houses, "count": len(houses), "buckets": buckets}
    except Exception as e:
        logger.error(f"Error listing financed houses: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{sale_id}")
async def get_financed_house(sale_id: str):
    """Full detail for one financed house incl. payment schedule."""
    try:
        res = sb.table("sales").select(_SALE_SELECT).eq("id", sale_id).limit(1).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Venta no encontrada")
        sale = res.data[0]
        if sale.get("sale_type") != "rto":
            raise HTTPException(status_code=400, detail="La venta no es financiada (RTO)")

        pid = sale.get("property_id")
        cid = sale.get("rto_contract_id")
        contract = _fetch_contracts([cid]).get(cid) if cid else None
        pay = _fetch_payment_aggs([cid]).get(cid) if cid else None
        inv_by_prop, inv_by_contract = _fetch_investments([pid] if pid else [], [cid] if cid else [])
        invs: dict = {}
        for i in inv_by_prop.get(pid, []):
            invs[i["id"]] = i
        for i in inv_by_contract.get(cid, []):
            invs[i["id"]] = i
        led = _ledger_sums_by_property([pid] if pid else {}).get(pid, {})

        card = _house_card(sale, contract, pay, list(invs.values()), led)

        # Full payment schedule (detail view only)
        schedule = []
        if cid:
            schedule = sb.table("rto_payments").select(
                "payment_number, amount, paid_amount, due_date, paid_date, status"
            ).eq("rto_contract_id", cid).order("payment_number").execute().data or []
        card["schedule"] = schedule

        return {"ok": True, "house": card}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching financed house {sale_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{sale_id}/assignable-investments")
async def assignable_investments(sale_id: str, investor_id: Optional[str] = None):
    """Investor tickets eligible to be earmarked to this house: active/partial_return
    tickets NOT already linked to this property. Optionally filter by investor."""
    try:
        sale = sb.table("sales").select("property_id").eq("id", sale_id).limit(1).execute()
        if not sale.data:
            raise HTTPException(status_code=404, detail="Venta no encontrada")
        this_prop = sale.data[0].get("property_id")

        q = sb.table("investments").select(
            "id, investor_id, property_id, property_code, rto_contract_id, amount, "
            "expected_return_rate, status, promissory_note_id, "
            "investors!investments_investor_id_fkey(name)"
        ).in_("status", list(_ASSIGNABLE_STATUSES))
        if investor_id:
            q = q.eq("investor_id", investor_id)
        rows = q.execute().data or []

        out = [
            {
                "investment_id": r.get("id"),
                "investor_id": r.get("investor_id"),
                "investor_name": (r.get("investors") or {}).get("name"),
                "amount": float(r.get("amount") or 0),
                "rate": float(r.get("expected_return_rate") or 0),
                "status": r.get("status"),
                "note_backed": bool(r.get("promissory_note_id")),
                "current_property_id": r.get("property_id"),
                "current_property_code": r.get("property_code"),
            }
            for r in rows
            if r.get("property_id") != this_prop  # not already on this house
        ]
        return {"ok": True, "investments": out, "count": len(out)}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing assignable investments for {sale_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class AssignInvestorRequest(BaseModel):
    investment_id: str


@router.post("/{sale_id}/assign-investor")
async def assign_investor(sale_id: str, data: AssignInvestorRequest):
    """Earmark an EXISTING investor ticket to this house.

    Pure re-tag: UPDATE investments.property_id / rto_contract_id. No money moves,
    no ledger entry — the ticket's principal already sits in 23900, so the
    reconciliation invariant is preserved regardless of the house it points to."""
    try:
        sale = sb.table("sales").select("property_id, rto_contract_id, sale_type") \
            .eq("id", sale_id).limit(1).execute()
        if not sale.data:
            raise HTTPException(status_code=404, detail="Venta no encontrada")
        s = sale.data[0]
        if s.get("sale_type") != "rto":
            raise HTTPException(status_code=400, detail="La venta no es financiada (RTO)")

        inv = sb.table("investments").select("id, status, amount, investor_id") \
            .eq("id", data.investment_id).limit(1).execute()
        if not inv.data:
            raise HTTPException(status_code=404, detail="Inversión no encontrada")
        ticket = inv.data[0]
        if ticket.get("status") not in _ASSIGNABLE_STATUSES:
            raise HTTPException(
                status_code=400,
                detail=f"No se puede asignar un ticket con estado '{ticket.get('status')}'",
            )

        update = {"property_id": s.get("property_id")}
        if s.get("rto_contract_id"):
            update["rto_contract_id"] = s.get("rto_contract_id")
        sb.table("investments").update(update).eq("id", data.investment_id).execute()

        return {"ok": True, "investment_id": data.investment_id, "property_id": s.get("property_id")}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error assigning investor to {sale_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{sale_id}/unassign-investor")
async def unassign_investor(sale_id: str, data: AssignInvestorRequest):
    """Remove a ticket's earmark from this house (only if it currently points here).

    Clears property_id / rto_contract_id — the capital stays deposited (still in
    23900), it just becomes un-earmarked. No ledger entry."""
    try:
        sale = sb.table("sales").select("property_id").eq("id", sale_id).limit(1).execute()
        if not sale.data:
            raise HTTPException(status_code=404, detail="Venta no encontrada")
        this_prop = sale.data[0].get("property_id")

        inv = sb.table("investments").select("id, property_id").eq("id", data.investment_id).limit(1).execute()
        if not inv.data:
            raise HTTPException(status_code=404, detail="Inversión no encontrada")
        if inv.data[0].get("property_id") != this_prop:
            raise HTTPException(status_code=400, detail="El ticket no está asignado a esta casa")

        sb.table("investments").update({"property_id": None, "rto_contract_id": None}) \
            .eq("id", data.investment_id).execute()
        return {"ok": True, "investment_id": data.investment_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error unassigning investor from {sale_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
