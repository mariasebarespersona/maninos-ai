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
