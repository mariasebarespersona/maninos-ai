"""
PDF Generation Service for Maninos Capital LLC
Generates Bill of Sale, Deposit Agreement, and other documents
"""

from io import BytesIO
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_JUSTIFY


# Company info
COMPANY_NAME = "Maninos Capital LLC"
COMPANY_ADDRESS = "Houston, Texas"
COMPANY_PHONE = "832-745-9600"
COMPANY_EMAIL = "info@maninoscapital.com"


def _get_styles():
    """Get custom paragraph styles"""
    styles = getSampleStyleSheet()
    
    # Title style
    styles.add(ParagraphStyle(
        name='DocTitle',
        parent=styles['Heading1'],
        fontSize=18,
        spaceAfter=20,
        alignment=TA_CENTER,
        textColor=colors.HexColor('#1e3a5f'),  # Navy
    ))
    
    # Subtitle
    styles.add(ParagraphStyle(
        name='DocSubtitle',
        parent=styles['Normal'],
        fontSize=12,
        spaceAfter=12,
        alignment=TA_CENTER,
        textColor=colors.HexColor('#666666'),
    ))
    
    # Section header
    styles.add(ParagraphStyle(
        name='SectionHeader',
        parent=styles['Heading2'],
        fontSize=12,
        spaceBefore=16,
        spaceAfter=8,
        textColor=colors.HexColor('#1e3a5f'),
    ))
    
    # Body text - modify existing instead of adding new
    styles['BodyText'].fontSize = 10
    styles['BodyText'].spaceAfter = 8
    styles['BodyText'].alignment = TA_JUSTIFY
    styles['BodyText'].leading = 14
    
    # Small text
    styles.add(ParagraphStyle(
        name='SmallText',
        parent=styles['Normal'],
        fontSize=8,
        textColor=colors.HexColor('#666666'),
    ))
    
    # Right aligned
    styles.add(ParagraphStyle(
        name='RightAligned',
        parent=styles['Normal'],
        fontSize=10,
        alignment=TA_RIGHT,
    ))
    
    return styles


def generate_bill_of_sale(
    seller_name: str,
    buyer_name: str,
    property_address: str,
    hud_number: str | None,
    property_year: int | None,
    sale_price: float,
    sale_date: datetime | None = None,
) -> bytes:
    """
    Generate a Bill of Sale PDF for a mobile home transaction.
    
    Returns: PDF as bytes
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=0.75*inch,
        leftMargin=0.75*inch,
        topMargin=0.75*inch,
        bottomMargin=0.75*inch,
    )
    
    styles = _get_styles()
    story = []
    
    sale_date = sale_date or datetime.now()
    
    # Header
    story.append(Paragraph(COMPANY_NAME, styles['DocTitle']))
    story.append(Paragraph("BILL OF SALE", styles['DocTitle']))
    story.append(Paragraph("Mobile Home / Manufactured Housing", styles['DocSubtitle']))
    story.append(Spacer(1, 20))
    
    # Date
    story.append(Paragraph(
        f"Date: {sale_date.strftime('%B %d, %Y')}",
        styles['RightAligned']
    ))
    story.append(Spacer(1, 20))
    
    # Parties
    story.append(Paragraph("PARTIES", styles['SectionHeader']))
    story.append(Paragraph(
        f"<b>SELLER:</b> {seller_name}",
        styles['BodyText']
    ))
    story.append(Paragraph(
        f"<b>BUYER:</b> {buyer_name}",
        styles['BodyText']
    ))
    story.append(Spacer(1, 12))
    
    # Property Description
    story.append(Paragraph("PROPERTY DESCRIPTION", styles['SectionHeader']))
    
    property_info = [
        ["Property Address:", property_address],
        ["HUD/Serial Number:", hud_number or "N/A"],
        ["Year:", str(property_year) if property_year else "N/A"],
    ]
    
    property_table = Table(property_info, colWidths=[2*inch, 4.5*inch])
    property_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    story.append(property_table)
    story.append(Spacer(1, 12))
    
    # Sale Terms
    story.append(Paragraph("SALE TERMS", styles['SectionHeader']))
    story.append(Paragraph(
        f"<b>Purchase Price:</b> ${sale_price:,.2f} USD",
        styles['BodyText']
    ))
    story.append(Paragraph(
        f"<b>Payment Method:</b> Cash / Certified Funds",
        styles['BodyText']
    ))
    story.append(Spacer(1, 12))
    
    # Legal Text
    story.append(Paragraph("TERMS AND CONDITIONS", styles['SectionHeader']))
    
    legal_text = """
    The Seller hereby sells, transfers, and conveys to the Buyer the above-described mobile home/manufactured 
    housing unit, together with all fixtures and improvements thereon, free and clear of all liens and 
    encumbrances, except as otherwise noted herein.
    
    The Seller warrants that they are the lawful owner of the property and have the right to sell and 
    transfer ownership. The property is sold "AS IS" without any warranties, express or implied, 
    regarding condition, fitness for a particular purpose, or merchantability.
    
    The Buyer acknowledges that they have inspected the property and accepts it in its present condition. 
    The Buyer assumes all risk and responsibility for the property upon execution of this Bill of Sale.
    
    This Bill of Sale shall be governed by and construed in accordance with the laws of the State of Texas.
    """
    
    story.append(Paragraph(legal_text.strip(), styles['BodyText']))
    story.append(Spacer(1, 30))
    
    # Signatures
    story.append(Paragraph("SIGNATURES", styles['SectionHeader']))
    story.append(Spacer(1, 20))
    
    sig_data = [
        ["_" * 40, "", "_" * 40],
        ["Seller Signature", "", "Buyer Signature"],
        ["", "", ""],
        [seller_name, "", buyer_name],
        ["", "", ""],
        ["Date: _______________", "", "Date: _______________"],
    ]
    
    sig_table = Table(sig_data, colWidths=[2.5*inch, 1*inch, 2.5*inch])
    sig_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(sig_table)
    
    # Footer
    story.append(Spacer(1, 40))
    story.append(Paragraph(
        f"{COMPANY_NAME} • {COMPANY_ADDRESS} • {COMPANY_PHONE}",
        styles['SmallText']
    ))
    
    doc.build(story)
    return buffer.getvalue()


def generate_deposit_agreement(
    depositor_name: str,
    property_address: str,
    deposit_amount: float,
    total_price: float,
    deposit_date: datetime | None = None,
) -> bytes:
    """
    Generate a Deposit Agreement PDF.
    
    Returns: PDF as bytes
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=0.75*inch,
        leftMargin=0.75*inch,
        topMargin=0.75*inch,
        bottomMargin=0.75*inch,
    )
    
    styles = _get_styles()
    story = []
    
    deposit_date = deposit_date or datetime.now()
    
    # Header
    story.append(Paragraph(COMPANY_NAME, styles['DocTitle']))
    story.append(Paragraph("DEPOSIT AGREEMENT", styles['DocTitle']))
    story.append(Spacer(1, 20))
    
    # Date
    story.append(Paragraph(
        f"Date: {deposit_date.strftime('%B %d, %Y')}",
        styles['RightAligned']
    ))
    story.append(Spacer(1, 20))
    
    # Parties
    story.append(Paragraph("PARTIES", styles['SectionHeader']))
    story.append(Paragraph(
        f"<b>DEPOSITOR (Buyer):</b> {depositor_name}",
        styles['BodyText']
    ))
    story.append(Paragraph(
        f"<b>RECIPIENT (Seller):</b> {COMPANY_NAME}",
        styles['BodyText']
    ))
    story.append(Spacer(1, 12))
    
    # Property
    story.append(Paragraph("PROPERTY", styles['SectionHeader']))
    story.append(Paragraph(
        f"<b>Property Address:</b> {property_address}",
        styles['BodyText']
    ))
    story.append(Spacer(1, 12))
    
    # Financial Terms
    story.append(Paragraph("FINANCIAL TERMS", styles['SectionHeader']))
    
    balance = total_price - deposit_amount
    
    financial_data = [
        ["Total Purchase Price:", f"${total_price:,.2f}"],
        ["Deposit Amount:", f"${deposit_amount:,.2f}"],
        ["Balance Due at Closing:", f"${balance:,.2f}"],
    ]
    
    financial_table = Table(financial_data, colWidths=[2.5*inch, 2*inch])
    financial_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 11),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('LINEBELOW', (0, -1), (-1, -1), 1, colors.HexColor('#1e3a5f')),
    ]))
    story.append(financial_table)
    story.append(Spacer(1, 20))
    
    # Terms
    story.append(Paragraph("TERMS AND CONDITIONS", styles['SectionHeader']))
    
    terms = [
        "1. The deposit is <b>non-refundable</b> unless otherwise agreed in writing.",
        "2. The deposit will be applied toward the total purchase price at closing.",
        "3. The Depositor agrees to complete the purchase within 30 days of this agreement.",
        "4. If the Depositor fails to complete the purchase, the deposit shall be forfeited.",
        "5. The Recipient agrees to hold the property off the market during the deposit period.",
        "6. This agreement is subject to the laws of the State of Texas.",
    ]
    
    for term in terms:
        story.append(Paragraph(term, styles['BodyText']))
    
    story.append(Spacer(1, 30))
    
    # Signatures
    story.append(Paragraph("SIGNATURES", styles['SectionHeader']))
    story.append(Spacer(1, 20))
    
    sig_data = [
        ["_" * 40, "", "_" * 40],
        ["Depositor Signature", "", f"{COMPANY_NAME}"],
        ["", "", ""],
        [depositor_name, "", "Authorized Representative"],
        ["", "", ""],
        ["Date: _______________", "", "Date: _______________"],
    ]
    
    sig_table = Table(sig_data, colWidths=[2.5*inch, 1*inch, 2.5*inch])
    sig_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(sig_table)
    
    # Footer
    story.append(Spacer(1, 40))
    story.append(Paragraph(
        f"{COMPANY_NAME} • {COMPANY_ADDRESS} • {COMPANY_PHONE}",
        styles['SmallText']
    ))
    
    doc.build(story)
    return buffer.getvalue()


def generate_rto_contract(
    tenant_name: str,
    property_address: str,
    hud_number: str | None,
    property_year: int | None,
    lease_term_months: int,
    monthly_rent: float,
    down_payment: float,
    purchase_price: float,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    payment_due_day: int = 15,
    late_fee_per_day: float = 15.0,
    grace_period_days: int = 5,
    nsf_fee: float = 250.0,
    holdover_monthly: float = 695.0,
    zelle_phone: str = "832-745-9600",
) -> bytes:
    """
    Generate a full Texas Residential Lease Agreement With Purchase Option PDF.
    Contains all 33 clauses as per the Maninos Capital LLC RTO template.
    
    Returns: PDF as bytes
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=0.6*inch,
        leftMargin=0.6*inch,
        topMargin=0.6*inch,
        bottomMargin=0.6*inch,
    )
    
    styles = _get_styles()
    
    # Add clause-specific styles
    styles.add(ParagraphStyle(
        name='ClauseTitle',
        parent=styles['Heading2'],
        fontSize=11,
        spaceBefore=14,
        spaceAfter=6,
        textColor=colors.HexColor('#1e3a5f'),
        fontName='Helvetica-Bold',
    ))
    styles.add(ParagraphStyle(
        name='ClauseBody',
        parent=styles['Normal'],
        fontSize=9,
        spaceAfter=6,
        alignment=TA_JUSTIFY,
        leading=12,
    ))
    styles.add(ParagraphStyle(
        name='SubClause',
        parent=styles['Normal'],
        fontSize=9,
        spaceAfter=4,
        alignment=TA_JUSTIFY,
        leading=11,
        leftIndent=20,
    ))
    
    story = []
    start = start_date or datetime.now()
    end = end_date or (start + __import__('dateutil.relativedelta', fromlist=['relativedelta']).relativedelta(months=lease_term_months))
    
    start_str = start.strftime('%B %d, %Y') if isinstance(start, datetime) else str(start)
    end_str = end.strftime('%B %d, %Y') if isinstance(end, datetime) else str(end)
    grace_day = payment_due_day + grace_period_days
    
    # =========================================================================
    # COVER / HEADER
    # =========================================================================
    story.append(Paragraph("MANINOS CAPITAL LLC", styles['DocTitle']))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        "TEXAS RESIDENTIAL LEASE AGREEMENT<br/>WITH PURCHASE OPTION",
        styles['DocTitle']
    ))
    story.append(Spacer(1, 12))
    story.append(Paragraph(
        f"Date: {start_str}",
        styles['RightAligned']
    ))
    story.append(Spacer(1, 8))
    
    # Parties
    story.append(Paragraph("PARTIES TO THIS AGREEMENT", styles['SectionHeader']))
    story.append(Paragraph(
        '<b>LANDLORD / SELLER:</b> Maninos Capital LLC ("Landlord")',
        styles['ClauseBody']
    ))
    story.append(Paragraph(
        f'<b>TENANT / BUYER:</b> {tenant_name} ("Tenant")',
        styles['ClauseBody']
    ))
    story.append(Spacer(1, 8))
    
    # Property summary table
    prop_info = [
        ["Property Address:", property_address],
        ["HUD/Serial Number:", hud_number or "N/A"],
        ["Year:", str(property_year) if property_year else "N/A"],
        ["Term:", f"{lease_term_months} months"],
        ["Monthly Rent:", f"${monthly_rent:,.2f}"],
        ["Purchase Price:", f"${purchase_price:,.2f}"],
        ["Down Payment:", f"${down_payment:,.2f}"],
    ]
    
    prop_table = Table(prop_info, colWidths=[1.8*inch, 4.5*inch])
    prop_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f5f5f5')),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cccccc')),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(prop_table)
    story.append(Spacer(1, 12))
    
    # =========================================================================
    # 33 CLAUSES
    # =========================================================================
    
    # 1. REAL PROPERTY
    story.append(Paragraph("1. REAL PROPERTY", styles['ClauseTitle']))
    story.append(Paragraph(
        f'Landlord hereby leases to Tenant the manufactured/mobile home (HUD Label No. '
        f'{hud_number or "_______________"}, Year: {property_year or "____"}) '
        f'located at <b>{property_address}</b>, together with all fixtures and '
        f'improvements thereon, subject to the terms and conditions of this Agreement.',
        styles['ClauseBody']
    ))
    
    # 2. TERM
    story.append(Paragraph("2. TERM", styles['ClauseTitle']))
    story.append(Paragraph(
        f'The term of this Lease shall be for a period of <b>{lease_term_months} months</b>, '
        f'commencing on <b>{start_str}</b> and terminating on <b>{end_str}</b>, '
        f'unless sooner terminated in accordance with the provisions of this Agreement.',
        styles['ClauseBody']
    ))
    
    # 3. RENT
    story.append(Paragraph("3. RENT", styles['ClauseTitle']))
    story.append(Paragraph(
        f'Tenant agrees to pay Landlord as rent for the premises the sum of '
        f'<b>${monthly_rent:,.2f}</b> per month, due and payable on the '
        f'<b>{payment_due_day}th day</b> of each month during the term of this Lease. '
        f'A late fee of <b>${late_fee_per_day:.2f} per day</b> shall be assessed for any '
        f'payment received after the <b>{grace_day}th day</b> of the month '
        f'({grace_period_days}-day grace period). A fee of <b>${nsf_fee:.2f}</b> shall be '
        f'charged for any returned check or insufficient funds (NSF). '
        f'Payments shall be made via Zelle to <b>{zelle_phone}</b> or other method approved by Landlord.',
        styles['ClauseBody']
    ))
    
    # 4. CONDITION OF PREMISES
    story.append(Paragraph("4. CONDITION OF PREMISES", styles['ClauseTitle']))
    story.append(Paragraph(
        'Tenant acknowledges that the premises have been inspected and are accepted in their '
        'present "AS IS" condition. Tenant has examined the premises and is satisfied with '
        'their physical condition including but not limited to plumbing, heating, air conditioning, '
        'electrical systems, and all appliances. The mobile home is accepted AS IS with no '
        'warranties express or implied.',
        styles['ClauseBody']
    ))
    
    # 5. ASSIGNMENT
    story.append(Paragraph("5. ASSIGNMENT AND SUBLETTING", styles['ClauseTitle']))
    story.append(Paragraph(
        'Tenant shall not assign this Agreement, or sub-let or grant any license to use the '
        'premises or any part thereof without the prior written consent of the Landlord. Any '
        'assignment, subletting, or licensing without such consent shall be void and, at the '
        'option of the Landlord, shall terminate this Agreement.',
        styles['ClauseBody']
    ))
    
    # 6. ALTERATIONS
    story.append(Paragraph("6. ALTERATIONS AND IMPROVEMENTS", styles['ClauseTitle']))
    story.append(Paragraph(
        'Tenant shall make no alterations to the buildings or improvements on the premises '
        'or construct any building or make any other improvements on the premises without the '
        'prior written consent of the Landlord. Any and all alterations, changes, and/or '
        'improvements built, constructed or placed on the premises by Tenant shall, unless '
        'otherwise provided by written agreement between Landlord and Tenant, be and become '
        'the property of Landlord.',
        styles['ClauseBody']
    ))
    
    # 7. NON-DELIVERY
    story.append(Paragraph("7. NON-DELIVERY OF POSSESSION", styles['ClauseTitle']))
    story.append(Paragraph(
        'In the event the Landlord cannot deliver possession of the premises at the commencement '
        'of the lease term, Landlord shall not be liable for any damage caused thereby, nor shall '
        'this Agreement be void or voidable, but Tenant shall not be liable for any rent until '
        'possession is delivered. Tenant may terminate this Agreement if possession is not '
        'delivered within <b>30 days</b> of the commencement of the lease term.',
        styles['ClauseBody']
    ))
    
    # 8. HAZARDOUS MATERIALS
    story.append(Paragraph("8. HAZARDOUS MATERIALS", styles['ClauseTitle']))
    story.append(Paragraph(
        'Tenant shall not keep on the premises any item of a dangerous, flammable, or explosive '
        'character that might unreasonably increase the danger of fire or explosion on the premises '
        'or that might be considered hazardous or extra hazardous by any responsible insurance company.',
        styles['ClauseBody']
    ))
    
    # 9. UTILITIES
    story.append(Paragraph("9. UTILITIES", styles['ClauseTitle']))
    story.append(Paragraph(
        'Tenant shall be responsible for arranging for and paying for all utility services required '
        'on the premises, including but not limited to gas, electricity, water, sewer, trash '
        'collection, and telephone/internet service. Landlord shall not be liable for any '
        'interruption of utility services.',
        styles['ClauseBody']
    ))
    
    # 10. MAINTENANCE AND RULES
    story.append(Paragraph("10. MAINTENANCE, REPAIR AND RULES", styles['ClauseTitle']))
    story.append(Paragraph(
        'Tenant shall at all times maintain the premises in a clean and sanitary manner including '
        'all equipment, appliances, furniture, and furnishings. Tenant shall comply with the '
        'following rules:',
        styles['ClauseBody']
    ))
    
    rules = [
        ("A", "Keep all areas of the premises clean, sanitary, and free from trash and debris."),
        ("B", "Not disturb surrounding neighbors or create excessive noise."),
        ("C", "Not paint or decorate without prior written consent from Landlord."),
        ("D", "Not store vehicles, equipment, or other items outside of designated areas."),
        ("E", "Not make any structural modifications without prior written consent."),
        ("F", "Properly dispose of all garbage and waste in designated areas."),
        ("G", "Maintain the yard and exterior areas in a neat and orderly condition."),
        ("H", "Not install any satellite dishes, antennas, or similar equipment without consent."),
        ("I", "Not engage in any illegal or criminal activity on the premises."),
        ("J", "Keep all pets under control at all times. No pets without prior written consent."),
        ("K", "Not block or obstruct any sidewalks, driveways, or common areas."),
        ("L", "Report any maintenance issues or damage to Landlord promptly."),
    ]
    
    for rule_ltr, rule in rules:
        story.append(Paragraph(f'<b>{rule_ltr}.</b> {rule}', styles['SubClause']))
    
    # 11. DAMAGE TO PREMISES
    story.append(Paragraph("11. DAMAGE TO PREMISES", styles['ClauseTitle']))
    story.append(Paragraph(
        'If the premises are partially damaged by fire or other casualty not due to Tenant\'s '
        'negligence or willful act, the rent shall abate during the period of repairs in proportion '
        'to the portion of the premises rendered uninhabitable. If the premises are totally '
        'destroyed, or so damaged as to be uninhabitable, Landlord may elect to terminate this '
        'Agreement or to repair the premises.',
        styles['ClauseBody']
    ))
    
    # 12. ACCESS BY LANDLORD
    story.append(Paragraph("12. ACCESS BY LANDLORD", styles['ClauseTitle']))
    story.append(Paragraph(
        'Landlord shall have the right to enter the premises during normal working hours for the '
        'following purposes, with reasonable prior notice:',
        styles['ClauseBody']
    ))
    access_reasons = [
        ("A", "Inspect the premises."),
        ("B", "Make necessary or agreed repairs, decorations, alterations, or improvements."),
        ("C", "Supply agreed services."),
        ("D", "Exhibit the premises to prospective or actual purchasers, mortgagees, tenants, or workmen."),
        ("E", "Address any emergency."),
        ("F", "Verify compliance with the terms of this Agreement."),
    ]
    for reason_ltr, reason in access_reasons:
        story.append(Paragraph(f'<b>{reason_ltr}.</b> {reason}', styles['SubClause']))
    
    # 13. SUBORDINATION
    story.append(Paragraph("13. SUBORDINATION", styles['ClauseTitle']))
    story.append(Paragraph(
        'This Agreement and Tenant\'s interest hereunder are and shall be subordinate, junior and '
        'inferior to any and all mortgages, liens or encumbrances now or hereafter placed on the '
        'premises by the Landlord, all advances made under any such mortgages, liens or encumbrances.',
        styles['ClauseBody']
    ))
    
    # 14. HOLD OVER
    story.append(Paragraph("14. HOLD OVER", styles['ClauseTitle']))
    story.append(Paragraph(
        f'If Tenant remains in possession of the premises after the expiration of the term without '
        f'executing a new lease or exercising the Purchase Option, such holdover shall be on a '
        f'month-to-month basis at a rate of <b>${holdover_monthly:.2f} per month</b>, subject '
        f'to all other terms of this Agreement. Landlord may terminate such month-to-month tenancy '
        f'upon thirty (30) days written notice.',
        styles['ClauseBody']
    ))
    
    # 15. SURRENDER
    story.append(Paragraph("15. SURRENDER OF PREMISES", styles['ClauseTitle']))
    story.append(Paragraph(
        'Upon the expiration of the term hereof, Tenant shall surrender the premises in as good '
        'condition as they were at the commencement of this Agreement, reasonable wear and tear '
        'excepted. Tenant shall remove all personal property from the premises.',
        styles['ClauseBody']
    ))
    
    # 16. WATERBEDS
    story.append(Paragraph("16. WATERBEDS", styles['ClauseTitle']))
    story.append(Paragraph(
        'Waterbeds or any water-filled furniture are strictly prohibited on the premises.',
        styles['ClauseBody']
    ))
    
    # 17. QUIET ENJOYMENT
    story.append(Paragraph("17. QUIET ENJOYMENT", styles['ClauseTitle']))
    story.append(Paragraph(
        'Landlord covenants that on paying the rent and performing the covenants herein contained, '
        'Tenant shall peaceably and quietly have, hold, and enjoy the premises for the agreed '
        'term of this Agreement.',
        styles['ClauseBody']
    ))
    
    # 18. INDEMNIFICATION
    story.append(Paragraph("18. INDEMNIFICATION", styles['ClauseTitle']))
    story.append(Paragraph(
        'Landlord shall not be liable for any damage or injury to Tenant, or any other person, '
        'or to any property, occurring on the premises or any part thereof, and Tenant agrees '
        'to hold Landlord harmless from any claims for damages. Tenant shall be responsible for '
        'obtaining renter\'s insurance to cover personal property and liability.',
        styles['ClauseBody']
    ))
    
    # 19. DEFAULT
    story.append(Paragraph("19. DEFAULT", styles['ClauseTitle']))
    story.append(Paragraph(
        'If Tenant fails to comply with any of the material provisions of this Agreement, or '
        'any applicable rules or regulations, Landlord may provide Tenant with written notice '
        'of such non-compliance. Tenant shall have <b>7 days</b> from the date of such notice '
        'to cure the default. If the default is not cured within said period, Landlord may '
        'terminate this Agreement and pursue all remedies available under Texas law.',
        styles['ClauseBody']
    ))
    
    # 20. ABANDONMENT
    story.append(Paragraph("20. ABANDONMENT", styles['ClauseTitle']))
    story.append(Paragraph(
        'If at any time during the term of this Agreement Tenant abandons the premises or any '
        'part thereof, Landlord may, at its option, enter the premises by any means without '
        'being liable for any prosecution for such entering, and without becoming liable to '
        'Tenant for damages or for any payment of any kind whatever. Landlord may, at its '
        'discretion, re-let the premises.',
        styles['ClauseBody']
    ))
    
    # 21. ATTORNEYS FEES
    story.append(Paragraph("21. ATTORNEYS' FEES", styles['ClauseTitle']))
    story.append(Paragraph(
        'If any action at law or in equity is necessary to enforce or interpret the terms of this '
        'Agreement, the prevailing party shall be entitled to reasonable attorneys\' fees, costs, '
        'and necessary disbursements in addition to any other relief to which such party may be '
        'entitled.',
        styles['ClauseBody']
    ))
    
    # 22. RECORDING
    story.append(Paragraph("22. RECORDING", styles['ClauseTitle']))
    story.append(Paragraph(
        'Tenant shall not record or register this Lease Agreement or any memorandum thereof '
        'in any public records without the prior written consent of Landlord.',
        styles['ClauseBody']
    ))
    
    # 23. GOVERNING LAW
    story.append(Paragraph("23. GOVERNING LAW", styles['ClauseTitle']))
    story.append(Paragraph(
        'This Agreement shall be governed by, construed, and interpreted in accordance with the '
        'laws of the <b>State of Texas</b>.',
        styles['ClauseBody']
    ))
    
    # 24. SEVERABILITY
    story.append(Paragraph("24. SEVERABILITY", styles['ClauseTitle']))
    story.append(Paragraph(
        'If any provision of this Agreement or the application thereof shall, for any reason and '
        'to any extent, be invalid or unenforceable, neither the remainder of this Agreement nor '
        'the application of the provision to other persons, entities, or circumstances shall be '
        'affected thereby.',
        styles['ClauseBody']
    ))
    
    # 25. BINDING EFFECT
    story.append(Paragraph("25. BINDING EFFECT", styles['ClauseTitle']))
    story.append(Paragraph(
        'The covenants, obligations, and conditions herein contained shall be binding on and inure '
        'to the benefit of the heirs, legal representatives, and assigns of the parties hereto.',
        styles['ClauseBody']
    ))
    
    # 26. HEADINGS
    story.append(Paragraph("26. HEADINGS", styles['ClauseTitle']))
    story.append(Paragraph(
        'The headings used in this Agreement are for convenience of reference only and shall not '
        'be construed to modify, define, limit, or affect the terms and provisions hereof.',
        styles['ClauseBody']
    ))
    
    # 27. CONSTRUCTION
    story.append(Paragraph("27. CONSTRUCTION", styles['ClauseTitle']))
    story.append(Paragraph(
        'The pronouns used herein shall include, where appropriate, either gender or both, '
        'singular and plural.',
        styles['ClauseBody']
    ))
    
    # 28. NON-WAIVER
    story.append(Paragraph("28. NON-WAIVER", styles['ClauseTitle']))
    story.append(Paragraph(
        'The failure of the Landlord to insist upon strict performance of any of the covenants '
        'and agreements of this Agreement, or to exercise any option herein conferred in any one '
        'or more instances, shall not be construed to be a waiver of any such, or any other, '
        'covenant or agreement.',
        styles['ClauseBody']
    ))
    
    # 29. MODIFICATION
    story.append(Paragraph("29. MODIFICATION", styles['ClauseTitle']))
    story.append(Paragraph(
        'This Agreement may not be modified, altered, or amended except by an instrument in '
        'writing signed by both parties.',
        styles['ClauseBody']
    ))
    
    # 30. NOTICE
    story.append(Paragraph("30. NOTICE", styles['ClauseTitle']))
    story.append(Paragraph(
        'Any notice required or permitted under this Agreement shall be in writing and shall be '
        'deemed delivered when personally delivered, or three (3) days after mailing by certified '
        'mail, return receipt requested, to the address of the respective party.',
        styles['ClauseBody']
    ))
    
    # 31. LEAD PAINT
    story.append(Paragraph("31. LEAD-BASED PAINT DISCLOSURE", styles['ClauseTitle']))
    if property_year and property_year < 1978:
        story.append(Paragraph(
            f'This property was built in {property_year}, prior to 1978. Landlord is required to '
            'disclose the presence of known lead-based paint and/or lead-based paint hazards in the '
            'dwelling. Tenant acknowledges receipt of the EPA pamphlet "Protect Your Family from '
            'Lead in Your Home" and any available records or reports pertaining to lead-based paint.',
            styles['ClauseBody']
        ))
    else:
        story.append(Paragraph(
            'The property was built after 1978. Lead-based paint disclosure is not applicable.',
            styles['ClauseBody']
        ))
    
    # 32. ARBITRATION
    story.append(Paragraph("32. ARBITRATION", styles['ClauseTitle']))
    story.append(Paragraph(
        'Any dispute arising under this Agreement, <b>except those related to the payment of '
        'rent and other monetary obligations</b>, shall be subject to binding arbitration in '
        'accordance with the rules of the American Arbitration Association. The arbitration shall '
        'take place in the county where the premises are located.',
        styles['ClauseBody']
    ))
    
    # 33. OPTION TO PURCHASE
    story.append(Paragraph("33. OPTION TO PURCHASE", styles['ClauseTitle']))
    story.append(Paragraph(
        f'Landlord hereby grants Tenant the option to purchase the above-described property for '
        f'the purchase price of <b>${purchase_price:,.2f}</b>. This option is contingent upon '
        f'Tenant\'s compliance with all terms of this Lease Agreement, including timely payment '
        f'of all rent due. If Tenant exercises the Purchase Option, closing shall occur within '
        f'<b>21 days</b> of notification. Down payment received of <b>${down_payment:,.2f}</b> '
        f'shall be credited toward the purchase price. Deposits are <b>non-refundable</b>.',
        styles['ClauseBody']
    ))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        'To exercise this option, Tenant must provide written notice to Landlord at least thirty '
        '(30) days prior to the desired closing date, and Tenant must not be in default of any '
        'provision of this Lease Agreement at the time the option is exercised.',
        styles['ClauseBody']
    ))
    
    # =========================================================================
    # ADDITIONAL NOTES
    # =========================================================================
    story.append(Spacer(1, 10))
    story.append(Paragraph("ADDITIONAL NOTES", styles['SectionHeader']))
    story.append(Paragraph(
        '• The Mobile Home is provided <b>AS IS</b> without warranty.<br/>'
        '• All deposits are <b>non-refundable</b>.<br/>'
        '• Tenant is responsible for paying property taxes and insurance during the lease term.',
        styles['ClauseBody']
    ))
    
    # =========================================================================
    # SIGNATURES
    # =========================================================================
    story.append(Spacer(1, 30))
    story.append(Paragraph("SIGNATURES", styles['SectionHeader']))
    story.append(Paragraph(
        'IN WITNESS WHEREOF, the parties hereto have executed this Agreement on the date first '
        'written above.',
        styles['ClauseBody']
    ))
    story.append(Spacer(1, 20))
    
    sig_data = [
        ["_" * 40, "", "_" * 40],
        ["LANDLORD / SELLER", "", "TENANT / BUYER"],
        ["Maninos Capital LLC", "", tenant_name],
        ["", "", ""],
        ["Date: _______________", "", "Date: _______________"],
        ["", "", ""],
        ["_" * 40, "", ""],
        ["Witness", "", ""],
    ]
    
    sig_table = Table(sig_data, colWidths=[2.5*inch, 1*inch, 2.5*inch])
    sig_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(sig_table)
    
    # Footer
    story.append(Spacer(1, 30))
    story.append(Paragraph(
        f'{COMPANY_NAME} • {COMPANY_ADDRESS} • {COMPANY_PHONE} • {COMPANY_EMAIL}',
        styles['SmallText']
    ))
    story.append(Paragraph(
        f'Contract generated on {datetime.now().strftime("%B %d, %Y at %I:%M %p")}',
        styles['SmallText']
    ))
    
    doc.build(story)
    return buffer.getvalue()


def generate_checklist_pdf(
    property_address: str,
    checklist_data: dict[str, bool],
    inspector_name: str | None = None,
    inspection_date: datetime | None = None,
) -> bytes:
    """
    Generate a Property Checklist PDF.
    
    Returns: PDF as bytes
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=0.5*inch,
        leftMargin=0.5*inch,
        topMargin=0.5*inch,
        bottomMargin=0.5*inch,
    )
    
    styles = _get_styles()
    story = []
    
    inspection_date = inspection_date or datetime.now()
    
    # Header
    story.append(Paragraph(COMPANY_NAME, styles['DocTitle']))
    story.append(Paragraph("CHECKLIST DE COMPRA DE CASA", styles['DocTitle']))
    story.append(Spacer(1, 10))
    
    # Property info
    story.append(Paragraph(f"<b>Propiedad:</b> {property_address}", styles['BodyText']))
    story.append(Paragraph(f"<b>Fecha:</b> {inspection_date.strftime('%d/%m/%Y')}", styles['BodyText']))
    if inspector_name:
        story.append(Paragraph(f"<b>Inspector:</b> {inspector_name}", styles['BodyText']))
    story.append(Spacer(1, 15))
    
    # Checklist categories
    CHECKLIST_STRUCTURE = {
        'estructura': {
            'title': '🏗️ ESTRUCTURA',
            'items': [
                ('estructura_1', 'Estructura y marco de acero'),
                ('estructura_2', 'Suelos y subfloor (humedad, hundimientos)'),
                ('estructura_3', 'Techo y techumbre (filtraciones, membrana, pendientes)'),
                ('estructura_4', 'Paredes y ventanas (aislamiento, grietas, fugas)'),
            ]
        },
        'instalaciones': {
            'title': '⚡ INSTALACIONES',
            'items': [
                ('instalaciones_1', 'Regaderas, tinas y coladeras (sellos, fugas, rupturas)'),
                ('instalaciones_2', 'Electricidad (contactos, apagadores, fusibles)'),
                ('instalaciones_3', 'Plomería (fugas, presión de agua, calentador)'),
                ('instalaciones_4', 'Aire acondicionado (sin garantía)'),
                ('instalaciones_5', 'Gas (líneas sin fugas, si aplica)'),
            ]
        },
        'documentacion': {
            'title': '📄 DOCUMENTACIÓN',
            'items': [
                ('documentacion_1', 'Título limpio y sin adeudos'),
                ('documentacion_2', 'Número de serie / VIN revisado en sistema'),
                ('documentacion_3', 'Documentos del vendedor en orden'),
                ('documentacion_4', 'Aplicación firmada del vendedor y comprador'),
                ('documentacion_5', 'Factura de compra-venta (Bill of Sale)'),
            ]
        },
        'financiero': {
            'title': '💰 FINANCIERO',
            'items': [
                ('financiero_1', 'Precio de compra + costo estimado de obra'),
                ('financiero_2', 'Costo de reparaciones < 30% valor de venta'),
                ('financiero_3', 'Comparativa con precios de mercado'),
                ('financiero_4', 'Costos extra: traslado, movida, alineación'),
            ]
        },
        'especificaciones': {
            'title': '📋 ESPECIFICACIONES',
            'items': [
                ('especificaciones_1', 'Definir año, condiciones y número de cuartos'),
                ('especificaciones_2', 'Lista de reparaciones y mejoras necesarias'),
                ('especificaciones_3', 'Recorrido completo de la casa (checklist)'),
            ]
        },
        'cierre': {
            'title': '🔑 CIERRE',
            'items': [
                ('cierre_1', 'Recibir depósito inicial'),
                ('cierre_2', 'Deposit Agreement firmado'),
                ('cierre_3', 'Contrato firmado (si es financiamiento)'),
                ('cierre_4', 'Pago total y entrega de documentos (si contado)'),
                ('cierre_5', 'Entrega en sobre: aplicación y factura firmada'),
            ]
        },
    }
    
    total_items = 0
    completed_items = 0
    
    for category_id, category in CHECKLIST_STRUCTURE.items():
        story.append(Paragraph(category['title'], styles['SectionHeader']))
        
        table_data = []
        for item_id, item_text in category['items']:
            is_checked = checklist_data.get(item_id, False)
            total_items += 1
            if is_checked:
                completed_items += 1
            
            check_mark = "✓" if is_checked else "☐"
            table_data.append([check_mark, item_text])
        
        table = Table(table_data, colWidths=[0.4*inch, 6.5*inch])
        table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#22c55e') if is_checked else colors.HexColor('#666666')),
        ]))
        story.append(table)
        story.append(Spacer(1, 8))
    
    # Summary
    story.append(Spacer(1, 15))
    completion_pct = (completed_items / total_items * 100) if total_items > 0 else 0
    story.append(Paragraph(
        f"<b>RESUMEN:</b> {completed_items} de {total_items} items completados ({completion_pct:.0f}%)",
        styles['BodyText']
    ))
    
    # Signature
    story.append(Spacer(1, 30))
    story.append(Paragraph("_" * 50, styles['BodyText']))
    story.append(Paragraph("Firma del Inspector", styles['SmallText']))
    
    doc.build(story)
    return buffer.getvalue()

