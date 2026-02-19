"""
Capital Promissory Notes - Simple (non-accumulative) interest
Investors lend money → Capital pays back principal + simple interest.
Payments are flexible: monthly, lump-sum, or any combination.
"""

import logging
import math
from datetime import datetime, date
from dateutil.relativedelta import relativedelta
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from tools.supabase_client import sb

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/promissory-notes", tags=["Capital - Promissory Notes"])


# =============================================================================
# SCHEMAS
# =============================================================================

class PromissoryNoteCreate(BaseModel):
    investor_id: str
    loan_amount: float
    annual_rate: float = 12.0        # default 12%
    term_months: int = 12
    start_date: Optional[str] = None  # YYYY-MM-DD
    signed_at: Optional[str] = None
    signed_city: str = "Conroe"
    signed_state: str = "Texas"
    subscriber_name: str = "Maninos Capital LLC"
    subscriber_representative: Optional[str] = None
    subscriber_address: str = "15891 Old Houston Rd, Conroe, Tx. Zip Code 77302"
    lender_name: Optional[str] = None       # auto-populated from investor if empty
    lender_company: Optional[str] = None
    lender_representative: Optional[str] = None
    default_interest_rate: float = 12.0
    notes: Optional[str] = None


class PromissoryNoteUpdate(BaseModel):
    annual_rate: Optional[float] = None
    term_months: Optional[int] = None
    start_date: Optional[str] = None
    signed_at: Optional[str] = None
    signed_city: Optional[str] = None
    subscriber_name: Optional[str] = None
    subscriber_representative: Optional[str] = None
    subscriber_address: Optional[str] = None
    lender_name: Optional[str] = None
    lender_company: Optional[str] = None
    lender_representative: Optional[str] = None
    default_interest_rate: Optional[float] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    document_url: Optional[str] = None


class RecordPaymentRequest(BaseModel):
    amount: float
    payment_method: str = "bank_transfer"  # bank_transfer, check, cash, zelle, wire
    reference: Optional[str] = None
    notes: Optional[str] = None


# =============================================================================
# HELPERS
# =============================================================================

def _calculate_simple_schedule(loan_amount: float, monthly_rate: float, term_months: int) -> dict:
    """
    Calculate **simple (non-accumulative) interest** schedule.
    Interest is always computed on the ORIGINAL principal — it never compounds.

    Returns:
        {
            "total_interest": float,
            "total_due": float,
            "monthly_interest": float,
            "schedule": [
                { "term": 0, "interest": 0, "accrued_interest": 0,
                  "payment": 0, "principal": loan, "pending": loan },
                { "term": 1, "interest": x, "accrued_interest": x,
                  "payment": 0, "principal": loan, "pending": loan + x },
                ...
            ]
        }
    """
    monthly_interest = round(loan_amount * monthly_rate, 2)
    total_interest = round(monthly_interest * term_months, 2)
    total_due = round(loan_amount + total_interest, 2)

    schedule = []

    # Term 0
    schedule.append({
        "term": 0,
        "interest": 0.0,
        "accrued_interest": 0.0,
        "payment": 0.0,
        "principal": round(loan_amount, 2),
        "pending": round(loan_amount, 2),
    })

    accrued = 0.0
    for month in range(1, term_months + 1):
        accrued = round(accrued + monthly_interest, 2)
        pending = round(loan_amount + accrued, 2)

        schedule.append({
            "term": month,
            "interest": monthly_interest,
            "accrued_interest": accrued,
            "payment": 0.0,
            "principal": round(loan_amount, 2),
            "pending": pending,
        })

    return {
        "total_interest": total_interest,
        "total_due": total_due,
        "monthly_interest": monthly_interest,
        "schedule": schedule,
    }


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("")
async def list_promissory_notes(
    status: Optional[str] = None,
    investor_id: Optional[str] = None,
):
    """List all promissory notes with investor info."""
    try:
        query = sb.table("promissory_notes") \
            .select("*, investors(id, name, email, phone, company)")
        
        if status:
            query = query.eq("status", status)
        if investor_id:
            query = query.eq("investor_id", investor_id)
        
        result = query.order("created_at", desc=True).execute()
        notes = result.data or []
        
        # Summary stats
        total_issued = sum(float(n.get("loan_amount", 0)) for n in notes)
        total_due = sum(float(n.get("total_due", 0)) for n in notes)
        total_paid = sum(float(n.get("paid_amount", 0) or 0) for n in notes)
        active_notes = [n for n in notes if n.get("status") == "active"]
        overdue_notes = [n for n in notes if n.get("status") == "overdue"]
        
        return {
            "ok": True,
            "notes": notes,
            "summary": {
                "total_notes": len(notes),
                "active_notes": len(active_notes),
                "overdue_notes": len(overdue_notes),
                "total_issued": total_issued,
                "total_due": total_due,
                "total_paid": total_paid,
                "outstanding": total_due - total_paid,
            }
        }
    except Exception as e:
        logger.error(f"Error listing promissory notes: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/alerts/upcoming")
async def get_upcoming_maturities(days: int = 30):
    """Get promissory notes maturing in the next N days."""
    try:
        from datetime import timedelta
        today = date.today()
        cutoff = today + timedelta(days=days)
        
        result = sb.table("promissory_notes") \
            .select("*, investors(id, name, email, phone)") \
            .in_("status", ["active", "overdue"]) \
            .lte("maturity_date", cutoff.isoformat()) \
            .order("maturity_date") \
            .execute()
        
        notes = result.data or []
        
        # Categorize
        overdue = []
        this_week = []
        this_month = []
        
        for n in notes:
            mat = date.fromisoformat(str(n["maturity_date"]))
            days_until = (mat - today).days
            n["days_until_maturity"] = days_until
            
            if days_until < 0:
                overdue.append(n)
            elif days_until <= 7:
                this_week.append(n)
            else:
                this_month.append(n)
        
        return {
            "ok": True,
            "overdue": overdue,
            "this_week": this_week,
            "this_month": this_month,
            "total_alerts": len(notes),
        }
    except Exception as e:
        logger.error(f"Error getting upcoming maturities: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{note_id}")
async def get_promissory_note(note_id: str):
    """Get a promissory note with full schedule and payment history."""
    try:
        result = sb.table("promissory_notes") \
            .select("*, investors(id, name, email, phone, company)") \
            .eq("id", note_id) \
            .single() \
            .execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Nota promisoria no encontrada")
        
        note = result.data
        monthly_rate = float(note["monthly_rate"])
        loan_amount = float(note["loan_amount"])
        term_months = int(note["term_months"])
        
        # Calculate simple interest schedule
        calc = _calculate_simple_schedule(loan_amount, monthly_rate, term_months)
        
        # Get individual payment history
        payments = []
        try:
            pay_result = sb.table("promissory_note_payments") \
                .select("*") \
                .eq("promissory_note_id", note_id) \
                .order("paid_at", desc=True) \
                .execute()
            payments = pay_result.data or []
        except Exception:
            pass
        
        return {
            "ok": True,
            "note": note,
            "schedule": calc["schedule"],
            "payments": payments,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting promissory note {note_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("")
async def create_promissory_note(data: PromissoryNoteCreate):
    """Create a new promissory note."""
    try:
        # Validate investor
        investor = sb.table("investors") \
            .select("id, name, email, company") \
            .eq("id", data.investor_id) \
            .single() \
            .execute()
        
        if not investor.data:
            raise HTTPException(status_code=404, detail="Inversionista no encontrado")
        
        inv = investor.data
        
        # Calculate rates and amounts
        monthly_rate = data.annual_rate / 100 / 12
        start = date.fromisoformat(data.start_date) if data.start_date else date.today()
        maturity = start + relativedelta(months=data.term_months)
        
        # Calculate simple interest schedule
        calc = _calculate_simple_schedule(data.loan_amount, monthly_rate, data.term_months)
        
        # Auto-populate lender info from investor if not provided
        lender_name = data.lender_name or inv["name"]
        lender_company = data.lender_company or inv.get("company")
        
        note_data = {
            "investor_id": data.investor_id,
            "loan_amount": data.loan_amount,
            "annual_rate": data.annual_rate,
            "monthly_rate": monthly_rate,
            "term_months": data.term_months,
            "total_interest": calc["total_interest"],
            "total_due": calc["total_due"],
            "subscriber_name": data.subscriber_name,
            "subscriber_representative": data.subscriber_representative,
            "subscriber_address": data.subscriber_address,
            "lender_name": lender_name,
            "lender_company": lender_company,
            "lender_representative": data.lender_representative,
            "start_date": start.isoformat(),
            "maturity_date": maturity.isoformat(),
            "signed_at": data.signed_at,
            "signed_city": data.signed_city,
            "signed_state": data.signed_state,
            "default_interest_rate": data.default_interest_rate,
            "notes": data.notes,
            "status": "active",
        }
        
        result = sb.table("promissory_notes").insert(note_data).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Error al crear nota promisoria")
        
        return {
            "ok": True,
            "note": result.data[0],
            "schedule": calc["schedule"],
            "message": f"Nota promisoria creada: ${data.loan_amount:,.2f} al {data.annual_rate}% por {data.term_months} meses. Vencimiento: ${calc['total_due']:,.2f}",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating promissory note: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{note_id}")
async def update_promissory_note(note_id: str, data: PromissoryNoteUpdate):
    """Update a promissory note (recalculates if terms change)."""
    try:
        # Get current note
        current = sb.table("promissory_notes") \
            .select("*") \
            .eq("id", note_id) \
            .single() \
            .execute()
        
        if not current.data:
            raise HTTPException(status_code=404, detail="Nota promisoria no encontrada")
        
        note = current.data
        update = {k: v for k, v in data.dict(exclude_unset=True).items() if v is not None}
        
        if not update:
            return {"ok": True, "message": "Nada que actualizar"}
        
        # If financial terms changed, recalculate
        annual_rate = float(update.get("annual_rate", note["annual_rate"]))
        term_months = int(update.get("term_months", note["term_months"]))
        loan_amount = float(note["loan_amount"])
        
        if "annual_rate" in update or "term_months" in update:
            monthly_rate = annual_rate / 100 / 12
            calc = _calculate_simple_schedule(loan_amount, monthly_rate, term_months)
            update["monthly_rate"] = monthly_rate
            update["total_interest"] = calc["total_interest"]
            update["total_due"] = calc["total_due"]
        
        if "start_date" in update or "term_months" in update:
            start_str = update.get("start_date", note["start_date"])
            start = date.fromisoformat(str(start_str))
            tm = int(update.get("term_months", note["term_months"]))
            update["maturity_date"] = (start + relativedelta(months=tm)).isoformat()
        
        sb.table("promissory_notes").update(update).eq("id", note_id).execute()
        
        return {"ok": True, "message": "Nota promisoria actualizada"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating promissory note {note_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{note_id}/pay")
async def record_note_payment(note_id: str, data: RecordPaymentRequest):
    """Record a payment on a promissory note (typically at maturity)."""
    try:
        note = sb.table("promissory_notes") \
            .select("*, investors(id, name, available_capital)") \
            .eq("id", note_id) \
            .single() \
            .execute()
        
        if not note.data:
            raise HTTPException(status_code=404, detail="Nota promisoria no encontrada")
        
        n = note.data
        
        if n["status"] in ("paid", "cancelled"):
            raise HTTPException(status_code=400, detail=f"Esta nota ya está {n['status']}")
        
        current_paid = float(n.get("paid_amount", 0) or 0)
        new_paid = current_paid + data.amount
        total_due = float(n["total_due"])
        
        # Determine new status
        if new_paid >= total_due:
            new_status = "paid"
        else:
            new_status = n["status"]  # Keep current status
        
        # Update note
        update_data = {
            "paid_amount": new_paid,
            "status": new_status,
        }
        if new_status == "paid":
            update_data["paid_at"] = datetime.utcnow().isoformat()
        
        sb.table("promissory_notes").update(update_data).eq("id", note_id).execute()
        
        # Record individual payment in promissory_note_payments table
        payment_record = None
        try:
            pay_result = sb.table("promissory_note_payments").insert({
                "promissory_note_id": note_id,
                "amount": data.amount,
                "payment_method": data.payment_method,
                "reference": data.reference,
                "notes": data.notes,
                "paid_at": datetime.utcnow().isoformat(),
            }).execute()
            payment_record = pay_result.data[0] if pay_result.data else None
        except Exception as pay_err:
            logger.warning(f"Could not record individual payment record: {pay_err}")
        
        # Record capital flow (outgoing - paying investor back)
        try:
            from api.routes.capital.capital_flows import _record_flow
            _record_flow({
                "flow_type": "return_out",
                "amount": -abs(data.amount),
                "investor_id": n["investor_id"],
                "description": data.notes or f"Pago de nota promisoria a {n['investors']['name']}",
                "flow_date": date.today().isoformat(),
            })
        except Exception as flow_err:
            logger.warning(f"Could not record capital flow for note payment: {flow_err}")
        
        return {
            "ok": True,
            "paid_amount": new_paid,
            "remaining": max(0, total_due - new_paid),
            "status": new_status,
            "payment": payment_record,
            "message": f"Pago de ${data.amount:,.2f} registrado. {'Nota PAGADA completamente.' if new_status == 'paid' else f'Pendiente: ${max(0, total_due - new_paid):,.2f}'}",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error recording payment for note {note_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{note_id}/schedule")
async def get_note_schedule(note_id: str):
    """Get just the amortization schedule for a note."""
    try:
        note = sb.table("promissory_notes") \
            .select("loan_amount, monthly_rate, term_months, annual_rate") \
            .eq("id", note_id) \
            .single() \
            .execute()
        
        if not note.data:
            raise HTTPException(status_code=404, detail="Nota promisoria no encontrada")
        
        n = note.data
        calc = _calculate_simple_schedule(
            float(n["loan_amount"]),
            float(n["monthly_rate"]),
            int(n["term_months"]),
        )
        
        return {
            "ok": True,
            "schedule": calc["schedule"],
            "total_interest": calc["total_interest"],
            "total_due": calc["total_due"],
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting schedule for note {note_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{note_id}/pdf")
async def download_promissory_note_pdf(note_id: str):
    """Generate and download a PDF of the promissory note document."""
    try:
        from io import BytesIO
        from fastapi.responses import Response
        
        result = sb.table("promissory_notes") \
            .select("*, investors(id, name, email, phone, company)") \
            .eq("id", note_id) \
            .single() \
            .execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Nota promisoria no encontrada")
        
        note = result.data
        investor = note.get("investors", {}) or {}
        monthly_rate = float(note["monthly_rate"])
        loan_amount = float(note["loan_amount"])
        term_months = int(note["term_months"])
        calc = _calculate_simple_schedule(loan_amount, monthly_rate, term_months)
        
        # Generate PDF
        try:
            from reportlab.lib import colors
            from reportlab.lib.pagesizes import letter
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib.units import inch
            from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_JUSTIFY
            from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
            from reportlab.graphics.shapes import Drawing, Polygon, Line, Rect
            from reportlab.graphics import renderPDF
        except ImportError:
            raise HTTPException(status_code=500, detail="reportlab not installed")
        
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter,
                                rightMargin=0.75*inch, leftMargin=0.75*inch,
                                topMargin=0.75*inch, bottomMargin=0.75*inch)
        
        styles = getSampleStyleSheet()
        styles.add(ParagraphStyle(name='DocTitle', parent=styles['Heading1'],
                                  fontSize=16, alignment=TA_CENTER, spaceAfter=16,
                                  textColor=colors.HexColor("#1a2744")))
        styles.add(ParagraphStyle(name='Section', parent=styles['Heading2'],
                                  fontSize=12, spaceAfter=8, spaceBefore=14,
                                  textColor=colors.HexColor("#283242")))
        styles.add(ParagraphStyle(name='Body', parent=styles['Normal'],
                                  fontSize=10, leading=14, alignment=TA_JUSTIFY))
        styles.add(ParagraphStyle(name='Right', parent=styles['Normal'],
                                  alignment=TA_RIGHT, fontSize=9))
        styles.add(ParagraphStyle(name='Center', parent=styles['Normal'],
                                  alignment=TA_CENTER, fontSize=9))
        
        elements = []
        fmt = lambda n: f"${n:,.2f}" if n else "$0.00"
        
        # ── Logo: Phoenician Boat ──
        def _draw_phoenician_boat():
            """Draw a simple Phoenician boat icon."""
            d = Drawing(60, 40)
            navy = colors.HexColor("#1a2744")
            gold = colors.HexColor("#d4a853")
            # Hull (curved bottom shape)
            d.add(Polygon(
                points=[5,12, 15,4, 45,4, 55,12, 50,16, 10,16],
                fillColor=navy, strokeColor=navy, strokeWidth=0.5
            ))
            # Sail (triangle)
            d.add(Polygon(
                points=[30,16, 30,38, 48,20],
                fillColor=gold, strokeColor=navy, strokeWidth=0.5
            ))
            # Mast
            d.add(Line(30, 16, 30, 38, strokeColor=navy, strokeWidth=1.5))
            return d
        
        elements.append(_draw_phoenician_boat())
        elements.append(Paragraph("MANINOS CAPITAL LLC", ParagraphStyle(
            name='BrandTitle', parent=styles['Normal'],
            fontSize=11, alignment=TA_CENTER, spaceAfter=4,
            textColor=colors.HexColor("#1a2744"),
            fontName='Helvetica-Bold',
        )))
        elements.append(Paragraph("PROMISSORY NOTE", styles['DocTitle']))
        
        # Meta
        signed_date = note.get("signed_at", note.get("start_date", ""))
        if signed_date:
            try:
                d = datetime.fromisoformat(str(signed_date).replace("Z", "+00:00"))
                signed_str = d.strftime("%B %d, %Y")
            except Exception:
                signed_str = str(signed_date)
        else:
            signed_str = "_______________"
        
        city = note.get("signed_city", "Conroe")
        state = note.get("signed_state", "Texas")
        monthly_int = calc.get("monthly_interest", 0)
        
        meta_data = [
            [f"Date: {signed_str}", f"City: {city}, {state}"],
            [f"Amount: {fmt(loan_amount)}", f"Term: {term_months} months"],
            [f"Annual Rate: {note.get('annual_rate', 12)}% (simple)", f"Total Due: {fmt(calc['total_due'])}"],
            [f"Monthly Interest: {fmt(monthly_int)}", f"Total Interest: {fmt(calc['total_interest'])}"],
        ]
        t = Table(meta_data, colWidths=[270, 270])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#f9f9f6")),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#ddd")),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
        ]))
        elements.append(t)
        elements.append(Spacer(1, 16))
        
        # Body text
        subscriber = note.get("subscriber_name", "Maninos Capital LLC")
        lender = note.get("lender_name", investor.get("name", ""))
        lender_co = note.get("lender_company", "")
        
        body_text = f"""
        FOR VALUE RECEIVED, the undersigned <b>{subscriber}</b> ("Subscriber") promises to pay to the order of 
        <b>{lender}</b>{f' ({lender_co})' if lender_co else ''} ("Lender"), the principal sum of 
        <b>{fmt(loan_amount)}</b>, together with simple (non-accumulative) interest at the rate of 
        <b>{note.get('annual_rate', 12)}%</b> per annum, calculated on the original principal, for a period of 
        <b>{term_months} months</b>, resulting in a total amount due of <b>{fmt(calc['total_due'])}</b>.
        Payments may be made at any time — monthly, in partial amounts, or as a lump sum.
        """
        elements.append(Paragraph(body_text.strip(), styles['Body']))
        elements.append(Spacer(1, 8))
        
        maturity = note.get("maturity_date", "")
        mat_str = maturity
        if maturity:
            try:
                mat_str = datetime.fromisoformat(str(maturity)).strftime("%B %d, %Y")
            except Exception:
                pass
        
        elements.append(Paragraph(f"<b>Maturity Date:</b> {mat_str}", styles['Body']))
        elements.append(Spacer(1, 8))
        
        default_rate = note.get("default_interest_rate", 12)
        elements.append(Paragraph(
            f"In the event of default, interest shall accrue at the rate of <b>{default_rate}%</b> per annum on the outstanding balance.",
            styles['Body']
        ))
        elements.append(Spacer(1, 16))
        
        # Schedule table
        elements.append(Paragraph("Simple Interest Schedule", styles['Section']))
        sched_header = ["Month", "Monthly Interest", "Accrued Interest", "Principal", "Total Owed"]
        sched_rows = [sched_header]
        for row in calc["schedule"]:
            sched_rows.append([
                str(row["term"]),
                fmt(row["interest"]) if row["interest"] > 0 else "-",
                fmt(row["accrued_interest"]),
                fmt(row["principal"]),
                fmt(row["pending"]),
            ])
        
        t = Table(sched_rows, colWidths=[50, 95, 95, 100, 100])
        style = [
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#283242")),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#ddd")),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9f9f6")]),
        ]
        # Highlight last row
        style.append(('BACKGROUND', (0, -1), (-1, -1), colors.HexColor("#e8f5e9")))
        style.append(('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'))
        t.setStyle(TableStyle(style))
        elements.append(t)
        elements.append(Spacer(1, 24))
        
        # Signature lines
        elements.append(Paragraph("SIGNATURES", styles['Section']))
        sig_data = [
            ["_" * 40, "", "_" * 40],
            [f"{subscriber}", "", f"{lender}"],
            ["Subscriber", "", "Lender"],
        ]
        t = Table(sig_data, colWidths=[200, 60, 200])
        t.setStyle(TableStyle([
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
        ]))
        elements.append(t)
        
        # Formula note
        elements.append(Spacer(1, 12))
        elements.append(Paragraph(
            f"<i>Simple interest: Monthly interest = Principal × Monthly Rate = {fmt(loan_amount)} × "
            f"{(monthly_rate * 100):.4f}% = {fmt(monthly_int)}/month. "
            f"Total interest = {fmt(monthly_int)} × {term_months} months = {fmt(calc['total_interest'])}. "
            f"Interest does not compound.</i>",
            ParagraphStyle(name='FormulaNote', parent=styles['Normal'], fontSize=8,
                           textColor=colors.HexColor("#666"), alignment=TA_CENTER)
        ))

        # Footer
        elements.append(Spacer(1, 20))
        elements.append(Paragraph(
            f"Generated {datetime.now().strftime('%m/%d/%Y %H:%M')} — Maninos Capital LLC — Confidential",
            ParagraphStyle(name='PNFooter', parent=styles['Normal'], fontSize=7,
                           textColor=colors.grey, alignment=TA_CENTER)
        ))
        
        doc.build(elements)
        pdf_bytes = buffer.getvalue()
        
        lender_safe = (lender or "note").replace(" ", "_")
        filename = f"Promissory_Note_{lender_safe}_{note_id[:8]}.pdf"
        
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating promissory note PDF {note_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{note_id}/payoff-estimate")
async def get_payoff_estimate(note_id: str, monthly_payment: float = 0):
    """
    Estimate how many months to pay off the note given a fixed monthly payment.
    With simple interest, monthly_interest is constant.
    Net principal reduction per month = payment - monthly_interest.
    """
    try:
        note = sb.table("promissory_notes") \
            .select("loan_amount, monthly_rate, term_months, total_due, paid_amount") \
            .eq("id", note_id) \
            .single() \
            .execute()
        
        if not note.data:
            raise HTTPException(status_code=404, detail="Nota promisoria no encontrada")
        
        n = note.data
        loan_amount = float(n["loan_amount"])
        monthly_rate = float(n["monthly_rate"])
        monthly_interest = round(loan_amount * monthly_rate, 2)
        total_due = float(n["total_due"])
        paid = float(n.get("paid_amount", 0) or 0)
        remaining = max(0, total_due - paid)
        
        if monthly_payment <= 0:
            return {
                "ok": True,
                "monthly_interest": monthly_interest,
                "remaining": remaining,
                "months_to_payoff": None,
                "message": "Ingresa un monto mensual para calcular",
            }
        
        if monthly_payment <= monthly_interest:
            return {
                "ok": True,
                "monthly_interest": monthly_interest,
                "remaining": remaining,
                "months_to_payoff": None,
                "message": f"El pago mensual (${monthly_payment:,.2f}) no cubre el interés mensual (${monthly_interest:,.2f}). Se requiere un pago mayor.",
            }
        
        # Net principal paydown per month
        net_paydown = monthly_payment - monthly_interest
        exact_months = loan_amount / net_paydown
        months_to_payoff = math.ceil(exact_months)
        
        # Last month may be a partial payment (remaining capital + interest)
        full_months = months_to_payoff - 1
        capital_paid_in_full_months = full_months * net_paydown
        remaining_capital = loan_amount - capital_paid_in_full_months
        last_month_payment = remaining_capital + monthly_interest
        
        total_paid_estimate = (full_months * monthly_payment) + last_month_payment
        total_interest_paid = monthly_interest * months_to_payoff
        
        return {
            "ok": True,
            "monthly_interest": monthly_interest,
            "net_paydown_per_month": round(net_paydown, 2),
            "remaining": remaining,
            "months_to_payoff": months_to_payoff,
            "total_paid_estimate": round(total_paid_estimate, 2),
            "total_interest_paid": round(total_interest_paid, 2),
            "last_month_payment": round(last_month_payment, 2),
            "message": f"Con ${monthly_payment:,.2f}/mes, el capital se paga en {months_to_payoff} meses.",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error calculating payoff for note {note_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{note_id}")
async def delete_promissory_note(note_id: str):
    """Delete a draft promissory note."""
    try:
        note = sb.table("promissory_notes") \
            .select("status") \
            .eq("id", note_id) \
            .single() \
            .execute()
        
        if not note.data:
            raise HTTPException(status_code=404, detail="Nota promisoria no encontrada")
        
        if note.data["status"] not in ("draft", "cancelled"):
            raise HTTPException(
                status_code=400,
                detail="Solo se pueden eliminar notas en borrador o canceladas"
            )
        
        sb.table("promissory_notes").delete().eq("id", note_id).execute()
        return {"ok": True, "message": "Nota promisoria eliminada"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting promissory note {note_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

