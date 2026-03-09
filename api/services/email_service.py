"""
Email Service - Maninos Homes
All email templates and scheduling logic.

Email types:
1. Welcome - When client registers/first purchase
2. Payment Confirmation - After successful payment
3. Review Request - 7 days after sale
4. Referral Request - 30 days after sale

Uses Resend API via tools/email_tool.py
"""

import os
import logging
from datetime import datetime, timedelta
from typing import Optional

from tools.email_tool import send_email
from tools.supabase_client import sb

logger = logging.getLogger(__name__)

# Resolve the public-facing URL for links in emails.
# Priority: APP_URL (explicit) > FRONTEND_URL > fallback to localhost for dev
_raw_app_url = os.getenv("APP_URL") or os.getenv("FRONTEND_URL") or "http://localhost:3000"
APP_URL = _raw_app_url.rstrip("/")
if APP_URL == "http://localhost:3000":
    logger.warning("[email_service] APP_URL not set — email links will point to localhost. Set APP_URL env var on Railway.")
COMPANY_NAME = "Maninos Homes"
COMPANY_PHONE = "832-745-9600"


# =============================================================================
# EMAIL TEMPLATES
# =============================================================================

def _base_template(content: str) -> str:
    """Wrap content in the Maninos brand email template."""
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body {{ font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #2d3748; margin: 0; padding: 0; background: #f7f8fc; }}
            .wrapper {{ max-width: 600px; margin: 0 auto; padding: 24px; }}
            .header {{ background: linear-gradient(135deg, #1e3a5f 0%, #2d5a8e 100%); color: white; padding: 32px; text-align: center; border-radius: 12px 12px 0 0; }}
            .header h1 {{ margin: 0; font-size: 22px; font-weight: 600; }}
            .header p {{ margin: 8px 0 0; opacity: 0.85; font-size: 14px; }}
            .body {{ background: #ffffff; padding: 32px; border-radius: 0 0 12px 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }}
            .highlight {{ background: #fef9e7; padding: 20px; border-left: 4px solid #c9a227; border-radius: 4px; margin: 20px 0; }}
            .btn {{ display: inline-block; background: #c9a227; color: #ffffff !important; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; }}
            .btn:hover {{ background: #b08d1f; }}
            .footer {{ text-align: center; margin-top: 24px; color: #718096; font-size: 12px; padding: 16px; }}
            .footer a {{ color: #c9a227; text-decoration: none; }}
            .divider {{ border: none; border-top: 1px solid #e2e8f0; margin: 24px 0; }}
            ul {{ padding-left: 20px; }}
            li {{ margin-bottom: 8px; }}
        </style>
    </head>
    <body>
        <div class="wrapper">
            {content}
            <div class="footer">
                <p>{COMPANY_NAME} &bull; Houston, Texas &bull; {COMPANY_PHONE}</p>
                <p>Tu hogar, nuestra misión 🏠</p>
            </div>
        </div>
    </body>
    </html>
    """


def _welcome_html(client_name: str) -> str:
    """Welcome email when a new client is created."""
    content = f"""
    <div class="header">
        <h1>🏠 ¡Bienvenido a {COMPANY_NAME}!</h1>
        <p>Estamos encantados de tenerte con nosotros</p>
    </div>
    <div class="body">
        <p>Hola <strong>{client_name}</strong>,</p>
        <p>Gracias por confiar en nosotros. En {COMPANY_NAME} estamos comprometidos a ayudarte a encontrar tu hogar ideal.</p>
        
        <div class="highlight">
            <h3>🔑 ¿Qué puedes hacer ahora?</h3>
            <ul>
                <li>🏡 <strong>Explorar casas disponibles</strong> en nuestro catálogo</li>
                <li>📋 <strong>Revisar tu cuenta</strong> y estado de compras</li>
                <li>📞 <strong>Contactarnos</strong> si tienes preguntas</li>
            </ul>
        </div>
        
        <center>
            <a href="{APP_URL}/clientes/casas" class="btn">Ver Casas Disponibles</a>
        </center>
        
        <hr class="divider">
        <p style="font-size: 13px; color: #718096;">Si tienes preguntas, responde a este email o llámanos al {COMPANY_PHONE}.</p>
    </div>
    """
    return _base_template(content)


def _payment_confirmation_html(
    client_name: str,
    property_address: str,
    property_city: str,
    sale_price: float,
    payment_date: str,
    payment_method: str = "Transferencia bancaria",
) -> str:
    """Payment confirmation email after successful payment."""
    content = f"""
    <div class="header">
        <h1>✅ ¡Pago Confirmado!</h1>
        <p>Tu compra ha sido procesada exitosamente</p>
    </div>
    <div class="body">
        <p>Hola <strong>{client_name}</strong>,</p>
        <p>¡Felicidades! Tu pago ha sido recibido y tu compra está confirmada.</p>

        <div class="highlight">
            <h3>📋 Detalles de tu compra:</h3>
            <p><strong>Propiedad:</strong> {property_address}</p>
            <p><strong>Ciudad:</strong> {property_city}</p>
            <p><strong>Precio:</strong> ${sale_price:,.2f} USD</p>
            <p><strong>Fecha:</strong> {payment_date}</p>
            <p><strong>Método:</strong> {payment_method}</p>
        </div>
        
        <h3>📌 Próximos pasos:</h3>
        <ol>
            <li>Procesaremos la <strong>transferencia del título</strong> a tu nombre</li>
            <li>Recibirás los <strong>documentos legales</strong> (Bill of Sale + Título)</li>
            <li>Te contactaremos para <strong>coordinar la entrega</strong></li>
        </ol>
        
        <center>
            <a href="{APP_URL}/clientes/mi-cuenta" class="btn">Ver Mi Cuenta</a>
        </center>
        
        <hr class="divider">
        <p style="font-size: 13px; color: #718096;">Guarda este email como comprobante de tu compra.</p>
    </div>
    """
    return _base_template(content)


def _review_request_html(
    client_name: str,
    property_address: str,
) -> str:
    """Review request email - sent 7 days after sale."""
    content = f"""
    <div class="header">
        <h1>⭐ ¿Cómo fue tu experiencia?</h1>
        <p>Tu opinión nos ayuda a mejorar</p>
    </div>
    <div class="body">
        <p>Hola <strong>{client_name}</strong>,</p>
        <p>Ha pasado una semana desde que compraste tu casa en <strong>{property_address}</strong> y queremos saber cómo ha sido tu experiencia.</p>
        
        <div class="highlight">
            <p>Tu reseña nos ayuda a seguir ofreciendo el mejor servicio a familias como la tuya. ¡Nos tomaría solo 2 minutos!</p>
        </div>
        
        <center>
            <a href="https://g.page/r/YOUR_GOOGLE_REVIEW_LINK/review" class="btn">⭐ Dejar Reseña en Google</a>
        </center>
        
        <hr class="divider">
        <p style="font-size: 13px; color: #718096;">Si has tenido algún problema, no dudes en contactarnos directamente al {COMPANY_PHONE}. Siempre estamos aquí para ayudarte.</p>
    </div>
    """
    return _base_template(content)


def _referral_request_html(
    client_name: str,
) -> str:
    """Referral request email - sent 30 days after sale."""
    content = f"""
    <div class="header">
        <h1>💛 ¿Conoces a alguien buscando casa?</h1>
        <p>Comparte la experiencia con tus amigos y familia</p>
    </div>
    <div class="body">
        <p>Hola <strong>{client_name}</strong>,</p>
        <p>Esperamos que estés disfrutando tu nuevo hogar. 🏡</p>
        
        <p>Si conoces a alguien que esté buscando casa, ¡nos encantaría ayudarles también! Puedes compartir nuestro catálogo directamente:</p>
        
        <center>
            <a href="{APP_URL}/clientes/casas" class="btn">🏠 Ver Casas Disponibles</a>
        </center>
        
        <div class="highlight">
            <p>💡 <strong>Tip:</strong> Simplemente comparte este link con quien necesite una casa. Nuestro equipo se encargará del resto.</p>
            <p style="font-size: 14px; color: #4a5568; word-break: break-all;"><strong>{APP_URL}/clientes/casas</strong></p>
        </div>
        
        <p>¡Gracias por confiar en {COMPANY_NAME}!</p>
        
        <hr class="divider">
        <p style="font-size: 13px; color: #718096;">Si necesitas cualquier cosa, estamos aquí: {COMPANY_PHONE}</p>
    </div>
    """
    return _base_template(content)


# =============================================================================
# EMAIL SENDING FUNCTIONS
# =============================================================================

def send_welcome_email(client_email: str, client_name: str) -> dict:
    """Send welcome email to new client."""
    try:
        html = _welcome_html(client_name)
        result = send_email(
            to=[client_email],
            subject=f"🏠 ¡Bienvenido a {COMPANY_NAME}!",
            html=html,
        )
        logger.info(f"[email_service] Welcome email sent to {client_email}")
        return {"ok": True, "type": "welcome", **result}
    except Exception as e:
        logger.error(f"[email_service] Failed to send welcome email: {e}")
        return {"ok": False, "error": str(e)}


def send_payment_confirmation_email(
    client_email: str,
    client_name: str,
    property_address: str,
    property_city: str,
    sale_price: float,
    payment_method: str = "Transferencia bancaria",
) -> dict:
    """Send payment confirmation email."""
    try:
        payment_date = datetime.now().strftime("%d de %B, %Y")
        html = _payment_confirmation_html(
            client_name, property_address, property_city, sale_price, payment_date, payment_method,
        )
        result = send_email(
            to=[client_email],
            subject="✅ ¡Pago Confirmado! - Tu compra en Maninos Homes",
            html=html,
        )
        logger.info(f"[email_service] Payment confirmation sent to {client_email}")
        return {"ok": True, "type": "payment_confirmation", **result}
    except Exception as e:
        logger.error(f"[email_service] Failed to send payment confirmation: {e}")
        return {"ok": False, "error": str(e)}


def send_review_request_email(
    client_email: str,
    client_name: str,
    property_address: str,
) -> dict:
    """Send review request email (7 days post-sale)."""
    try:
        html = _review_request_html(client_name, property_address)
        result = send_email(
            to=[client_email],
            subject="⭐ ¿Cómo fue tu experiencia? - Maninos Homes",
            html=html,
        )
        logger.info(f"[email_service] Review request sent to {client_email}")
        return {"ok": True, "type": "review_request", **result}
    except Exception as e:
        logger.error(f"[email_service] Failed to send review request: {e}")
        return {"ok": False, "error": str(e)}


def send_referral_request_email(
    client_email: str,
    client_name: str,
) -> dict:
    """Send referral request email (30 days post-sale)."""
    try:
        html = _referral_request_html(client_name)
        result = send_email(
            to=[client_email],
            subject="💛 ¿Conoces a alguien buscando casa? - Maninos Homes",
            html=html,
        )
        logger.info(f"[email_service] Referral request sent to {client_email}")
        return {"ok": True, "type": "referral_request", **result}
    except Exception as e:
        logger.error(f"[email_service] Failed to send referral request: {e}")
        return {"ok": False, "error": str(e)}


def _title_transferred_html(client_name: str, property_address: str) -> str:
    """Congratulations email when a title is transferred to the client."""
    content = f"""
    <div class="header">
        <h1>🏠 ¡Tu título ha sido transferido!</h1>
        <p>¡Felicidades, la casa es oficialmente tuya!</p>
    </div>
    <div class="body">
        <p>Hola <strong>{client_name}</strong>,</p>
        <p>¡Felicidades! El título de propiedad de <strong>{property_address}</strong> ha sido transferido a tu nombre.</p>

        <div class="highlight">
            <h3>📋 ¿Qué significa esto?</h3>
            <ul>
                <li>🏡 La propiedad está <strong>oficialmente a tu nombre</strong></li>
                <li>📄 Tus documentos legales están listos para descargar</li>
                <li>🔑 ¡Disfruta tu nuevo hogar!</li>
            </ul>
        </div>

        <p>Puedes descargar tu Bill of Sale, solicitud de título y demás documentos desde tu portal de cliente:</p>

        <center>
            <a href="{APP_URL}/clientes/mi-cuenta/documentos" class="btn">Descargar Mis Documentos</a>
        </center>

        <hr class="divider">
        <p style="font-size: 13px; color: #718096;">Si tienes preguntas sobre tus documentos, llámanos al {COMPANY_PHONE}.</p>
    </div>
    """
    return _base_template(content)


def send_title_transferred_email(
    client_email: str,
    client_name: str,
    property_address: str,
) -> dict:
    """Send congratulations email when title is transferred to client."""
    try:
        html = _title_transferred_html(client_name, property_address)
        result = send_email(
            to=[client_email],
            subject="🏠 ¡Tu título ha sido transferido! - Maninos Homes",
            html=html,
        )
        logger.info(f"[email_service] Title transferred email sent to {client_email}")
        return {"ok": True, "type": "title_transferred", **result}
    except Exception as e:
        logger.error(f"[email_service] Failed to send title transferred email: {e}")
        return {"ok": False, "error": str(e)}


def send_rto_application_email(
    client_email: str,
    client_name: str,
    property_address: str,
    property_city: str,
    sale_price: float,
) -> dict:
    """Send RTO application confirmation email to client."""
    try:
        html = f"""
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
            <div style="background: linear-gradient(135deg, #f97316, #ea580c); padding: 30px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px;">🏠 Solicitud Rent-to-Own Recibida</h1>
            </div>
            <div style="padding: 30px;">
                <p style="font-size: 16px; color: #333;">Hola <strong>{client_name}</strong>,</p>
                <p style="color: #555; line-height: 1.6;">
                    Hemos recibido tu solicitud de <strong>Rent-to-Own</strong> para la siguiente propiedad:
                </p>
                <div style="background: #fff7ed; border-left: 4px solid #f97316; padding: 15px; margin: 20px 0; border-radius: 4px;">
                    <p style="margin: 0; font-weight: bold; color: #1e3a5f;">{property_address}</p>
                    <p style="margin: 5px 0 0; color: #666;">{property_city}</p>
                    <p style="margin: 5px 0 0; font-size: 20px; color: #f97316; font-weight: bold;">${sale_price:,.0f}</p>
                </div>
                <h3 style="color: #1e3a5f;">¿Qué sigue?</h3>
                <ol style="color: #555; line-height: 1.8;">
                    <li><strong>Revisión de solicitud</strong> — Nuestro equipo de Maninos Homes revisará tu aplicación</li>
                    <li><strong>Contacto</strong> — Te contactaremos dentro de 24-48 horas hábiles</li>
                    <li><strong>Documentación</strong> — Te pediremos información adicional para evaluar tu solicitud</li>
                    <li><strong>Aprobación</strong> — Si todo está en orden, procederemos con el contrato RTO</li>
                </ol>
                <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <p style="margin: 0; color: #1e40af; font-size: 14px;">
                        💡 <strong>¿Qué es Rent-to-Own?</strong><br>
                        Es un programa donde rentas la casa con opción a compra. Parte de tu renta se aplica al precio final.
                        Al terminar el plazo, la casa es tuya.
                    </p>
                </div>
                <p style="color: #555;">
                    Si tienes preguntas, no dudes en contactarnos al <strong>{COMPANY_PHONE}</strong>.
                </p>
            </div>
            <div style="background: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                <p style="margin: 0; color: #94a3b8; font-size: 12px;">© {datetime.now().year} {COMPANY_NAME} LLC</p>
            </div>
        </div>
        """
        result = send_email(
            to=[client_email],
            subject="🏠 Solicitud Rent-to-Own Recibida - Maninos Homes",
            html=html,
        )
        logger.info(f"[email_service] RTO application email sent to {client_email}")
        return {"ok": True, "type": "rto_application", **result}
    except Exception as e:
        logger.error(f"[email_service] Failed to send RTO application email: {e}")
        return {"ok": False, "error": str(e)}


def _transfer_reported_html(
    client_name: str,
    property_address: str,
    property_city: str,
    sale_price: float,
) -> str:
    """Acknowledgment email when client reports a bank transfer."""
    content = f"""
    <div class="header">
        <h1>Hemos registrado tu transferencia</h1>
        <p>Tu reporte ha sido recibido</p>
    </div>
    <div class="body">
        <p>Hola <strong>{client_name}</strong>,</p>
        <p>Hemos recibido tu reporte de transferencia bancaria para la propiedad en <strong>{property_address}</strong>.</p>

        <div class="highlight">
            <h3>Detalles de la propiedad:</h3>
            <p><strong>Direccion:</strong> {property_address}</p>
            <p><strong>Ciudad:</strong> {property_city}</p>
            <p><strong>Precio:</strong> ${sale_price:,.2f} USD</p>
        </div>

        <h3>Proximos pasos:</h3>
        <ol>
            <li>Nuestro equipo verificara la transferencia</li>
            <li>Te notificaremos por email una vez confirmado el pago</li>
        </ol>

        <div class="highlight" style="border-left-color: #e53e3e;">
            <p style="margin: 0; color: #e53e3e;"><strong>Importante:</strong> Este email NO confirma la recepcion del pago, solo que hemos registrado tu reporte.</p>
        </div>

        <center>
            <a href="{APP_URL}/clientes/mi-cuenta" class="btn">Ver Mi Cuenta</a>
        </center>

        <hr class="divider">
        <p style="font-size: 13px; color: #718096;">Si tienes preguntas, contactanos al {COMPANY_PHONE}.</p>
    </div>
    """
    return _base_template(content)


def send_transfer_reported_email(
    client_email: str,
    client_name: str,
    property_address: str,
    property_city: str,
    sale_price: float,
) -> dict:
    """Send acknowledgment email when client reports a bank transfer."""
    try:
        html = _transfer_reported_html(
            client_name, property_address, property_city, sale_price,
        )
        result = send_email(
            to=[client_email],
            subject=f"Transferencia Registrada - {COMPANY_NAME}",
            html=html,
        )
        logger.info(f"[email_service] Transfer reported email sent to {client_email}")
        return {"ok": True, "type": "transfer_reported", **result}
    except Exception as e:
        logger.error(f"[email_service] Failed to send transfer reported email: {e}")
        return {"ok": False, "error": str(e)}


def _sale_completed_html(
    client_name: str,
    property_address: str,
    property_city: str,
    sale_price: float,
    documents_url: str = None,
) -> str:
    """Sale completed email after transfer is confirmed."""
    docs_url = documents_url or f"{APP_URL}/clientes/mi-cuenta/documentos"
    content = f"""
    <div class="header">
        <h1>Venta Completada!</h1>
        <p>Felicidades por tu nueva casa</p>
    </div>
    <div class="body">
        <p>Hola <strong>{client_name}</strong>,</p>
        <p>Felicidades! Tu compra de la propiedad en <strong>{property_address}</strong> ha sido confirmada.</p>

        <div class="highlight">
            <h3>Detalles de tu compra:</h3>
            <p><strong>Direccion:</strong> {property_address}</p>
            <p><strong>Ciudad:</strong> {property_city}</p>
            <p><strong>Precio:</strong> ${sale_price:,.2f} USD</p>
        </div>

        <h3>Tus documentos estan listos:</h3>
        <ul>
            <li>Bill of Sale</li>
            <li>Aplicacion de Cambio de Titulo</li>
            <li>Titulo</li>
        </ul>

        <center>
            <a href="{docs_url}" class="btn">Ver Mis Documentos</a>
        </center>

        <h3>Proximos pasos:</h3>
        <p>Procesaremos la transferencia del titulo a tu nombre. Recibiras una notificacion cuando este listo.</p>

        <hr class="divider">
        <p style="font-size: 13px; color: #718096;">Si tienes preguntas, contactanos al {COMPANY_PHONE}.</p>
    </div>
    """
    return _base_template(content)


def send_sale_completed_email(
    client_email: str,
    client_name: str,
    property_address: str,
    property_city: str,
    sale_price: float,
    documents_url: str = None,
) -> dict:
    """Send sale completed email after transfer is confirmed."""
    try:
        html = _sale_completed_html(
            client_name, property_address, property_city, sale_price, documents_url,
        )
        result = send_email(
            to=[client_email],
            subject=f"Venta Completada! - {COMPANY_NAME}",
            html=html,
        )
        logger.info(f"[email_service] Sale completed email sent to {client_email}")
        return {"ok": True, "type": "sale_completed", **result}
    except Exception as e:
        logger.error(f"[email_service] Failed to send sale completed email: {e}")
        return {"ok": False, "error": str(e)}


# =============================================================================
# RTO EMAIL TEMPLATES
# =============================================================================

def _rto_payment_reminder_html(
    client_name: str,
    property_address: str,
    monthly_rent: float,
    due_date: str,
    payment_number: int,
    total_payments: int,
    days_until_due: int,
    zelle_phone: str = "832-745-9600",
) -> str:
    """Payment reminder email for RTO clients."""
    if days_until_due > 0:
        urgency_color = "#f59e0b"  # amber
        urgency_text = f"Tu pago vence en <strong>{days_until_due} día{'s' if days_until_due > 1 else ''}</strong>"
        urgency_icon = "📅"
        subject_prefix = "Recordatorio"
    elif days_until_due == 0:
        urgency_color = "#ef4444"  # red
        urgency_text = "Tu pago vence <strong>HOY</strong>"
        urgency_icon = "⚠️"
        subject_prefix = "HOY vence"
    else:
        urgency_color = "#dc2626"  # dark red
        days_late = abs(days_until_due)
        urgency_text = f"Tu pago está <strong>atrasado {days_late} día{'s' if days_late > 1 else ''}</strong>"
        urgency_icon = "🚨"
        subject_prefix = "ATRASADO"

    content = f"""
    <div class="header" style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a8e 100%);">
        <h1>{urgency_icon} {subject_prefix} - Pago RTO</h1>
        <p>Contrato Rent-to-Own</p>
    </div>
    <div class="body">
        <p>Hola <strong>{client_name}</strong>,</p>
        <p>{urgency_text} para tu contrato de Rent-to-Own.</p>
        
        <div class="highlight" style="border-left-color: {urgency_color};">
            <h3>💰 Detalles del Pago</h3>
            <p><strong>Propiedad:</strong> {property_address}</p>
            <p><strong>Pago #{payment_number}</strong> de {total_payments}</p>
            <p><strong>Monto:</strong> <span style="font-size: 22px; color: {urgency_color}; font-weight: bold;">${monthly_rent:,.2f}</span></p>
            <p><strong>Fecha límite:</strong> {due_date}</p>
        </div>
        
        <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h4 style="margin-top: 0; color: #166534;">📱 ¿Cómo pagar?</h4>
            <p style="margin: 5px 0; color: #333;">Envía tu pago por <strong>Zelle</strong> al: <strong>{zelle_phone}</strong></p>
        </div>
        
        <center>
            <a href="{APP_URL}/clientes/mi-cuenta" class="btn">Ver Mi Cuenta</a>
        </center>
        
        <hr class="divider">
        <p style="font-size: 13px; color: #718096;">
            Recuerda: pagos después del día 20 generan un recargo de $15/día.
            Si ya realizaste el pago, ignora este mensaje.
        </p>
    </div>
    """
    return _base_template(content)


def _rto_overdue_alert_html(
    employee_name: str,
    overdue_payments: list,
    total_overdue_amount: float,
) -> str:
    """Alert email for employees about overdue RTO payments."""
    rows = ""
    for p in overdue_payments:
        rows += f"""
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">{p.get('client_name', 'N/A')}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">{p.get('property_address', 'N/A')}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${p.get('amount', 0):,.2f}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; color: #dc2626; font-weight: bold;">{p.get('days_late', 0)} días</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; color: #ef4444;">${p.get('late_fee', 0):,.2f}</td>
        </tr>
        """

    content = f"""
    <div class="header" style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);">
        <h1>🚨 Alerta de Morosidad RTO</h1>
        <p>{len(overdue_payments)} pago{'s' if len(overdue_payments) > 1 else ''} vencido{'s' if len(overdue_payments) > 1 else ''}</p>
    </div>
    <div class="body">
        <p>Hola <strong>{employee_name}</strong>,</p>
        <p>Los siguientes pagos RTO están vencidos y requieren atención:</p>
        
        <div class="highlight" style="border-left-color: #dc2626;">
            <p style="font-size: 18px; margin: 0;">
                Total vencido: <strong style="color: #dc2626;">${total_overdue_amount:,.2f}</strong>
            </p>
        </div>
        
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
                <tr style="background: #f8f9fa;">
                    <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Cliente</th>
                    <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Propiedad</th>
                    <th style="padding: 10px; text-align: right; border-bottom: 2px solid #dee2e6;">Monto</th>
                    <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Atraso</th>
                    <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Late Fee</th>
                </tr>
            </thead>
            <tbody>
                {rows}
            </tbody>
        </table>
        
        <center style="margin-top: 24px;">
            <a href="{APP_URL}/capital/payments?filter=overdue" class="btn" style="background: #dc2626;">
                Ver Pagos Vencidos
            </a>
        </center>
    </div>
    """
    return _base_template(content)


def send_rto_payment_reminder(
    client_email: str,
    client_name: str,
    property_address: str,
    monthly_rent: float,
    due_date: str,
    payment_number: int,
    total_payments: int,
    days_until_due: int,
) -> dict:
    """Send an RTO payment reminder email to client."""
    try:
        html = _rto_payment_reminder_html(
            client_name=client_name,
            property_address=property_address,
            monthly_rent=monthly_rent,
            due_date=due_date,
            payment_number=payment_number,
            total_payments=total_payments,
            days_until_due=days_until_due,
        )
        
        if days_until_due > 0:
            subject = f"📅 Recordatorio: Tu pago RTO vence en {days_until_due} días"
        elif days_until_due == 0:
            subject = "⚠️ HOY vence tu pago RTO - Maninos Homes"
        else:
            subject = f"🚨 Pago RTO atrasado ({abs(days_until_due)} días) - Maninos Homes"
        
        result = send_email(to=[client_email], subject=subject, html=html)
        logger.info(f"[email_service] RTO reminder sent to {client_email} (days: {days_until_due})")
        return {"ok": True, "type": "rto_reminder", **result}
    except Exception as e:
        logger.error(f"[email_service] Failed to send RTO reminder: {e}")
        return {"ok": False, "error": str(e)}


def send_rto_overdue_alert(
    employee_email: str,
    employee_name: str,
    overdue_payments: list,
    total_overdue_amount: float,
) -> dict:
    """Send overdue alert to employee/admin."""
    try:
        html = _rto_overdue_alert_html(
            employee_name=employee_name,
            overdue_payments=overdue_payments,
            total_overdue_amount=total_overdue_amount,
        )
        count = len(overdue_payments)
        subject = f"🚨 {count} pago{'s' if count > 1 else ''} RTO vencido{'s' if count > 1 else ''} - Acción requerida"
        
        result = send_email(to=[employee_email], subject=subject, html=html)
        logger.info(f"[email_service] Overdue alert sent to {employee_email} ({count} payments)")
        return {"ok": True, "type": "rto_overdue_alert", **result}
    except Exception as e:
        logger.error(f"[email_service] Failed to send overdue alert: {e}")
        return {"ok": False, "error": str(e)}


# =============================================================================
# SCHEDULED EMAILS
# =============================================================================

def schedule_post_sale_emails(
    sale_id: str,
    client_id: str,
    client_email: str,
    client_name: str,
    property_address: str,
) -> dict:
    """
    Schedule review (7d) and referral (30d) emails after a sale.
    Inserts rows into `scheduled_emails` table.
    """
    try:
        now = datetime.utcnow()
        
        emails_to_schedule = [
            {
                "sale_id": sale_id,
                "client_id": client_id,
                "email_type": "review_request",
                "to_email": client_email,
                "to_name": client_name,
                "subject": "⭐ ¿Cómo fue tu experiencia? - Maninos Homes",
                "metadata": {"property_address": property_address},
                "scheduled_for": (now + timedelta(days=7)).isoformat(),
                "status": "pending",
            },
            {
                "sale_id": sale_id,
                "client_id": client_id,
                "email_type": "referral_request",
                "to_email": client_email,
                "to_name": client_name,
                "subject": "💛 ¿Conoces a alguien buscando casa? - Maninos Homes",
                "metadata": {"property_address": property_address},
                "scheduled_for": (now + timedelta(days=30)).isoformat(),
                "status": "pending",
            },
        ]
        
        result = sb.table("scheduled_emails").insert(emails_to_schedule).execute()
        
        logger.info(f"[email_service] Scheduled 2 post-sale emails for sale {sale_id}")
        return {
            "ok": True,
            "scheduled_count": len(result.data) if result.data else 0,
            "emails": [
                {"type": "review_request", "send_at": emails_to_schedule[0]["scheduled_for"]},
                {"type": "referral_request", "send_at": emails_to_schedule[1]["scheduled_for"]},
            ],
        }
    except Exception as e:
        logger.error(f"[email_service] Failed to schedule emails: {e}")
        return {"ok": False, "error": str(e)}


def process_scheduled_emails() -> dict:
    """
    Process all scheduled emails that are due.
    Called by cron job or manual trigger.
    
    Returns count of sent/failed emails.
    """
    try:
        now = datetime.utcnow().isoformat()
        
        # Get pending emails that are due
        result = sb.table("scheduled_emails") \
            .select("*") \
            .eq("status", "pending") \
            .lte("scheduled_for", now) \
            .order("scheduled_for") \
            .limit(50) \
            .execute()
        
        if not result.data:
            return {"ok": True, "processed": 0, "message": "No emails pending"}
        
        sent = 0
        failed = 0
        
        for email_row in result.data:
            email_type = email_row["email_type"]
            to_email = email_row["to_email"]
            to_name = email_row["to_name"]
            metadata = email_row.get("metadata") or {}
            
            try:
                if email_type == "review_request":
                    send_review_request_email(
                        client_email=to_email,
                        client_name=to_name,
                        property_address=metadata.get("property_address", ""),
                    )
                elif email_type == "referral_request":
                    send_referral_request_email(
                        client_email=to_email,
                        client_name=to_name,
                    )
                else:
                    logger.warning(f"[email_service] Unknown email type: {email_type}")
                    continue
                
                # Mark as sent
                sb.table("scheduled_emails").update({
                    "status": "sent",
                    "sent_at": datetime.utcnow().isoformat(),
                }).eq("id", email_row["id"]).execute()
                
                sent += 1
                
            except Exception as send_error:
                logger.error(f"[email_service] Failed to send {email_type} to {to_email}: {send_error}")
                
                # Mark as failed with retry
                attempts = email_row.get("attempts", 0) + 1
                update_data = {
                    "attempts": attempts,
                    "last_error": str(send_error),
                }
                
                if attempts >= 3:
                    update_data["status"] = "failed"
                else:
                    # Retry in 1 hour
                    update_data["scheduled_for"] = (datetime.utcnow() + timedelta(hours=1)).isoformat()
                
                sb.table("scheduled_emails").update(update_data).eq("id", email_row["id"]).execute()
                failed += 1
        
        logger.info(f"[email_service] Processed {sent + failed} emails: {sent} sent, {failed} failed")
        return {
            "ok": True,
            "processed": sent + failed,
            "sent": sent,
            "failed": failed,
        }
        
    except Exception as e:
        logger.error(f"[email_service] Error processing scheduled emails: {e}")
        return {"ok": False, "error": str(e)}


def process_rto_reminders() -> dict:
    """
    Process RTO payment reminders.
    Sends reminders at: 3 days before, day of, and 1 day after due date.
    Called by cron job or manual trigger.
    """
    from datetime import date as date_type
    
    try:
        today = date_type.today()
        
        # Find payments due in 3 days, today, or 1 day overdue
        target_dates = [
            (today + timedelta(days=3), 3, "3_days_before"),
            (today, 0, "day_of"),
            (today - timedelta(days=1), -1, "1_day_after"),
        ]
        
        total_sent = 0
        total_failed = 0
        details = []
        
        for target_date, days_until, label in target_dates:
            # Get pending/scheduled payments for this date
            payments = sb.table("rto_payments") \
                .select("*, rto_contracts(*, clients(name, email), properties(address))") \
                .eq("due_date", target_date.isoformat()) \
                .in_("status", ["scheduled", "pending", "late"]) \
                .execute()
            
            if not payments.data:
                details.append({"label": label, "sent": 0, "reason": "no payments"})
                continue
            
            sent = 0
            for p in payments.data:
                contract = p.get("rto_contracts") or {}
                client = contract.get("clients") or {}
                prop = contract.get("properties") or {}
                
                if not client.get("email"):
                    continue
                
                # Check if we already sent this reminder (prevent duplicates)
                # Use scheduled_emails table to track
                existing = sb.table("scheduled_emails") \
                    .select("id") \
                    .eq("email_type", f"rto_reminder_{label}") \
                    .eq("metadata->>payment_id", p["id"]) \
                    .execute()
                
                if existing.data:
                    continue  # Already sent
                
                result = send_rto_payment_reminder(
                    client_email=client["email"],
                    client_name=client.get("name", "Cliente"),
                    property_address=prop.get("address", "N/A"),
                    monthly_rent=float(p.get("amount", 0)),
                    due_date=target_date.strftime("%d de %B, %Y"),
                    payment_number=p.get("payment_number", 0),
                    total_payments=contract.get("term_months", 0),
                    days_until_due=days_until,
                )
                
                if result.get("ok"):
                    sent += 1
                    # Log in scheduled_emails to prevent duplicates
                    try:
                        sb.table("scheduled_emails").insert({
                            "email_type": f"rto_reminder_{label}",
                            "to_email": client["email"],
                            "to_name": client.get("name"),
                            "subject": f"RTO Reminder ({label})",
                            "metadata": {"payment_id": p["id"], "contract_id": contract.get("id")},
                            "scheduled_for": datetime.utcnow().isoformat(),
                            "status": "sent",
                            "sent_at": datetime.utcnow().isoformat(),
                        }).execute()
                    except Exception:
                        pass
                else:
                    total_failed += 1
            
            total_sent += sent
            details.append({"label": label, "sent": sent})
        
        logger.info(f"[email_service] RTO reminders: {total_sent} sent, {total_failed} failed")
        return {
            "ok": True,
            "total_sent": total_sent,
            "total_failed": total_failed,
            "details": details,
        }
    except Exception as e:
        logger.error(f"[email_service] Error processing RTO reminders: {e}")
        return {"ok": False, "error": str(e)}


def process_rto_overdue_alerts(admin_email: str = "info@maninoscapital.com") -> dict:
    """
    Check for overdue RTO payments and alert admin/employee.
    Called daily by cron job.
    """
    from datetime import date as date_type
    
    try:
        today = date_type.today()
        
        # Get all overdue payments (past grace period = 5 days after due)
        overdue = sb.table("rto_payments") \
            .select("*, rto_contracts(*, clients(name, phone), properties(address))") \
            .in_("status", ["pending", "late"]) \
            .lt("due_date", (today - timedelta(days=5)).isoformat()) \
            .order("due_date") \
            .execute()
        
        if not overdue.data:
            return {"ok": True, "overdue_count": 0, "message": "No overdue payments"}
        
        # Build overdue summary
        overdue_list = []
        total_amount = 0
        
        for p in overdue.data:
            contract = p.get("rto_contracts") or {}
            client = contract.get("clients") or {}
            prop = contract.get("properties") or {}
            
            due = datetime.strptime(p["due_date"], "%Y-%m-%d").date()
            days_late = (today - due).days
            late_fee = days_late * float(contract.get("late_fee_per_day", 15))
            amount = float(p.get("amount", 0))
            
            overdue_list.append({
                "client_name": client.get("name", "N/A"),
                "property_address": prop.get("address", "N/A"),
                "amount": amount,
                "days_late": days_late,
                "late_fee": late_fee,
                "payment_number": p.get("payment_number"),
            })
            total_amount += amount + late_fee
        
        # Send alert email
        result = send_rto_overdue_alert(
            employee_email=admin_email,
            employee_name="Administrador",
            overdue_payments=overdue_list,
            total_overdue_amount=total_amount,
        )
        
        return {
            "ok": True,
            "overdue_count": len(overdue_list),
            "total_overdue": total_amount,
            "alert_sent": result.get("ok", False),
        }
    except Exception as e:
        logger.error(f"[email_service] Error processing overdue alerts: {e}")
        return {"ok": False, "error": str(e)}

