"""
Stripe Payments Integration - Pagos Automáticos para RTO

Integración con Stripe para cobros mensuales de contratos rent-to-own.
https://docs.stripe.com/payments

Flujo de pagos automáticos:
1. create_stripe_customer() - Crear cliente en Stripe
2. create_setup_intent() - Preparar para agregar método de pago
3. Cliente completa checkout (frontend) con Stripe Elements
4. create_subscription() - Activar cobro recurrente
5. Stripe cobra automáticamente cada mes

Requisitos:
- STRIPE_SECRET_KEY en variables de entorno
- Webhook configurado para recibir eventos de pago
"""

import os
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from decimal import Decimal

logger = logging.getLogger(__name__)

# Stripe API
try:
    import stripe
    STRIPE_AVAILABLE = True
except ImportError:
    STRIPE_AVAILABLE = False
    logger.warning("[stripe_payments] stripe package not installed. Run: pip install stripe")


def _get_stripe_client():
    """Obtiene cliente de Stripe configurado."""
    if not STRIPE_AVAILABLE:
        raise ImportError("stripe package not installed. Run: pip install stripe")
    
    api_key = os.getenv("STRIPE_SECRET_KEY")
    if not api_key:
        raise ValueError("STRIPE_SECRET_KEY not configured in environment variables")
    
    stripe.api_key = api_key
    return stripe


# =============================================================================
# CUSTOMER MANAGEMENT
# =============================================================================

def create_stripe_customer(
    client_id: str,
    email: str,
    name: str,
    phone: Optional[str] = None,
    address: Optional[Dict] = None
) -> Dict[str, Any]:
    """
    Crea un cliente en Stripe asociado a nuestro client_id.
    
    Args:
        client_id: UUID del cliente en nuestra BD
        email: Email del cliente
        name: Nombre completo
        phone: Teléfono (opcional)
        address: Dirección {line1, city, state, postal_code, country}
    
    Returns:
        Dict con stripe_customer_id y detalles
    """
    try:
        stripe_client = _get_stripe_client()
        
        customer_data = {
            "email": email,
            "name": name,
            "metadata": {
                "maninos_client_id": client_id,
                "source": "maninos_ai"
            }
        }
        
        if phone:
            customer_data["phone"] = phone
        
        if address:
            customer_data["address"] = {
                "line1": address.get("line1", ""),
                "city": address.get("city", ""),
                "state": address.get("state", "TX"),
                "postal_code": address.get("postal_code", ""),
                "country": address.get("country", "US")
            }
        
        customer = stripe_client.Customer.create(**customer_data)
        
        logger.info(f"[create_stripe_customer] Created customer {customer.id} for client {client_id}")
        
        return {
            "ok": True,
            "stripe_customer_id": customer.id,
            "email": customer.email,
            "name": customer.name,
            "created": datetime.fromtimestamp(customer.created).isoformat(),
            "message": f"✅ Cliente creado en Stripe: {customer.id}"
        }
        
    except stripe.error.StripeError as e:
        logger.error(f"[create_stripe_customer] Stripe error: {e}")
        return {"ok": False, "error": f"Error de Stripe: {str(e)}"}
    except Exception as e:
        logger.error(f"[create_stripe_customer] Error: {e}")
        return {"ok": False, "error": str(e)}


def get_or_create_customer(
    client_id: str,
    email: str,
    name: str,
    **kwargs
) -> Dict[str, Any]:
    """
    Obtiene cliente existente o crea uno nuevo si no existe.
    Busca por metadata.maninos_client_id primero.
    """
    try:
        stripe_client = _get_stripe_client()
        
        # Buscar cliente existente por client_id en metadata
        existing = stripe_client.Customer.search(
            query=f'metadata["maninos_client_id"]:"{client_id}"'
        )
        
        if existing.data:
            customer = existing.data[0]
            logger.info(f"[get_or_create_customer] Found existing customer {customer.id}")
            return {
                "ok": True,
                "stripe_customer_id": customer.id,
                "email": customer.email,
                "name": customer.name,
                "existing": True,
                "message": f"Cliente encontrado: {customer.id}"
            }
        
        # No existe, crear nuevo
        return create_stripe_customer(client_id, email, name, **kwargs)
        
    except Exception as e:
        logger.error(f"[get_or_create_customer] Error: {e}")
        return {"ok": False, "error": str(e)}


# =============================================================================
# SETUP INTENT (para agregar método de pago)
# =============================================================================

def create_setup_intent(
    stripe_customer_id: str,
    return_url: Optional[str] = None
) -> Dict[str, Any]:
    """
    Crea un SetupIntent para que el cliente agregue método de pago.
    
    El cliente usa el client_secret con Stripe Elements (frontend)
    para agregar su tarjeta de forma segura.
    
    Args:
        stripe_customer_id: ID del cliente en Stripe (cus_xxx)
        return_url: URL de retorno después de setup
    
    Returns:
        Dict con client_secret para usar en frontend
    """
    try:
        stripe_client = _get_stripe_client()
        
        setup_intent = stripe_client.SetupIntent.create(
            customer=stripe_customer_id,
            payment_method_types=["card"],
            usage="off_session",  # Permite cobros futuros sin el cliente presente
            metadata={
                "source": "maninos_ai",
                "purpose": "rto_automatic_payment"
            }
        )
        
        logger.info(f"[create_setup_intent] Created {setup_intent.id} for customer {stripe_customer_id}")
        
        # URL para checkout hosted (alternativa a Stripe Elements)
        checkout_url = None
        if return_url:
            try:
                session = stripe_client.checkout.Session.create(
                    customer=stripe_customer_id,
                    mode="setup",
                    payment_method_types=["card"],
                    success_url=return_url + "?setup_success=true",
                    cancel_url=return_url + "?setup_canceled=true",
                )
                checkout_url = session.url
            except Exception as checkout_error:
                logger.warning(f"[create_setup_intent] Could not create checkout session: {checkout_error}")
        
        return {
            "ok": True,
            "setup_intent_id": setup_intent.id,
            "client_secret": setup_intent.client_secret,
            "status": setup_intent.status,
            "checkout_url": checkout_url,
            "message": "SetupIntent creado. El cliente debe agregar su tarjeta."
        }
        
    except stripe.error.StripeError as e:
        logger.error(f"[create_setup_intent] Stripe error: {e}")
        return {"ok": False, "error": f"Error de Stripe: {str(e)}"}
    except Exception as e:
        logger.error(f"[create_setup_intent] Error: {e}")
        return {"ok": False, "error": str(e)}


def get_customer_payment_methods(stripe_customer_id: str) -> Dict[str, Any]:
    """
    Lista los métodos de pago de un cliente.
    """
    try:
        stripe_client = _get_stripe_client()
        
        payment_methods = stripe_client.PaymentMethod.list(
            customer=stripe_customer_id,
            type="card"
        )
        
        methods = []
        for pm in payment_methods.data:
            methods.append({
                "id": pm.id,
                "brand": pm.card.brand,
                "last4": pm.card.last4,
                "exp_month": pm.card.exp_month,
                "exp_year": pm.card.exp_year,
            })
        
        return {
            "ok": True,
            "payment_methods": methods,
            "count": len(methods),
            "message": f"Cliente tiene {len(methods)} método(s) de pago"
        }
        
    except Exception as e:
        logger.error(f"[get_customer_payment_methods] Error: {e}")
        return {"ok": False, "error": str(e)}


# =============================================================================
# SUBSCRIPTION (cobro recurrente)
# =============================================================================

def create_price(
    amount_cents: int,
    nickname: str,
    contract_id: str
) -> Dict[str, Any]:
    """
    Crea un precio en Stripe para el cobro mensual.
    
    Args:
        amount_cents: Monto en centavos (ej: 69500 = $695.00)
        nickname: Descripción del precio
        contract_id: ID del contrato RTO
    """
    try:
        stripe_client = _get_stripe_client()
        
        # Buscar producto existente o crear uno
        products = stripe_client.Product.search(
            query='metadata["type"]:"rto_monthly_rent"'
        )
        
        if products.data:
            product = products.data[0]
        else:
            product = stripe_client.Product.create(
                name="Renta Mensual RTO - Maninos Capital",
                description="Pago mensual de contrato rent-to-own",
                metadata={"type": "rto_monthly_rent"}
            )
        
        # Crear precio
        price = stripe_client.Price.create(
            product=product.id,
            unit_amount=amount_cents,
            currency="usd",
            recurring={"interval": "month"},
            nickname=nickname,
            metadata={
                "contract_id": contract_id,
                "source": "maninos_ai"
            }
        )
        
        logger.info(f"[create_price] Created price {price.id} for ${amount_cents/100:.2f}/month")
        
        return {
            "ok": True,
            "price_id": price.id,
            "amount": amount_cents / 100,
            "currency": "usd",
            "interval": "month"
        }
        
    except Exception as e:
        logger.error(f"[create_price] Error: {e}")
        return {"ok": False, "error": str(e)}


def create_subscription(
    stripe_customer_id: str,
    price_id: str,
    contract_id: str,
    billing_cycle_anchor: Optional[int] = None,
    trial_end: Optional[int] = None
) -> Dict[str, Any]:
    """
    Crea una suscripción para cobros mensuales automáticos.
    
    Args:
        stripe_customer_id: ID del cliente en Stripe
        price_id: ID del precio creado
        contract_id: ID del contrato RTO
        billing_cycle_anchor: Timestamp de cuándo cobrar (día del mes)
        trial_end: Timestamp de fin de período de prueba
    """
    try:
        stripe_client = _get_stripe_client()
        
        # Verificar que el cliente tenga método de pago
        payment_methods = get_customer_payment_methods(stripe_customer_id)
        if not payment_methods.get("ok") or payment_methods.get("count", 0) == 0:
            return {
                "ok": False,
                "error": "El cliente no tiene método de pago configurado. Use create_setup_intent primero.",
                "needs_payment_method": True
            }
        
        # Obtener método de pago predeterminado
        default_pm = payment_methods["payment_methods"][0]["id"]
        
        subscription_data = {
            "customer": stripe_customer_id,
            "items": [{"price": price_id}],
            "default_payment_method": default_pm,
            "payment_behavior": "default_incomplete",
            "payment_settings": {
                "payment_method_types": ["card"],
                "save_default_payment_method": "on_subscription"
            },
            "metadata": {
                "contract_id": contract_id,
                "source": "maninos_ai"
            }
        }
        
        if billing_cycle_anchor:
            subscription_data["billing_cycle_anchor"] = billing_cycle_anchor
        
        if trial_end:
            subscription_data["trial_end"] = trial_end
        
        subscription = stripe_client.Subscription.create(**subscription_data)
        
        logger.info(f"[create_subscription] Created subscription {subscription.id} for contract {contract_id}")
        
        return {
            "ok": True,
            "subscription_id": subscription.id,
            "status": subscription.status,
            "current_period_start": datetime.fromtimestamp(subscription.current_period_start).isoformat(),
            "current_period_end": datetime.fromtimestamp(subscription.current_period_end).isoformat(),
            "message": f"✅ Suscripción creada. Próximo cobro: {datetime.fromtimestamp(subscription.current_period_end).strftime('%Y-%m-%d')}"
        }
        
    except stripe.error.CardError as e:
        logger.error(f"[create_subscription] Card error: {e}")
        return {"ok": False, "error": f"Error de tarjeta: {e.user_message}"}
    except stripe.error.StripeError as e:
        logger.error(f"[create_subscription] Stripe error: {e}")
        return {"ok": False, "error": f"Error de Stripe: {str(e)}"}
    except Exception as e:
        logger.error(f"[create_subscription] Error: {e}")
        return {"ok": False, "error": str(e)}


def cancel_subscription(
    subscription_id: str,
    cancel_immediately: bool = False
) -> Dict[str, Any]:
    """
    Cancela una suscripción.
    
    Args:
        subscription_id: ID de la suscripción
        cancel_immediately: Si True, cancela inmediatamente. Si False, al final del período.
    """
    try:
        stripe_client = _get_stripe_client()
        
        if cancel_immediately:
            subscription = stripe_client.Subscription.cancel(subscription_id)
        else:
            subscription = stripe_client.Subscription.modify(
                subscription_id,
                cancel_at_period_end=True
            )
        
        logger.info(f"[cancel_subscription] Canceled subscription {subscription_id}")
        
        return {
            "ok": True,
            "subscription_id": subscription.id,
            "status": subscription.status,
            "cancel_at_period_end": subscription.cancel_at_period_end,
            "message": "Suscripción cancelada" if cancel_immediately else "Suscripción se cancelará al final del período"
        }
        
    except Exception as e:
        logger.error(f"[cancel_subscription] Error: {e}")
        return {"ok": False, "error": str(e)}


# =============================================================================
# PAYMENT INTENTS (cobros únicos)
# =============================================================================

def create_payment_intent(
    stripe_customer_id: str,
    amount_cents: int,
    description: str,
    contract_id: str,
    payment_method_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Crea un PaymentIntent para un cobro único.
    
    Útil para:
    - Enganche/down payment
    - Late fees
    - Pagos extraordinarios
    
    Args:
        stripe_customer_id: ID del cliente
        amount_cents: Monto en centavos
        description: Descripción del cobro
        contract_id: ID del contrato
        payment_method_id: ID del método de pago (opcional, usa default)
    """
    try:
        stripe_client = _get_stripe_client()
        
        intent_data = {
            "customer": stripe_customer_id,
            "amount": amount_cents,
            "currency": "usd",
            "description": description,
            "metadata": {
                "contract_id": contract_id,
                "source": "maninos_ai"
            },
            "automatic_payment_methods": {"enabled": True}
        }
        
        if payment_method_id:
            intent_data["payment_method"] = payment_method_id
            intent_data["confirm"] = True
            intent_data["off_session"] = True
        
        payment_intent = stripe_client.PaymentIntent.create(**intent_data)
        
        logger.info(f"[create_payment_intent] Created {payment_intent.id} for ${amount_cents/100:.2f}")
        
        return {
            "ok": True,
            "payment_intent_id": payment_intent.id,
            "client_secret": payment_intent.client_secret,
            "status": payment_intent.status,
            "amount": amount_cents / 100,
            "message": f"PaymentIntent creado: ${amount_cents/100:.2f}"
        }
        
    except stripe.error.CardError as e:
        logger.error(f"[create_payment_intent] Card error: {e}")
        return {"ok": False, "error": f"Error de tarjeta: {e.user_message}"}
    except Exception as e:
        logger.error(f"[create_payment_intent] Error: {e}")
        return {"ok": False, "error": str(e)}


# =============================================================================
# PAYMENT STATUS & HISTORY
# =============================================================================

def get_subscription_status(subscription_id: str) -> Dict[str, Any]:
    """
    Obtiene el estado actual de una suscripción.
    """
    try:
        stripe_client = _get_stripe_client()
        
        subscription = stripe_client.Subscription.retrieve(
            subscription_id,
            expand=["latest_invoice", "default_payment_method"]
        )
        
        latest_invoice = subscription.latest_invoice
        
        return {
            "ok": True,
            "subscription_id": subscription.id,
            "status": subscription.status,
            "current_period_start": datetime.fromtimestamp(subscription.current_period_start).isoformat(),
            "current_period_end": datetime.fromtimestamp(subscription.current_period_end).isoformat(),
            "cancel_at_period_end": subscription.cancel_at_period_end,
            "latest_invoice": {
                "id": latest_invoice.id if latest_invoice else None,
                "status": latest_invoice.status if latest_invoice else None,
                "amount_due": latest_invoice.amount_due / 100 if latest_invoice else 0,
                "amount_paid": latest_invoice.amount_paid / 100 if latest_invoice else 0,
            } if latest_invoice else None,
            "payment_method": {
                "brand": subscription.default_payment_method.card.brand if subscription.default_payment_method else None,
                "last4": subscription.default_payment_method.card.last4 if subscription.default_payment_method else None,
            } if subscription.default_payment_method else None
        }
        
    except Exception as e:
        logger.error(f"[get_subscription_status] Error: {e}")
        return {"ok": False, "error": str(e)}


def get_customer_invoices(
    stripe_customer_id: str,
    limit: int = 10
) -> Dict[str, Any]:
    """
    Lista las facturas de un cliente.
    """
    try:
        stripe_client = _get_stripe_client()
        
        invoices = stripe_client.Invoice.list(
            customer=stripe_customer_id,
            limit=limit
        )
        
        invoice_list = []
        for inv in invoices.data:
            invoice_list.append({
                "id": inv.id,
                "number": inv.number,
                "status": inv.status,
                "amount_due": inv.amount_due / 100,
                "amount_paid": inv.amount_paid / 100,
                "created": datetime.fromtimestamp(inv.created).isoformat(),
                "due_date": datetime.fromtimestamp(inv.due_date).isoformat() if inv.due_date else None,
                "paid": inv.paid,
                "invoice_pdf": inv.invoice_pdf,
                "hosted_invoice_url": inv.hosted_invoice_url,
            })
        
        return {
            "ok": True,
            "invoices": invoice_list,
            "total": len(invoice_list),
            "has_more": invoices.has_more
        }
        
    except Exception as e:
        logger.error(f"[get_customer_invoices] Error: {e}")
        return {"ok": False, "error": str(e)}


def get_payment_history(
    stripe_customer_id: str,
    limit: int = 10
) -> Dict[str, Any]:
    """
    Obtiene historial de pagos de un cliente.
    """
    try:
        stripe_client = _get_stripe_client()
        
        # Obtener PaymentIntents
        payments = stripe_client.PaymentIntent.list(
            customer=stripe_customer_id,
            limit=limit
        )
        
        payment_list = []
        for payment in payments.data:
            payment_list.append({
                "id": payment.id,
                "amount": payment.amount / 100,
                "status": payment.status,
                "created": datetime.fromtimestamp(payment.created).isoformat(),
                "description": payment.description,
                "payment_method": payment.payment_method_types[0] if payment.payment_method_types else None,
                "receipt_url": payment.charges.data[0].receipt_url if payment.charges.data else None,
            })
        
        return {
            "ok": True,
            "payments": payment_list,
            "total": len(payment_list),
            "has_more": payments.has_more
        }
        
    except Exception as e:
        logger.error(f"[get_payment_history] Error: {e}")
        return {"ok": False, "error": str(e)}


# =============================================================================
# WEBHOOK HANDLING
# =============================================================================

def process_payment_webhook(payload: bytes, sig_header: str) -> Dict[str, Any]:
    """
    Procesa webhook de Stripe para eventos de pago.
    
    Eventos relevantes:
    - invoice.paid: Factura pagada (mensualidad cobrada)
    - invoice.payment_failed: Fallo en pago
    - customer.subscription.deleted: Suscripción cancelada
    - payment_intent.succeeded: Pago único exitoso
    - payment_intent.payment_failed: Pago único fallido
    
    Args:
        payload: Body del request (bytes)
        sig_header: Header Stripe-Signature
    
    Returns:
        Dict con evento procesado y acción recomendada
    """
    try:
        stripe_client = _get_stripe_client()
        
        webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET")
        
        if webhook_secret:
            event = stripe_client.Webhook.construct_event(
                payload, sig_header, webhook_secret
            )
        else:
            # Desarrollo: procesar sin verificar firma
            import json
            logger.warning("[process_payment_webhook] STRIPE_WEBHOOK_SECRET not configured - skipping signature verification")
            event = json.loads(payload)
        
        event_type = event.get("type") if isinstance(event, dict) else event.type
        data = event.get("data", {}).get("object", {}) if isinstance(event, dict) else event.data.object
        
        logger.info(f"[process_payment_webhook] Received event: {event_type}")
        
        result = {
            "ok": True,
            "event_type": event_type,
            "event_id": event.get("id") if isinstance(event, dict) else event.id,
        }
        
        # Procesar según tipo de evento
        if event_type == "invoice.paid":
            result["action"] = "record_payment"
            result["contract_id"] = data.get("subscription_details", {}).get("metadata", {}).get("contract_id") or data.get("metadata", {}).get("contract_id")
            result["amount"] = data.get("amount_paid", 0) / 100
            result["invoice_id"] = data.get("id")
            result["message"] = f"✅ Pago de ${result['amount']:.2f} recibido"
            
        elif event_type == "invoice.payment_failed":
            result["action"] = "mark_payment_failed"
            result["contract_id"] = data.get("metadata", {}).get("contract_id")
            result["amount"] = data.get("amount_due", 0) / 100
            result["attempt_count"] = data.get("attempt_count", 1)
            result["next_attempt"] = data.get("next_payment_attempt")
            result["message"] = f"❌ Pago de ${result['amount']:.2f} falló (intento #{result['attempt_count']})"
            
        elif event_type == "customer.subscription.deleted":
            result["action"] = "cancel_auto_payment"
            result["contract_id"] = data.get("metadata", {}).get("contract_id")
            result["subscription_id"] = data.get("id")
            result["message"] = "Suscripción cancelada"
            
        elif event_type == "payment_intent.succeeded":
            result["action"] = "record_single_payment"
            result["contract_id"] = data.get("metadata", {}).get("contract_id")
            result["amount"] = data.get("amount", 0) / 100
            result["message"] = f"✅ Pago único de ${result['amount']:.2f} exitoso"
            
        elif event_type == "payment_intent.payment_failed":
            result["action"] = "notify_payment_failed"
            result["contract_id"] = data.get("metadata", {}).get("contract_id")
            result["amount"] = data.get("amount", 0) / 100
            result["error"] = data.get("last_payment_error", {}).get("message", "Unknown error")
            result["message"] = f"❌ Pago de ${result['amount']:.2f} falló: {result['error']}"
        
        else:
            result["action"] = "log_only"
            result["message"] = f"Evento registrado: {event_type}"
        
        return result
        
    except stripe.error.SignatureVerificationError as e:
        logger.error(f"[process_payment_webhook] Invalid signature: {e}")
        return {"ok": False, "error": "Invalid webhook signature"}
    except Exception as e:
        logger.error(f"[process_payment_webhook] Error: {e}")
        return {"ok": False, "error": str(e)}


# =============================================================================
# HIGH-LEVEL INTEGRATION FUNCTION
# =============================================================================

def setup_automatic_payment_full(
    client_id: str,
    client_email: str,
    client_name: str,
    contract_id: str,
    monthly_rent_cents: int,
    payment_day: int = 15
) -> Dict[str, Any]:
    """
    Configura pagos automáticos completos para un contrato RTO.
    
    Este es el flujo completo que orquesta todas las funciones:
    1. Crea o obtiene cliente en Stripe
    2. Crea precio para el monto mensual
    3. Retorna URL para que el cliente agregue método de pago
    4. (Después) crear suscripción cuando tenga método de pago
    
    Args:
        client_id: UUID del cliente
        client_email: Email
        client_name: Nombre completo
        contract_id: UUID del contrato RTO
        monthly_rent_cents: Renta mensual en centavos (ej: 69500 = $695)
        payment_day: Día del mes para cobrar
    
    Returns:
        Dict con URLs y IDs para completar el setup
    """
    try:
        # 1. Crear/obtener cliente en Stripe
        customer_result = get_or_create_customer(
            client_id=client_id,
            email=client_email,
            name=client_name
        )
        
        if not customer_result.get("ok"):
            return customer_result
        
        stripe_customer_id = customer_result["stripe_customer_id"]
        
        # 2. Crear precio para la renta mensual
        price_result = create_price(
            amount_cents=monthly_rent_cents,
            nickname=f"Renta RTO - Contrato {contract_id[:8]}",
            contract_id=contract_id
        )
        
        if not price_result.get("ok"):
            return price_result
        
        # 3. Crear SetupIntent para agregar método de pago
        return_url = os.getenv("APP_URL", "https://maninos.app") + "/payment/setup"
        setup_result = create_setup_intent(
            stripe_customer_id=stripe_customer_id,
            return_url=return_url
        )
        
        if not setup_result.get("ok"):
            return setup_result
        
        # 4. Verificar si ya tiene método de pago
        pm_result = get_customer_payment_methods(stripe_customer_id)
        has_payment_method = pm_result.get("ok") and pm_result.get("count", 0) > 0
        
        result = {
            "ok": True,
            "stripe_customer_id": stripe_customer_id,
            "price_id": price_result["price_id"],
            "setup_intent_id": setup_result["setup_intent_id"],
            "client_secret": setup_result["client_secret"],
            "checkout_url": setup_result.get("checkout_url"),
            "has_payment_method": has_payment_method,
            "monthly_amount": monthly_rent_cents / 100,
            "payment_day": payment_day,
        }
        
        if has_payment_method:
            # Ya tiene método, podemos crear suscripción
            result["next_step"] = "Cliente ya tiene método de pago. Listo para crear suscripción."
            result["ready_for_subscription"] = True
        else:
            result["next_step"] = f"Cliente debe agregar método de pago en: {setup_result.get('checkout_url') or 'Stripe Elements'}"
            result["ready_for_subscription"] = False
        
        result["message"] = f"✅ Setup de pago automático iniciado. Renta: ${monthly_rent_cents/100:.2f}/mes"
        
        return result
        
    except Exception as e:
        logger.error(f"[setup_automatic_payment_full] Error: {e}")
        return {"ok": False, "error": str(e)}

