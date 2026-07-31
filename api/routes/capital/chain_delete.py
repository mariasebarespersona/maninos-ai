"""
Capital — Borrado en CASCADA de una operación RTO completa (cliente RTO / casa
financiada), keyed por sale_id.

Elimina TODO lo que cuelga de la venta en ambos portales, sin dejar huérfanos
ni asientos fantasma:

  CAPITAL: contrato, cronograma de pagos, cuotas de enganche, auto-facturas
  [RTO:] (+ sus legs del ledger, vía delete_capital_invoice), asientos ligados
  al contrato/pagos/adquisición (con des-linkeo de estados de cuenta y pares),
  flujos de renta, órdenes de pago del contrato, solicitud (+ solicitud de
  crédito por FK CASCADE). Los tickets de INVERSIONISTAS earmarkeados a la casa
  se DESASIGNAN (nunca se borra dinero de inversionistas — invariante 23900).

  HOMES: facturas de la venta ([CAPFIN], comisiones) + sus asientos, pagos de
  comisión, pagos de venta, órdenes de pago (enganche / pago_capital) + sus
  asientos, asiento COGS de la venta, traspasos de título, emails programados
  y notificaciones de la venta.

  CASA: si es source='manual_capital' se elimina (solo existía para esta
  operación); si es una casa real de Homes, se re-publica en el catálogo si no
  tiene otra venta activa. CLIENTE: se conserva; su estado vuelve a 'lead' si
  no le quedan otras ventas.

Antes de borrar se sube un BACKUP JSON completo a Storage
(transaction-documents/deleted-chains/) y se devuelve su URL.
"""

import json
import logging
from datetime import datetime
from fastapi import APIRouter, HTTPException
from tools.supabase_client import sb

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/rto-chain", tags=["Capital - Borrado de cadena RTO"])

_BUCKET = "transaction-documents"
# Tipos de asiento Capital ligados a la operación de la casa (nunca depósitos
# de inversionistas, que llevan investor_id y se preservan siempre).
_CAPITAL_SALE_TXN_TYPES = ("acquisition", "rto_payment", "down_payment", "late_fee", "invoice_ar", "adjustment")


def _load_chain(sale_id: str) -> dict:
    """Carga toda la cadena ligada a la venta. Lanza 404 si no existe."""
    sale = sb.table("sales").select("*").eq("id", sale_id).execute().data
    if not sale:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    sale = sale[0]
    pid, cid = sale.get("property_id"), sale.get("client_id")

    contracts = sb.table("rto_contracts").select("*").eq("sale_id", sale_id).execute().data or []
    contract_ids = [c["id"] for c in contracts]
    payments = []
    installments = []
    if contract_ids:
        payments = sb.table("rto_payments").select("*").in_("rto_contract_id", contract_ids).execute().data or []
        installments = sb.table("capital_down_payment_installments").select("*") \
            .in_("contract_id", contract_ids).execute().data or []
    pay_ids = [p["id"] for p in payments]

    # Capital: facturas del contrato/pagos
    cap_invoices = []
    if contract_ids:
        cap_invoices += sb.table("capital_invoices").select("*").in_("rto_contract_id", contract_ids).execute().data or []
    if pay_ids:
        extra = sb.table("capital_invoices").select("*").in_("rto_payment_id", pay_ids).execute().data or []
        seen = {i["id"] for i in cap_invoices}
        cap_invoices += [i for i in extra if i["id"] not in seen]

    # Capital: asientos ligados (excluyendo inversionistas y legs de facturas,
    # que se borran vía delete_capital_invoice)
    inv_ids = {i["id"] for i in cap_invoices}
    cap_txns = []
    seen_txn = set()

    def _add_txns(rows):
        for r in rows or []:
            if r["id"] in seen_txn:
                continue
            if r.get("investor_id"):
                continue                       # dinero de inversionistas: JAMÁS
            if r.get("entity_type") == "invoice" and r.get("entity_id") in inv_ids:
                continue                       # legs de facturas: los borra delete_capital_invoice
            seen_txn.add(r["id"])
            cap_txns.append(r)

    if contract_ids:
        _add_txns(sb.table("capital_transactions").select("*").in_("rto_contract_id", contract_ids).execute().data)
    if pay_ids:
        _add_txns(sb.table("capital_transactions").select("*").in_("rto_payment_id", pay_ids).execute().data)
    if pid:
        rows = sb.table("capital_transactions").select("*").eq("property_id", pid) \
            .in_("transaction_type", list(_CAPITAL_SALE_TXN_TYPES)).execute().data or []
        _add_txns(rows)
    # Pares balanceados: incluir la otra pierna aunque no tenga el link directo
    linked_ids = [t.get("linked_transaction_id") for t in cap_txns if t.get("linked_transaction_id")]
    missing = [l for l in linked_ids if l not in seen_txn]
    if missing:
        _add_txns(sb.table("capital_transactions").select("*").in_("id", missing).execute().data)

    cap_flows = []
    if contract_ids:
        cap_flows = sb.table("capital_flows").select("*").in_("rto_contract_id", contract_ids).execute().data or []
    cap_pos = []
    if contract_ids:
        cap_pos = sb.table("capital_payment_orders").select("*").in_("rto_contract_id", contract_ids).execute().data or []

    # Inversionistas earmarkeados a la casa/contrato → solo desasignar
    earmarked = []
    if pid or contract_ids:
        q = sb.table("investments").select("id, investor_id, amount, property_id, rto_contract_id").execute().data or []
        earmarked = [i for i in q if (pid and i.get("property_id") == pid)
                     or (i.get("rto_contract_id") in contract_ids)]

    # Homes
    homes_invoices = sb.table("accounting_invoices").select("*").eq("sale_id", sale_id).execute().data or []
    commission_pays = sb.table("commission_payments").select("*").eq("sale_id", sale_id).execute().data or []
    sale_pays = sb.table("sale_payments").select("*").eq("sale_id", sale_id).execute().data or []
    transfers = sb.table("title_transfers").select("*").eq("sale_id", sale_id).execute().data or []
    sched_emails = sb.table("scheduled_emails").select("id").eq("sale_id", sale_id).execute().data or []
    pos = []
    if pid:
        pos = sb.table("payment_orders").select("*").eq("property_id", pid) \
            .in_("concept", ["enganche", "pago_capital"]).execute().data or []
    # Asientos Homes: legs de facturas de la venta + legs de esas POs + COGS de la venta
    homes_txns = []
    hseen = set()

    def _hadd(rows):
        for r in rows or []:
            if r["id"] not in hseen:
                hseen.add(r["id"])
                homes_txns.append(r)

    hinv_ids = [i["id"] for i in homes_invoices]
    if hinv_ids:
        _hadd(sb.table("accounting_transactions").select("*").eq("entity_type", "invoice").in_("entity_id", hinv_ids).execute().data)
    po_ids = [p["id"] for p in pos]
    if po_ids:
        _hadd(sb.table("accounting_transactions").select("*").eq("entity_type", "payment_order").in_("entity_id", po_ids).execute().data)
    _hadd(sb.table("accounting_transactions").select("*").eq("entity_type", "sale").eq("entity_id", sale_id).execute().data)
    hlinked = [t.get("linked_transaction_id") for t in homes_txns if t.get("linked_transaction_id")]
    hmissing = [l for l in hlinked if l not in hseen]
    if hmissing:
        _hadd(sb.table("accounting_transactions").select("*").in_("id", hmissing).execute().data)

    notif = sb.table("notifications").select("id").eq("related_entity_type", "sale") \
        .eq("related_entity_id", sale_id).execute().data or []

    prop = sb.table("properties").select("*").eq("id", pid).execute().data if pid else []
    prop = prop[0] if prop else None
    client = sb.table("clients").select("id, name, status").eq("id", cid).execute().data if cid else []
    client = client[0] if client else None
    apps = sb.table("rto_applications").select("*").eq("sale_id", sale_id).execute().data or []

    return {
        "sale": sale, "property": prop, "client": client, "applications": apps,
        "contracts": contracts, "payments": payments, "installments": installments,
        "cap_invoices": cap_invoices, "cap_txns": cap_txns, "cap_flows": cap_flows,
        "cap_payment_orders": cap_pos, "earmarked_investments": earmarked,
        "homes_invoices": homes_invoices, "homes_txns": homes_txns,
        "commission_payments": commission_pays, "sale_payments": sale_pays,
        "payment_orders": pos, "title_transfers": transfers,
        "scheduled_emails": sched_emails, "notifications": notif,
    }


@router.get("/{sale_id}/preview")
async def preview_chain_delete(sale_id: str):
    """Qué se eliminaría exactamente (conteos + montos) — para el modal de confirmación."""
    try:
        ch = _load_chain(sale_id)
        prop, client, sale = ch["property"], ch["client"], ch["sale"]
        is_manual = (sale.get("source") == "manual_capital")
        cap_confirmed = round(sum(float(t.get("amount") or 0) for t in ch["cap_txns"] if t.get("status") == "confirmed"), 2)
        homes_confirmed = round(sum(float(t.get("amount") or 0) for t in ch["homes_txns"] if t.get("status") == "confirmed"), 2)
        other_sales = 0
        if prop:
            other = sb.table("sales").select("id").eq("property_id", prop["id"]).neq("id", sale_id) \
                .neq("status", "cancelled").execute().data or []
            other_sales = len(other)
        return {
            "ok": True,
            "sale_id": sale_id,
            "is_manual": is_manual,
            "client_name": (client or {}).get("name"),
            "property_address": (prop or {}).get("address"),
            "property_action": ("eliminar (solo existía en Capital)" if is_manual
                                else ("re-publicar en el catálogo" if other_sales == 0 else "se conserva (tiene otras ventas)")),
            "counts": {
                "solicitudes": len(ch["applications"]),
                "contratos": len(ch["contracts"]),
                "pagos_cronograma": len(ch["payments"]),
                "pagos_cobrados": sum(1 for p in ch["payments"] if p.get("status") == "paid"),
                "cuotas_enganche": len(ch["installments"]),
                "facturas_capital": len(ch["cap_invoices"]),
                "asientos_capital": len(ch["cap_txns"]),
                "flujos_capital": len(ch["cap_flows"]),
                "ordenes_capital": len(ch["cap_payment_orders"]),
                "facturas_homes": len(ch["homes_invoices"]),
                "asientos_homes": len(ch["homes_txns"]),
                "comisiones": len(ch["commission_payments"]),
                "pagos_venta": len(ch["sale_payments"]),
                "ordenes_homes": len(ch["payment_orders"]),
                "traspasos_titulo": len(ch["title_transfers"]),
                "inversionistas_a_desasignar": len(ch["earmarked_investments"]),
            },
            "accounting_impact": {
                "capital_confirmado": cap_confirmed,
                "homes_confirmado": homes_confirmed,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[chain-delete] preview failed for {sale_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _delete_capital_txns(txns: list):
    """Borra asientos Capital des-linkeando estados de cuenta y pares primero."""
    ids = [t["id"] for t in txns]
    if not ids:
        return
    try:
        sb.table("capital_statement_movements").update({"transaction_id": None, "status": "pending"}) \
            .in_("transaction_id", ids).execute()
        sb.table("capital_statement_movements").update({"matched_transaction_id": None}) \
            .in_("matched_transaction_id", ids).execute()
    except Exception as e:
        logger.warning(f"[chain-delete] capital statement unlink: {e}")
    sb.table("capital_transactions").update({"linked_transaction_id": None}).in_("id", ids).execute()
    sb.table("capital_transactions").delete().in_("id", ids).execute()


def _delete_homes_txns(txns: list):
    ids = [t["id"] for t in txns]
    if not ids:
        return
    try:
        sb.table("statement_movements").update({"transaction_id": None, "status": "pending"}) \
            .in_("transaction_id", ids).execute()
        sb.table("statement_movements").update({"matched_transaction_id": None}) \
            .in_("matched_transaction_id", ids).execute()
    except Exception as e:
        logger.warning(f"[chain-delete] homes statement unlink: {e}")
    sb.table("accounting_transactions").update({"linked_transaction_id": None}).in_("id", ids).execute()
    sb.table("accounting_transactions").delete().in_("id", ids).execute()


@router.delete("/{sale_id}")
async def delete_chain(sale_id: str, deleted_by: str = "capital"):
    """Ejecuta el borrado en cascada. Sube backup JSON completo antes de tocar nada."""
    try:
        ch = _load_chain(sale_id)
        sale, prop, client = ch["sale"], ch["property"], ch["client"]
        contract_ids = [c["id"] for c in ch["contracts"]]
        is_manual = (sale.get("source") == "manual_capital")

        # ── 0. BACKUP a Storage ─────────────────────────────────────────────
        backup_url = None
        try:
            ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            path = f"deleted-chains/{sale_id}_{ts}.json"
            blob = json.dumps({"deleted_by": deleted_by, "deleted_at": datetime.utcnow().isoformat(), **ch},
                              default=str).encode()
            sb.storage.from_(_BUCKET).upload(path, blob, {"content-type": "application/json"})
            backup_url = sb.storage.from_(_BUCKET).get_public_url(path)
            if backup_url and backup_url.endswith("?"):
                backup_url = backup_url[:-1]
        except Exception as be:
            logger.error(f"[chain-delete] BACKUP FAILED for {sale_id}: {be}")
            raise HTTPException(status_code=500, detail=f"No se pudo crear el backup — borrado ABORTADO: {be}")

        # ── 1. CAPITAL ──────────────────────────────────────────────────────
        from api.routes.capital.accounting_invoices import delete_capital_invoice
        for inv in ch["cap_invoices"]:
            try:
                await delete_capital_invoice(inv["id"])
            except Exception as de:
                logger.warning(f"[chain-delete] capital invoice {inv['id']}: {de}")
        _delete_capital_txns(ch["cap_txns"])
        # Flujos: los de inversionista se DESASIGNAN, el resto se borra
        for f in ch["cap_flows"]:
            if f.get("investor_id") or f.get("investment_id"):
                sb.table("capital_flows").update({"rto_contract_id": None, "property_id": None,
                                                  "rto_payment_id": None}).eq("id", f["id"]).execute()
            else:
                sb.table("capital_flows").delete().eq("id", f["id"]).execute()
        for i in ch["earmarked_investments"]:
            sb.table("investments").update({"property_id": None, "rto_contract_id": None}).eq("id", i["id"]).execute()
        if ch["cap_payment_orders"]:
            sb.table("capital_payment_orders").delete().in_("id", [p["id"] for p in ch["cap_payment_orders"]]).execute()
        if contract_ids:
            sb.table("capital_down_payment_installments").delete().in_("contract_id", contract_ids).execute()
            sb.table("rto_payments").delete().in_("rto_contract_id", contract_ids).execute()

        # ── 2. HOMES ────────────────────────────────────────────────────────
        _delete_homes_txns(ch["homes_txns"])
        if ch["homes_invoices"]:
            sb.table("accounting_invoices").delete().in_("id", [i["id"] for i in ch["homes_invoices"]]).execute()
        if ch["commission_payments"]:
            sb.table("commission_payments").delete().in_("id", [c["id"] for c in ch["commission_payments"]]).execute()
        if ch["sale_payments"]:
            sb.table("sale_payments").delete().in_("id", [s["id"] for s in ch["sale_payments"]]).execute()
        for po in ch["payment_orders"]:
            sb.table("payment_orders").update({"accounting_transaction_id": None}).eq("id", po["id"]).execute()
            sb.table("payment_orders").delete().eq("id", po["id"]).execute()
        if ch["title_transfers"]:
            sb.table("title_transfers").delete().in_("id", [t["id"] for t in ch["title_transfers"]]).execute()
        if ch["scheduled_emails"]:
            sb.table("scheduled_emails").delete().in_("id", [e["id"] for e in ch["scheduled_emails"]]).execute()
        if ch["notifications"]:
            sb.table("notifications").delete().in_("id", [n["id"] for n in ch["notifications"]]).execute()

        # ── 3. Núcleo: contrato → solicitud (+credit app x FK) → venta ──────
        sb.table("sales").update({"rto_contract_id": None}).eq("id", sale_id).execute()
        if contract_ids:
            sb.table("rto_contracts").delete().in_("id", contract_ids).execute()
        if ch["applications"]:
            sb.table("rto_applications").delete().in_("id", [a["id"] for a in ch["applications"]]).execute()
        sb.table("sales").delete().eq("id", sale_id).execute()

        # ── 4. Casa ─────────────────────────────────────────────────────────
        property_action = "sin casa"
        if prop:
            if is_manual:
                # Solo eliminar la casa si NINGUNA otra venta la usa (una casa
                # manual puede tener varias operaciones — p.ej. un alta
                # duplicada). Si queda otra, se conserva la casa Y sus
                # expedientes/notificaciones (pertenecen a la operación viva).
                other_manual = sb.table("sales").select("id").eq("property_id", prop["id"]).execute().data or []
                if other_manual:
                    property_action = "conservada (otra operación RTO la usa)"
                else:
                    sb.table("title_transfers").delete().eq("property_id", prop["id"]).execute()
                    sb.table("notifications").delete().eq("property_id", prop["id"]).execute()
                    sb.table("properties").delete().eq("id", prop["id"]).execute()
                    property_action = "eliminada"
            else:
                other = sb.table("sales").select("id").eq("property_id", prop["id"]) \
                    .neq("status", "cancelled").execute().data or []
                if not other:
                    sb.table("properties").update({"status": "published"}).eq("id", prop["id"]).execute()
                    property_action = "re-publicada"
                else:
                    property_action = "conservada (tiene otras ventas)"

        # ── 5. Cliente: conservar; estado a 'lead' si no le quedan ventas ───
        client_action = "sin cliente"
        if client:
            remaining = sb.table("sales").select("id").eq("client_id", client["id"]).execute().data or []
            if not remaining:
                sb.table("clients").update({"status": "lead"}).eq("id", client["id"]).execute()
                client_action = "conservado (estado → lead)"
            else:
                client_action = "conservado (tiene otras ventas)"

        logger.info(f"[chain-delete] Sale {sale_id} chain deleted by {deleted_by}: "
                    f"property={property_action}, client={client_action}, backup={backup_url}")
        return {
            "ok": True,
            "message": "Operación RTO eliminada por completo (contabilidad incluida).",
            "property_action": property_action,
            "client_action": client_action,
            "backup_url": backup_url,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[chain-delete] delete failed for {sale_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
