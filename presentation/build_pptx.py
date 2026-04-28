"""
Build Maninos OS pitch deck as PPTX (English version), mirroring the HTML deck.
Editorial tone, navy/gold palette, only verified numbers from the repo.
"""
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
import os

# Palette
BG = RGBColor(0x0D, 0x16, 0x23)
BG_2 = RGBColor(0x13, 0x1F, 0x30)
SURFACE = RGBColor(0x1A, 0x26, 0x38)
LINE = RGBColor(0x2A, 0x36, 0x50)
LINE_SOFT = RGBColor(0x1F, 0x2A, 0x3E)
INK = RGBColor(0xEE, 0xF0, 0xF4)
INK2 = RGBColor(0xC7, 0xCD, 0xD8)
INK3 = RGBColor(0x8C, 0x95, 0xA8)
INK4 = RGBColor(0x5A, 0x64, 0x78)
GOLD = RGBColor(0xC9, 0xA0, 0x47)
GOLD_SOFT = RGBColor(0xE6, 0xCF, 0x95)

SERIF = "Georgia"          # closest universally available serif (Fraunces fallback)
SANS = "Calibri"           # universal
MONO = "Consolas"          # universal mono

# 16:9 widescreen
SLIDE_W = Inches(13.333)
SLIDE_H = Inches(7.5)

# Outer margin
MARGIN_X = Inches(0.6)
MARGIN_Y = Inches(0.45)
CONTENT_W = SLIDE_W - 2 * MARGIN_X


def _set_bg(slide, color=BG):
    bg = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE, 0, 0, SLIDE_W, SLIDE_H
    )
    bg.line.fill.background()
    bg.fill.solid()
    bg.fill.fore_color.rgb = color
    bg.shadow.inherit = False
    spTree = bg._element.getparent()
    spTree.remove(bg._element)
    spTree.insert(2, bg._element)
    return bg


def add_text(slide, x, y, w, h, text, *, font=SANS, size=14, color=INK,
             bold=False, italic=False, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP,
             line_spacing=1.3, letter_spacing=0):
    tb = slide.shapes.add_textbox(x, y, w, h)
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = 0
    tf.margin_right = 0
    tf.margin_top = 0
    tf.margin_bottom = 0
    tf.vertical_anchor = anchor
    if isinstance(text, str):
        runs = [(text, {})]
    else:
        runs = text
    p = tf.paragraphs[0]
    p.alignment = align
    p.line_spacing = line_spacing
    for i, (chunk, opts) in enumerate(runs):
        r = p.add_run() if i > 0 else p.runs[0] if p.runs else p.add_run()
        r.text = chunk
        r.font.name = opts.get("font", font)
        r.font.size = Pt(opts.get("size", size))
        r.font.bold = opts.get("bold", bold)
        r.font.italic = opts.get("italic", italic)
        r.font.color.rgb = opts.get("color", color)
        ls = opts.get("letter_spacing", letter_spacing)
        if ls:
            rPr = r._r.get_or_add_rPr()
            rPr.set("spc", str(int(ls * 100)))
    return tb


def add_eyebrow(slide, x, y, text, w=Inches(8)):
    return add_text(slide, x, y, w, Inches(0.3), text,
                    size=9, color=GOLD, bold=True, letter_spacing=2.5)


def add_rule(slide, x, y, w, color=LINE, thickness=Pt(0.75)):
    line = slide.shapes.add_connector(1, x, y, x + w, y)
    line.line.color.rgb = color
    line.line.width = thickness
    return line


def add_vrule(slide, x, y, h, color=LINE_SOFT, thickness=Pt(0.75)):
    line = slide.shapes.add_connector(1, x, y, x, y + h)
    line.line.color.rgb = color
    line.line.width = thickness
    return line


def add_footer(slide, left_text, right_text):
    add_text(slide, MARGIN_X, SLIDE_H - Inches(0.4), CONTENT_W, Inches(0.25),
             left_text, size=8, color=INK4, letter_spacing=2, bold=True)
    add_text(slide, MARGIN_X, SLIDE_H - Inches(0.4), CONTENT_W, Inches(0.25),
             right_text, size=8, color=INK4, letter_spacing=2, bold=True,
             align=PP_ALIGN.RIGHT)


def slide_blank(prs):
    layout = prs.slide_layouts[6]
    s = prs.slides.add_slide(layout)
    _set_bg(s)
    return s


# ============== SLIDES ==============

def slide_title(prs):
    s = slide_blank(prs)

    add_text(s, MARGIN_X, Inches(0.6), CONTENT_W, Inches(0.3),
             "MANINOS OS    ·    DESCRIPTIVE DOCUMENT    ·    VERSION 2026.04",
             size=9, color=INK3, letter_spacing=3, bold=True)

    add_text(s, MARGIN_X, Inches(2.0), CONTENT_W, Inches(2.5),
             "An operating platform\nfor selling mobile homes,",
             font=SERIF, size=54, color=INK, line_spacing=1.05)

    add_text(s, MARGIN_X, Inches(3.7), CONTENT_W, Inches(1.0),
             "end to end.",
             font=SERIF, size=54, color=GOLD, italic=True, line_spacing=1.05)

    add_text(s, MARGIN_X, Inches(5.0), Inches(8), Inches(1),
             "How it's built, what it solves, and why its architecture supports\nother physical assets that follow the same business pattern.",
             font=SERIF, size=18, color=INK2, line_spacing=1.4)

    add_text(s, MARGIN_X, SLIDE_H - Inches(0.7), Inches(8), Inches(0.3),
             "MANINOS HOMES LLC  ·  MANINOS CAPITAL LLC",
             size=8, color=INK4, letter_spacing=2.5, bold=True)
    add_text(s, MARGIN_X, SLIDE_H - Inches(0.7), CONTENT_W, Inches(0.3),
             "TEXAS — 2026",
             size=8, color=INK4, letter_spacing=2.5, bold=True, align=PP_ALIGN.RIGHT)


def slide_definition(prs):
    s = slide_blank(prs)
    add_eyebrow(s, MARGIN_X, MARGIN_Y, "DEFINITION")
    add_text(s, MARGIN_X, MARGIN_Y + Inches(0.3), CONTENT_W, Inches(0.9),
             "What Maninos OS is",
             font=SERIF, size=36, color=INK)

    lead = (
        "It is the proprietary software platform operated by Maninos Homes LLC and "
        "Maninos Capital LLC. It covers the full lifecycle of an asset: market discovery, "
        "purchase, renovation, listing, sale, in-house financing (RTO or cash), recurring "
        "payment management, title transfer, and investor reporting."
    )
    add_text(s, MARGIN_X, Inches(2.0), Inches(11.5), Inches(2),
             lead, font=SERIF, size=17, color=INK, line_spacing=1.4)

    add_rule(s, MARGIN_X, Inches(4.1), CONTENT_W)

    col_w = (CONTENT_W - Inches(0.6)) / 2
    col1_x = MARGIN_X
    col2_x = MARGIN_X + col_w + Inches(0.6)

    add_text(s, col1_x, Inches(4.4), col_w, Inches(0.3),
             "WHAT IT REPLACES", size=8, color=GOLD, bold=True, letter_spacing=2)

    items_left = [
        "Spreadsheets and WhatsApp threads for inventory and renovation",
        "A generic CRM for clients and leads",
        "An external accounting system",
        "A manual state title transfer process",
        "A side spreadsheet for investor and delinquency tracking",
    ]
    add_text(s, col1_x, Inches(4.75), col_w, Inches(0.3),
             "—  " + items_left[0], size=11, color=INK2, line_spacing=1.5)
    y = Inches(5.1)
    for itm in items_left[1:]:
        add_text(s, col1_x, y, col_w, Inches(0.3),
                 "—  " + itm, size=11, color=INK2, line_spacing=1.5)
        y += Inches(0.32)

    add_text(s, col2_x, Inches(4.4), col_w, Inches(0.3),
             "WHAT IT ADDS THAT DOESN'T EXIST ELSEWHERE",
             size=8, color=GOLD, bold=True, letter_spacing=2)
    items_right = [
        "Six specialized AI agents embedded in the daily workflow",
        "An in-house financing module (RTO) with its own accounting",
        "A public customer portal with simulator, KYC, e-signature, and self-service payment reporting",
        "A separate module for managing private investor capital",
    ]
    y = Inches(4.75)
    for itm in items_right:
        add_text(s, col2_x, y, col_w, Inches(0.5),
                 "—  " + itm, size=11, color=INK2, line_spacing=1.5)
        y += Inches(0.4)

    add_footer(s, "01  ·  DEFINITION", "MANINOS OS")


def slide_architecture(prs):
    s = slide_blank(prs)

    add_text(s, MARGIN_X, MARGIN_Y, Inches(8), Inches(0.6),
             "The shape of the system", font=SERIF, size=32, color=INK)
    add_text(s, MARGIN_X, MARGIN_Y, CONTENT_W, Inches(0.6),
             "ARCHITECTURE", size=8, color=INK3, bold=True, letter_spacing=2.5,
             align=PP_ALIGN.RIGHT, anchor=MSO_ANCHOR.MIDDLE)
    add_rule(s, MARGIN_X, MARGIN_Y + Inches(0.7), CONTENT_W)

    add_text(s, MARGIN_X, Inches(1.45), Inches(11.5), Inches(0.9),
             "Three portals sharing a single Postgres database. There is no sync layer or replication job between them: anything that happens in operations is immediately visible in finance and in the customer's account.",
             font=SERIF, size=15, color=INK, line_spacing=1.4)

    cw = (CONTENT_W - Inches(0.8)) / 3
    base_y = Inches(2.9)

    portals = [
        ("PORTAL 01", "Homes", "INTERNAL OPERATIONS",
         "For the Maninos team. Inventory, renovation, photos, accounting, commissions, titles, dashboards. Role-based access: treasury, operations, yard_manager, admin, buyer, seller."),
        ("PORTAL 02", "Capital", "FINANCING AND INVESTORS",
         "For underwriters and finance partners. RTO applications, lease-with-purchase-option contracts, monthly payments, delinquency, KYC, investor capital, promissory notes, monthly reports."),
        ("PORTAL 03", "Customers", "PUBLIC-FACING AND SELF-SERVICE",
         "For the buyer. Public catalog, RTO simulator, credit application, KYC with document upload, e-signature of the contract, account statement and payment reporting."),
    ]
    for i, (eb, title, sub, body) in enumerate(portals):
        x = MARGIN_X + i * (cw + Inches(0.4))
        add_rule(s, x, base_y, cw)
        add_text(s, x, base_y + Inches(0.15), cw, Inches(0.3),
                 eb, size=8, color=GOLD, bold=True, letter_spacing=2)
        add_text(s, x, base_y + Inches(0.5), cw, Inches(0.6),
                 title, font=SERIF, size=22, color=INK)
        add_text(s, x, base_y + Inches(1.05), cw, Inches(0.3),
                 sub, size=8, color=INK3, bold=True, letter_spacing=2)
        add_text(s, x, base_y + Inches(1.4), cw, Inches(2),
                 body, size=10.5, color=INK2, line_spacing=1.5)

    add_rule(s, MARGIN_X, Inches(5.95), CONTENT_W)
    add_rule(s, MARGIN_X, Inches(6.65), CONTENT_W)
    kpis = [
        ("18", "PAGES IN HOMES"),
        ("19", "PAGES IN CAPITAL"),
        ("16", "PAGES IN CUSTOMERS"),
        ("58", "TABLES IN POSTGRES"),
        ("91", "SQL MIGRATIONS"),
    ]
    kw = CONTENT_W / 5
    for i, (num, lbl) in enumerate(kpis):
        x = MARGIN_X + i * kw
        add_text(s, x + Inches(0.05), Inches(6.05), kw, Inches(0.45),
                 num, font=SERIF, size=24, color=INK)
        add_text(s, x + Inches(0.05), Inches(6.45), kw, Inches(0.2),
                 lbl, size=7, color=INK3, bold=True, letter_spacing=1.5)
        if i < 4:
            add_vrule(s, x + kw, Inches(6.0), Inches(0.65))

    add_text(s, MARGIN_X, Inches(6.85), CONTENT_W, Inches(0.3),
             "Numbers taken directly from the Maninos repository, as of today.",
             size=9, color=INK3, italic=True)

    add_footer(s, "02  ·  ARCHITECTURE", "THREE PORTALS  ·  ONE DATABASE")


def slide_section_index(prs, num, title, desc):
    s = slide_blank(prs)
    _set_bg(s, BG_2)
    add_text(s, MARGIN_X, Inches(2.5), CONTENT_W, Inches(0.4),
             num, font=SERIF, size=12, color=GOLD, bold=True, letter_spacing=2)
    add_text(s, MARGIN_X, Inches(3.0), Inches(10), Inches(2),
             title, font=SERIF, size=48, color=INK, line_spacing=1.05)
    add_text(s, MARGIN_X, Inches(5.0), Inches(8), Inches(1.5),
             desc, font=SERIF, size=15, color=INK3, italic=True, line_spacing=1.5)


def slide_homes_portal(prs):
    s = slide_blank(prs)
    add_text(s, MARGIN_X, MARGIN_Y, Inches(8), Inches(0.6),
             "Homes Portal", font=SERIF, size=32, color=INK)
    add_text(s, MARGIN_X, MARGIN_Y, CONTENT_W, Inches(0.6),
             "INTERNAL OPERATIONS", size=8, color=INK3, bold=True,
             letter_spacing=2.5, align=PP_ALIGN.RIGHT, anchor=MSO_ANCHOR.MIDDLE)
    add_rule(s, MARGIN_X, MARGIN_Y + Inches(0.7), CONTENT_W)

    add_text(s, MARGIN_X, Inches(1.6), Inches(2.5), Inches(0.3),
             "/HOMES", font=MONO, size=8, color=INK4, letter_spacing=1.5, bold=True)
    add_text(s, MARGIN_X, Inches(1.95), Inches(2.5), Inches(1),
             "The staff's daily workspace",
             font=SERIF, size=15, color=GOLD, italic=True, line_spacing=1.3)

    rx = MARGIN_X + Inches(2.9)
    rw = CONTENT_W - Inches(2.9)
    add_text(s, rx, Inches(1.6), rw, Inches(1),
             "The Maninos staff spends the workday in this portal. Access is at /homes/* after authenticating in Supabase with their assigned role. The sidebar only shows the sections they have access to, with a badge for pending items (title transfers, payment orders, renovation approvals).",
             size=11, color=INK2, line_spacing=1.5)

    rows = [
        ("Dashboard", "KPIs, Texas map, six-month activity chart, pipeline by property status."),
        ("Properties", "Listing with status filters (purchased, published, reserved, renovating, sold), search by address/code. Subroutes for editing, photos, the “Revisar Casa” checklist, and the renovation wizard."),
        ("Transfers", "Titles in flight. Daily TDHCA scheduler widget plus a modal for manual upload of legacy titles. Each serial is a direct link to the TDHCA database."),
        ("Sales", "Active sales, partial payments, commissions (finder + closer), Bill of Sale PDF generation, redirect to Capital when the sale is RTO."),
        ("Clients", "Internal CRM, cash buyers only."),
        ("Accounting", "11 tabs: overview, transactions, invoices, statements, chart of accounts, properties, banks, budget, recurring, audit, account statement."),
        ("Commissions", "Per-employee commissions. Treasury and Admin see all; other roles see only their own."),
        ("Market", "External listings scraped from public sources."),
    ]
    table_y = Inches(2.65)
    col1_w = Inches(1.8)
    col2_w = rw - col1_w - Inches(0.2)
    add_text(s, rx, table_y, col1_w, Inches(0.25),
             "SECTION", size=7, color=INK3, bold=True, letter_spacing=1.8)
    add_text(s, rx + col1_w, table_y, col2_w, Inches(0.25),
             "FUNCTION", size=7, color=INK3, bold=True, letter_spacing=1.8)
    add_rule(s, rx, table_y + Inches(0.28), rw)
    y = table_y + Inches(0.4)
    for name, desc in rows:
        add_text(s, rx, y, col1_w, Inches(0.4),
                 name, size=10, color=INK, bold=True)
        add_text(s, rx + col1_w, y, col2_w, Inches(0.5),
                 desc, size=9.5, color=INK2, line_spacing=1.4)
        y += Inches(0.45)
        add_rule(s, rx, y - Inches(0.05), rw, color=LINE_SOFT, thickness=Pt(0.5))

    add_footer(s, "03  ·  HOMES PORTAL", "18 PAGES  ·  ROLE-BASED ACCESS")


def slide_capital_portal(prs):
    s = slide_blank(prs)
    add_text(s, MARGIN_X, MARGIN_Y, Inches(8), Inches(0.6),
             "Capital Portal", font=SERIF, size=32, color=INK)
    add_text(s, MARGIN_X, MARGIN_Y, CONTENT_W, Inches(0.6),
             "IN-HOUSE FINANCING + INVESTORS", size=8, color=INK3, bold=True,
             letter_spacing=2.5, align=PP_ALIGN.RIGHT, anchor=MSO_ANCHOR.MIDDLE)
    add_rule(s, MARGIN_X, MARGIN_Y + Inches(0.7), CONTENT_W)

    add_text(s, MARGIN_X, Inches(1.6), Inches(2.5), Inches(0.3),
             "/CAPITAL", font=MONO, size=8, color=INK4, letter_spacing=1.5, bold=True)
    add_text(s, MARGIN_X, Inches(1.95), Inches(2.5), Inches(1),
             "The dealer as a bank",
             font=SERIF, size=15, color=GOLD, italic=True, line_spacing=1.3)

    rx = MARGIN_X + Inches(2.9)
    rw = CONTENT_W - Inches(2.9)
    add_text(s, rx, Inches(1.6), rw, Inches(1),
             "When banks won't finance — and for pre-owned mobile homes they almost never do — the dealer becomes the lender. Capital is the portal where that role is administered. Access is restricted to a small group of authorized people.",
             size=11, color=INK2, line_spacing=1.5)

    rows = [
        ("Dashboard", "Portfolio summary, financial health, recent activity, KPIs."),
        ("Applications", "RTO applications in each state: pending, under review, approved, rejected, needs_info. Underwriting + scoring."),
        ("KYC", "Manual customer identity verification. Documents uploaded by the client to the Supabase bucket and reviewed here. No external service."),
        ("Contracts", "RTO contracts with their 33 clauses, amortization table, down-payment installment tracking, PDF generation."),
        ("Payments", "Monthly payments, confirmation of client-reported transfers, delinquency summary, commissions, insurance expiration alerts."),
        ("Investors", "Active investors, committed capital, deployed capital, returns."),
        ("Promissory notes", "Investor notes with maturity alerts at 90, 60, and 30 days."),
        ("Accounting", "Capital's own accounting: chart of accounts, journal entries, bank statements with reconciliation, reports (P&L, balance sheet, cash flow)."),
        ("Reports", "Monthly PDF statements for each investor plus unified portfolio summaries."),
        ("Delinquency", "Past-due portfolio by aging bucket (0–30, 31–60, 61–90, 90+)."),
    ]
    table_y = Inches(2.65)
    col1_w = Inches(1.8)
    col2_w = rw - col1_w - Inches(0.2)
    add_text(s, rx, table_y, col1_w, Inches(0.25),
             "SECTION", size=7, color=INK3, bold=True, letter_spacing=1.8)
    add_text(s, rx + col1_w, table_y, col2_w, Inches(0.25),
             "FUNCTION", size=7, color=INK3, bold=True, letter_spacing=1.8)
    add_rule(s, rx, table_y + Inches(0.28), rw)
    y = table_y + Inches(0.4)
    for name, desc in rows:
        add_text(s, rx, y, col1_w, Inches(0.36),
                 name, size=9.5, color=INK, bold=True)
        add_text(s, rx + col1_w, y, col2_w, Inches(0.5),
                 desc, size=9, color=INK2, line_spacing=1.4)
        y += Inches(0.36)
        add_rule(s, rx, y - Inches(0.04), rw, color=LINE_SOFT, thickness=Pt(0.5))

    add_footer(s, "04  ·  CAPITAL PORTAL", "19 PAGES  ·  13 BACKEND ROUTE FILES")


def slide_customers_portal(prs):
    s = slide_blank(prs)
    add_text(s, MARGIN_X, MARGIN_Y, Inches(8), Inches(0.6),
             "Customers Portal", font=SERIF, size=32, color=INK)
    add_text(s, MARGIN_X, MARGIN_Y, CONTENT_W, Inches(0.6),
             "PUBLIC-FACING AND SELF-SERVICE", size=8, color=INK3, bold=True,
             letter_spacing=2.5, align=PP_ALIGN.RIGHT, anchor=MSO_ANCHOR.MIDDLE)
    add_rule(s, MARGIN_X, MARGIN_Y + Inches(0.7), CONTENT_W)

    add_text(s, MARGIN_X, Inches(1.6), Inches(2.5), Inches(0.3),
             "/CLIENTES", font=MONO, size=8, color=INK4, letter_spacing=1.5, bold=True)
    add_text(s, MARGIN_X, Inches(1.95), Inches(2.5), Inches(1.2),
             "From first click to payment 36",
             font=SERIF, size=15, color=GOLD, italic=True, line_spacing=1.3)

    rx = MARGIN_X + Inches(2.9)
    rw = CONTENT_W - Inches(2.9)
    add_text(s, rx, Inches(1.6), rw, Inches(0.9),
             "This is the only portal accessible without a session. A visitor can land on the catalog from Facebook or from a direct link. Authentication only appears as the buyer advances through the funnel.",
             size=11, color=INK2, line_spacing=1.5)

    add_text(s, rx, Inches(2.7), rw, Inches(0.3),
             "VISITOR'S PATH", size=8, color=GOLD, bold=True, letter_spacing=2)
    py = Inches(3.05)
    add_rule(s, rx, py, rw)
    add_rule(s, rx, py + Inches(1.4), rw)
    stages = [
        ("— 01 —", "Catalog", "Public listing with city and price filters. Auto-refreshes every 2 min to surface new inventory."),
        ("— 02 —", "Property", "Detail page with gallery, specs, and an interactive RTO simulator (down 30–100%, term 12–60 months)."),
        ("— 03 —", "Purchase", "Captures contact, creates client or reuses existing one, picks method: cash or RTO."),
        ("— 04 —", "Account", "Account statement, KYC, contract signing, documents, monthly payment reporting."),
    ]
    sw = rw / 4
    for i, (num, h, body) in enumerate(stages):
        x = rx + i * sw
        add_text(s, x + Inches(0.05), py + Inches(0.15), sw - Inches(0.2), Inches(0.25),
                 num, font=MONO, size=8, color=INK4, letter_spacing=1.5)
        add_text(s, x + Inches(0.05), py + Inches(0.4), sw - Inches(0.2), Inches(0.4),
                 h, font=SERIF, size=14, color=INK)
        add_text(s, x + Inches(0.05), py + Inches(0.78), sw - Inches(0.2), Inches(0.6),
                 body, size=8.5, color=INK3, line_spacing=1.4)
        if i < 3:
            add_vrule(s, x + sw, py, Inches(1.4))

    add_text(s, rx, Inches(4.7), rw, Inches(0.3),
             "WHAT THE CUSTOMER CAN DO IN THEIR ACCOUNT",
             size=8, color=GOLD, bold=True, letter_spacing=2)
    items = [
        "Upload their driver's license, passport, or state ID for KYC (JPG/PNG/WebP/HEIC, up to 10 MB)",
        "Electronically sign their RTO contract with timestamp, IP, and user-agent recorded",
        "Complete the credit application in sections (employment, housing, assets, debts, references)",
        "Report the current month's payment and review the full payment history",
        "Download signed contracts and title transfer documents",
    ]
    y = Inches(5.1)
    for itm in items:
        add_text(s, rx, y, rw, Inches(0.3),
                 "—  " + itm, size=10, color=INK2, line_spacing=1.5)
        y += Inches(0.32)

    add_footer(s, "05  ·  CUSTOMERS PORTAL", "16 PAGES  ·  PUBLIC + AUTHENTICATED")


def slide_loop(prs):
    s = slide_blank(prs)
    add_text(s, MARGIN_X, MARGIN_Y, Inches(10), Inches(0.6),
             "Buy · Renovate · Sell · Collect", font=SERIF, size=30, color=INK)
    add_text(s, MARGIN_X, MARGIN_Y, CONTENT_W, Inches(0.6),
             "THE FULL LOOP", size=8, color=INK3, bold=True,
             letter_spacing=2.5, align=PP_ALIGN.RIGHT, anchor=MSO_ANCHOR.MIDDLE)
    add_rule(s, MARGIN_X, MARGIN_Y + Inches(0.7), CONTENT_W)

    add_text(s, MARGIN_X, Inches(1.5), CONTENT_W, Inches(0.6),
             "Each stage has its tables, its AI agent(s), and its UI surface. The same record advances through five stages without leaving the system and without anyone retyping data.",
             size=11, color=INK2, line_spacing=1.5)

    rows = [
        ("1. Detect", "BuscadorAgent crawls external sources, applies Maninos's rules, proposes candidates.",
         "BuscadorAgent (Playwright + scrapers for MHVillage, MobileHome.net, Zillow, FB Marketplace).",
         "market_listings"),
        ("2. Buy", "“Revisar Casa” wizard: photos, checklist, seller details, offer.",
         "FotosAgent (image classification), VozAgent (notes dictated on the yard).",
         "properties, title_transfers (purchase)"),
        ("3. Renovate", "Renovation plan: materials, labor, contingency.",
         "RenovacionAgent (orchestrator), CostosAgent (prices read from DB).",
         "renovations · accounting_transactions"),
        ("4. List and sell", "Suggested price. Publishing. Customer buys cash or applies for RTO.",
         "PrecioAgent (80% market-value ceiling).",
         "sales, sale_payments, rto_applications"),
        ("5. Collect and close", "Monthly payments, late fees, delinquency, final title transfer.",
         "Daily title_monitor scheduler against TDHCA. Email service for reminders.",
         "rto_payments, title_transfers (sale), commission_payments"),
    ]
    ty = Inches(2.4)
    cols = [Inches(1.6), Inches(3.6), Inches(3.5), Inches(3.4)]
    headers = ["STAGE", "WHAT HAPPENS", "AGENTS / SERVICES", "DATA PRODUCED"]
    cx = MARGIN_X
    for i, (col, hdr) in enumerate(zip(cols, headers)):
        add_text(s, cx, ty, col, Inches(0.25), hdr, size=7, color=INK3,
                 bold=True, letter_spacing=1.8)
        cx += col
    add_rule(s, MARGIN_X, ty + Inches(0.3), CONTENT_W)
    y = ty + Inches(0.4)
    for row in rows:
        cx = MARGIN_X
        for i, (col, val) in enumerate(zip(cols, row)):
            add_text(s, cx, y, col - Inches(0.15),
                     Inches(0.65),
                     val,
                     size=9 if i > 0 else 10,
                     color=INK if i == 0 else INK2,
                     bold=(i == 0),
                     font=MONO if i == 3 else SANS,
                     line_spacing=1.4)
            cx += col
        y += Inches(0.7)
        add_rule(s, MARGIN_X, y - Inches(0.05), CONTENT_W,
                 color=LINE_SOFT, thickness=Pt(0.5))

    add_footer(s, "06  ·  THE LOOP", "5 STAGES  ·  6 AGENTS  ·  ONE SOURCE OF TRUTH")


def slide_agents(prs):
    s = slide_blank(prs)
    add_text(s, MARGIN_X, MARGIN_Y, Inches(10), Inches(0.6),
             "The six specialized agents", font=SERIF, size=30, color=INK)
    add_text(s, MARGIN_X, MARGIN_Y, CONTENT_W, Inches(0.6),
             "AI LAYER", size=8, color=INK3, bold=True,
             letter_spacing=2.5, align=PP_ALIGN.RIGHT, anchor=MSO_ANCHOR.MIDDLE)
    add_rule(s, MARGIN_X, MARGIN_Y + Inches(0.7), CONTENT_W)

    add_text(s, MARGIN_X, Inches(1.45), CONTENT_W, Inches(0.7),
             "Each agent lives under api/agents/, inherits from BaseAgent, runs asynchronously, and returns structured JSON validated by Pydantic. They have no memory between calls: the context required is passed explicitly with every request.",
             size=11, color=INK2, line_spacing=1.5)

    rows = [
        ("Buscador", "Finds mobile homes on the market that satisfy Maninos's rules.",
         "Scrapes MHVillage, MobileHome.net, MHBay, Zillow, Facebook Marketplace. Filters using the Feb 2026 rules: 60% of market value, $5K–$80K, 200mi from Houston or Dallas, no year filter."),
        ("Costos", "Estimates the renovation cost.",
         "Reads the materials catalog from the database. Returns materials + labor (30–50% of materials) + contingency (5–15%) + cost per sqft + risk factors."),
        ("Precio", "Proposes a sale price.",
         "Returns four strategies: minimum, target, market, aggressive. Applies an automatic ceiling of 80% of blended market value."),
        ("Fotos", "Classifies photos by renovation state.",
         "True vision (no keyword tricks). Distinguishes before / after / exterior / interior. Sorts the public gallery: after first, then exterior, interior, before."),
        ("Voz", "Transcribes audio dictated by staff and extracts intent.",
         "Whisper in Spanish. Detects whether it's an inspection note, a materials list, or a general observation. Works with Spanglish."),
        ("Renovación", "Guided conversation to plan the renovation.",
         "Material prices are embedded in the prompt itself (a latency choice). If the property has no sqft, it refuses to estimate — fails loud."),
    ]
    ty = Inches(2.45)
    cols = [Inches(1.4), Inches(3.5), Inches(7.2)]
    headers = ["AGENT", "FUNCTION", "IMPLEMENTATION NOTE"]
    cx = MARGIN_X
    for col, hdr in zip(cols, headers):
        add_text(s, cx, ty, col, Inches(0.25), hdr, size=7, color=INK3,
                 bold=True, letter_spacing=1.8)
        cx += col
    add_rule(s, MARGIN_X, ty + Inches(0.3), CONTENT_W)
    y = ty + Inches(0.4)
    for row in rows:
        cx = MARGIN_X
        for i, (col, val) in enumerate(zip(cols, row)):
            add_text(s, cx, y, col - Inches(0.15), Inches(0.55),
                     val,
                     size=9 if i > 0 else 10,
                     color=INK if i == 0 else INK2,
                     bold=(i == 0),
                     line_spacing=1.4)
            cx += col
        y += Inches(0.55)
        add_rule(s, MARGIN_X, y - Inches(0.04), CONTENT_W,
                 color=LINE_SOFT, thickness=Pt(0.5))

    add_rule(s, MARGIN_X, Inches(6.4), CONTENT_W)
    add_text(s, MARGIN_X, Inches(6.55), CONTENT_W, Inches(0.7),
             "Aside: the floating AIChatWidget chat in the Homes portal does not use these agents. It calls /api/ai/chat (gpt-5-mini) with a tool-calling pattern over 19 database query tools.",
             size=10, color=INK2, italic=True, line_spacing=1.5)

    add_footer(s, "07  ·  AGENTS", "6 SPECIALIZED  +  1 CONVERSATIONAL ASSISTANT")


def slide_scheduler(prs):
    s = slide_blank(prs)
    add_text(s, MARGIN_X, MARGIN_Y, Inches(8), Inches(0.6),
             "The scheduler", font=SERIF, size=32, color=INK)
    add_text(s, MARGIN_X, MARGIN_Y, CONTENT_W, Inches(0.6),
             "BACKGROUND AUTOMATION", size=8, color=INK3, bold=True,
             letter_spacing=2.5, align=PP_ALIGN.RIGHT, anchor=MSO_ANCHOR.MIDDLE)
    add_rule(s, MARGIN_X, MARGIN_Y + Inches(0.7), CONTENT_W)

    add_text(s, MARGIN_X, Inches(1.5), CONTENT_W, Inches(0.7),
             "APScheduler runs on the US Central timezone. Ten jobs in production. Every run, successful or failed, leaves a record in the scheduler_runs table — the widget at /homes/transfers reads from that table, not from the scheduler's in-memory state.",
             size=11, color=INK2, line_spacing=1.5)

    rows = [
        ("process_scheduled_emails", "Every 30 min", "Sends pending scheduled emails."),
        ("rto_reminders", "Daily · 8:00 CT", "RTO payment reminders to the customer (3d before, day-of, 1d after)."),
        ("rto_overdue_alerts", "Daily · 9:00 CT", "Internal alerts for overdue RTO payments."),
        ("promissory_maturity_alerts", "Daily · 9:30 CT", "Notifies the team of upcoming note maturities (90 / 60 / 30 days)."),
        ("title_monitor", "Daily · 10:00 CT", "Queries TDHCA for each pending serial, fuzzy-matches the owner name."),
        ("investor_followup_emails", "1st of month · 10:30 CT", "Monthly statement to each investor with attached PDF."),
        ("portal_sync", "Every 2 hours", "Cross-consistency between Homes ↔ Capital."),
        ("refresh_partner_listings", "Every 6 hours", "Refreshes VMF Homes and 21st Mortgage listings."),
        ("facebook_auto_scrape", "Mon and Thu · 7:00 CT", "Facebook Marketplace scraping via Apify."),
        ("expire_old_listings", "Daily · 6:00 CT", "Marks listings older than 14 days as expired."),
    ]
    ty = Inches(2.45)
    cols = [Inches(3.7), Inches(2.3), Inches(6.1)]
    headers = ["JOB", "CADENCE", "FUNCTION"]
    cx = MARGIN_X
    for col, hdr in zip(cols, headers):
        add_text(s, cx, ty, col, Inches(0.25), hdr, size=7, color=INK3,
                 bold=True, letter_spacing=1.8)
        cx += col
    add_rule(s, MARGIN_X, ty + Inches(0.3), CONTENT_W)
    y = ty + Inches(0.38)
    for row in rows:
        cx = MARGIN_X
        for i, (col, val) in enumerate(zip(cols, row)):
            add_text(s, cx, y, col - Inches(0.15), Inches(0.4),
                     val,
                     size=9.5 if i != 0 else 10,
                     color=GOLD_SOFT if i == 0 else INK2,
                     bold=(i == 0),
                     font=MONO if i == 0 else SANS,
                     line_spacing=1.3)
            cx += col
        y += Inches(0.36)
        add_rule(s, MARGIN_X, y - Inches(0.03), CONTENT_W,
                 color=LINE_SOFT, thickness=Pt(0.5))

    add_footer(s, "08  ·  SCHEDULER", "10 JOBS  ·  US CENTRAL  ·  AUDIT IN scheduler_runs")


def slide_titles(prs):
    s = slide_blank(prs)
    add_text(s, MARGIN_X, MARGIN_Y, Inches(10), Inches(0.6),
             "The state title flow", font=SERIF, size=30, color=INK)
    add_text(s, MARGIN_X, MARGIN_Y, CONTENT_W, Inches(0.6),
             "TDHCA AND LEGACY", size=8, color=INK3, bold=True,
             letter_spacing=2.5, align=PP_ALIGN.RIGHT, anchor=MSO_ANCHOR.MIDDLE)
    add_rule(s, MARGIN_X, MARGIN_Y + Inches(0.7), CONTENT_W)

    add_text(s, MARGIN_X, Inches(1.5), CONTENT_W, Inches(0.7),
             "In Texas, transfer of ownership for a mobile home is recorded with TDHCA via the Statement of Ownership. Maninos OS automates the follow-up.",
             size=11, color=INK2, line_spacing=1.5)

    col_w = (CONTENT_W - Inches(0.6)) / 2
    col1_x = MARGIN_X
    col2_x = MARGIN_X + col_w + Inches(0.6)

    add_text(s, col1_x, Inches(2.5), col_w, Inches(0.3),
             "AUTOMATIC FLOW", size=8, color=GOLD, bold=True, letter_spacing=2)
    auto_steps = [
        "1.  When the title application document is uploaded, the agent extracts the HUD label / serial.",
        "2.  If the title application doesn't carry the value, falls back to the Bill of Sale (bos_purchase.hud_label_number).",
        "3.  The 10:00 CT daily job queries the TDHCA portal for each pending serial.",
        "4.  Fuzzy-matches the name TDHCA returns against to_name.",
        "5.  If they match, sets title_name_updated = TRUE, records the name in tdhca_owner_name, moves the transfer to completed.",
    ]
    y = Inches(2.85)
    for stp in auto_steps:
        add_text(s, col1_x, y, col_w, Inches(0.6), stp,
                 size=10, color=INK2, line_spacing=1.5)
        y += Inches(0.55)

    add_text(s, col2_x, Inches(2.5), col_w, Inches(0.3),
             "LEGACY HOUSES", size=8, color=GOLD, bold=True, letter_spacing=2)
    add_text(s, col2_x, Inches(2.85), col_w, Inches(0.7),
             "Houses sold before the platform existed are not in the system, and their transfer was already done outside it. To bring them in, the Homes portal exposes a manual upload flow:",
             size=10, color=INK2, line_spacing=1.5)
    legacy_items = [
        "Lets you create the property and the transfer from scratch, or against an existing property.",
        "If the house is already sold, asks for the buyer and creates the matching sale transfer.",
        "Sets is_manual_upload = TRUE and title_name_updated = TRUE so the daily job ignores them.",
        "The serial shown in the listing is a direct link to the public TDHCA record.",
    ]
    y = Inches(3.85)
    for itm in legacy_items:
        add_text(s, col2_x, y, col_w, Inches(0.5),
                 "—  " + itm, size=10, color=INK2, line_spacing=1.5)
        y += Inches(0.45)

    add_footer(s, "09  ·  TITLES", "TDHCA + MANUAL  ·  AUDIT EACH NIGHT")


def slide_rto(prs):
    s = slide_blank(prs)
    add_text(s, MARGIN_X, MARGIN_Y, Inches(10), Inches(0.6),
             "The in-house financing module", font=SERIF, size=30, color=INK)
    add_text(s, MARGIN_X, MARGIN_Y, CONTENT_W, Inches(0.6),
             "RTO IN DETAIL", size=8, color=INK3, bold=True,
             letter_spacing=2.5, align=PP_ALIGN.RIGHT, anchor=MSO_ANCHOR.MIDDLE)
    add_rule(s, MARGIN_X, MARGIN_Y + Inches(0.7), CONTENT_W)

    add_text(s, MARGIN_X, Inches(1.5), CONTENT_W, Inches(0.7),
             "The base contract is the Texas Residential Lease With Purchase Option (33 clauses). The numeric defaults live in code and are configurable per contract.",
             size=11, color=INK2, line_spacing=1.5)

    add_rule(s, MARGIN_X, Inches(2.5), CONTENT_W)
    add_rule(s, MARGIN_X, Inches(3.4), CONTENT_W)
    kpis = [
        ("$15", "/day", "LATE FEE"),
        ("5", " days", "GRACE PERIOD"),
        ("15", "", "DUE DAY OF MONTH"),
        ("$250", "", "NSF FEE"),
        ("$695", "/month", "HOLDOVER"),
    ]
    kw = CONTENT_W / 5
    for i, (num, suffix, lbl) in enumerate(kpis):
        x = MARGIN_X + i * kw
        add_text(s, x + Inches(0.05), Inches(2.65), kw, Inches(0.5),
                 [(num, {"font": SERIF, "size": 24, "color": INK}),
                  (suffix, {"font": SANS, "size": 11, "color": INK3})],
                 line_spacing=1.0)
        add_text(s, x + Inches(0.05), Inches(3.2), kw, Inches(0.2),
                 lbl, size=7, color=INK3, bold=True, letter_spacing=1.8)
        if i < 4:
            add_vrule(s, x + kw, Inches(2.55), Inches(0.85))

    add_text(s, MARGIN_X, Inches(3.55), CONTENT_W, Inches(0.3),
             "Defaults applied by migration 012_maninos_capital.sql. Each contract can override them.",
             size=9, color=INK3, italic=True)

    add_rule(s, MARGIN_X, Inches(4.05), CONTENT_W)

    col_w = (CONTENT_W - Inches(0.6)) / 2
    col1_x = MARGIN_X
    col2_x = MARGIN_X + col_w + Inches(0.6)

    add_text(s, col1_x, Inches(4.25), col_w, Inches(0.3),
             "WHAT THE DEALER SEES EVERY DAY",
             size=8, color=GOLD, bold=True, letter_spacing=2)
    dealer_items = [
        "Incoming RTO applications with their underwriting score",
        "The month's payments with confirmation pending or applied",
        "Past-due portfolio segmented by aging (0–30, 31–60, 61–90, 90+)",
        "Per-sale commissions split into finder vs closer, pending vs paid",
        "Alerts for customer insurance about to lapse",
    ]
    y = Inches(4.6)
    for itm in dealer_items:
        add_text(s, col1_x, y, col_w, Inches(0.4),
                 "—  " + itm, size=10, color=INK2, line_spacing=1.5)
        y += Inches(0.35)

    add_text(s, col2_x, Inches(4.25), col_w, Inches(0.3),
             "WHAT THE CUSTOMER SEES IN THEIR ACCOUNT",
             size=8, color=GOLD, bold=True, letter_spacing=2)
    client_items = [
        "Their amortization table with past, current, and future months",
        "Total paid and remaining balance",
        "A button to report this month's payment with method and reference",
        "The status of their KYC and contract",
        "Notifications for upcoming and overdue payments",
    ]
    y = Inches(4.6)
    for itm in client_items:
        add_text(s, col2_x, y, col_w, Inches(0.4),
                 "—  " + itm, size=10, color=INK2, line_spacing=1.5)
        y += Inches(0.35)

    add_footer(s, "10  ·  RTO", "33 CLAUSES  ·  DUAL VIEW (OPERATOR + CUSTOMER)")


def slide_accounting(prs):
    s = slide_blank(prs)
    add_text(s, MARGIN_X, MARGIN_Y, Inches(8), Inches(0.6),
             "The accounting layer", font=SERIF, size=32, color=INK)
    add_text(s, MARGIN_X, MARGIN_Y, CONTENT_W, Inches(0.6),
             "FULL GL, TWO ENTITIES", size=8, color=INK3, bold=True,
             letter_spacing=2.5, align=PP_ALIGN.RIGHT, anchor=MSO_ANCHOR.MIDDLE)
    add_rule(s, MARGIN_X, MARGIN_Y + Inches(0.7), CONTENT_W)

    add_text(s, MARGIN_X, Inches(1.5), CONTENT_W, Inches(0.9),
             "Maninos OS doesn't lean on an external QuickBooks: it implements its own General Ledger with a structure inspired by QuickBooks' chart of accounts. There are two separate sets of books — one for Homes, one for Capital — because they are two distinct LLCs with independent reporting.",
             size=11, color=INK2, line_spacing=1.5)

    col_w = (CONTENT_W - Inches(0.6)) / 2
    col1_x = MARGIN_X
    col2_x = MARGIN_X + col_w + Inches(0.6)

    add_text(s, col1_x, Inches(2.7), col_w, Inches(0.3),
             "TABLES INVOLVED", size=8, color=GOLD, bold=True, letter_spacing=2)
    schema_lines = [
        ("accounting_accounts",       "// chart of accounts (Homes)"),
        ("accounting_transactions",   "// journal entries"),
        ("bank_accounts",             "// bank accounts"),
        ("recurring_expenses",        "// recurring rules"),
        ("accounting_budgets",        "// budgets"),
        ("accounting_audit_log",      "// audit trail"),
        ("capital_accounts",          "// chart of accounts (Capital)"),
        ("capital_transactions",      "// Capital journal entries"),
        ("capital_bank_statements",   "// bank statements"),
        ("capital_statement_movements","// statement lines"),
        ("capital_budgets",           "// Capital budgets"),
    ]
    bg = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, col1_x, Inches(3.05), col_w, Inches(3.5))
    bg.fill.solid(); bg.fill.fore_color.rgb = SURFACE
    bg.line.color.rgb = LINE
    bg.line.width = Pt(0.5)
    bg.shadow.inherit = False

    y = Inches(3.2)
    for key, comment in schema_lines:
        add_text(s, col1_x + Inches(0.2), y, col_w - Inches(0.4), Inches(0.3),
                 [(key.ljust(30), {"font": MONO, "size": 9, "color": GOLD_SOFT}),
                  (comment, {"font": MONO, "size": 9, "color": INK4})],
                 line_spacing=1.0)
        y += Inches(0.3)

    add_text(s, col2_x, Inches(2.7), col_w, Inches(0.3),
             "WHAT IT COVERS",
             size=8, color=GOLD, bold=True, letter_spacing=2)
    cat_items = [
        "Revenue: cash sales, RTO sales, monthly RTO payments",
        "Expenses: house purchases, renovations, transport, commissions, operating",
        "Assets: per-house inventory (each property generates its own hierarchy)",
        "Reports: P&L, balance sheet, cash flow, budget vs actual, P&L per property and per yard",
        "Bank reconciliation with statement import and matching against entries",
        "Audit log for compliance and traceability",
    ]
    y = Inches(3.05)
    for itm in cat_items:
        add_text(s, col2_x, y, col_w, Inches(0.5),
                 "—  " + itm, size=10, color=INK2, line_spacing=1.5)
        y += Inches(0.4)

    add_text(s, col2_x, Inches(5.95), col_w, Inches(0.5),
             "RTO payments automatically trigger their matching journal entry (_accounting_hooks.py). The team doesn't double-key bookkeeping.",
             size=10, color=INK2, italic=True, line_spacing=1.5)

    add_footer(s, "11  ·  ACCOUNTING", "TWO LLCs  ·  OWN GL  ·  AUDIT LOG")


def slide_stack(prs):
    s = slide_blank(prs)
    add_text(s, MARGIN_X, MARGIN_Y, Inches(8), Inches(0.6),
             "The tech stack", font=SERIF, size=32, color=INK)
    add_text(s, MARGIN_X, MARGIN_Y, CONTENT_W, Inches(0.6),
             "NO SURPRISES, ALL STANDARD", size=8, color=INK3, bold=True,
             letter_spacing=2.5, align=PP_ALIGN.RIGHT, anchor=MSO_ANCHOR.MIDDLE)
    add_rule(s, MARGIN_X, MARGIN_Y + Inches(0.7), CONTENT_W)

    rows = [
        ("Backend", "Python 3.12 with FastAPI. 22 route files for Homes, 13 for Capital, 5 public. 9 services (email, pdf, scheduler, scrapers, title monitor, notification, document, esign, property)."),
        ("Data", "Supabase: Postgres + Auth + Storage. 58 tables, 91 SQL migrations. Direct SDK access, no ORM. Service-role key on the backend, RLS on public buckets."),
        ("Frontend", "Next.js 14 with the App Router. Tailwind on top of an in-house design system (navy / gold palette). Mobile-first responsive. No external state library: just React hooks."),
        ("AI", "OpenAI: gpt-5 in agents, gpt-5-mini in chat with tool-calling, whisper-1 for transcription (locked to Spanish)."),
        ("Email", "Resend with custom templates and PDF attachments. The scheduled-email queue is processed every 30 min."),
        ("Scraping", "Playwright for browser automation. Apify for Facebook Marketplace."),
        ("Deployment", "Backend on Railway (Docker). Frontend on Vercel. Auto-deploy on every push to main."),
        ("Observability", "structlog for structured logging. Logfire optional for telemetry."),
    ]
    ty = Inches(1.6)
    cols = [Inches(2.0), Inches(10.0)]
    headers = ["LAYER", "COMPONENTS"]
    cx = MARGIN_X
    for col, hdr in zip(cols, headers):
        add_text(s, cx, ty, col, Inches(0.25), hdr, size=7, color=INK3,
                 bold=True, letter_spacing=1.8)
        cx += col
    add_rule(s, MARGIN_X, ty + Inches(0.3), CONTENT_W)
    y = ty + Inches(0.4)
    for layer, comp in rows:
        add_text(s, MARGIN_X, y, cols[0] - Inches(0.15), Inches(0.55),
                 layer, size=11, color=INK, bold=True)
        add_text(s, MARGIN_X + cols[0], y, cols[1] - Inches(0.15), Inches(0.7),
                 comp, size=10, color=INK2, line_spacing=1.45)
        y += Inches(0.6)
        add_rule(s, MARGIN_X, y - Inches(0.04), CONTENT_W,
                 color=LINE_SOFT, thickness=Pt(0.5))

    add_footer(s, "12  ·  STACK", "FASTAPI + NEXT.JS + SUPABASE")


def slide_rules(prs):
    s = slide_blank(prs)
    add_text(s, MARGIN_X, MARGIN_Y, Inches(10), Inches(0.6),
             "The business rules", font=SERIF, size=32, color=INK)
    add_text(s, MARGIN_X, MARGIN_Y, CONTENT_W, Inches(0.6),
             "TEXAS, MANINOS, 2026", size=8, color=INK3, bold=True,
             letter_spacing=2.5, align=PP_ALIGN.RIGHT, anchor=MSO_ANCHOR.MIDDLE)
    add_rule(s, MARGIN_X, MARGIN_Y + Inches(0.7), CONTENT_W)

    add_text(s, MARGIN_X, Inches(1.5), CONTENT_W, Inches(0.7),
             "The rules live in code and are applied automatically. They aren't agent suggestions: they are guardrails that the APIs and the agents respect.",
             size=11, color=INK2, line_spacing=1.5)

    col_w = (CONTENT_W - Inches(0.6)) / 2
    col1_x = MARGIN_X
    col2_x = MARGIN_X + col_w + Inches(0.6)

    add_text(s, col1_x, Inches(2.7), col_w, Inches(0.3),
             "ACQUISITION", size=8, color=GOLD, bold=True, letter_spacing=2)
    adq_rules = [
        ("Geography:", "200-mile radius from Houston or Dallas, Texas only"),
        ("Purchase price:", "up to 60% of market value (renovation excluded)"),
        ("Accepted range:", "$5,000 to $80,000 per property"),
        ("Year:", "no filter"),
        ("Types:", "single wide and double wide"),
    ]
    y = Inches(3.05)
    for k, v in adq_rules:
        add_text(s, col1_x, y, col_w, Inches(0.4),
                 [("—  ", {"color": GOLD, "size": 11}),
                  (k + " ", {"size": 11, "color": INK, "bold": True}),
                  (v, {"size": 11, "color": INK2})],
                 line_spacing=1.5)
        y += Inches(0.45)

    add_text(s, col2_x, Inches(2.7), col_w, Inches(0.3),
             "RENOVATION AND SALE", size=8, color=GOLD, bold=True, letter_spacing=2)
    sell_rules = [
        ("Renovation budget:", "$5,000 to $15,000"),
        ("Sale price:", "up to 80% of blended market value (ceiling enforced by PrecioAgent)"),
        ("Commissions:", "$1,500 on cash sale · $1,000 on RTO sale"),
        ("Commission split:", "50% finder, 50% closer"),
        ("Sale modes:", "cash or RTO"),
    ]
    y = Inches(3.05)
    for k, v in sell_rules:
        add_text(s, col2_x, y, col_w, Inches(0.5),
                 [("—  ", {"color": GOLD, "size": 11}),
                  (k + " ", {"size": 11, "color": INK, "bold": True}),
                  (v, {"size": 11, "color": INK2})],
                 line_spacing=1.5)
        y += Inches(0.45)

    add_footer(s, "13  ·  RULES", "ENFORCED IN CODE  ·  FEBRUARY 2026")


def slide_portability(prs):
    s = slide_blank(prs)
    add_text(s, MARGIN_X, MARGIN_Y, Inches(11), Inches(0.6),
             "What is generic, what is Texas-MH", font=SERIF, size=28, color=INK)
    add_text(s, MARGIN_X, MARGIN_Y, CONTENT_W, Inches(0.6),
             "PORTABILITY ANALYSIS", size=8, color=INK3, bold=True,
             letter_spacing=2.5, align=PP_ALIGN.RIGHT, anchor=MSO_ANCHOR.MIDDLE)
    add_rule(s, MARGIN_X, MARGIN_Y + Inches(0.7), CONTENT_W)

    add_text(s, MARGIN_X, Inches(1.5), CONTENT_W, Inches(0.9),
             "The core of the system describes a universal pattern: a dealer acquires a high-value physical asset that carries a registrable title, refurbishes it, sells it on its own credit, and collects over time. Any business that fits that pattern can run on Maninos OS with localized configuration.",
             size=11, color=INK2, italic=True, line_spacing=1.5)

    col_w = (CONTENT_W - Inches(0.6)) / 2
    col1_x = MARGIN_X
    col2_x = MARGIN_X + col_w + Inches(0.6)

    add_text(s, col1_x, Inches(2.95), col_w, Inches(0.3),
             "GENERIC — THE ENGINE", size=8, color=GOLD, bold=True, letter_spacing=2)
    gen_items = [
        "Acquisition pipeline: detect, qualify, buy",
        "Refurbishment workflow with materials, labor, and costs",
        "Classified photo gallery (vision is asset-agnostic)",
        "RTO/BHPH engine: contract, amortization, late fee, NSF, holdover, delinquency",
        "Customer portal: KYC, e-signature, payment reporting, account statement",
        "Investor capital with promissory notes and monthly reports",
        "General Ledger with bank reconciliation",
        "Conversational assistant over the database",
    ]
    y = Inches(3.3)
    for itm in gen_items:
        add_text(s, col1_x, y, col_w, Inches(0.4),
                 "—  " + itm, size=10, color=INK2, line_spacing=1.5)
        y += Inches(0.38)

    add_text(s, col2_x, Inches(2.95), col_w, Inches(0.3),
             "LOCALIZABLE — THE “ASSET PACK”", size=8, color=GOLD, bold=True, letter_spacing=2)
    loc_items = [
        ("Asset schema:", "sqft + HUD label for MH; HIN + engine number for boats; VIN + odometer for cars."),
        ("Acquisition rules:", "the 60% / $5K-$80K / 200mi belongs to Maninos; another dealer would have its own."),
        ("Title workflow:", "TDHCA in Texas, a different agency in each state, USCG optional for large boats."),
        ("Contract template:", "Lease with Purchase Option for MH; BHPH contract for cars."),
        ("Scraping sources:", "MHVillage for MH, Manheim for cars, BoatTrader for boats."),
        ("Agent prompts:", "the cost agent knows about paint and drywall for houses; gelcoat and bottom paint for boats."),
    ]
    y = Inches(3.3)
    for k, v in loc_items:
        add_text(s, col2_x, y, col_w, Inches(0.5),
                 [("—  ", {"color": GOLD, "size": 10}),
                  (k + " ", {"size": 10, "color": INK, "bold": True}),
                  (v, {"size": 10, "color": INK2})],
                 line_spacing=1.5)
        y += Inches(0.42)

    add_footer(s, "14  ·  PORTABILITY", "CORE + ASSET PACK")


def slide_verticals(prs):
    s = slide_blank(prs)
    add_text(s, MARGIN_X, MARGIN_Y, Inches(11), Inches(0.6),
             "Verticals where the pattern fits", font=SERIF, size=30, color=INK)
    add_text(s, MARGIN_X, MARGIN_Y, CONTENT_W, Inches(0.6),
             "QUALITATIVE READ", size=8, color=INK3, bold=True,
             letter_spacing=2.5, align=PP_ALIGN.RIGHT, anchor=MSO_ANCHOR.MIDDLE)
    add_rule(s, MARGIN_X, MARGIN_Y + Inches(0.7), CONTENT_W)

    add_text(s, MARGIN_X, Inches(1.5), CONTENT_W, Inches(0.7),
             "Market sizes are intentionally absent from this document, because the third-party numbers I'd quote haven't been verified. What follows is a qualitative read based on how literally each vertical maps onto the Maninos case.",
             size=10, color=INK3, italic=True, line_spacing=1.5)

    rows = [
        ("BHPH used cars",
         "The buy → recondition → finance → collect loop is identical. Past-due portfolio and monthly payment tracking are the most direct analogue.",
         "State-by-state title workflow via DMV. Starter-interrupt / GPS integrations. Auctions as sourcing channel."),
        ("RV / travel trailers",
         "The “Revisar Casa” concept maps almost unchanged onto the PDI (Pre-Delivery Inspection). Buy-recondition-sell cycle is the same.",
         "Asset schema (motorhome vs towable). PDI inspection template."),
        ("Boats (used)",
         "Pre-sale reconditioning is standard (gelcoat, engine, upholstery). Title is state-issued and analogous. In-house financing is the area least served.",
         "HIN + engine / trailer data in the schema. Seasonality. USCG documentation for vessels > 5 net tons."),
        ("Tiny homes / park models / ADU",
         "Almost 1:1 with MH. Same title flow in many states.",
         "Volume is small; better as a module inside an MH dealer than a standalone vertical."),
        ("Heavy equipment / tractors",
         "Acquisition and reconditioning fit. In-house financing is rare because manufacturer captives dominate.",
         "UCC-1 instead of title. OEM lock-in makes go-to-market harder."),
    ]
    ty = Inches(2.65)
    cols = [Inches(2.6), Inches(5.0), Inches(4.5)]
    headers = ["VERTICAL", "HOW IT FITS THE CURRENT ENGINE", "WHAT NEEDS TO BE ADAPTED"]
    cx = MARGIN_X
    for col, hdr in zip(cols, headers):
        add_text(s, cx, ty, col, Inches(0.25), hdr, size=7, color=INK3,
                 bold=True, letter_spacing=1.8)
        cx += col
    add_rule(s, MARGIN_X, ty + Inches(0.3), CONTENT_W)
    y = ty + Inches(0.4)
    for row in rows:
        cx = MARGIN_X
        for i, (col, val) in enumerate(zip(cols, row)):
            add_text(s, cx, y, col - Inches(0.15), Inches(0.7),
                     val,
                     size=9.5 if i > 0 else 11,
                     color=INK if i == 0 else INK2,
                     bold=(i == 0),
                     line_spacing=1.4)
            cx += col
        y += Inches(0.7)
        add_rule(s, MARGIN_X, y - Inches(0.04), CONTENT_W,
                 color=LINE_SOFT, thickness=Pt(0.5))

    add_footer(s, "15  ·  VERTICALS", "QUALITATIVE READ  ·  NO THIRD-PARTY FIGURES")


def slide_status(prs):
    s = slide_blank(prs)
    add_text(s, MARGIN_X, MARGIN_Y, Inches(10), Inches(0.6),
             "Where Maninos OS stands today", font=SERIF, size=30, color=INK)
    add_text(s, MARGIN_X, MARGIN_Y, CONTENT_W, Inches(0.6),
             "VERIFIABLE STATUS", size=8, color=INK3, bold=True,
             letter_spacing=2.5, align=PP_ALIGN.RIGHT, anchor=MSO_ANCHOR.MIDDLE)
    add_rule(s, MARGIN_X, MARGIN_Y + Inches(0.7), CONTENT_W)

    add_text(s, MARGIN_X, Inches(1.5), CONTENT_W, Inches(0.7),
             "What follows is what's in the repository and in production right now, counted against the current code.",
             size=11, color=INK2, line_spacing=1.5)

    add_rule(s, MARGIN_X, Inches(2.4), CONTENT_W)
    add_rule(s, MARGIN_X, Inches(3.3), CONTENT_W)
    kpis = [
        ("3", "PORTALS IN PRODUCTION"),
        ("53", "FRONTEND PAGES (18+19+16)"),
        ("40", "BACKEND ROUTE FILES"),
        ("6", "SPECIALIZED AGENTS"),
        ("10", "SCHEDULER JOBS"),
    ]
    kw = CONTENT_W / 5
    for i, (num, lbl) in enumerate(kpis):
        x = MARGIN_X + i * kw
        add_text(s, x + Inches(0.05), Inches(2.55), kw, Inches(0.5),
                 num, font=SERIF, size=28, color=INK)
        add_text(s, x + Inches(0.05), Inches(3.05), kw, Inches(0.2),
                 lbl, size=7, color=INK3, bold=True, letter_spacing=1.8)
        if i < 4:
            add_vrule(s, x + kw, Inches(2.45), Inches(0.85))

    add_rule(s, MARGIN_X, Inches(3.7), CONTENT_W)

    col_w = (CONTENT_W - Inches(0.6)) / 2
    col1_x = MARGIN_X
    col2_x = MARGIN_X + col_w + Inches(0.6)

    add_text(s, col1_x, Inches(3.95), col_w, Inches(0.3),
             "IN PRODUCTION", size=8, color=GOLD, bold=True, letter_spacing=2)
    prod_items = [
        "Daily real-world operations of the Maninos staff in the Homes portal",
        "Active investors reading their reports in Capital",
        "Customers reporting monthly payments from their accounts in Customers",
        "Daily scheduler against TDHCA leaving an audit trail in scheduler_runs",
        "AI agents inside the “Revisar Casa” and renovation-planning flows",
    ]
    y = Inches(4.3)
    for itm in prod_items:
        add_text(s, col1_x, y, col_w, Inches(0.4),
                 "—  " + itm, size=10, color=INK2, line_spacing=1.5)
        y += Inches(0.4)

    add_text(s, col2_x, Inches(3.95), col_w, Inches(0.3),
             "AREAS THAT STILL CARRY DEBT",
             size=8, color=GOLD, bold=True, letter_spacing=2)
    debt_items = [
        "Multi-tenant: today the system runs as a single instance for Maninos. Tenant separation is missing.",
        "White-label of brand and domain.",
        "Stripe is wired as a label in dropdowns but not actually integrated. Real online payments don't exist yet — everything is bank transfer with confirmation.",
        "Asset Pack as an explicit abstraction: today the MH rules are scattered across the code; lifting them into a pack requires refactoring.",
    ]
    y = Inches(4.3)
    for itm in debt_items:
        add_text(s, col2_x, y, col_w, Inches(0.5),
                 "—  " + itm, size=10, color=INK2, line_spacing=1.5)
        y += Inches(0.5)

    add_footer(s, "16  ·  TODAY", "REAL PRODUCTION  ·  EXPLICIT DEBT")


def slide_closing(prs):
    s = slide_blank(prs)
    add_text(s, MARGIN_X, MARGIN_Y, Inches(8), Inches(0.6),
             "In one sentence", font=SERIF, size=32, color=INK)
    add_text(s, MARGIN_X, MARGIN_Y, CONTENT_W, Inches(0.6),
             "CLOSING", size=8, color=INK3, bold=True,
             letter_spacing=2.5, align=PP_ALIGN.RIGHT, anchor=MSO_ANCHOR.MIDDLE)
    add_rule(s, MARGIN_X, MARGIN_Y + Inches(0.7), CONTENT_W)

    quote_x = MARGIN_X + Inches(0.4)
    quote_y = Inches(2.0)
    quote_w = CONTENT_W - Inches(0.4)
    add_vrule(s, quote_x - Inches(0.1), quote_y, Inches(2.6), color=GOLD, thickness=Pt(2.5))
    add_text(s, quote_x + Inches(0.2), quote_y, quote_w - Inches(0.2), Inches(2.6),
             "“Maninos OS is the operational discipline of a specialized mobile-home dealer in Texas — turned into code. What used to be spreadsheets, WhatsApp, QuickBooks, and unwritten procedure is now a system with six AI agents, its own GL, an in-house financing module, a customer portal, and an audit log.”",
             font=SERIF, size=21, color=INK, italic=True, line_spacing=1.4)

    add_rule(s, MARGIN_X, Inches(4.95), CONTENT_W)

    add_text(s, MARGIN_X, Inches(5.2), CONTENT_W, Inches(0.9),
             "The natural next step is to separate the engine from Maninos's specific rules, formalize the Asset Pack abstraction, and let other dealers — first mobile homes in other states, then RV or BHPH — run on the same infrastructure.",
             font=SERIF, size=15, color=INK2, line_spacing=1.5)

    add_rule(s, MARGIN_X, Inches(6.6), CONTENT_W)
    add_text(s, MARGIN_X, Inches(6.8), Inches(8), Inches(0.4),
             "Maninos OS", font=SERIF, size=16, color=INK)
    add_text(s, MARGIN_X, Inches(7.05), Inches(8), Inches(0.3),
             "Descriptive document · 2026", size=9, color=INK3, italic=True)
    add_text(s, MARGIN_X, Inches(6.8), CONTENT_W, Inches(0.3),
             "Maninos Homes LLC", size=9, color=INK3,
             align=PP_ALIGN.RIGHT)
    add_text(s, MARGIN_X, Inches(7.05), CONTENT_W, Inches(0.3),
             "Maninos Capital LLC", size=9, color=INK3,
             align=PP_ALIGN.RIGHT)

    add_footer(s, "17  ·  CLOSING", "END OF DOCUMENT")


def main():
    prs = Presentation()
    prs.slide_width = SLIDE_W
    prs.slide_height = SLIDE_H

    slide_title(prs)
    slide_definition(prs)
    slide_architecture(prs)
    slide_section_index(prs, "— PART I —", "The system, module by module",
                        "A descriptive walkthrough of each portal: what it includes, how each user works with it, what data it stores, and how it connects to the rest.")
    slide_homes_portal(prs)
    slide_capital_portal(prs)
    slide_customers_portal(prs)
    slide_section_index(prs, "— PART II —", "The business loop",
                        "How an asset moves from the moment it surfaces in an external source until its 36-month RTO contract closes out.")
    slide_loop(prs)
    slide_agents(prs)
    slide_scheduler(prs)
    slide_titles(prs)
    slide_rto(prs)
    slide_accounting(prs)
    slide_stack(prs)
    slide_rules(prs)
    slide_section_index(prs, "— PART III —", "The pattern is portable",
                        "The system was built for mobile homes in Texas, but its data model and its workflows describe a broader class of businesses.")
    slide_portability(prs)
    slide_verticals(prs)
    slide_status(prs)
    slide_closing(prs)

    out = os.path.join(os.path.dirname(__file__), "Maninos_OS_Pitch.pptx")
    prs.save(out)
    print(f"Saved: {out}")


if __name__ == "__main__":
    main()
