"""
Generate a fake bank statement PDF that the user can upload during Test 3
to verify the reconciliation flow. The movements in this statement are
crafted to MATCH the transactions she will create during Test 1 + Test 2,
so the AI parser + reconciliation wizard should find matches.

Match logic in the reconcile step compares amount + date (±few days) +
counterparty fuzzy text. So each statement line below mirrors one of
the expected app transactions.

Usage:
    python3 scripts/generate_test_statement.py
    → writes a PDF to ./Cuenta_Dallas_Statement_TEST.pdf
"""
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from datetime import date

OUT = "Cuenta_Dallas_Statement_TEST.pdf"

doc = SimpleDocTemplate(OUT, pagesize=letter, topMargin=0.5*inch, bottomMargin=0.5*inch)
styles = getSampleStyleSheet()
elements = []

today = date.today().isoformat()

# Header
elements.append(Paragraph("BANK OF AMERICA, N.A.", styles['Title']))
elements.append(Paragraph("Business Advantage Checking Statement", styles['Heading2']))
elements.append(Spacer(1, 6))
elements.append(Paragraph("Account: BOA DFW 0623", styles['Normal']))
elements.append(Paragraph("Account holder: MANINOS HOMES LLC", styles['Normal']))
elements.append(Paragraph(f"Statement period: {today} through {today}", styles['Normal']))
elements.append(Paragraph(f"Beginning Balance: $45,237.18", styles['Normal']))
elements.append(Spacer(1, 12))

elements.append(Paragraph("TRANSACTION DETAIL", styles['Heading3']))

# Movements that should match Test 1 + Test 2 transactions on Cuenta Dallas.
# Each row: (date, description, amount). Negative = withdrawal, positive = deposit.
# Amounts and counterparty names mirror what she will create in the app.
movements = [
    # --- Test 1 outflows ---
    (today, "WIRE TRANSFER OUT - VENDEDOR TEST 1 - COMPRA CASA TEST1", -25000.00),
    (today, "ZELLE PAYMENT TO CONTRATISTA ALDAIRMOBILEHOMES - RENOVACION", -5050.00),
    (today, "ZELLE PAYMENT TO ALDAIRMOBILEHOMES - COMISION VENTA", -750.00),
    (today, "ZELLE PAYMENT TO GABRIEL - COMISION VENTA",                    -750.00),
    # --- Test 1 inflows ---
    (today, "ZELLE PAYMENT FROM COMPRADOR TEST 1 - ENGANCHE",       20000.00),
    (today, "WIRE TRANSFER IN FROM COMPRADOR TEST 1 - SALDO RESTANTE", 28000.00),
    # --- Test 2 ---
    (today, "ACH CREDIT FROM CLIENTE TEST 2 - PAGO FACTURA",         5000.00),
    # --- A couple of unrelated movements so the wizard has a mix ---
    (today, "BANK FEE - MONTHLY MAINTENANCE",                         -15.00),
    (today, "INTEREST CREDIT - SAVINGS SWEEP",                          3.42),
]

# Build the table
table_data = [["DATE", "DESCRIPTION", "AMOUNT"]]
running = 45237.18
for d, desc, amt in movements:
    running += amt
    sign = "+" if amt > 0 else ""
    table_data.append([d, desc, f"{sign}${amt:,.2f}"])

table = Table(table_data, colWidths=[1.0*inch, 4.5*inch, 1.3*inch])
table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1f2937')),
    ('TEXTCOLOR',  (0, 0), (-1, 0), colors.white),
    ('FONTNAME',   (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('ALIGN',      (2, 0), (2, -1), 'RIGHT'),
    ('FONTSIZE',   (0, 0), (-1, -1), 9),
    ('GRID',       (0, 0), (-1, -1), 0.25, colors.grey),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f3f4f6')]),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ('TOPPADDING',    (0, 0), (-1, -1), 6),
]))
elements.append(table)
elements.append(Spacer(1, 12))

elements.append(Paragraph(f"<b>Ending Balance: ${running:,.2f}</b>", styles['Normal']))
elements.append(Spacer(1, 6))
elements.append(Paragraph(f"Total Deposits:    +${sum(a for _,_,a in movements if a > 0):,.2f}", styles['Normal']))
elements.append(Paragraph(f"Total Withdrawals: ${sum(a for _,_,a in movements if a < 0):,.2f}", styles['Normal']))
elements.append(Spacer(1, 18))
elements.append(Paragraph("--- END OF STATEMENT ---", styles['Italic']))

doc.build(elements)
print(f"Generated: {OUT}")
print(f"Beginning balance: $45,237.18")
print(f"Ending balance:    ${running:,.2f}")
print(f"Net change:        ${running - 45237.18:,.2f}")
