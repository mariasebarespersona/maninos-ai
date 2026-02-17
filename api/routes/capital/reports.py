"""
Capital Reports - Monthly portfolio reports (PDF + data)
"""

import os
import logging
from datetime import datetime, date
from calendar import monthrange
from typing import Optional
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from tools.supabase_client import sb

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/reports", tags=["Capital - Reports"])

MONTH_NAMES_ES = {
    1: "Enero", 2: "Febrero", 3: "Marzo", 4: "Abril",
    5: "Mayo", 6: "Junio", 7: "Julio", 8: "Agosto",
    9: "Septiembre", 10: "Octubre", 11: "Noviembre", 12: "Diciembre"
}


# =============================================================================
# SCHEMAS
# =============================================================================

class ReportGenerate(BaseModel):
    month: int  # 1-12
    year: int
    generated_by: str = "admin"


# =============================================================================
# HELPERS
# =============================================================================

def _collect_report_data(month: int, year: int) -> dict:
    """Collect all metrics for the given month/year."""
    start_date = f"{year}-{month:02d}-01"
    _, last_day = monthrange(year, month)
    end_date = f"{year}-{month:02d}-{last_day}"

    # --- Active Contracts ---
    contracts = sb.table("rto_contracts") \
        .select("id, monthly_rent, purchase_price, status, start_date, client_id, property_id") \
        .execute().data or []

    active_contracts = [c for c in contracts if c["status"] == "active"]
    total_contracts = len(contracts)

    portfolio_value = sum(float(c.get("purchase_price", 0)) for c in active_contracts)
    expected_income = sum(float(c.get("monthly_rent", 0)) for c in active_contracts)

    # --- Payments this month ---
    payments = sb.table("rto_payments") \
        .select("id, amount, paid_amount, status, due_date, late_fee_amount, days_late") \
        .gte("due_date", start_date) \
        .lte("due_date", end_date) \
        .execute().data or []

    paid_payments = [p for p in payments if p["status"] == "paid"]
    actual_income = sum(float(p.get("paid_amount", 0)) for p in paid_payments)
    overdue_payments = [p for p in payments if p["status"] in ("late", "pending") and p["due_date"] < date.today().isoformat()]
    overdue_amount = sum(float(p.get("amount", 0)) for p in overdue_payments)

    collection_rate = (actual_income / expected_income * 100) if expected_income > 0 else 0

    total_due = sum(float(p.get("amount", 0)) for p in payments)
    delinquency_rate = (overdue_amount / total_due * 100) if total_due > 0 else 0

    late_fees_charged = sum(float(p.get("late_fee_amount", 0)) for p in payments)
    late_fees_collected = sum(float(p.get("late_fee_amount", 0)) for p in paid_payments if p.get("late_fee_amount"))

    # --- Investors ---
    investors = sb.table("investors") \
        .select("id, total_invested, available_capital, status") \
        .execute().data or []

    active_investors = [i for i in investors if i["status"] == "active"]
    total_invested = sum(float(i.get("total_invested", 0)) for i in active_investors)
    total_returns_paid = 0  # calculated from capital_flows

    try:
        returns = sb.table("capital_flows") \
            .select("amount") \
            .eq("flow_type", "return_out") \
            .gte("flow_date", start_date) \
            .lte("flow_date", end_date) \
            .execute().data or []
        total_returns_paid = sum(abs(float(r.get("amount", 0))) for r in returns)
    except Exception:
        pass

    # --- Acquisitions this month ---
    try:
        acquisitions = sb.table("capital_flows") \
            .select("amount") \
            .eq("flow_type", "acquisition_out") \
            .gte("flow_date", start_date) \
            .lte("flow_date", end_date) \
            .execute().data or []
        acquisition_spend = sum(abs(float(a.get("amount", 0))) for a in acquisitions)
        properties_acquired = len(acquisitions)
    except Exception:
        acquisition_spend = 0
        properties_acquired = 0

    # --- Deliveries this month ---
    try:
        deliveries = sb.table("rto_contracts") \
            .select("id") \
            .eq("status", "delivered") \
            .execute().data or []
        titles_delivered = len(deliveries)
    except Exception:
        titles_delivered = 0

    # --- Contract breakdown ---
    contract_breakdown = {}
    for c in contracts:
        s = c.get("status", "unknown")
        contract_breakdown[s] = contract_breakdown.get(s, 0) + 1

    # --- Payment breakdown ---
    payment_breakdown = {}
    for p in payments:
        s = p.get("status", "unknown")
        payment_breakdown[s] = payment_breakdown.get(s, 0) + 1

    # --- Top delinquent clients ---
    top_delinquent = []
    for p in sorted(overdue_payments, key=lambda x: float(x.get("amount", 0)), reverse=True)[:5]:
        top_delinquent.append({
            "payment_id": p["id"],
            "amount": float(p.get("amount", 0)),
            "due_date": p.get("due_date"),
            "days_late": p.get("days_late", 0),
        })

    return {
        "active_contracts": len(active_contracts),
        "total_contracts": total_contracts,
        "portfolio_value": portfolio_value,
        "expected_income": expected_income,
        "actual_income": actual_income,
        "collection_rate": round(collection_rate, 1),
        "overdue_payments": len(overdue_payments),
        "overdue_amount": overdue_amount,
        "delinquency_rate": round(delinquency_rate, 1),
        "late_fees_charged": late_fees_charged,
        "late_fees_collected": late_fees_collected,
        "total_invested": total_invested,
        "total_returns_paid": total_returns_paid,
        "active_investors": len(active_investors),
        "properties_acquired": properties_acquired,
        "acquisition_spend": acquisition_spend,
        "titles_delivered": titles_delivered,
        "detailed_data": {
            "contract_breakdown": contract_breakdown,
            "payment_breakdown": payment_breakdown,
            "top_delinquent": top_delinquent,
        },
    }


def _generate_report_pdf(report_data: dict, period_label: str) -> bytes:
    """Generate a PDF monthly report."""
    from io import BytesIO
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter,
                            rightMargin=0.75*inch, leftMargin=0.75*inch,
                            topMargin=0.75*inch, bottomMargin=0.75*inch)

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name='ReportTitle', parent=styles['Heading1'],
                              fontSize=18, alignment=TA_CENTER, spaceAfter=20))
    styles.add(ParagraphStyle(name='SectionHead', parent=styles['Heading2'],
                              fontSize=13, spaceAfter=8, spaceBefore=16,
                              textColor=colors.HexColor("#283242")))
    styles.add(ParagraphStyle(name='RightAlign', parent=styles['Normal'],
                              alignment=TA_RIGHT))

    elements = []
    fmt = lambda n: f"${n:,.0f}" if n else "$0"

    # Title
    elements.append(Paragraph("Maninos Capital LLC", styles['ReportTitle']))
    elements.append(Paragraph(f"Reporte Mensual — {period_label}", styles['Heading2']))
    elements.append(Spacer(1, 20))

    # Portfolio Overview
    elements.append(Paragraph("Resumen del Portafolio", styles['SectionHead']))
    portfolio_data = [
        ["Contratos Activos", str(report_data["active_contracts"])],
        ["Total Contratos", str(report_data["total_contracts"])],
        ["Valor del Portafolio", fmt(report_data["portfolio_value"])],
    ]
    t = Table(portfolio_data, colWidths=[300, 150])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#f9f9f6")),
        ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor("#283242")),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica-Bold'),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#ddd")),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(t)
    elements.append(Spacer(1, 15))

    # Income
    elements.append(Paragraph("Ingresos del Mes", styles['SectionHead']))
    income_data = [
        ["Ingreso Esperado", fmt(report_data["expected_income"])],
        ["Ingreso Real", fmt(report_data["actual_income"])],
        ["Tasa de Cobro", f"{report_data['collection_rate']}%"],
    ]
    t = Table(income_data, colWidths=[300, 150])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#f9f9f6")),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica-Bold'),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#ddd")),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(t)
    elements.append(Spacer(1, 15))

    # Delinquency
    elements.append(Paragraph("Morosidad", styles['SectionHead']))
    delinq_data = [
        ["Pagos Atrasados", str(report_data["overdue_payments"])],
        ["Monto Atrasado", fmt(report_data["overdue_amount"])],
        ["Tasa de Morosidad", f"{report_data['delinquency_rate']}%"],
        ["Late Fees Cobrados", fmt(report_data["late_fees_collected"])],
    ]
    t = Table(delinq_data, colWidths=[300, 150])
    bg = colors.HexColor("#fef2f2") if report_data["overdue_payments"] > 0 else colors.HexColor("#f9f9f6")
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), bg),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica-Bold'),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#ddd")),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(t)
    elements.append(Spacer(1, 15))

    # Investors
    elements.append(Paragraph("Inversionistas", styles['SectionHead']))
    inv_data = [
        ["Inversionistas Activos", str(report_data["active_investors"])],
        ["Total Invertido", fmt(report_data["total_invested"])],
        ["Retornos Pagados (mes)", fmt(report_data["total_returns_paid"])],
    ]
    t = Table(inv_data, colWidths=[300, 150])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#f9f9f6")),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica-Bold'),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#ddd")),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(t)
    elements.append(Spacer(1, 15))

    # Acquisitions
    elements.append(Paragraph("Adquisiciones & Entregas", styles['SectionHead']))
    acq_data = [
        ["Propiedades Adquiridas", str(report_data["properties_acquired"])],
        ["Gasto en Adquisiciones", fmt(report_data["acquisition_spend"])],
        ["Títulos Entregados", str(report_data["titles_delivered"])],
    ]
    t = Table(acq_data, colWidths=[300, 150])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#f9f9f6")),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica-Bold'),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#ddd")),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(t)

    # Footer
    elements.append(Spacer(1, 30))
    elements.append(Paragraph(
        f"Generado el {datetime.now().strftime('%d/%m/%Y %H:%M')} — Maninos Capital LLC — Confidencial",
        ParagraphStyle(name='Footer', parent=styles['Normal'], fontSize=8,
                       textColor=colors.grey, alignment=TA_CENTER)
    ))

    doc.build(elements)
    return buffer.getvalue()


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("")
async def list_reports():
    """List all generated monthly reports."""
    try:
        result = sb.table("monthly_reports") \
            .select("id, report_month, report_year, period_label, active_contracts, actual_income, collection_rate, overdue_payments, delinquency_rate, pdf_url, generated_at") \
            .order("report_year", desc=True) \
            .order("report_month", desc=True) \
            .execute()

        return {"ok": True, "reports": result.data or []}
    except Exception as e:
        logger.error(f"Error listing reports: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate")
async def generate_monthly_report(data: ReportGenerate):
    """Generate (or regenerate) a monthly portfolio report."""
    try:
        if data.month < 1 or data.month > 12:
            raise HTTPException(status_code=400, detail="Mes inválido (1-12)")
        if data.year < 2020 or data.year > 2030:
            raise HTTPException(status_code=400, detail="Año inválido")

        period_label = f"{MONTH_NAMES_ES[data.month]} {data.year}"

        # Collect data
        report_metrics = _collect_report_data(data.month, data.year)

        # Generate PDF
        pdf_bytes = _generate_report_pdf(report_metrics, period_label)

        # Upload PDF to storage
        pdf_url = None
        try:
            from api.services.document_service import _upload_to_storage
            filename = f"Report_{data.year}_{data.month:02d}.pdf"
            pdf_url = _upload_to_storage(pdf_bytes, f"reports/{data.year}", filename)
        except Exception as upload_err:
            logger.warning(f"Could not upload report PDF: {upload_err}")

        # Upsert report record
        existing = sb.table("monthly_reports") \
            .select("id") \
            .eq("report_month", data.month) \
            .eq("report_year", data.year) \
            .execute()

        report_record = {
            "report_month": data.month,
            "report_year": data.year,
            "period_label": period_label,
            "active_contracts": report_metrics["active_contracts"],
            "total_contracts": report_metrics["total_contracts"],
            "portfolio_value": report_metrics["portfolio_value"],
            "expected_income": report_metrics["expected_income"],
            "actual_income": report_metrics["actual_income"],
            "collection_rate": report_metrics["collection_rate"],
            "overdue_payments": report_metrics["overdue_payments"],
            "overdue_amount": report_metrics["overdue_amount"],
            "delinquency_rate": report_metrics["delinquency_rate"],
            "late_fees_charged": report_metrics["late_fees_charged"],
            "late_fees_collected": report_metrics["late_fees_collected"],
            "total_invested": report_metrics["total_invested"],
            "total_returns_paid": report_metrics["total_returns_paid"],
            "active_investors": report_metrics["active_investors"],
            "properties_acquired": report_metrics["properties_acquired"],
            "acquisition_spend": report_metrics["acquisition_spend"],
            "titles_delivered": report_metrics["titles_delivered"],
            "detailed_data": report_metrics["detailed_data"],
            "pdf_url": pdf_url,
            "generated_at": datetime.utcnow().isoformat(),
            "generated_by": data.generated_by,
        }

        if existing.data:
            sb.table("monthly_reports") \
                .update(report_record) \
                .eq("id", existing.data[0]["id"]) \
                .execute()
            report_id = existing.data[0]["id"]
        else:
            result = sb.table("monthly_reports") \
                .insert(report_record) \
                .execute()
            report_id = result.data[0]["id"]

        return {
            "ok": True,
            "report_id": report_id,
            "period": period_label,
            "pdf_url": pdf_url,
            "metrics": report_metrics,
            "message": f"Reporte de {period_label} generado exitosamente."
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating report {data.month}/{data.year}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# UNIFIED FINANCIAL SUMMARY — single source of truth from capital_transactions
# Links Clientes ↔ Inversionistas ↔ Contabilidad
# NOTE: This route MUST be defined BEFORE /{report_id} to avoid route conflicts.
# =============================================================================

@router.get("/unified-summary")
async def get_unified_financial_summary(
    month: Optional[int] = None,
    year: Optional[int] = None,
):
    """
    Single source of truth that aggregates *all* financial movements from
    ``capital_transactions`` and cross-links them to Clientes (RTO) and
    Inversionistas modules.

    This endpoint powers the top-level dashboard and the Reportes section.
    """
    try:
        today = date.today()
        m = month or today.month
        y = year or today.year
        start = f"{y}-{m:02d}-01"
        _, last_day = monthrange(y, m)
        end = f"{y}-{m:02d}-{last_day}"

        # ── All transactions in the period ──
        txns = sb.table("capital_transactions") \
            .select("*") \
            .neq("status", "voided") \
            .gte("transaction_date", start) \
            .lte("transaction_date", end) \
            .order("transaction_date", desc=True) \
            .execute().data or []

        # Aggregate by type
        by_type: dict = {}
        total_income = 0.0
        total_expense = 0.0
        for t in txns:
            tt = t.get("transaction_type", "other")
            amt = abs(float(t.get("amount", 0)))
            by_type.setdefault(tt, {"count": 0, "total": 0.0})
            by_type[tt]["count"] += 1
            by_type[tt]["total"] += amt
            if t.get("is_income"):
                total_income += amt
            else:
                total_expense += amt

        # ── Clientes (RTO) Snapshot ──
        contracts = sb.table("rto_contracts") \
            .select("id, status, monthly_rent, purchase_price") \
            .execute().data or []
        active_contracts = [c for c in contracts if c.get("status") == "active"]

        # Payments due this month
        payments = sb.table("rto_payments") \
            .select("id, amount, paid_amount, status, due_date, late_fee_amount") \
            .gte("due_date", start) \
            .lte("due_date", end) \
            .execute().data or []

        payments_paid = [p for p in payments if p.get("status") == "paid"]
        payments_overdue = [p for p in payments if p.get("status") in ("late", "pending") and (p.get("due_date") or "") < today.isoformat()]

        rto_expected = sum(float(p.get("amount", 0)) for p in payments)
        rto_collected = sum(float(p.get("paid_amount", 0) or 0) for p in payments_paid)
        rto_overdue = sum(float(p.get("amount", 0)) for p in payments_overdue)
        rto_late_fees = sum(float(p.get("late_fee_amount", 0) or 0) for p in payments)
        collection_rate = (rto_collected / rto_expected * 100) if rto_expected > 0 else 0

        # ── Inversionistas Snapshot ──
        investors = sb.table("investors") \
            .select("id, name, total_invested, available_capital, status") \
            .execute().data or []
        active_investors = [i for i in investors if i.get("status") == "active"]
        total_invested = sum(float(i.get("total_invested", 0) or 0) for i in investors)

        # Investor-related transactions this month
        investor_deposits = by_type.get("investor_deposit", {}).get("total", 0)
        investor_returns = by_type.get("investor_return", {}).get("total", 0)

        # Active promissory notes
        notes = sb.table("promissory_notes") \
            .select("id, loan_amount, total_due, paid_amount, status, maturity_date") \
            .execute().data or []
        active_notes = [n for n in notes if n.get("status") == "active"]
        notes_outstanding = sum(float(n.get("total_due", 0)) - float(n.get("paid_amount", 0) or 0) for n in active_notes)

        # ── Bank balances ──
        bank_balance = 0
        try:
            banks = sb.table("capital_bank_accounts") \
                .select("current_balance") \
                .eq("is_active", True) \
                .execute().data or []
            bank_balance = sum(float(b.get("current_balance", 0)) for b in banks)
        except Exception:
            pass

        return {
            "ok": True,
            "period": {"month": m, "year": y, "start": start, "end": end},

            # ── Accounting (single source of truth) ──
            "accounting": {
                "total_income": round(total_income, 2),
                "total_expense": round(total_expense, 2),
                "net_profit": round(total_income - total_expense, 2),
                "by_type": by_type,
                "transaction_count": len(txns),
                "bank_balance": round(bank_balance, 2),
            },

            # ── Clientes (RTO) ──
            "clientes": {
                "active_contracts": len(active_contracts),
                "portfolio_value": round(sum(float(c.get("purchase_price", 0)) for c in active_contracts), 2),
                "expected_monthly_income": round(sum(float(c.get("monthly_rent", 0)) for c in active_contracts), 2),
                "month_expected": round(rto_expected, 2),
                "month_collected": round(rto_collected, 2),
                "month_overdue": round(rto_overdue, 2),
                "collection_rate": round(collection_rate, 1),
                "late_fees": round(rto_late_fees, 2),
                "payments_paid": len(payments_paid),
                "payments_overdue": len(payments_overdue),
                "payments_total": len(payments),
            },

            # ── Inversionistas ──
            "inversionistas": {
                "total_investors": len(investors),
                "active_investors": len(active_investors),
                "total_invested": round(total_invested, 2),
                "month_deposits": round(investor_deposits, 2),
                "month_returns": round(investor_returns, 2),
                "active_notes": len(active_notes),
                "notes_outstanding": round(notes_outstanding, 2),
            },

            # ── Cross-link summary ──
            "cross_link": {
                "rto_income_to_accounting": round(by_type.get("rto_payment", {}).get("total", 0), 2),
                "down_payments_to_accounting": round(by_type.get("down_payment", {}).get("total", 0), 2),
                "investor_deposits_to_accounting": round(investor_deposits, 2),
                "investor_returns_from_accounting": round(investor_returns, 2),
                "commissions_from_accounting": round(by_type.get("commission", {}).get("total", 0), 2),
                "acquisitions_from_accounting": round(by_type.get("acquisition", {}).get("total", 0), 2),
            },
        }

    except Exception as e:
        logger.error(f"Error in unified financial summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{report_id}")
async def get_report(report_id: str):
    """Get a specific report with full details."""
    try:
        result = sb.table("monthly_reports") \
            .select("*") \
            .eq("id", report_id) \
            .execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Reporte no encontrado")

        return {"ok": True, "report": result.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting report {report_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/investor-statement")
async def generate_investor_statement(investor_id: str, month: int = None, year: int = None):
    """Generate an investor statement showing investments, returns, and promissory notes."""
    try:
        # Default to current month/year
        today = date.today()
        m = month or today.month
        y = year or today.year
        start_date = f"{y}-{m:02d}-01"
        _, last_day = monthrange(y, m)
        end_date = f"{y}-{m:02d}-{last_day}"
        period_label = f"{MONTH_NAMES_ES[m]} {y}"

        # Get investor
        inv = sb.table("investors") \
            .select("*") \
            .eq("id", investor_id) \
            .single() \
            .execute()
        if not inv.data:
            raise HTTPException(status_code=404, detail="Inversionista no encontrado")
        investor = inv.data

        # Get investments
        investments = sb.table("investments") \
            .select("*, properties(address, city), rto_contracts(client_id, monthly_rent, status, clients(name))") \
            .eq("investor_id", investor_id) \
            .execute().data or []

        # Get promissory notes
        notes = sb.table("promissory_notes") \
            .select("*") \
            .eq("investor_id", investor_id) \
            .execute().data or []

        # Get capital flows for the month
        flows = sb.table("capital_flows") \
            .select("*") \
            .eq("investor_id", investor_id) \
            .gte("flow_date", start_date) \
            .lte("flow_date", end_date) \
            .order("flow_date") \
            .execute().data or []

        # Calculate totals
        total_invested = sum(float(i.get("amount", 0)) for i in investments)
        total_returned = sum(float(i.get("return_amount", 0) or 0) for i in investments)
        active_investments = [i for i in investments if i.get("status") == "active"]
        expected_return = sum(float(i.get("amount", 0)) * float(i.get("expected_return_rate", 0) or 0) / 100 for i in active_investments)

        active_notes = [n for n in notes if n.get("status") == "active"]
        total_notes_issued = sum(float(n.get("loan_amount", 0)) for n in notes)
        total_notes_due = sum(float(n.get("total_due", 0)) for n in active_notes)
        total_notes_paid = sum(float(n.get("paid_amount", 0) or 0) for n in notes)

        month_inflows = sum(abs(float(f.get("amount", 0))) for f in flows if float(f.get("amount", 0)) > 0)
        month_outflows = sum(abs(float(f.get("amount", 0))) for f in flows if float(f.get("amount", 0)) < 0)

        return {
            "ok": True,
            "statement": {
                "investor": {
                    "name": investor.get("name"),
                    "company": investor.get("company"),
                    "email": investor.get("email"),
                    "status": investor.get("status"),
                },
                "period": period_label,
                "summary": {
                    "total_invested": total_invested,
                    "total_returned": total_returned,
                    "net_outstanding": total_invested - total_returned,
                    "active_investments": len(active_investments),
                    "expected_annual_return": expected_return,
                    "notes_outstanding": total_notes_due,
                    "notes_paid": total_notes_paid,
                },
                "investments": [{
                    "id": i["id"],
                    "property": i.get("properties", {}).get("address") if i.get("properties") else None,
                    "client": (i.get("rto_contracts", {}) or {}).get("clients", {}).get("name") if i.get("rto_contracts") else None,
                    "amount": float(i.get("amount", 0)),
                    "expected_return_rate": float(i.get("expected_return_rate", 0) or 0),
                    "status": i.get("status"),
                    "return_amount": float(i.get("return_amount", 0) or 0),
                } for i in investments],
                "promissory_notes": [{
                    "id": n["id"],
                    "loan_amount": float(n.get("loan_amount", 0)),
                    "annual_rate": float(n.get("annual_rate", 0)),
                    "term_months": n.get("term_months"),
                    "total_due": float(n.get("total_due", 0)),
                    "paid_amount": float(n.get("paid_amount", 0) or 0),
                    "status": n.get("status"),
                    "maturity_date": n.get("maturity_date"),
                } for n in notes],
                "month_flows": [{
                    "date": f.get("flow_date"),
                    "type": f.get("flow_type"),
                    "amount": float(f.get("amount", 0)),
                    "description": f.get("description"),
                } for f in flows],
                "month_summary": {
                    "inflows": month_inflows,
                    "outflows": month_outflows,
                    "net": month_inflows - month_outflows,
                },
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating investor statement: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{report_id}/pdf")
async def download_report_pdf(report_id: str):
    """Download or regenerate the report PDF."""
    try:
        result = sb.table("monthly_reports") \
            .select("*") \
            .eq("id", report_id) \
            .execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Reporte no encontrado")

        report = result.data[0]
        period_label = report["period_label"]

        # Regenerate PDF from stored data
        report_metrics = {
            "active_contracts": report.get("active_contracts", 0),
            "total_contracts": report.get("total_contracts", 0),
            "portfolio_value": float(report.get("portfolio_value", 0)),
            "expected_income": float(report.get("expected_income", 0)),
            "actual_income": float(report.get("actual_income", 0)),
            "collection_rate": float(report.get("collection_rate", 0)),
            "overdue_payments": report.get("overdue_payments", 0),
            "overdue_amount": float(report.get("overdue_amount", 0)),
            "delinquency_rate": float(report.get("delinquency_rate", 0)),
            "late_fees_charged": float(report.get("late_fees_charged", 0)),
            "late_fees_collected": float(report.get("late_fees_collected", 0)),
            "total_invested": float(report.get("total_invested", 0)),
            "total_returns_paid": float(report.get("total_returns_paid", 0)),
            "active_investors": report.get("active_investors", 0),
            "properties_acquired": report.get("properties_acquired", 0),
            "acquisition_spend": float(report.get("acquisition_spend", 0)),
            "titles_delivered": report.get("titles_delivered", 0),
        }

        pdf_bytes = _generate_report_pdf(report_metrics, period_label)

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=Reporte_{report['report_year']}_{report['report_month']:02d}.pdf"
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error downloading report PDF {report_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
