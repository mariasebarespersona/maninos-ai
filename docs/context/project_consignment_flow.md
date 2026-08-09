---
name: project_consignment_flow
description: "Consignment houses can be sold before paying the previous owner; debt recorded at intake, COGS at payment"
metadata: 
  node_type: memory
  type: project
  originSessionId: e5223da9-e4bf-474d-bda1-f506713af80e
---

Consignment = a house taken without paying the previous owner, to pay later. As of 2026-07 the real flow is supported: **sell first, pay the owner afterwards.**

Rules (chosen by the user):
- **Debt appears at intake:** `create_property` with `is_consignment=true` auto-creates an outstanding purchase `payment_order` (concept='compra', status='approved', amount=`purchase_price`, payee=`seller_name` or "Dueño anterior — <CODE>") → which auto-generates its "por pagar" bill (see [[project_auto_payable_invoices]]). Debt is visible from day 1.
- **Sellable before paid:** `sales.create_sale` guard allows selling a consignment house from purchased/renovating/pending_payment (not just published). It reserves the property from ANY pre-sale status.
- **COGS at payment** (unchanged policy, see [[project_cogs_per_house_policy]]): paying the 'compra' order (normal Notificaciones/Tesorería flow) posts COGS, stamps `properties.consignment_paid_at`, and settles the bill.
- **complete_payment_order** only promotes `pending_payment`→`purchased`; it must NEVER revert a later status — a consignment house sold before payment is `reserved`/`sold`, and paying the owner afterwards must not undo that.

Columns: `properties.is_consignment` (bool), `properties.consignment_paid_at` (ts). The old "Pagar Consignación" button was replaced by a "Consignación pendiente de pago" indicator (payment now flows through the standard payment path). H48 was the first real consignment ($27,500 owed).
