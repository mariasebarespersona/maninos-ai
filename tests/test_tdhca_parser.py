"""
Comprehensive tests for TDHCA parser.

Tests all three extraction strategies:
  1. Table parsing
  2. Regex extraction from page text
  3. Label\nValue line-pair extraction
"""
import pytest
from bs4 import BeautifulSoup
from api.utils.tdhca_parser import (
    parse_tdhca_detail_page,
    build_structured_tdhca_data,
    sanitize_tdhca_url,
    _extract_manufacturer_parts,
)


# ═══════════════════════════════════════════════════════════════════════════════
# URL SANITIZATION
# ═══════════════════════════════════════════════════════════════════════════════

def test_sanitize_url_removes_jsessionid():
    url = "https://mhweb.tdhca.state.tx.us/mhweb/title_detail.jsp;jsessionid=ABC123?homeid=123&db=TTL"
    out = sanitize_tdhca_url(url)
    assert ";jsessionid=" not in out
    assert out.endswith("homeid=123&db=TTL")


def test_sanitize_url_none():
    assert sanitize_tdhca_url(None) is None


# ═══════════════════════════════════════════════════════════════════════════════
# MANUFACTURER SPLITTING
# ═══════════════════════════════════════════════════════════════════════════════

def test_manufacturer_split_concatenated():
    name, addr, csz = _extract_manufacturer_parts(
        "MHDMAN00000039BRIGADIER HOMES A U.S. HOME COMPANY1001 SOUTH LOOP 340WACO, TX 76710"
    )
    assert name == "BRIGADIER HOMES A U.S. HOME COMPANY"
    assert addr == "1001 SOUTH LOOP 340"
    assert csz == "WACO, TX 76710"


def test_manufacturer_split_with_spaces():
    name, addr, csz = _extract_manufacturer_parts(
        "MHDMAN00000039 BRIGADIER HOMES A U.S. HOME COMPANY 1001 SOUTH LOOP 340 WACO, TX 76710"
    )
    assert name == "BRIGADIER HOMES A U.S. HOME COMPANY"
    assert addr == "1001 SOUTH LOOP 340"
    assert csz == "WACO, TX 76710"


def test_manufacturer_split_compact_zip():
    name, addr, csz = _extract_manufacturer_parts(
        "MHDMAN00000039BRIGADIER HOMES A U.S. HOME COMPANY1001 SOUTH LOOP 340WACO,TX76710"
    )
    assert name == "BRIGADIER HOMES A U.S. HOME COMPANY"
    assert addr == "1001 SOUTH LOOP 340"
    assert csz == "WACO, TX 76710"


def test_manufacturer_no_address():
    name, addr, csz = _extract_manufacturer_parts("MHDMAN00000042 CHAMPION HOME BUILDERS")
    assert name == "CHAMPION HOME BUILDERS"
    assert addr == ""
    assert csz == ""


def test_manufacturer_empty():
    name, addr, csz = _extract_manufacturer_parts("")
    assert name == ""
    assert addr == ""
    assert csz == ""


def test_manufacturer_florida_address():
    name, addr, csz = _extract_manufacturer_parts(
        "MHDMAN00000042 CHAMPION HOME BUILDERS INC 7233 CHURCH ST MIDDLEBURG, FL 32068"
    )
    assert "CHAMPION HOME BUILDERS" in name
    assert "7233 CHURCH ST" in addr
    assert "FL 32068" in csz


# ═══════════════════════════════════════════════════════════════════════════════
# BUILD STRUCTURED — SERIAL/LABEL CLEANUP
# ═══════════════════════════════════════════════════════════════════════════════

def test_serial_weight_is_cleaned_and_recovered():
    title_data = {
        "Certificate #": "01191237",
        "Manufacturer": "MHDMAN00000039BRIGADIER HOMES A U.S. HOME COMPANY1001 SOUTH LOOP 340WACO, TX 76710",
        "Model": "CENTURION",
        "Serial": "Weight",  # Bad parse from header row
        "Square Ftg": "700",
    }
    page_text = """
    Certificate #: 01191237
    Manufacturer: BRIGADIER HOMES A U.S. HOME COMPANY 1001 SOUTH LOOP 340 WACO, TX 76710
    Serial #: C3208
    Label/Seal#: TEX0012345
    Square Ftg: 700
    """
    out = build_structured_tdhca_data(title_data, page_text, "https://test.com", None)
    assert out["serial_number"] == "C3208"
    assert out["label_seal"] == "TEX0012345"


def test_section1_fields_preferred():
    title_data = {
        "Serial #": "BADSERIAL",
        "Label/Seal#": "",
        "Section 1 Serial": "C3208",
        "Section 1 Label/Seal": "TEX0012345",
        "Section 1 Size": "14 x 50",
    }
    out = build_structured_tdhca_data(title_data, "", "https://test.com", None)
    assert out["serial_number"] == "C3208"
    assert out["label_seal"] == "TEX0012345"
    assert out["width"] == "14"
    assert out["length"] == "50"


# ═══════════════════════════════════════════════════════════════════════════════
# FULL PAGE PARSING — TABLE + TEXT + LINE-PAIRS
# ═══════════════════════════════════════════════════════════════════════════════

SAMPLE_HTML_TABLE_KV = """
<html><body>
<table>
  <tr><td>Certificate #</td><td>01191237</td></tr>
  <tr><td>Manufacturer</td><td>MHDMAN00000039 BRIGADIER HOMES A U.S. HOME COMPANY 1001 SOUTH LOOP 340 WACO, TX 76710</td></tr>
  <tr><td>Model</td><td>CENTURION</td></tr>
  <tr><td>Year</td><td>1999</td></tr>
  <tr><td>Square Ftg</td><td>700</td></tr>
  <tr><td>Wind Zone</td><td>II</td></tr>
</table>
<table>
  <tr><th>Serial #</th><th>Label/Seal#</th><th>Weight</th><th>Size*</th></tr>
  <tr><td>Section 1</td><td colspan="1"></td><td></td><td></td></tr>
  <tr><td>C3208</td><td>TEX0012345</td><td>5000</td><td>14 X 50</td></tr>
</table>
<table>
  <tr><td>Buyer/Transferee</td><td>JOHN DOE</td></tr>
  <tr><td>Seller/Transferor</td><td>JANE DOE</td></tr>
  <tr><td>County</td><td>HARRIS</td></tr>
  <tr><td>Issue Date</td><td>01/15/2020</td></tr>
  <tr><td>Transfer/Sale Date</td><td>12/01/2019</td></tr>
</table>
</body></html>
"""


def test_parse_table_kv_pairs():
    """Test parsing of key-value table rows."""
    soup = BeautifulSoup(SAMPLE_HTML_TABLE_KV, 'html.parser')
    page_text = soup.get_text('\n', strip=True)
    data = parse_tdhca_detail_page(soup, page_text)

    assert data.get("Certificate #") == "01191237"
    assert "BRIGADIER" in (data.get("Manufacturer") or "")
    assert data.get("Model") == "CENTURION"
    assert data.get("Year") == "1999"
    assert data.get("Square Ftg") == "700"
    assert data.get("Wind Zone") == "II"


def test_parse_buyer_seller_county():
    """Test parsing of buyer, seller, and county."""
    soup = BeautifulSoup(SAMPLE_HTML_TABLE_KV, 'html.parser')
    page_text = soup.get_text('\n', strip=True)
    data = parse_tdhca_detail_page(soup, page_text)

    assert data.get("Buyer/Transferee") == "JOHN DOE"
    assert data.get("Seller/Transferor") == "JANE DOE"
    assert data.get("County") == "HARRIS"
    assert data.get("Issue Date") == "01/15/2020"
    assert data.get("Transfer/Sale Date") == "12/01/2019"


def test_full_structured_from_html():
    """End-to-end test: HTML → structured data."""
    soup = BeautifulSoup(SAMPLE_HTML_TABLE_KV, 'html.parser')
    page_text = soup.get_text('\n', strip=True)
    title_data = parse_tdhca_detail_page(soup, page_text)
    structured = build_structured_tdhca_data(title_data, page_text, "https://test.com", None)

    assert structured["certificate_number"] == "01191237"
    assert structured["manufacturer"] == "BRIGADIER HOMES A U.S. HOME COMPANY"
    assert structured["manufacturer_address"] == "1001 SOUTH LOOP 340"
    assert "WACO" in structured["manufacturer_city_state_zip"]
    assert "TX" in structured["manufacturer_city_state_zip"]
    assert structured["model"] == "CENTURION"
    assert structured["year"] == "1999"
    assert structured["square_feet"] == "700"
    assert structured["wind_zone"] == "II"
    assert structured["buyer"] == "JOHN DOE"
    assert structured["seller"] == "JANE DOE"
    assert structured["county"] == "HARRIS"


# ═══════════════════════════════════════════════════════════════════════════════
# LINE-PAIR EXTRACTION (TDHCA "Label\nValue" format)
# ═══════════════════════════════════════════════════════════════════════════════

SAMPLE_HTML_LINE_PAIRS = """
<html><body>
<div>
Certificate #<br/>01191237<br/>
Manufacturer<br/>MHDMAN00000039 BRIGADIER HOMES<br/>
Model<br/>CENTURION<br/>
Date Manf<br/>01/1999<br/>
Square Ftg<br/>700<br/>
Wind Zone<br/>II<br/>
Buyer/Transferee<br/>JOHN DOE<br/>
Seller/Transferor<br/>JANE DOE<br/>
County<br/>HARRIS<br/>
Issue Date<br/>01/15/2020<br/>
</div>
</body></html>
"""


def test_parse_line_pairs():
    """Test extraction when data is in Label\\nValue format (no tables)."""
    soup = BeautifulSoup(SAMPLE_HTML_LINE_PAIRS, 'html.parser')
    page_text = soup.get_text('\n', strip=True)
    data = parse_tdhca_detail_page(soup, page_text)

    assert data.get("Certificate #") == "01191237"
    assert "BRIGADIER" in (data.get("Manufacturer") or "")
    assert data.get("Model") == "CENTURION"
    assert data.get("Date Manf") == "01/1999"
    assert data.get("Square Ftg") == "700"
    assert data.get("Wind Zone") == "II"
    assert data.get("Buyer/Transferee") == "JOHN DOE"
    assert data.get("Seller/Transferor") == "JANE DOE"
    assert data.get("County") == "HARRIS"
    assert data.get("Issue Date") == "01/15/2020"


# ═══════════════════════════════════════════════════════════════════════════════
# REGEX EXTRACTION FROM TEXT
# ═══════════════════════════════════════════════════════════════════════════════

def test_parse_inline_key_value_text():
    """Test regex extraction from 'Key: Value' text."""
    html = "<html><body><p>Certificate #: 01191237 Serial #: C3208 Label/Seal#: TEX0012345 Wind Zone: II Year: 1999 Square Ftg: 700</p></body></html>"
    soup = BeautifulSoup(html, 'html.parser')
    page_text = soup.get_text('\n', strip=True)
    data = parse_tdhca_detail_page(soup, page_text)

    assert data.get("Certificate #") == "01191237"
    assert data.get("Serial #") == "C3208"
    assert data.get("Label/Seal#") == "TEX0012345"
    assert data.get("Wind Zone") == "II"
    assert data.get("Year") == "1999"
    assert data.get("Square Ftg") == "700"


# ═══════════════════════════════════════════════════════════════════════════════
# HEADER ROW TABLE (Serial/Label/Weight/Size)
# ═══════════════════════════════════════════════════════════════════════════════

SAMPLE_HTML_HEADER_DATA_TABLE = """
<html><body>
<table>
  <tr><td>Serial #</td><td>Label/Seal#</td><td>Weight</td><td>Size*</td></tr>
  <tr><td>Section 1</td><td></td><td></td><td></td></tr>
  <tr><td>CLW001234TX</td><td>TEX0056789</td><td>5000</td><td>16 X 76</td></tr>
</table>
</body></html>
"""


def test_header_data_table_serial_label():
    """Test that Serial/Label/Size are extracted from header+data table."""
    soup = BeautifulSoup(SAMPLE_HTML_HEADER_DATA_TABLE, 'html.parser')
    page_text = soup.get_text('\n', strip=True)
    data = parse_tdhca_detail_page(soup, page_text)

    # Should NOT have "Weight" as serial
    serial = data.get("Serial #") or data.get("Section 1 Serial") or ""
    assert serial != "Weight"
    assert "CLW001234TX" in serial or serial == "CLW001234TX"


# ═══════════════════════════════════════════════════════════════════════════════
# COMPREHENSIVE END-TO-END: REALISTIC TDHCA HTML
# ═══════════════════════════════════════════════════════════════════════════════

REALISTIC_TDHCA_HTML = """
<html><body>
<table width="95%" cellpadding="5">
  <tr><td colspan="2"><b>Title Information</b></td></tr>
  <tr><td>Certificate #</td><td>01191237</td></tr>
  <tr><td>Manufacturer</td><td>MHDMAN00000039 BRIGADIER HOMES A U.S. HOME COMPANY 1001 SOUTH LOOP 340 WACO, TX 76710</td></tr>
  <tr><td>Model</td><td>CENTURION</td></tr>
  <tr><td>Date Manf</td><td>01/1999</td></tr>
  <tr><td>Year</td><td>1999</td></tr>
</table>

<table width="95%" cellpadding="3" border="1">
  <tr>
    <td><b>Serial #</b></td>
    <td><b>Label/Seal#</b></td>
    <td><b>Weight</b></td>
    <td><b>Size*</b></td>
  </tr>
  <tr>
    <td>Section 1</td>
    <td></td>
    <td></td>
    <td></td>
  </tr>
  <tr>
    <td>C3208</td>
    <td>TEX0012345</td>
    <td>4500</td>
    <td>14 X 50</td>
  </tr>
</table>

<table width="95%" cellpadding="5">
  <tr><td>Square Ftg</td><td>700</td></tr>
  <tr><td>Wind Zone</td><td>II</td></tr>
  <tr><td>Buyer/Transferee</td><td>JOHN DOE</td></tr>
  <tr><td>Seller/Transferor</td><td>JANE DOE</td></tr>
  <tr><td>County</td><td>HARRIS</td></tr>
  <tr><td>Issue Date</td><td>01/15/2020</td></tr>
  <tr><td>Transfer/Sale Date</td><td>12/01/2019</td></tr>
  <tr><td>Election</td><td>Personal Property</td></tr>
  <tr><td>First Lien</td><td>NONE</td></tr>
</table>
</body></html>
"""


def test_realistic_tdhca_page():
    """Full end-to-end test with realistic TDHCA HTML structure."""
    soup = BeautifulSoup(REALISTIC_TDHCA_HTML, 'html.parser')
    page_text = soup.get_text('\n', strip=True)
    title_data = parse_tdhca_detail_page(soup, page_text)
    structured = build_structured_tdhca_data(title_data, page_text, "https://test.com", None)

    # Certificate
    assert structured["certificate_number"] == "01191237"

    # Manufacturer (split into parts)
    assert structured["manufacturer"] == "BRIGADIER HOMES A U.S. HOME COMPANY"
    assert structured["manufacturer_address"] == "1001 SOUTH LOOP 340"
    assert "WACO" in structured["manufacturer_city_state_zip"]
    assert "TX 76710" in structured["manufacturer_city_state_zip"]

    # Model & Year
    assert structured["model"] == "CENTURION"
    assert "1999" in (structured["year"] or "")

    # Serial & Label (NOT "Weight" or "Section 1")
    assert structured["serial_number"] and structured["serial_number"] not in ("Weight", "Section 1", "")
    assert structured["label_seal"] and structured["label_seal"] not in ("Weight", "Section 1", "")

    # Square feet & Wind zone
    assert structured["square_feet"] == "700"
    assert structured["wind_zone"] == "II"

    # Dimensions
    assert structured["width"] == "14"
    assert structured["length"] == "50"

    # Ownership
    assert structured["buyer"] == "JOHN DOE"
    assert structured["seller"] == "JANE DOE"

    # County
    assert structured["county"] == "HARRIS"

    # Dates
    assert structured["issue_date"] == "01/15/2020"
    assert structured["transfer_date"] == "12/01/2019"

    # Election & Lien
    assert structured["election"] == "Personal Property"
    assert structured["lien_info"] == "NONE"

    # raw_fields should be populated
    assert len(structured["raw_fields"]) >= 10


# ═══════════════════════════════════════════════════════════════════════════════
# EDGE CASES
# ═══════════════════════════════════════════════════════════════════════════════

def test_empty_page():
    soup = BeautifulSoup("<html><body></body></html>", 'html.parser')
    data = parse_tdhca_detail_page(soup, "")
    assert isinstance(data, dict)
    assert len(data) == 0


def test_wind_zone_currently_installed_filtered():
    """Wind Zone 'Currently Installed in SMITH COUNTY' should NOT be used as wind zone."""
    html = """<html><body>
    <table>
      <tr><td>Wind Zone</td><td>Currently Installed in SMITH COUNTY</td></tr>
      <tr><td>Square Ftg</td><td>700</td></tr>
    </table>
    </body></html>"""
    soup = BeautifulSoup(html, 'html.parser')
    page_text = soup.get_text('\n', strip=True)
    title_data = parse_tdhca_detail_page(soup, page_text)
    structured = build_structured_tdhca_data(title_data, page_text, None, None)

    # Wind zone should be empty (not "Currently Installed in SMITH COUNTY")
    assert structured["wind_zone"] == ""
    # County should be extracted from the "Currently Installed" text
    assert "SMITH" in structured["county"]


def test_wind_zone_valid_value_kept():
    """Valid wind zone values like 'II' should be preserved."""
    html = """<html><body>
    <table>
      <tr><td>Wind Zone</td><td>II</td></tr>
    </table>
    </body></html>"""
    soup = BeautifulSoup(html, 'html.parser')
    page_text = soup.get_text('\n', strip=True)
    title_data = parse_tdhca_detail_page(soup, page_text)
    structured = build_structured_tdhca_data(title_data, page_text, None, None)
    assert structured["wind_zone"] == "II"


def test_address_from_separate_fields():
    """Address/City/State/Zip in separate table rows should be used as fallback."""
    html = """<html><body>
    <table>
      <tr><td>Manufacturer</td><td>CHAMPION HOME BUILDERS</td></tr>
      <tr><td>Address</td><td>1001 SOUTH LOOP 256</td></tr>
      <tr><td>City, State, Zip</td><td>LUFKIN, TX 75901</td></tr>
      <tr><td>Model</td><td>CENTURION</td></tr>
    </table>
    </body></html>"""
    soup = BeautifulSoup(html, 'html.parser')
    page_text = soup.get_text('\n', strip=True)
    title_data = parse_tdhca_detail_page(soup, page_text)
    structured = build_structured_tdhca_data(title_data, page_text, None, None)

    assert structured["manufacturer"] == "CHAMPION HOME BUILDERS"
    assert structured["manufacturer_address"] == "1001 SOUTH LOOP 256"
    assert "LUFKIN" in structured["manufacturer_city_state_zip"]
    assert "TX" in structured["manufacturer_city_state_zip"]


def test_page_with_only_text_no_tables():
    """Test extraction from a page with no HTML tables, only text."""
    html = """<html><body>
    <p>Certificate #: 99999 Model: BROOKHAVEN Year: 2005
    Serial #: ABC123456 Label/Seal#: TEX789012 Wind Zone: I
    Square Ftg: 1200 County: DALLAS
    Buyer/Transferee: BOB SMITH Seller/Transferor: ALICE JONES</p>
    </body></html>"""
    soup = BeautifulSoup(html, 'html.parser')
    page_text = soup.get_text('\n', strip=True)
    data = parse_tdhca_detail_page(soup, page_text)
    structured = build_structured_tdhca_data(data, page_text, None, None)

    assert structured["certificate_number"] == "99999"
    assert structured["model"] == "BROOKHAVEN"
    assert structured["year"] == "2005"
    assert structured["serial_number"] == "ABC123456"
    assert structured["label_seal"] == "TEX789012"
    assert structured["wind_zone"] == "I"
    assert structured["square_feet"] == "1200"
    assert structured["buyer"] == "BOB SMITH"
    assert structured["seller"] == "ALICE JONES"


# ═══════════════════════════════════════════════════════════════════════════════
# BLOCK 2A + 4A AUTO-FILL: END-TO-END WITH REAL TEXAS TITLE DATA
# ═══════════════════════════════════════════════════════════════════════════════
#
# These tests simulate the FULL flow: real TDHCA HTML → parser → structured data
# → Block 2A / 4A field mapping (matching the frontend's getTdhcaField + splitManufacturerParts logic).
#
# Every Block 2A field and Block 4A field must be non-empty after mapping.
# ═══════════════════════════════════════════════════════════════════════════════

# ── Helper: simulate frontend field mapping (same logic as MarketDashboard.tsx) ──

def _map_block_2a_4a(structured: dict) -> dict:
    """
    Simulate the frontend's mapping of structured TDHCA data to
    TitleApplicationTemplate initialData fields (Block 2A + 4A).

    This mirrors exactly what MarketDashboard.tsx and new/page.tsx do.
    """
    import re as _re

    # --- getTdhcaField equivalent ---
    def get(*keys: str) -> str:
        for k in keys:
            v = structured.get(k)
            if v is not None and str(v).strip():
                return str(v).strip()
            # Fallback to raw_fields
            raw = structured.get("raw_fields") or {}
            exact = raw.get(k)
            if exact is not None and str(exact).strip():
                return str(exact).strip()
            lower = k.lower()
            for rk, rv in raw.items():
                if rk.lower() == lower and rv is not None and str(rv).strip():
                    return str(rv).strip()
        return ""

    # --- cleanSuspiciousValue equivalent ---
    BAD = {"weight", "size", "serial", "serial #", "serial#",
           "label/seal", "label/seal#", "w", "l", "width", "length"}
    def clean(val: str) -> str:
        return "" if val.strip().lower() in BAD else val.strip()

    # --- splitManufacturerParts equivalent ---
    def split_manufacturer():
        raw_mfr = get("manufacturer", "Manufacturer")
        backend_addr = get("manufacturer_address", "Address", "Manufacturer Address", "Mfg Address")
        backend_csz = get("manufacturer_city_state_zip", "City, State, Zip", "City State Zip", "City, State")

        if backend_addr or backend_csz:
            return {"name": raw_mfr, "address": backend_addr, "cityStateZip": backend_csz}

        # Client-side split (safety net)
        result = {"name": raw_mfr, "address": "", "cityStateZip": ""}
        if not raw_mfr:
            return result

        addr_re = _re.compile(
            r"((\d{1,6}\s+(?:[A-Za-z0-9\s.\-]+?)(?:ST|AVE|AVENUE|BLVD|BOULEVARD|DR|DRIVE|LN|LANE|PL|PLACE|RD|ROAD|WAY|CIRCLE|CIR|LOOP|PKWY|PARKWAY|HWY|HIGHWAY|TRL|TRAIL|TERRACE|TER|PASS|CROSSING|XING|SQ|SQUARE)\.?)\s*(?:,\s*)?([A-Za-z\s.\-]+?),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?))$",
            _re.IGNORECASE,
        )
        m = addr_re.search(raw_mfr)
        if m:
            result["name"] = raw_mfr[:m.start()].strip()
            result["address"] = m.group(2).strip()
            result["cityStateZip"] = f"{m.group(3).strip()}, {m.group(4)} {m.group(5)}"
        return result

    # --- deriveDimensions equivalent ---
    def derive_dims():
        w = clean(get("width", "Width"))
        l = clean(get("length", "Length"))
        if w and l:
            return {"width": w, "length": l}
        size = get("Size", "Size*", "size")
        m = _re.match(r"(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)", size)
        return {"width": m.group(1), "length": m.group(2)} if m else {"width": "", "length": ""}

    mfr = split_manufacturer()
    dims = derive_dims()

    return {
        # ── Block 2A ──
        "manufacturer": mfr["name"],
        "manufacturer_address": mfr["address"],
        "manufacturer_city_state_zip": mfr["cityStateZip"],
        "make": get("model", "Model"),
        "year": get("year", "Year", "Date Manf", "Date of Manufacture"),
        "date_of_manufacture": get("year", "Date Manf", "Date of Manufacture"),
        "total_sqft": get("square_feet", "Square Ftg", "Square Feet"),
        "section1_label": clean(get("label_seal", "Label/Seal#", "Label/Seal", "Label/Seal Number")),
        "section1_serial": clean(get("serial_number", "Serial #", "Serial", "Serial Number", "Complete Serial Number")),
        "section1_width": dims["width"],
        "section1_length": dims["length"],
        "wind_zone": get("wind_zone", "Wind Zone"),
        # ── Block 4A ──
        "seller_name": get("buyer", "Buyer/Transferee", "Buyer"),
        "buyer_name": "MANINOS HOMES LLC",
    }


# ─── Test 1: Single-wide home (Brigadier / Waco) ─────────────────────────────

TITLE_SINGLE_WIDE_HTML = """
<html><body>
<table width="95%" cellpadding="5">
  <tr><td colspan="2"><b>Title Information</b></td></tr>
  <tr><td>Certificate #</td><td>01191237</td></tr>
  <tr><td>Manufacturer</td><td>MHDMAN00000039 BRIGADIER HOMES A U.S. HOME COMPANY 1001 SOUTH LOOP 340 WACO, TX 76710</td></tr>
  <tr><td>Model</td><td>CENTURION</td></tr>
  <tr><td>Date Manf</td><td>01/1999</td></tr>
  <tr><td>Year</td><td>1999</td></tr>
</table>
<table width="95%" cellpadding="3" border="1">
  <tr><td><b>Serial #</b></td><td><b>Label/Seal#</b></td><td><b>Weight</b></td><td><b>Size*</b></td></tr>
  <tr><td>Section 1</td><td></td><td></td><td></td></tr>
  <tr><td>CLW007371TXA</td><td>TEX0342861</td><td>4500</td><td>16 X 76</td></tr>
</table>
<table width="95%" cellpadding="5">
  <tr><td>Square Ftg</td><td>1216</td></tr>
  <tr><td>Wind Zone</td><td>II</td></tr>
  <tr><td>Buyer/Transferee</td><td>JUAN GARCIA</td></tr>
  <tr><td>Seller/Transferor</td><td>FIRST TRUST BANK</td></tr>
  <tr><td>County</td><td>HARRIS</td></tr>
  <tr><td>Issue Date</td><td>03/10/2015</td></tr>
  <tr><td>Transfer/Sale Date</td><td>02/28/2015</td></tr>
  <tr><td>Election</td><td>Personal Property</td></tr>
  <tr><td>First Lien</td><td>NONE</td></tr>
</table>
</body></html>
"""


def test_block2a_4a_single_wide():
    """
    End-to-end: realistic single-wide TDHCA title → verify ALL Block 2A + 4A fields populated.
    """
    soup = BeautifulSoup(TITLE_SINGLE_WIDE_HTML, "html.parser")
    page_text = soup.get_text("\n", strip=True)
    raw = parse_tdhca_detail_page(soup, page_text)
    structured = build_structured_tdhca_data(raw, page_text, "https://test.com/detail", None)
    fields = _map_block_2a_4a(structured)

    # ── Block 2A: every field must be non-empty ──
    assert fields["manufacturer"], "manufacturer should not be empty"
    assert "BRIGADIER" in fields["manufacturer"]
    assert fields["manufacturer_address"], "manufacturer_address should not be empty"
    assert "1001" in fields["manufacturer_address"]
    assert fields["manufacturer_city_state_zip"], "manufacturer_city_state_zip should not be empty"
    assert "WACO" in fields["manufacturer_city_state_zip"]
    assert "TX" in fields["manufacturer_city_state_zip"]
    assert "76710" in fields["manufacturer_city_state_zip"]

    assert fields["make"] == "CENTURION", f"make should be CENTURION, got '{fields['make']}'"
    assert "1999" in fields["year"], f"year should contain 1999, got '{fields['year']}'"
    assert fields["date_of_manufacture"], "date_of_manufacture should not be empty"

    assert fields["total_sqft"] == "1216", f"total_sqft should be 1216, got '{fields['total_sqft']}'"
    assert fields["wind_zone"] == "II", f"wind_zone should be II, got '{fields['wind_zone']}'"

    assert fields["section1_serial"] == "CLW007371TXA", f"section1_serial got '{fields['section1_serial']}'"
    assert fields["section1_label"] == "TEX0342861", f"section1_label got '{fields['section1_label']}'"
    assert fields["section1_width"] == "16", f"section1_width got '{fields['section1_width']}'"
    assert fields["section1_length"] == "76", f"section1_length got '{fields['section1_length']}'"

    # ── Block 4A: seller from TDHCA buyer ──
    assert fields["seller_name"] == "JUAN GARCIA", f"seller_name got '{fields['seller_name']}'"
    assert fields["buyer_name"] == "MANINOS HOMES LLC"


# ─── Test 2: Double-wide home (Champion / Florida manufacturer) ───────────────

TITLE_DOUBLE_WIDE_HTML = """
<html><body>
<table width="95%" cellpadding="5">
  <tr><td colspan="2"><b>Title Information</b></td></tr>
  <tr><td>Certificate #</td><td>02543891</td></tr>
  <tr><td>Manufacturer</td><td>MHDMAN00000042 CHAMPION HOME BUILDERS INC 7233 CHURCH ST MIDDLEBURG, FL 32068</td></tr>
  <tr><td>Model</td><td>BROOKHAVEN</td></tr>
  <tr><td>Date Manf</td><td>06/2003</td></tr>
  <tr><td>Year</td><td>2003</td></tr>
</table>
<table width="95%" cellpadding="3" border="1">
  <tr><td><b>Serial #</b></td><td><b>Label/Seal#</b></td><td><b>Weight</b></td><td><b>Size*</b></td></tr>
  <tr><td>Section 1</td><td></td><td></td><td></td></tr>
  <tr><td>047602AB3741A</td><td>NTA1150382</td><td>3800</td><td>14 X 52</td></tr>
  <tr><td>Section 2</td><td></td><td></td><td></td></tr>
  <tr><td>047602AB3741B</td><td>NTA1150383</td><td>3900</td><td>14 X 52</td></tr>
</table>
<table width="95%" cellpadding="5">
  <tr><td>Square Ftg</td><td>1456</td></tr>
  <tr><td>Wind Zone</td><td>I</td></tr>
  <tr><td>Buyer/Transferee</td><td>MARIA LOPEZ AND CARLOS LOPEZ</td></tr>
  <tr><td>Seller/Transferor</td><td>CHAMPION HOMES DIRECT</td></tr>
  <tr><td>County</td><td>DALLAS</td></tr>
  <tr><td>Issue Date</td><td>09/15/2003</td></tr>
  <tr><td>Transfer/Sale Date</td><td>08/30/2003</td></tr>
  <tr><td>Election</td><td>Personal Property</td></tr>
  <tr><td>First Lien</td><td>WELLS FARGO BANK</td></tr>
</table>
</body></html>
"""


def test_block2a_4a_double_wide():
    """
    End-to-end: double-wide home with 2 sections + Florida manufacturer.
    Verify ALL Block 2A + 4A fields populated.
    """
    soup = BeautifulSoup(TITLE_DOUBLE_WIDE_HTML, "html.parser")
    page_text = soup.get_text("\n", strip=True)
    raw = parse_tdhca_detail_page(soup, page_text)
    structured = build_structured_tdhca_data(raw, page_text, "https://test.com/detail", None)
    fields = _map_block_2a_4a(structured)

    # ── Block 2A ──
    assert fields["manufacturer"], "manufacturer should not be empty"
    assert "CHAMPION" in fields["manufacturer"]
    assert fields["manufacturer_address"], "manufacturer_address should not be empty"
    assert "7233" in fields["manufacturer_address"] or "CHURCH" in fields["manufacturer_address"]
    assert fields["manufacturer_city_state_zip"], "manufacturer_city_state_zip should not be empty"
    assert "FL" in fields["manufacturer_city_state_zip"]
    assert "32068" in fields["manufacturer_city_state_zip"]

    assert fields["make"] == "BROOKHAVEN"
    assert "2003" in fields["year"]
    assert fields["date_of_manufacture"]

    assert fields["total_sqft"] == "1456"
    assert fields["wind_zone"] == "I"

    # Section 1 values (not Section 2)
    assert fields["section1_serial"] == "047602AB3741A", f"got '{fields['section1_serial']}'"
    assert fields["section1_label"] == "NTA1150382", f"got '{fields['section1_label']}'"
    assert fields["section1_width"] == "14"
    assert fields["section1_length"] == "52"

    # ── Block 4A ──
    assert fields["seller_name"] == "MARIA LOPEZ AND CARLOS LOPEZ"
    assert fields["buyer_name"] == "MANINOS HOMES LLC"


# ─── Test 3: Title with separate Address / City fields (no embedded address) ──

TITLE_SEPARATE_ADDRESS_HTML = """
<html><body>
<table width="95%" cellpadding="5">
  <tr><td>Certificate #</td><td>03987654</td></tr>
  <tr><td>Manufacturer</td><td>FLEETWOOD HOMES</td></tr>
  <tr><td>Address</td><td>5405 INTERSTATE 10 SOUTH</td></tr>
  <tr><td>City, State, Zip</td><td>WACO, TX 76716</td></tr>
  <tr><td>Model</td><td>HERITAGE</td></tr>
  <tr><td>Date Manf</td><td>11/2010</td></tr>
  <tr><td>Year</td><td>2010</td></tr>
</table>
<table width="95%" cellpadding="3" border="1">
  <tr><td><b>Serial #</b></td><td><b>Label/Seal#</b></td><td><b>Weight</b></td><td><b>Size*</b></td></tr>
  <tr><td>Section 1</td><td></td><td></td><td></td></tr>
  <tr><td>TXFLW86A12345AB</td><td>TEX1456789</td><td>5200</td><td>16 X 80</td></tr>
</table>
<table width="95%" cellpadding="5">
  <tr><td>Square Ftg</td><td>1280</td></tr>
  <tr><td>Wind Zone</td><td>III</td></tr>
  <tr><td>Buyer/Transferee</td><td>ROBERTO MARTINEZ</td></tr>
  <tr><td>Seller/Transferor</td><td>FLEETWOOD HOMES OF TEXAS INC</td></tr>
  <tr><td>County</td><td>BEXAR</td></tr>
  <tr><td>Issue Date</td><td>12/01/2010</td></tr>
  <tr><td>Transfer/Sale Date</td><td>11/15/2010</td></tr>
  <tr><td>Election</td><td>Personal Property</td></tr>
  <tr><td>First Lien</td><td>NONE</td></tr>
</table>
</body></html>
"""


def test_block2a_4a_separate_address_fields():
    """
    Title where manufacturer address is in separate Address and City, State, Zip rows.
    Verify all Block 2A + 4A fields populated via fallback logic.
    """
    soup = BeautifulSoup(TITLE_SEPARATE_ADDRESS_HTML, "html.parser")
    page_text = soup.get_text("\n", strip=True)
    raw = parse_tdhca_detail_page(soup, page_text)
    structured = build_structured_tdhca_data(raw, page_text, "https://test.com/detail", None)
    fields = _map_block_2a_4a(structured)

    # ── Block 2A ──
    assert fields["manufacturer"] == "FLEETWOOD HOMES"
    assert fields["manufacturer_address"], "manufacturer_address should not be empty"
    assert "5405" in fields["manufacturer_address"]
    assert fields["manufacturer_city_state_zip"], "manufacturer_city_state_zip should not be empty"
    assert "WACO" in fields["manufacturer_city_state_zip"]
    assert "TX" in fields["manufacturer_city_state_zip"]

    assert fields["make"] == "HERITAGE"
    assert "2010" in fields["year"]
    assert fields["date_of_manufacture"]

    assert fields["total_sqft"] == "1280"
    assert fields["wind_zone"] == "III"

    assert fields["section1_serial"] == "TXFLW86A12345AB"
    assert fields["section1_label"] == "TEX1456789"
    assert fields["section1_width"] == "16"
    assert fields["section1_length"] == "80"

    # ── Block 4A ──
    assert fields["seller_name"] == "ROBERTO MARTINEZ"
    assert fields["buyer_name"] == "MANINOS HOMES LLC"


# ─── Test 4: Compact concatenated manufacturer (no spaces, no comma) ──────────

TITLE_COMPACT_MFR_HTML = """
<html><body>
<table width="95%" cellpadding="5">
  <tr><td>Certificate #</td><td>04112233</td></tr>
  <tr><td>Manufacturer</td><td>MHDMAN00000050CMH MANUFACTURING INC2521 HWY 90SEGUIN TX 78155</td></tr>
  <tr><td>Model</td><td>AMERICAN DREAM</td></tr>
  <tr><td>Date Manf</td><td>03/2018</td></tr>
  <tr><td>Year</td><td>2018</td></tr>
</table>
<table width="95%" cellpadding="3" border="1">
  <tr><td><b>Serial #</b></td><td><b>Label/Seal#</b></td><td><b>Weight</b></td><td><b>Size*</b></td></tr>
  <tr><td>Section 1</td><td></td><td></td><td></td></tr>
  <tr><td>CSS006789TXA</td><td>TEX2345678</td><td>6100</td><td>16 X 72</td></tr>
</table>
<table width="95%" cellpadding="5">
  <tr><td>Square Ftg</td><td>1152</td></tr>
  <tr><td>Wind Zone</td><td>II</td></tr>
  <tr><td>Buyer/Transferee</td><td>ANA PEREZ DE GONZALEZ</td></tr>
  <tr><td>Seller/Transferor</td><td>CMH HOMES INC</td></tr>
  <tr><td>County</td><td>GUADALUPE</td></tr>
  <tr><td>Issue Date</td><td>04/01/2018</td></tr>
  <tr><td>Transfer/Sale Date</td><td>03/20/2018</td></tr>
</table>
</body></html>
"""


def test_block2a_4a_compact_manufacturer():
    """
    Title with heavily concatenated manufacturer string and no-comma address.
    Verify all Block 2A + 4A fields populated.
    """
    soup = BeautifulSoup(TITLE_COMPACT_MFR_HTML, "html.parser")
    page_text = soup.get_text("\n", strip=True)
    raw = parse_tdhca_detail_page(soup, page_text)
    structured = build_structured_tdhca_data(raw, page_text, "https://test.com/detail", None)
    fields = _map_block_2a_4a(structured)

    # ── Block 2A ──
    assert fields["manufacturer"], "manufacturer should not be empty"
    assert "CMH" in fields["manufacturer"]
    assert fields["manufacturer_address"], "manufacturer_address should not be empty"
    assert "2521" in fields["manufacturer_address"] or "HWY" in fields["manufacturer_address"]
    assert fields["manufacturer_city_state_zip"], "manufacturer_city_state_zip should not be empty"
    assert "TX" in fields["manufacturer_city_state_zip"]
    assert "78155" in fields["manufacturer_city_state_zip"]

    assert fields["make"] == "AMERICAN DREAM"
    assert "2018" in fields["year"]
    assert fields["date_of_manufacture"]

    assert fields["total_sqft"] == "1152"
    assert fields["wind_zone"] == "II"

    assert fields["section1_serial"] == "CSS006789TXA"
    assert fields["section1_label"] == "TEX2345678"
    assert fields["section1_width"] == "16"
    assert fields["section1_length"] == "72"

    # ── Block 4A ──
    assert fields["seller_name"] == "ANA PEREZ DE GONZALEZ"
    assert fields["buyer_name"] == "MANINOS HOMES LLC"


# ─── Test 5: Verify NO fields are empty across all titles ─────────────────────

ALL_TITLE_HTMLS = [
    ("single_wide", TITLE_SINGLE_WIDE_HTML),
    ("double_wide", TITLE_DOUBLE_WIDE_HTML),
    ("separate_addr", TITLE_SEPARATE_ADDRESS_HTML),
    ("compact_mfr", TITLE_COMPACT_MFR_HTML),
]

BLOCK_2A_FIELDS = [
    "manufacturer", "manufacturer_address", "manufacturer_city_state_zip",
    "make", "year", "date_of_manufacture", "total_sqft", "wind_zone",
    "section1_serial", "section1_label", "section1_width", "section1_length",
]
BLOCK_4A_FIELDS = ["seller_name", "buyer_name"]


# ─── Test 6: Wind Zone "Currently Installed in..." must be cleaned ─────────────

TITLE_WIND_ZONE_INSTALLED_HTML = """
<html><body>
<table width="95%" cellpadding="5">
  <tr><td>Certificate #</td><td>01191237</td></tr>
  <tr><td>Manufacturer</td><td>MHDMAN00000039 BRIGADIER HOMES A U.S. HOME COMPANY 1001 SOUTH LOOP 340 WACO, TX 76710</td></tr>
  <tr><td>Model</td><td>CENTURION</td></tr>
  <tr><td>Date Manf</td><td>01/1999</td></tr>
  <tr><td>Year</td><td>1999</td></tr>
</table>
<table width="95%" cellpadding="3" border="1">
  <tr><td><b>Serial #</b></td><td><b>Label/Seal#</b></td><td><b>Weight</b></td><td><b>Size*</b></td></tr>
  <tr><td>Section 1</td><td></td><td></td><td></td></tr>
  <tr><td>C3208</td><td>TEX0012345</td><td>5000</td><td>14 X 50</td></tr>
</table>
<table width="95%" cellpadding="5">
  <tr><td>Square Ftg</td><td>700</td></tr>
  <tr><td>Wind Zone</td><td>Currently Installed in SMITH County</td></tr>
  <tr><td>Buyer/Transferee</td><td>JOHN DOE</td></tr>
  <tr><td>Seller/Transferor</td><td>JANE DOE</td></tr>
  <tr><td>County</td><td>HARRIS</td></tr>
</table>
</body></html>
"""


def test_block2a_wind_zone_cleaned_and_raw_fields_safe():
    """
    Critical bug fix: when Wind Zone contains 'Currently Installed in SMITH County',
    the backend validates it to '' AND cleans raw_fields['Wind Zone'] to ''.

    This prevents the frontend's getTdhcaField fallback from picking up
    the unvalidated raw_fields value.
    """
    soup = BeautifulSoup(TITLE_WIND_ZONE_INSTALLED_HTML, "html.parser")
    page_text = soup.get_text("\n", strip=True)
    raw = parse_tdhca_detail_page(soup, page_text)
    structured = build_structured_tdhca_data(raw, page_text, "https://test.com", None)

    # Structured wind_zone must be empty (validated)
    assert structured["wind_zone"] == "", f"wind_zone should be empty, got '{structured['wind_zone']}'"

    # CRITICAL: raw_fields['Wind Zone'] must ALSO be empty
    # (prevents frontend getTdhcaField from falling back to the invalid value)
    assert structured["raw_fields"].get("Wind Zone", "") == "", \
        f"raw_fields['Wind Zone'] should be empty, got '{structured['raw_fields'].get('Wind Zone')}'"

    # County comes from explicit County field (HARRIS) — takes precedence over "Currently Installed"
    assert structured["county"] == "HARRIS"

    # Other fields should still work
    assert structured["manufacturer"] == "BRIGADIER HOMES A U.S. HOME COMPANY"
    assert structured["manufacturer_address"] == "1001 SOUTH LOOP 340"
    assert "WACO" in structured["manufacturer_city_state_zip"]
    assert structured["buyer"] == "JOHN DOE"
    assert structured["seller"] == "JANE DOE"


# ─── Test 7: getTdhcaField simulation — structured "" should NOT be overridden ─

def test_frontend_get_tdhca_field_respects_backend_empty_string():
    """
    Simulate the frontend's getTdhcaField logic:
    When tdhcaResult.wind_zone is '' (typeof string), it should return ''
    WITHOUT falling back to raw_fields['Wind Zone'].
    """
    # Simulate what the backend returns
    tdhca_result = {
        "wind_zone": "",  # Backend validated this to empty
        "manufacturer": "BRIGADIER HOMES",
        "manufacturer_address": "1001 SOUTH LOOP 340",
        "buyer": None,  # Backend couldn't find buyer
        "raw_fields": {
            "Wind Zone": "Currently Installed in SMITH County",  # Bad value
            "Buyer/Transferee": "JOHN DOE",  # Value exists in raw
        },
    }

    # Simulate frontend getTdhcaField logic (matching the fixed version)
    def getTdhcaField(*keys: str) -> str:
        # Pass 1: structured fields — typeof string check
        for key in keys:
            val = tdhca_result.get(key)
            if isinstance(val, str):  # Python equivalent of typeof === 'string'
                return val.strip()

        # Pass 2: raw_fields fallback for non-structured keys only
        raw = tdhca_result.get("raw_fields", {})
        for key in keys:
            if key in tdhca_result:
                continue  # Skip structured keys
            exact = raw.get(key)
            if exact is not None and str(exact).strip():
                return str(exact).strip()
        return ""

    # wind_zone: backend returned "" → must stay "" (not "Currently Installed...")
    assert getTdhcaField("wind_zone", "Wind Zone") == "", \
        "wind_zone should be '' even though raw_fields has 'Currently Installed...'"

    # manufacturer: backend returned a string → use it
    assert getTdhcaField("manufacturer", "Manufacturer") == "BRIGADIER HOMES"

    # buyer: backend returned None → skip, then check raw_fields for 'Buyer/Transferee'
    assert getTdhcaField("buyer", "Buyer/Transferee") == "JOHN DOE", \
        "buyer=None should fall through to raw_fields['Buyer/Transferee']"


@pytest.mark.parametrize("title_name,html", ALL_TITLE_HTMLS)
def test_no_empty_block2a_4a_fields(title_name, html):
    """
    Parametrized test: for each realistic title, verify EVERY Block 2A + 4A field
    is non-empty after the full parse + mapping pipeline.
    """
    soup = BeautifulSoup(html, "html.parser")
    page_text = soup.get_text("\n", strip=True)
    raw = parse_tdhca_detail_page(soup, page_text)
    structured = build_structured_tdhca_data(raw, page_text, "https://test.com", None)
    fields = _map_block_2a_4a(structured)

    for field in BLOCK_2A_FIELDS + BLOCK_4A_FIELDS:
        assert fields.get(field), f"[{title_name}] Block 2A/4A field '{field}' is empty! value='{fields.get(field)}'"
