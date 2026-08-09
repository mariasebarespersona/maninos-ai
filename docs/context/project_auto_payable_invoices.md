---
name: project_auto_payable_invoices
description: "Outbound payment_orders auto-generate a document-only payable bill tagged [PO:<id>] — never post it to the ledger"
metadata: 
  node_type: memory
  type: project
  originSessionId: e5223da9-e4bf-474d-bda1-f506713af80e
---

Every OUTBOUND `payment_order` (compra/renovación/movida/comisión) auto-generates a matching "por pagar" bill in `accounting_invoices` (direction=payable) via `_sync_payable_invoice()` in `api/routes/payment_orders.py`. Lifecycle-synced: create/edit→'sent', complete→'paid', cancel→'voided'.

**Critical:** the bill is a DOCUMENT record only — it is inserted directly and MUST NOT post to the ledger. The payment_order's own completion already posts the real expense/inventory entry (`property_purchase_paid`, `renovation_paid`, etc.); posting the bill too (as `create_invoice` does via `invoice_received_ap`) would DOUBLE-COUNT the expense in the P&L.

Linked idempotently by the order id embedded in the bill's `notes` as `[PO:<order_id>]` (matched with `ilike`). Inbound orders (client receipts) are skipped.

Dashboard "Por Pagar" KPI + Facturas tab read `accounting_invoices`, so these show automatically. Receivables side is separate: dashboard AR is DERIVED from `sales.amount_pending` (see accounting.py dashboard). Related: [[project_consignment_flow]], [[project_cogs_per_house_policy]].
