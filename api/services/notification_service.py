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
    """Property was purchased from market."""
    return create_notification(
        type="purchase",
        title=f"Casa comprada: {address[:50]}",
        message=f"Se ha comprado la propiedad '{address}' por ${purchase_price:,.0f}. Vendedor: {seller or 'N/A'}. Orden de pago creada para Abigail.",
        property_id=property_id,
        amount=purchase_price,
        priority="high",
        action_required=True,
        action_type="pay",
    )


def notify_new_sale(sale_id: str, property_id: str, sale_type: str, sale_price: float, client_name: str = ""):
    """New sale created (contado or RTO)."""
    tipo = "Contado" if sale_type == "contado" else "RTO"
    return create_notification(
        type="sale",
        title=f"Nueva venta {tipo}: ${sale_price:,.0f}",
        message=f"Venta {tipo} registrada por ${sale_price:,.0f} a {client_name or 'cliente'}. {'Pendiente transferencia bancaria.' if sale_type == 'contado' else 'Pendiente aprobación de contrato RTO en Capital.'}",
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
    """Commission created for an employee."""
    return create_notification(
        type="commission",
        title=f"Comisión: ${amount:,.0f} para {employee_name}",
        message=f"Comisión de ${amount:,.0f} generada para {employee_name} ({role}). Pendiente de pago. Registrar en contabilidad.",
        property_id=property_id,
        related_entity_type="sale",
        related_entity_id=sale_id,
        amount=amount,
        priority="normal",
        action_required=True,
        action_type="pay",
    )


def notify_payment_order_created(order_id: str, property_id: str, amount: float, payee_name: str = ""):
    """Payment order created (pending approval)."""
    return create_notification(
        type="payment_order",
        title=f"Orden de pago: ${amount:,.0f}",
        message=f"Orden de pago por ${amount:,.0f} a {payee_name or 'vendedor'}. Pendiente aprobación de administrador.",
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
    return create_notification(
        type="payment_order",
        title=f"Pago aprobado: ${amount:,.0f}",
        message=f"Orden de pago por ${amount:,.0f} aprobada por {approved_by or 'admin'}. Abigail puede procesar el pago.",
        property_id=property_id,
        related_entity_type="payment_order",
        related_entity_id=order_id,
        amount=amount,
        priority="high",
        action_required=True,
        action_type="pay",
    )


def notify_payment_completed(order_id: str, property_id: str, amount: float, method: str = ""):
    """Payment completed."""
    return create_notification(
        type="payment_order",
        title=f"Pago completado: ${amount:,.0f}",
        message=f"Pago de ${amount:,.0f} realizado via {method or 'transferencia'}. Registrado en contabilidad.",
        property_id=property_id,
        related_entity_type="payment_order",
        related_entity_id=order_id,
        amount=amount,
        priority="normal",
    )


def notify_renovation_submitted(property_id: str, total_cost: float, responsable: str = ""):
    """Renovation quote submitted for approval."""
    return create_notification(
        type="renovation",
        title=f"Cotización renovación: ${total_cost:,.0f}",
        message=f"Cotización de renovación por ${total_cost:,.0f} enviada para aprobación. Responsable: {responsable or 'N/A'}.",
        property_id=property_id,
        related_entity_type="renovation",
        amount=total_cost,
        priority="high",
        action_required=True,
        action_type="approve",
    )


def notify_renovation_approved(property_id: str, total_cost: float, approved_by: str = ""):
    """Renovation quote approved."""
    return create_notification(
        type="renovation",
        title=f"Renovación aprobada: ${total_cost:,.0f}",
        message=f"Cotización de ${total_cost:,.0f} aprobada por {approved_by or 'admin'}. Solicitar pago a Abigail.",
        property_id=property_id,
        related_entity_type="renovation",
        amount=total_cost,
        priority="normal",
        action_required=True,
        action_type="pay",
    )


def notify_move_created(property_id: str, move_cost: float, origin: str = "", destination: str = ""):
    """Move/transport contracted."""
    return create_notification(
        type="move",
        title=f"Movida contratada: ${move_cost:,.0f}",
        message=f"Movida de '{origin}' a '{destination}' por ${move_cost:,.0f}.",
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
