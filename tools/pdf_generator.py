"""
PDF Generator for RTO Contracts - Maninos Capital LLC

Generates professional PDF contracts with all 33 clauses of the
Texas Residential Lease Agreement With Purchase Option.

Uses ReportLab for PDF generation.
"""

import io
import os
import logging
from datetime import datetime, date
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

# ReportLab imports
try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
        PageBreak, Image, HRFlowable
    )
    from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False
    logger.warning("[pdf_generator] reportlab not installed. Run: pip install reportlab")


def generate_rto_contract_pdf(
    contract_data: Dict[str, Any],
    client_data: Dict[str, Any],
    property_data: Dict[str, Any],
    output_path: Optional[str] = None
) -> Dict[str, Any]:
    """
    Generates a complete RTO Contract PDF with all 33 clauses.
    
    Args:
        contract_data: Contract details (term, rent, dates, etc.)
        client_data: Client information (name, address, etc.)
        property_data: Property details (address, HUD, year, etc.)
        output_path: Optional file path to save PDF. If None, returns bytes.
    
    Returns:
        Dict with:
        - ok: bool
        - pdf_bytes: bytes (if output_path is None)
        - pdf_path: str (if output_path is provided)
        - filename: str
    """
    if not REPORTLAB_AVAILABLE:
        return {"ok": False, "error": "reportlab not installed"}
    
    try:
        # Create buffer or file
        if output_path:
            buffer = output_path
        else:
            buffer = io.BytesIO()
        
        # Create document
        doc = SimpleDocTemplate(
            buffer,
            pagesize=letter,
            rightMargin=0.75*inch,
            leftMargin=0.75*inch,
            topMargin=0.75*inch,
            bottomMargin=0.75*inch
        )
        
        # Build story (content)
        story = []
        styles = _get_custom_styles()
        
        # === HEADER ===
        story.append(Paragraph("MANINOS CAPITAL LLC", styles['CompanyName']))
        story.append(Paragraph("Texas Residential Lease Agreement", styles['ContractTitle']))
        story.append(Paragraph("With Purchase Option (Rent-to-Own)", styles['ContractSubtitle']))
        story.append(Spacer(1, 0.3*inch))
        
        # === CONTRACT INFO TABLE ===
        contract_info = [
            ["Contract ID:", contract_data.get('contract_id', 'N/A')[:12] + "..."],
            ["Date:", datetime.now().strftime("%B %d, %Y")],
            ["Status:", contract_data.get('status', 'draft').upper()],
        ]
        info_table = Table(contract_info, colWidths=[1.5*inch, 3*inch])
        info_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
            ('ALIGN', (1, 0), (1, -1), 'LEFT'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        story.append(info_table)
        story.append(Spacer(1, 0.3*inch))
        story.append(HRFlowable(width="100%", thickness=1, color=colors.black))
        story.append(Spacer(1, 0.2*inch))
        
        # === PARTIES ===
        story.append(Paragraph("PARTIES TO THIS AGREEMENT", styles['SectionHeader']))
        
        landlord_text = """
        <b>LANDLORD:</b> Maninos Capital LLC<br/>
        Address: Houston, TX<br/>
        Phone: 832-745-9600<br/>
        Email: info@maninoscapital.com
        """
        story.append(Paragraph(landlord_text, styles['Normal']))
        story.append(Spacer(1, 0.15*inch))
        
        tenant_text = f"""
        <b>TENANT:</b> {client_data.get('full_name', 'N/A')}<br/>
        Address: {client_data.get('current_address', 'N/A')}<br/>
        Phone: {client_data.get('phone', 'N/A')}<br/>
        Email: {client_data.get('email', 'N/A')}
        """
        story.append(Paragraph(tenant_text, styles['Normal']))
        story.append(Spacer(1, 0.3*inch))
        
        # === ALL 33 CLAUSES ===
        clauses = _get_contract_clauses(contract_data, client_data, property_data)
        
        for i, clause in enumerate(clauses, 1):
            story.append(Paragraph(f"{i}. {clause['title']}", styles['ClauseTitle']))
            story.append(Paragraph(clause['content'], styles['ClauseContent']))
            story.append(Spacer(1, 0.15*inch))
        
        # === SIGNATURE SECTION ===
        story.append(PageBreak())
        story.append(Paragraph("SIGNATURES", styles['SectionHeader']))
        story.append(Spacer(1, 0.2*inch))
        
        story.append(Paragraph(
            "By signing below, both parties acknowledge that they have read, understand, "
            "and agree to all terms and conditions of this Lease Agreement with Purchase Option.",
            styles['Normal']
        ))
        story.append(Spacer(1, 0.4*inch))
        
        # Signature table
        sig_data = [
            ["LANDLORD:", "", "TENANT:", ""],
            ["", "", "", ""],
            ["_" * 35, "", "_" * 35, ""],
            ["Maninos Capital LLC", "", client_data.get('full_name', ''), ""],
            ["Date: _______________", "", "Date: _______________", ""],
        ]
        sig_table = Table(sig_data, colWidths=[2.5*inch, 0.5*inch, 2.5*inch, 0.5*inch])
        sig_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('FONTNAME', (0, 0), (0, 0), 'Helvetica-Bold'),
            ('FONTNAME', (2, 0), (2, 0), 'Helvetica-Bold'),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
        ]))
        story.append(sig_table)
        
        # === EXHIBIT A - PROPERTY DESCRIPTION ===
        story.append(Spacer(1, 0.5*inch))
        story.append(Paragraph("EXHIBIT A - PROPERTY DESCRIPTION", styles['SectionHeader']))
        story.append(Spacer(1, 0.2*inch))
        
        prop_info = [
            ["Property Address:", property_data.get('address', 'N/A')],
            ["Park/Community:", property_data.get('park_name', 'N/A')],
            ["HUD Number:", property_data.get('hud_number', 'N/A')],
            ["Year Built:", str(property_data.get('year_built', 'N/A'))],
            ["Lot Rent:", f"${property_data.get('lot_rent', 0):,.2f}/month" if property_data.get('lot_rent') else 'N/A'],
        ]
        prop_table = Table(prop_info, colWidths=[2*inch, 4*inch])
        prop_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
            ('ALIGN', (1, 0), (1, -1), 'LEFT'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('BACKGROUND', (0, 0), (0, -1), colors.Color(0.95, 0.95, 0.95)),
        ]))
        story.append(prop_table)
        
        # === EXHIBIT B - PAYMENT SCHEDULE ===
        story.append(Spacer(1, 0.3*inch))
        story.append(Paragraph("EXHIBIT B - PAYMENT SCHEDULE", styles['SectionHeader']))
        story.append(Spacer(1, 0.2*inch))
        
        payment_info = [
            ["Monthly Rent:", f"${contract_data.get('monthly_rent', 0):,.2f}"],
            ["Down Payment:", f"${contract_data.get('down_payment', 0):,.2f}"],
            ["Purchase Option Price:", f"${contract_data.get('purchase_option_price', 0):,.2f}"],
            ["Payment Due Date:", f"Day {contract_data.get('payment_day', 15)} of each month"],
            ["Late Fee:", f"${contract_data.get('late_fee_per_day', 15)}/day after 5th day"],
            ["NSF Fee:", f"${contract_data.get('nsf_fee', 250)}"],
            ["Payment Method:", "Zelle to 832-745-9600"],
        ]
        payment_table = Table(payment_info, colWidths=[2*inch, 4*inch])
        payment_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
            ('ALIGN', (1, 0), (1, -1), 'LEFT'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('BACKGROUND', (0, 0), (0, -1), colors.Color(0.95, 0.95, 0.95)),
        ]))
        story.append(payment_table)
        
        # Build PDF
        doc.build(story)
        
        # Generate filename
        tenant_name = client_data.get('full_name', 'Unknown').replace(' ', '_')
        contract_id = contract_data.get('contract_id', 'unknown')[:8]
        filename = f"RTO_Contract_{tenant_name}_{contract_id}.pdf"
        
        if output_path:
            logger.info(f"[generate_rto_contract_pdf] PDF saved to {output_path}")
            return {
                "ok": True,
                "pdf_path": output_path,
                "filename": filename
            }
        else:
            pdf_bytes = buffer.getvalue()
            logger.info(f"[generate_rto_contract_pdf] PDF generated: {len(pdf_bytes)} bytes")
            return {
                "ok": True,
                "pdf_bytes": pdf_bytes,
                "filename": filename,
                "size_bytes": len(pdf_bytes)
            }
        
    except Exception as e:
        logger.error(f"[generate_rto_contract_pdf] Error: {e}")
        return {"ok": False, "error": str(e)}


def _get_custom_styles():
    """Create custom styles for the PDF."""
    styles = getSampleStyleSheet()
    
    styles.add(ParagraphStyle(
        name='CompanyName',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=16,
        alignment=TA_CENTER,
        spaceAfter=6,
        textColor=colors.Color(0.1, 0.2, 0.4)
    ))
    
    styles.add(ParagraphStyle(
        name='ContractTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=14,
        alignment=TA_CENTER,
        spaceAfter=3
    ))
    
    styles.add(ParagraphStyle(
        name='ContractSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica-Oblique',
        fontSize=11,
        alignment=TA_CENTER,
        spaceAfter=12
    ))
    
    styles.add(ParagraphStyle(
        name='SectionHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12,
        alignment=TA_LEFT,
        spaceBefore=12,
        spaceAfter=6,
        textColor=colors.Color(0.1, 0.2, 0.4)
    ))
    
    styles.add(ParagraphStyle(
        name='ClauseTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10,
        alignment=TA_LEFT,
        spaceBefore=8,
        spaceAfter=4
    ))
    
    styles.add(ParagraphStyle(
        name='ClauseContent',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        alignment=TA_JUSTIFY,
        leftIndent=20,
        spaceAfter=6
    ))
    
    return styles


def _get_contract_clauses(
    contract: Dict,
    client: Dict,
    prop: Dict
) -> list:
    """
    Returns all 33 clauses of the RTO contract with variable substitution.
    Based on Texas Residential Lease Agreement With Purchase Option.
    """
    
    # Extract values
    tenant_name = client.get('full_name', '[TENANT NAME]')
    property_address = prop.get('address', '[PROPERTY ADDRESS]')
    hud_number = prop.get('hud_number', '[HUD NUMBER]')
    property_year = prop.get('year_built', '[YEAR]')
    park_name = prop.get('park_name', '[PARK NAME]')
    
    term_months = contract.get('lease_term_months', 36)
    start_date = contract.get('start_date', date.today().isoformat())
    end_date = contract.get('end_date', '')
    monthly_rent = contract.get('monthly_rent', 695)
    down_payment = contract.get('down_payment', 0)
    purchase_price = contract.get('purchase_option_price', 0)
    payment_day = contract.get('payment_day', 15)
    late_fee = contract.get('late_fee_per_day', 15)
    nsf_fee = contract.get('nsf_fee', 250)
    
    clauses = [
        {
            "title": "REAL PROPERTY",
            "content": f"Landlord agrees to rent to Tenant the mobile home located at <b>{property_address}</b>, "
                      f"in the mobile home community known as <b>{park_name}</b>, Texas. "
                      f"HUD Label Number: <b>{hud_number}</b>. Year of manufacture: <b>{property_year}</b>. "
                      f"The property is rented 'AS IS' with interior warranty only for remodeling work performed by Landlord."
        },
        {
            "title": "TERM",
            "content": f"The lease term shall be <b>{term_months} months</b>, commencing on <b>{start_date}</b> "
                      f"and ending on <b>{end_date}</b>, unless terminated earlier in accordance with this Agreement."
        },
        {
            "title": "RENT",
            "content": f"Tenant agrees to pay monthly rent of <b>${monthly_rent:,.2f}</b> due on the <b>{payment_day}th day</b> "
                      f"of each month. Payment shall be made via Zelle to <b>832-745-9600</b>. "
                      f"A late fee of <b>${late_fee}/day</b> will be charged after the 5th day of the month. "
                      f"Returned check fee: <b>${nsf_fee}</b>. Down payment received: <b>${down_payment:,.2f}</b>."
        },
        {
            "title": "CONDITION OF PREMISES",
            "content": "Tenant acknowledges that the premises are rented in 'AS IS' condition. Landlord warrants only "
                      "interior work performed during remodeling. Tenant has inspected the property and accepts its current condition."
        },
        {
            "title": "ASSIGNMENT AND SUBLETTING",
            "content": "Tenant shall not assign this lease or sublet any portion of the premises without prior written "
                      "consent from Landlord. Any unauthorized assignment shall be void and constitute a breach of this Agreement."
        },
        {
            "title": "ALTERATIONS",
            "content": "Tenant shall not make any alterations, additions, or improvements to the premises without prior "
                      "written consent from Landlord. All approved alterations become property of the Landlord."
        },
        {
            "title": "NON-DELIVERY OF POSSESSION",
            "content": "If Landlord cannot deliver possession within 30 days of the start date, Tenant may terminate "
                      "this Agreement and receive a full refund of all deposits paid. Landlord shall not be liable for damages."
        },
        {
            "title": "HAZARDOUS MATERIALS",
            "content": "Tenant shall not use, store, or dispose of any hazardous materials on the premises. This includes "
                      "but is not limited to flammable substances, toxic chemicals, and illegal drugs."
        },
        {
            "title": "UTILITIES",
            "content": "Tenant is responsible for all utilities including electricity, gas, water, sewer, trash, cable, "
                      "and internet services. Tenant must maintain utilities in Tenant's name during the lease term."
        },
        {
            "title": "MAINTENANCE AND RULES",
            "content": "Tenant agrees to: (A) Keep premises clean and sanitary; (B) Dispose of garbage properly; "
                      "(C) Not disturb neighbors; (D) Comply with park rules; (E) Not engage in illegal activities; "
                      "(F) Keep pets only with written permission; (G) Not store vehicles or equipment outside designated areas; "
                      "(H) Maintain yard and exterior; (I) Report maintenance issues promptly; (J) Allow inspections with notice; "
                      "(K) Not modify plumbing or electrical; (L) Pay lot rent directly to park if required."
        },
        {
            "title": "DAMAGE TO PREMISES",
            "content": "Tenant is responsible for any damage to the premises beyond normal wear and tear. Tenant shall "
                      "immediately notify Landlord of any damage or needed repairs. Tenant is liable for damage caused by "
                      "Tenant, guests, or pets."
        },
        {
            "title": "ACCESS BY LANDLORD",
            "content": "Landlord may enter the premises with reasonable notice for: (A) Inspections; (B) Repairs; "
                      "(C) Showing to prospective buyers or tenants; (D) Emergency situations; (E) Abandonment verification; "
                      "(F) Court-ordered access. Emergency access does not require notice."
        },
        {
            "title": "SUBORDINATION",
            "content": "This lease is subordinate to any mortgages or deeds of trust now or hereafter placed on the property. "
                      "Tenant agrees to execute any documents required to effectuate such subordination."
        },
        {
            "title": "HOLD OVER",
            "content": f"If Tenant remains in possession after lease expiration without Landlord's consent, Tenant shall pay "
                      f"<b>${monthly_rent:,.2f} per month</b> as holdover rent, and this Agreement shall continue on a month-to-month basis "
                      f"until either party provides 30 days written notice to terminate."
        },
        {
            "title": "SURRENDER OF PREMISES",
            "content": "Upon termination, Tenant shall surrender the premises in good condition, reasonable wear and tear excepted. "
                      "Tenant shall remove all personal property and return all keys. Any property left behind may be disposed of by Landlord."
        },
        {
            "title": "WATERBEDS",
            "content": "Waterbeds and water-filled furniture are strictly prohibited on the premises due to structural "
                      "limitations of mobile homes."
        },
        {
            "title": "QUIET ENJOYMENT",
            "content": "Landlord covenants that Tenant, upon paying rent and performing all obligations, shall peacefully "
                      "and quietly enjoy the premises without interference from Landlord or anyone claiming through Landlord."
        },
        {
            "title": "INDEMNIFICATION",
            "content": "Tenant agrees to indemnify and hold harmless Landlord from any claims, damages, or expenses arising "
                      "from Tenant's use of the premises, except for Landlord's gross negligence or willful misconduct."
        },
        {
            "title": "DEFAULT",
            "content": "If Tenant fails to pay rent or breaches any term of this Agreement, Tenant shall have <b>7 days</b> "
                      "to cure the default after written notice. If not cured, Landlord may terminate this Agreement and pursue "
                      "all legal remedies including eviction."
        },
        {
            "title": "ABANDONMENT",
            "content": "If Tenant abandons the premises (absence for 15+ days without rent payment and notice), Landlord may "
                      "retake possession, re-rent the property, and hold Tenant liable for any losses."
        },
        {
            "title": "ATTORNEYS' FEES",
            "content": "In any legal action arising from this Agreement, the prevailing party shall be entitled to recover "
                      "reasonable attorneys' fees and court costs from the non-prevailing party."
        },
        {
            "title": "RECORDING",
            "content": "Tenant shall not record this lease or any memorandum thereof without Landlord's prior written consent."
        },
        {
            "title": "GOVERNING LAW",
            "content": "This Agreement shall be governed by the laws of the <b>State of Texas</b>. Any disputes shall be "
                      "resolved in the courts of Harris County, Texas."
        },
        {
            "title": "SEVERABILITY",
            "content": "If any provision of this Agreement is found invalid or unenforceable, the remaining provisions "
                      "shall continue in full force and effect."
        },
        {
            "title": "BINDING EFFECT",
            "content": "This Agreement shall be binding upon and inure to the benefit of the parties and their respective "
                      "heirs, executors, administrators, successors, and permitted assigns."
        },
        {
            "title": "HEADINGS",
            "content": "The headings in this Agreement are for convenience only and shall not affect its interpretation."
        },
        {
            "title": "CONSTRUCTION",
            "content": "This Agreement shall be construed without regard to any presumption against the party who drafted it."
        },
        {
            "title": "NON-WAIVER",
            "content": "Landlord's failure to enforce any provision of this Agreement shall not be deemed a waiver of the "
                      "right to enforce that or any other provision in the future."
        },
        {
            "title": "MODIFICATION",
            "content": "This Agreement may only be modified by a written instrument signed by both parties. No oral "
                      "modifications shall be valid or enforceable."
        },
        {
            "title": "NOTICE",
            "content": "All notices under this Agreement shall be in writing and delivered personally or by certified mail "
                      "to the addresses listed above. Notice is effective upon delivery or 3 days after mailing."
        },
        {
            "title": "LEAD-BASED PAINT DISCLOSURE",
            "content": f"{'The property was built before 1978 and may contain lead-based paint. Tenant has received the EPA pamphlet Protect Your Family From Lead in Your Home and any available records.' if property_year and int(property_year) < 1978 else 'The property was built after 1978 and is exempt from lead-based paint disclosure requirements.'}"
        },
        {
            "title": "ARBITRATION",
            "content": "Any dispute arising from this Agreement, <b>except for collection of rent and other payments</b>, "
                      "shall be resolved by binding arbitration in accordance with Texas law. The arbitrator's decision shall be final."
        },
        {
            "title": "OPTION TO PURCHASE",
            "content": f"Tenant has the option to purchase the property for <b>${purchase_price:,.2f}</b> at any time during "
                      f"the lease term. To exercise this option, Tenant must: (1) Be current on all rent payments; "
                      f"(2) Provide written notice of intent to purchase; (3) Close within <b>21 days</b> of notice. "
                      f"Deposits paid are <b>non-refundable</b> but may be applied toward the purchase price at Landlord's discretion."
        },
    ]
    
    return clauses


def _sanitize_filename(filename: str) -> str:
    """
    Sanitize filename for Supabase Storage.
    Removes accents and special characters.
    """
    import unicodedata
    import re
    
    # Normalize unicode and remove accents
    normalized = unicodedata.normalize('NFKD', filename)
    ascii_text = normalized.encode('ASCII', 'ignore').decode('ASCII')
    
    # Replace spaces with underscores and remove other special chars
    sanitized = re.sub(r'[^\w\-_\.]', '_', ascii_text)
    
    # Remove multiple underscores
    sanitized = re.sub(r'_+', '_', sanitized)
    
    return sanitized


def upload_pdf_to_storage(
    pdf_bytes: bytes,
    filename: str,
    contract_id: str
) -> Dict[str, Any]:
    """
    Uploads PDF to Supabase Storage.
    
    Args:
        pdf_bytes: PDF file content
        filename: Name for the file
        contract_id: Contract ID for organization
    
    Returns:
        Dict with storage URL
    """
    try:
        from .supabase_client import sb
        
        # Sanitize filename to remove accents and special characters
        safe_filename = _sanitize_filename(filename)
        
        # Upload to contracts bucket
        storage_path = f"contracts/{contract_id}/{safe_filename}"
        
        result = sb.storage.from_("documents").upload(
            storage_path,
            pdf_bytes,
            {"content-type": "application/pdf"}
        )
        
        # Get public URL and clean it (remove trailing ? if present)
        public_url = sb.storage.from_("documents").get_public_url(storage_path)
        if public_url.endswith('?'):
            public_url = public_url[:-1]
        
        logger.info(f"[upload_pdf_to_storage] Uploaded {safe_filename} to {storage_path}")
        
        return {
            "ok": True,
            "storage_path": storage_path,
            "public_url": public_url,
            "filename": safe_filename
        }
        
    except Exception as e:
        logger.error(f"[upload_pdf_to_storage] Error: {e}")
        return {"ok": False, "error": str(e)}

