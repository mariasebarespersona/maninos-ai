"""
Centralized Notification Service for Maninos AI.

Creates detailed notifications for all key business events:
- Property purchases, sales, moves
- Commissions
- Payment orders (pending, approved, completed)
- Renovation quotes (submitted, approved)
- Capital payments (RTO, down payments)
- Cash payments
- E-signatures
"""

import logging
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)


def _get_sb():
    from tools.supabase_client import sb
    return sb


def _get_property_info(property_id: str) -> dict:
    """Get property address and code for notification context."""
    if not property_id:
        return {"address": "", "code": ""}
    try:
        sb = _get_sb()
        result = sb.table("properties").select("address, property_code, city").eq("id", property_id).limit(1).execute()
        if result.data:
            p = result.data[0]
            addr = f"{p.get('address', '')}, {p.get('city', '')}" if p.get('city') else p.get('address', '')
            return {"address": addr[:100], "code": p.get("property_code", "")}
    except Exception:
        pass
    return {"address": "", "code": ""}


def create_notification(
    type: str,
    title: str,
    message: str,
    category: str = "homes",
    property_id: Optional[str] = None,
    related_entity_type: Optional[str] = None,
    related_entity_id: Optional[str] = None,
    amount: Optional[float] = None,
    priority: str = "normal",
    action_required: bool = False,
    action_type: Optional[str] = None,
    created_by: str = "system",
    metadata: Optional[dict] = None,
) -> Optional[dict]:
    """Create a notification in the database."""
    try:
        sb = _get_sb()
        prop_info = _get_property_info(property_id) if property_id else {"address": "", "code": ""}

        data = {
            "type": type,
            "category": category,
            "title": title,
            "message": message,
            "property_id": property_id,
            "property_address": prop_info["address"],
            "property_code": prop_info["code"],
            "related_entity_type": related_entity_type,
            "related_entity_id": related_entity_id,
            "amount": amount,
            "priority": priority,
            "action_required": action_required,
            "action_type": action_type,
            "created_by": created_by,
            "metadata": metadata or {},
        }

        result = sb.table("notifications").insert(data).execute()
        logger.info(f"[Notif] Created: {type} — {title}")
        return result.data[0] if result.data else None
    except Exception as e:
        logger.warning(f"[Notif] Failed to create notification: {e}")
        return None


# ═══════════════════════════════════════════════════════════════════
# SPECIFIC NOTIFICATION CREATORS
# ═══════════════════════════════════════════════════════════════════

def notify_property_purchased(property_id: str, address: str, purchase_price: float, seller: str = ""):
    """Property was purchased from market — full context."""
    prop = _get_property_info(property_id) if property_id else {"address": address, "code": ""}
    code_str = f" ({prop['code']})" if prop.get("code") else ""
    return create_notification(
        type="purchase",
        title=f"Casa comprada: {address[:40]}{code_str} — ${purchase_price:,.0f}",
        message=f"Se ha comprado '{address}' por ${purchase_price:,.0f}. Vendedor: {seller or 'N/A'}. Orden de pago creada para Abigail.",
        property_id=property_id,
        amount=purchase_price,
        priority="high",
        action_required=True,
        action_type="pay",
    )


def notify_new_sale(sale_id: str, property_id: str, sale_type: str, sale_price: float, client_name: str = ""):
    """New sale created (contado or RTO) — full context."""
    tipo = "Contado" if sale_type == "contado" else "RTO"
    prop = _get_property_info(property_id) if property_id else {"address": "", "code": ""}
    code_str = f" ({prop['code']})" if prop.get("code") else ""
    next_step = "Pendiente transferencia bancaria." if sale_type == "contado" else "Pendiente aprobación de contrato RTO en Capital."
    return create_notification(
        type="sale",
        title=f"Venta {tipo}: ${sale_price:,.0f} — {prop['address'][:35]}{code_str}",
        message=f"Venta {tipo} de '{prop['address']}' por ${sale_price:,.0f} a {client_name or 'cliente'}. {next_step}",
        category="both",
        property_id=property_id,
        related_entity_type="sale",
        related_entity_id=sale_id,
        amount=sale_price,
        priority="high",
        action_required=True,
        action_type="confirm",
    )


def notify_commission(sale_id: str, property_id: str, employee_name: str, amount: float, role: str = ""):
    """Commission created for an employee — includes property info."""
    prop = _get_property_info(property_id) if property_id else {"address": "", "code": ""}
    code_str = f" ({prop['code']})" if prop.get("code") else ""
    role_label = {"found_by": "encontró al cliente", "sold_by": "cerró la venta"}.get(role, role)
    return create_notification(
        type="commission",
        title=f"Comisión: ${amount:,.0f} — {employee_name} — {prop['address'][:30]}{code_str}",
        message=f"Comisión de ${amount:,.0f} para {employee_name} ({role_label}). Propiedad: {prop['address']}. Pendiente de pago.",
        property_id=property_id,
        related_entity_type="sale",
        related_entity_id=sale_id,
        amount=amount,
        priority="normal",
        action_required=True,
        action_type="pay",
    )


def notify_payment_order_created(order_id: str, property_id: str, amount: float, payee_name: str = "", property_address: str = "", concept: str = ""):
    """Payment order created (pending approval). Includes full context."""
    prop = _get_property_info(property_id) if property_id else {"address": "", "code": ""}
    addr = property_address or prop["address"]
    code_str = f" ({prop['code']})" if prop.get("code") else ""
    concept_str = f" — {concept}" if concept else ""
    return create_notification(
        type="payment_order",
        title=f"Orden de pago: ${amount:,.0f} — {addr[:40]}{code_str}",
        message=f"${amount:,.0f} a {payee_name or 'vendedor'}{concept_str}. Propiedad: {addr}{code_str}. Pendiente aprobación de administrador.",
        property_id=property_id,
        related_entity_type="payment_order",
        related_entity_id=order_id,
        amount=amount,
        priority="high",
        action_required=True,
        action_type="approve",
    )


def notify_payment_order_approved(order_id: str, property_id: str, amount: float, approved_by: str = ""):
    """Payment order approved (ready for treasury)."""
    prop = _get_property_info(property_id) if property_id else {"address": "", "code": ""}
    code_str = f" ({prop['code']})" if prop.get("code") else ""
    return create_notification(
        type="payment_order",
        title=f"Pago aprobado: ${amount:,.0f} — {prop['address'][:40]}{code_str}",
        message=f"Orden de pago por ${amount:,.0f} aprobada por {approved_by or 'admin'}. Propiedad: {prop['address']}. Abigail puede procesar.",
        property_id=property_id,
        related_entity_type="payment_order",
        related_entity_id=order_id,
        amount=amount,
        priority="high",
        action_required=True,
        action_type="pay",
    )


def notify_payment_completed(order_id: str, property_id: str, amount: float, method: str = "", payee_name: str = "", concept: str = ""):
    """Payment completed — includes full context."""
    prop = _get_property_info(property_id) if property_id else {"address": "", "code": ""}
    code_str = f" ({prop['code']})" if prop.get("code") else ""
    concept_str = f" [{concept}]" if concept else ""
    return create_notification(
        type="payment_order",
        title=f"Pago completado: ${amount:,.0f} — {prop['address'][:35]}{code_str}",
        message=f"Pago de ${amount:,.0f} a {payee_name or 'vendedor'} via {method or 'transferencia'}{concept_str}. Propiedad: {prop['address']}. Registrado en contabilidad.",
        property_id=property_id,
        related_entity_type="payment_order",
        related_entity_id=order_id,
        amount=amount,
        priority="normal",
    )


def notify_renovation_submitted(property_id: str, total_cost: float, responsable: str = "", items_summary: str = ""):
    """Renovation quote submitted for approval."""
    prop = _get_property_info(property_id) if property_id else {"address": "", "code": ""}
    code_str = f" ({prop['code']})" if prop.get("code") else ""
    items_str = f" — {items_summary}" if items_summary else ""
    return create_notification(
        type="renovation",
        title=f"Renovación {prop['address'][:35]}{code_str}: ${total_cost:,.0f}",
        message=f"Cotización de renovación por ${total_cost:,.0f} para {prop['address']}{items_str}. Responsable: {responsable or 'N/A'}. Pendiente aprobación.",
        property_id=property_id,
        related_entity_type="renovation",
        amount=total_cost,
        priority="high",
        action_required=True,
        action_type="approve",
    )


def notify_renovation_approved(property_id: str, total_cost: float, approved_by: str = ""):
    """Renovation quote approved."""
    prop = _get_property_info(property_id) if property_id else {"address": "", "code": ""}
    code_str = f" ({prop['code']})" if prop.get("code") else ""
    return create_notification(
        type="renovation",
        title=f"Renovación aprobada: ${total_cost:,.0f} — {prop['address'][:35]}{code_str}",
        message=f"Cotización de ${total_cost:,.0f} para {prop['address']} aprobada por {approved_by or 'admin'}. Solicitar pago a Abigail.",
        property_id=property_id,
        related_entity_type="renovation",
        amount=total_cost,
        priority="normal",
        action_required=True,
        action_type="pay",
    )


def notify_move_created(property_id: str, move_cost: float, origin: str = "", destination: str = "", company: str = "", driver: str = ""):
    """Move/transport contracted — includes full context."""
    prop = _get_property_info(property_id) if property_id else {"address": "", "code": ""}
    code_str = f" ({prop['code']})" if prop.get("code") else ""
    company_str = f" Empresa: {company}." if company else ""
    driver_str = f" Conductor: {driver}." if driver else ""
    return create_notification(
        type="move",
        title=f"Movida contratada: ${move_cost:,.0f} — {prop['address'][:30]}{code_str}",
        message=f"Movida de '{origin}' a '{destination}' por ${move_cost:,.0f}. Propiedad: {prop['address']}.{company_str}{driver_str}",
        property_id=property_id,
        related_entity_type="move",
        amount=move_cost,
        priority="normal",
    )


def notify_capital_payment_received(payment_id: str, property_id: str, amount: float, client_name: str = "", payment_type: str = "RTO"):
    """Capital received a payment from a client (RTO or down payment)."""
    return create_notification(
        type="capital_payment",
        title=f"Pago {payment_type} recibido: ${amount:,.0f}",
        message=f"Pago de ${amount:,.0f} recibido de {client_name or 'cliente'} ({payment_type}). Pendiente confirmación de tesorería.",
        category="both",
        property_id=property_id,
        related_entity_type="payment",
        related_entity_id=payment_id,
        amount=amount,
        priority="high",
        action_required=True,
        action_type="confirm",
    )


def notify_cash_payment(property_id: str, amount: float, from_name: str = "", description: str = ""):
    """Cash payment received."""
    return create_notification(
        type="cash_payment",
        title=f"Pago en efectivo: ${amount:,.0f}",
        message=f"Pago en efectivo de ${amount:,.0f} de {from_name or 'cliente'}. {description}. Registrar en contabilidad.",
        property_id=property_id,
        amount=amount,
        priority="high",
        action_required=True,
        action_type="confirm",
    )


def notify_sale_payment(sale_id: str, property_id: str, amount: float, payment_type: str = "partial", reported_by: str = "staff", client_name: str = "", sale_price: float = 0, amount_paid_so_far: float = 0):
    """Payment registered on a sale — includes full context with payment progress."""
    type_labels = {
        "down_payment": "Enganche",
        "remaining": "Saldo restante",
        "full": "Pago total",
        "partial": "Pago parcial",
        "adjustment": "Ajuste",
    }
    label = type_labels.get(payment_type, "Pago")
    source = "cliente" if reported_by == "client" else "empleado"
    prop = _get_property_info(property_id) if property_id else {"address": "", "code": ""}
    code_str = f" ({prop['code']})" if prop.get("code") else ""

    # Payment progress
    total_paid = amount_paid_so_far + amount
    pending = max(0, sale_price - total_paid) if sale_price > 0 else 0
    progress = f" Pagado: ${total_paid:,.0f} de ${sale_price:,.0f}, falta ${pending:,.0f}." if sale_price > 0 else ""

    return create_notification(
        type="sale_payment",
        title=f"Pago recibido: ${amount:,.0f} ({label}) — {prop['address'][:35]}{code_str}",
        message=f"{label} de ${amount:,.0f} de {client_name or 'cliente'} (registrado por {source}). Propiedad: {prop['address']}.{progress} Pendiente confirmación.",
        category="homes",
        property_id=property_id,
        related_entity_type="sale",
        related_entity_id=sale_id,
        amount=amount,
        priority="high",
        action_required=True,
        action_type="confirm",
    )


def notify_sale_payment_edited(sale_id: str, property_id: str, old_amount: float, new_amount: float, client_name: str = ""):
    """Sale payment was edited (amount changed)."""
    return create_notification(
        type="sale_payment",
        title=f"Pago editado: ${old_amount:,.0f} → ${new_amount:,.0f}",
        message=f"Pago de venta modificado de ${old_amount:,.0f} a ${new_amount:,.0f}. Cliente: {client_name or 'N/A'}. Verificar en contabilidad.",
        category="homes",
        property_id=property_id,
        related_entity_type="sale",
        related_entity_id=sale_id,
        amount=new_amount,
        priority="high",
        action_required=True,
        action_type="confirm",
    )
