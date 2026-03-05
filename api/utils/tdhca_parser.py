"""
TDHCA Title Detail Page Parser.

Extracts structured data from TDHCA manufactured home title records.
Uses multiple strategies for robustness:
  1. HTML table parsing (header+data rows, key-value pairs)
  2. Comprehensive regex extraction from full page text
  3. Label\\nValue line-pair extraction
  4. Field normalization and cleanup
"""

import re
import logging
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ─── Constants ────────────────────────────────────────────────────────────────

_BAD_VALUES = {
    "weight", "size", "label/seal", "label/seal#",
    "serial", "serial#", "serial #", "n/a", "na", "-",
    "w", "l", "width", "length",
    # Sub-headers in the Owners table — appear as cell values but are labels
    "previous owners", "previous owner",
    "no beneficiary",
}

# TDHCA navigation / chrome text that should NEVER be captured as field values.
# These appear as link text or tab labels on the page.
_NAV_GARBAGE = {
    "detail", "details", "previous owners", "report", "records",
    "print", "search", "back", "home", "help", "submit",
    "title search", "title view", "log out", "logout", "login",
    "tab", "view", "edit", "delete", "new search",
    "return to search", "return to results", "previous",
    "next", "close", "ok", "cancel", "reset", "clear",
    # Additional TDHCA-specific nav/chrome terms
    "title information", "section information",
    "previous owner", "prev owners", "prev owner",
    "record", "report view", "print view",
    "manufactured housing", "mhweb",
    # Real TDHCA page navigation items
    "search again", "print home detail", "skip to content",
    "contact", "about", "calendar", "press", "employment",
    "manufactured housing division", "site search:",
    "manufactured housing report options",
    "view ownership records", "download ownership records",
    "monthly titling report", "download selling retailer records",
    "view tax lien records", "download tax lien records",
    "view central tax collectors", "view license records",
    "download license records", "view installation records",
    "download installation records", "ownership records by county report",
    "check tax lien status", "tax lien history",
    "privacy & security policy", "web accessibility policy",
    "link policy", "top of page",
}

# Values that look like section labels (should not be stored as data)
_SECTION_RE = re.compile(r"^section\s*\d+$", re.IGNORECASE)

# Common US street suffixes — used to detect where city starts in addresses
_STREET_SUFFIXES = {
    "st", "ave", "avenue", "blvd", "boulevard", "ct", "court",
    "dr", "drive", "ln", "lane", "pl", "place", "rd", "road",
    "way", "circle", "cir", "loop", "pkwy", "parkway",
    "hwy", "highway", "trail", "trl", "terrace", "ter",
    "pass", "crossing", "xing", "sq", "square",
}

# Header hints for detecting header rows in TDHCA tables
_HEADER_HINTS = ("serial", "label", "seal", "weight", "size", "section", "lien", "current owner", "seller")

# Known field names (used as boundary in regex to avoid over-matching)
_FIELD_BOUNDARY = (
    r"(?:Year|Date|Serial|Label|Wind|Sq(?:uare)?|Buyer|Seller|County|Size|Weight|"
    r"Certificate|Model|Manufacturer|Section|Issue|Transfer|Election|Lien|First|"
    r"Purchaser|Transferee|Transferor|Make|Address|City)"
)


# ─── URL helpers ──────────────────────────────────────────────────────────────

def sanitize_tdhca_url(url: str | None) -> str | None:
    if not url:
        return url
    return re.sub(r";jsessionid=[^?]*", "", url, flags=re.IGNORECASE)


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════

def parse_tdhca_detail_page(soup, page_text: str) -> Dict[str, str]:
    """
    Extract all key-value fields from a TDHCA detail page.

    Uses three complementary strategies:
      1. HTML table cell parsing (handles structured tables)
      2. Full-text regex extraction (catches inline Key: Value)
      3. Label\\nValue line-pair extraction (catches TDHCA two-line format)

    Returns a flat dict of field_name → value.
    """
    title_data: Dict[str, str] = {}

    # ── Pre-processing: strip navigation links from soup before table parsing ──
    # TDHCA pages have navigation tabs ("Detail", "Previous Owners", "Report",
    # "Records") that the parser incorrectly captures as field values.
    _strip_nav_elements(soup)

    # ── Strategy 0: Check if this is a SEARCH RESULTS page (not detail) ──
    # If yes, extract data from the results table as fallback.
    # CRITICAL: Only run this on search results pages, NOT on detail pages.
    # The detail page has tables (like "Sections") that look like result tables
    # but aren't. Detect detail page by <h1> or <title> containing "Certificate Detail".
    is_detail_page = bool(
        soup.find('h1', string=re.compile(r'Certificate\s+Detail', re.IGNORECASE))
        or soup.find('title', string=re.compile(r'Certificate\s+Detail', re.IGNORECASE))
    )
    if not is_detail_page:
        _parse_search_results_table(soup, title_data)
        if title_data:
            logger.info(f"[TDHCA-parser] Found search results table data: {list(title_data.keys())}")
    else:
        logger.info("[TDHCA-parser] Detected detail page — skipping search results parser")

    # ── Strategy 0b: Parse heading + table pairs ──
    # TDHCA uses <h2>Label</h2> followed by a <table> with single-cell data.
    # e.g., <h2>Manufacturer</h2><table><tr><td>MHDMAN00000039<br>BRIGADIER...</td></tr></table>
    _parse_heading_table_pairs(soup, title_data)
    if title_data:
        logger.info(f"[TDHCA-parser] After heading+table pairs: {list(title_data.keys())}")

    # ── Strategy 1: Parse HTML tables (from CLEANED soup) ──
    _parse_tables(soup, title_data)
    logger.info(f"[TDHCA-parser] After tables: {list(title_data.keys())}")

    # ── CRITICAL: Regenerate page_text from the CLEANED soup ──
    # The caller's page_text was extracted BEFORE we stripped nav elements,
    # so it still contains garbage like "Detail", "Previous Owners", etc.
    # We must regenerate from the clean soup for strategies 2 & 3.
    clean_text = soup.get_text('\n', strip=True)
    # Normalize non-breaking spaces (&nbsp;) — TDHCA pages use these extensively
    clean_text = _normalize_whitespace(clean_text)
    # Also strip lines that are just nav terms (belt + suspenders)
    clean_text = _clean_page_text(clean_text)
    logger.info(f"[TDHCA-parser] Clean text (first 1500): {clean_text[:1500]}")

    # ── Strategy 2: Regex extraction from cleaned text ──
    _extract_regex_fields(clean_text, title_data)
    logger.info(f"[TDHCA-parser] After regex: {list(title_data.keys())}")

    # ── Strategy 3: Label\nValue line pairs from cleaned text ──
    _extract_label_value_pairs(clean_text, title_data)
    logger.info(f"[TDHCA-parser] After line-pairs: {list(title_data.keys())}")

    # ── Cleanup: remove nav garbage that slipped through + serial/label ──
    _cleanup_nav_garbage(title_data)
    _cleanup_serial_label(clean_text, title_data)

    logger.info(f"[TDHCA-parser] Final fields ({len(title_data)}): "
                f"{dict((k, v[:60] if isinstance(v, str) and len(v) > 60 else v) for k, v in title_data.items())}")
    return title_data


def _parse_heading_table_pairs(soup, title_data: Dict[str, str]) -> None:
    """
    Parse TDHCA's heading + single-cell table pattern.

    The REAL TDHCA detail page puts some data in this format:
        <h2>Manufacturer</h2>
        <table>
          <tr>
            <td>MHDMAN00000039<br>
              BRIGADIER HOMES A U.S. HOME COMPANY<br>
              1001 SOUTH LOOP 340<br>
              WACO, TX 76710
            </td>
          </tr>
        </table>

    For these, we use the heading text as the key and the cell content as the value.
    """
    for heading in soup.find_all(['h1', 'h2', 'h3']):
        text = heading.get_text(strip=True).lower().rstrip(':').strip()
        canonical = _LABEL_TO_KEY.get(text)
        if not canonical:
            continue

        # Already have a good value?
        existing = (title_data.get(canonical) or "").strip()
        if existing and existing.lower() not in _BAD_VALUES and not _SECTION_RE.match(existing):
            continue

        # Find the next table sibling
        next_table = heading.find_next_sibling('table')
        if not next_table:
            # Try through parent (heading might be wrapped in a div)
            next_el = heading.find_next('table')
            if next_el:
                next_table = next_el

        if not next_table:
            continue

        # Get ALL text from the table (join with spaces to collapse <br> tags)
        full_text = _normalize_whitespace(next_table.get_text(separator=' ', strip=True))
        # Also collapse newlines
        full_text = re.sub(r'\s*\n\s*', ' ', full_text).strip()
        full_text = re.sub(r'\s{2,}', ' ', full_text).strip()

        if full_text and len(full_text) < 300:
            title_data[canonical] = full_text
            logger.debug(f"[TDHCA-parser] Heading+table: {canonical} = {full_text[:80]}")


def _parse_search_results_table(soup, title_data: Dict[str, str]) -> None:
    """
    Parse TDHCA search results table.

    The search results page has a table with columns like:
      Certificate | Serial/Label | Manufacturer | Model | Year | ...
    And data rows below. We extract the FIRST result row's data.

    This is a FALLBACK for when we can't navigate to the detail page.
    """
    # Look for tables that have header cells containing result column names
    _RESULT_HEADERS = {
        "certificate", "serial", "label", "manufacturer",
        "model", "year", "county",
    }
    # Map result column headers to canonical field names
    _RESULT_HEADER_MAP = {
        "certificate": "Certificate #",
        "certificate #": "Certificate #",
        "cert #": "Certificate #",
        "cert": "Certificate #",
        "serial": "Serial #",
        "serial #": "Serial #",
        "serial/label": "Serial #",
        "label": "Label/Seal#",
        "label/seal": "Label/Seal#",
        "label/seal#": "Label/Seal#",
        "manufacturer": "Manufacturer",
        "model": "Model",
        "make": "Model",
        "year": "Year",
        "county": "County",
        "sq ft": "Square Ftg",
        "sqft": "Square Ftg",
        "square ft": "Square Ftg",
        "size": "Size",
        "buyer": "Buyer/Transferee",
        "seller": "Seller/Transferor",
        "wind zone": "Wind Zone",
    }

    for table in soup.find_all('table'):
        rows = table.find_all('tr')
        if len(rows) < 2:
            continue

        # Check first row for result-like headers
        first_row_cells = rows[0].find_all(['td', 'th'])
        headers = [c.get_text(strip=True).lower() for c in first_row_cells]

        # Count how many headers match known result columns
        hits = sum(1 for h in headers if any(rh in h for rh in _RESULT_HEADERS))
        if hits < 2:
            continue

        logger.info(f"[TDHCA-parser] Found results table with headers: {headers}")

        # Map headers to canonical keys
        canonical_headers = []
        for h in headers:
            matched = None
            for key, canon in _RESULT_HEADER_MAP.items():
                if key in h:
                    matched = canon
                    break
            canonical_headers.append(matched)

        # Parse data rows (skip header row)
        for row in rows[1:]:
            cells = row.find_all(['td', 'th'])
            if len(cells) < 2:
                continue

            # Skip rows that look like more headers
            cell_texts = [c.get_text(strip=True) for c in cells]
            if all(t.lower() in _RESULT_HEADERS or not t for t in cell_texts):
                continue

            # Extract data from this row
            for i, (canon, cell) in enumerate(zip(canonical_headers, cells)):
                if not canon:
                    continue
                val = cell.get_text(separator=' ', strip=True)
                if not val or val.lower() in _BAD_VALUES or val.lower() in _NAV_GARBAGE:
                    continue
                # Don't overwrite existing good values
                existing = title_data.get(canon, "").strip()
                if not existing or existing.lower() in _BAD_VALUES:
                    title_data[canon] = val

            # Only take the first data row
            logger.info(f"[TDHCA-parser] Extracted from results table: "
                        f"{dict((k,v[:50]) for k,v in title_data.items())}")
            return


def _strip_nav_elements(soup) -> None:
    """Remove navigation links and non-data elements from the soup BEFORE parsing."""

    # ═══ CRITICAL: Remove the TDHCA sidebar navigation ═══
    # The TDHCA detail page uses a layout table with a <td class="menuBG">
    # that contains the entire sidebar menu. This sidebar has nested tables
    # with links like "View Ownership Records", "Download Tax Lien Records", etc.
    # If not removed, our table parser captures the sidebar text as data values
    # (e.g., "County" gets the entire sidebar text as its value).
    for sidebar in soup.find_all('td', class_='menuBG'):
        logger.debug("[TDHCA-parser] Stripping sidebar <td class='menuBG'>")
        sidebar.decompose()

    # Also remove nav boxes (TDHCA uses class="bgNavBox" for the sidebar menu)
    for nav_box in soup.find_all('table', class_='bgNavBox'):
        logger.debug("[TDHCA-parser] Stripping <table class='bgNavBox'>")
        nav_box.decompose()
    for nav_box in soup.find_all('table', class_='bgTable'):
        logger.debug("[TDHCA-parser] Stripping <table class='bgTable'>")
        nav_box.decompose()

    # Remove the top navigation bar (id="topnav")
    for topnav in soup.find_all(id='topnav'):
        topnav.decompose()
    # Remove the search form
    for search_div in soup.find_all(id='search'):
        search_div.decompose()
    # Remove the logo div
    for logo in soup.find_all(id='logo'):
        logo.decompose()

    # Remove ALL <a> links that look like navigation (not data links)
    for link in soup.find_all('a'):
        text = link.get_text(strip=True).lower()
        href = (link.get('href') or '').lower()

        # Remove links whose ENTIRE text is a nav term
        if text in _NAV_GARBAGE:
            link.decompose()
            continue

        # Remove links that navigate to TDHCA chrome pages (not data)
        if any(nav in href for nav in (
            'title_view', 'title_search', 'titleSearch',
            'previous_owners', 'previousOwners',
            'main.jsp', 'download', 'taxlien', 'license',
            'install', 'ctc_view', 'tdlr_title', 'rai_search',
            'title_by_county', 'title_download', 'seller_download',
            'javascript:', 'logout', 'login',
            'tdhca.state.tx.us/au', 'tdhca.state.tx.us/hr',
            'tdhca.state.tx.us/events', 'tdhca.state.tx.us/ppa',
            'tdhca.state.tx.us/mh/',
        )):
            # Only decompose if the link text is short (nav, not data)
            if len(text) < 30:
                link.decompose()
                continue

    # Remove <script>, <style>, <nav>, <header>, <footer>, <select>, <input>, <form>
    for tag_name in ('script', 'style', 'nav', 'header', 'footer', 'select', 'option'):
        for tag in soup.find_all(tag_name):
            tag.decompose()

    # Remove hidden text divs (TDHCA has <div class="hiddentext">)
    for hidden in soup.find_all('div', class_='hiddentext'):
        hidden.decompose()


def _clean_page_text(page_text: str) -> str:
    """Remove lines that consist solely of navigation/chrome terms."""
    clean_lines = []
    for line in page_text.splitlines():
        stripped = line.strip()
        lower = stripped.lower()

        # Exact match to nav garbage
        if lower in _NAV_GARBAGE:
            continue

        # Line is only nav terms separated by whitespace/pipes/tabs
        # e.g. "Detail  Previous Owners  Report  Records"
        # e.g. "Detail | Previous Owners | Report | Records"
        tokens = re.split(r'\s*[|/]\s*|\s{2,}|\t+', lower)
        tokens = [t.strip() for t in tokens if t.strip()]
        if tokens and all(t in _NAV_GARBAGE for t in tokens):
            continue

        # Skip single-char lines that are just punctuation or noise
        # (but keep "II", "I", "III" etc. which are valid wind zone values)
        if len(stripped) == 1 and not stripped.isalnum():
            continue

        clean_lines.append(line)
    return '\n'.join(clean_lines)


def _cleanup_nav_garbage(title_data: Dict[str, str]) -> None:
    """Remove any field values that are actually navigation text."""
    for key in list(title_data.keys()):
        val = (title_data.get(key) or "").strip()
        if val.lower() in _NAV_GARBAGE:
            logger.info(f"[TDHCA-parser] Removing nav garbage: {key} = '{val}'")
            del title_data[key]


# ═══════════════════════════════════════════════════════════════════════════════
# STRATEGY 1: TABLE PARSING
# ═══════════════════════════════════════════════════════════════════════════════

def _parse_tables(soup, title_data: Dict[str, str]) -> None:
    """Extract fields from all HTML tables in the page."""
    tables = soup.find_all('table')

    for table in tables:
        rows = table.find_all('tr')
        pending_headers: Optional[List[str]] = None

        for row in rows:
            cells = row.find_all(['td', 'th'])
            if not cells:
                continue

            all_th = all(c.name == 'th' for c in cells)
            all_td = all(c.name == 'td' for c in cells)

            row_texts = [_normalize_whitespace(c.get_text(separator=' ').strip().rstrip(':')) for c in cells]

            # Detect header-like <td> rows (≥50% of cells contain header keywords)
            header_cell_count = sum(1 for t in row_texts if any(h in t.lower() for h in _HEADER_HINTS))
            is_header_like_td_row = (
                all_td
                and len(row_texts) >= 2  # Changed from >2 to >=2 for 2-column tables (Liens, Owners)
                and header_cell_count >= max(2, int(len(row_texts) * 0.5))
            )

            # ── Header-only row (all <th>) OR header-like <td> row ──
            if (all_th and len(cells) > 1) or is_header_like_td_row:
                pending_headers = row_texts
                continue

            # ── Data row matching a previous header row ──
            if pending_headers and all_td:
                _map_header_data(pending_headers, cells, title_data)
                # Keep pending_headers alive for multi-section tables (Section 1, Section 2…)
                continue

            # ── Mixed / key-value rows: step=2 pairing ──
            pending_headers = None
            _parse_kv_cells(cells, title_data)


def _map_header_data(headers: List[str], cells, title_data: Dict[str, str]) -> None:
    """Map header labels to corresponding data cells."""
    # Detect section index from first cell
    first_text = _normalize_whitespace(cells[0].get_text(separator=' ').strip()) if cells else ""
    m_sec = re.search(r"section\s*(\d+)", first_text, re.IGNORECASE)
    section_idx = m_sec.group(1) if m_sec else None

    # If this is a "Section N" label row with empty remaining cells, skip it
    if _SECTION_RE.match(first_text):
        has_real_data = any(c.get_text(separator=' ').strip() for c in cells[1:])
        if not has_real_data:
            return  # Empty section label row — skip

    # TDHCA Sections table uses bare numbers as section indicators:
    #   Row: [1] [&nbsp;] [&nbsp;] [&nbsp;] [&nbsp;]  ← section number, rest "empty" (but contain &nbsp;)
    #   Row: [TEX0012345] [C3208] [12000] [14] [50]  ← actual data
    # Detect this pattern: first cell is a small integer, remaining cells empty.
    # CRITICAL: TDHCA uses &nbsp; in "empty" cells, which becomes \xa0.
    # Regular str.strip() does NOT strip \xa0, so we must normalize first.
    if re.fullmatch(r"\d{1,2}", first_text):
        has_real_data = any(
            _normalize_whitespace(c.get_text(separator=' ')).strip()
            for c in cells[1:]
        )
        if not has_real_data:
            # This is a section number row — record the section index
            section_idx = first_text
            logger.debug(f"[TDHCA-parser] Skipping bare section number row: {first_text}")
            return

    for header, cell in zip(headers, cells):
        val = _normalize_whitespace(cell.get_text(separator=' ').strip())
        if not header or not val or len(header) >= 60:
            continue

        # Skip section labels, bad values, and navigation garbage
        if _SECTION_RE.match(val) or val.lower() in _BAD_VALUES or val.lower() in _NAV_GARBAGE:
            continue

        # Skip bare section numbers (e.g., "1", "2") as values
        # These appear in TDHCA Sections table when section number is in the first column
        if re.fullmatch(r"\d{1,2}", val) and header.lower() in ("label", "serial", "label/seal", "serial #"):
            logger.debug(f"[TDHCA-parser] Skipping bare number '{val}' for header '{header}'")
            continue

        existing = (title_data.get(header) or "").strip()
        # Overwrite if empty, bad, nav garbage, a section label, or a bare section number
        if (not existing or existing.lower() in _BAD_VALUES
                or existing.lower() in _NAV_GARBAGE
                or _SECTION_RE.match(existing)
                or re.fullmatch(r"\d{1,2}", existing)):
            title_data[header] = val

        # Capture per-section values
        if section_idx:
            h = header.lower()
            if "label" in h and "seal" in h:
                key = f"Section {section_idx} Label/Seal"
                if not title_data.get(key) or _SECTION_RE.match(title_data.get(key, "")):
                    title_data[key] = val
            elif "serial" in h:
                key = f"Section {section_idx} Serial"
                if not title_data.get(key) or _SECTION_RE.match(title_data.get(key, "")):
                    title_data[key] = val
            elif "size" in h and val.lower() != "size":
                key = f"Section {section_idx} Size"
                if not title_data.get(key):
                    title_data[key] = val


def _parse_kv_cells(cells, title_data: Dict[str, str]) -> None:
    """Parse key-value pairs from table cells (step-2 pairing)."""
    i = 0
    while i < len(cells) - 1:
        key = _normalize_whitespace(cells[i].get_text(separator=' ').strip().rstrip(':'))
        val = _normalize_whitespace(cells[i + 1].get_text(separator=' ').strip())
        key_l = key.lower()
        val_l = val.lower()

        value_looks_like_header = any(h in val_l for h in _HEADER_HINTS) and len(val) < 30

        if (key and val
                and 1 < len(key) < 60
                and not key.replace(',', '').replace('.', '').replace(' ', '').isdigit()
                and not value_looks_like_header
                and key_l != val_l
                and val_l not in _BAD_VALUES
                and val_l not in _NAV_GARBAGE
                and not _SECTION_RE.match(val)):

            existing = title_data.get(key, "").strip()
            if not existing or existing.lower() in _BAD_VALUES or _SECTION_RE.match(existing):
                title_data[key] = val
        i += 2


# ═══════════════════════════════════════════════════════════════════════════════
# STRATEGY 2: REGEX FROM FULL TEXT
# ═══════════════════════════════════════════════════════════════════════════════

# Comprehensive regex patterns: (canonical_key, pattern, flags)
# Uses _FIELD_BOUNDARY lookahead to stop before the next known field name.
_TEXT_PATTERNS: List[Tuple[str, str, int]] = [
    ("Certificate #",       r"Certificate\s*#?\s*:?\s*([\w-]+)",                                                0),
    ("Manufacturer",        r"Manufacturer(?:\s+Name)?\s*:?\s*(.+?)(?:\n|$)",                                   0),
    ("Model",               rf"\bModel\s*:?\s*([A-Z][A-Z0-9/.& -]+?)(?=\s+{_FIELD_BOUNDARY}\b|\s*[:\n]|\s*$)", re.IGNORECASE),
    ("Date Manf",           r"(?:Date\s+(?:of\s+)?)?Man[u]?f(?:acture)?d?\s*:?\s*(\d{1,2}/\d{2,4}|\d{4})",    re.IGNORECASE),
    ("Year",                r"\bYear\s*:?\s*(\d{4})\b",                                                         re.IGNORECASE),
    ("Serial #",            r"(?:Complete\s+)?Serial\s*(?:Number|#)?\s*:?\s*([A-Z0-9][A-Z0-9-]{4,})",          re.IGNORECASE),
    ("Label/Seal#",         r"Label/?Seal\s*#?\s*(?:Number)?\s*:?\s*([A-Z0-9][A-Z0-9-]{4,})",                  re.IGNORECASE),
    ("Square Ftg",          r"(?:Square|Sq\.?|Total\s+Square)\s*(?:Ft(?:g|age)?|Feet)\s*:?\s*([\d,]+)",        re.IGNORECASE),
    ("Wind Zone",           r"Wind\s*Zone\s*:?\s*([IVX123]+)",                                                  re.IGNORECASE),
    ("Size",                r"\bSize\s*\*?\s*:?\s*(\d+(?:\.\d+)?\s*[xX×]\s*\d+(?:\.\d+)?)",                   re.IGNORECASE),
    ("Buyer/Transferee",    rf"(?:Buyer|Purchaser)\s*/?\s*(?:Transferee)?\s*:?\s*(.+?)(?=\s+{_FIELD_BOUNDARY}\b|\s*\n|\s*$)", 0),
    ("Seller/Transferor",   rf"(?:Seller)\s*/?\s*(?:Transferor)?\s*:?\s*(.+?)(?=\s+{_FIELD_BOUNDARY}\b|\s*\n|\s*$)",          0),
    # County regex: Must start at beginning of field/line, NOT match "SMITH County"
    # The word "County" preceded by [A-Z] (like "SMITH County") is NOT a county label.
    ("County",              rf"(?<![A-Za-z] )County\s*:+\s*([A-Z][A-Za-z ]+?)(?=\s+{_FIELD_BOUNDARY}\b|\s*[,\n]|\s*$|\d)",  0),
    ("Issue Date",          r"Issue\s+Date\s*:?\s*([\d/.-]+)",                                                  re.IGNORECASE),
    ("Transfer/Sale Date",  r"(?:Transfer|Sale)\s*/?(?:Sale)?\s*Date\s*:?\s*([\d/.-]+)",                        re.IGNORECASE),
    # Use word boundary on "Lien" to avoid matching "s" from "Active Mortgage Liens"
    ("First Lien",          rf"(?:First\s+)?Lien\b(?:holder)?\s*:\s*(.+?)(?=\s+{_FIELD_BOUNDARY}\b|\s*\n|\s*$)", re.IGNORECASE),
    ("Election",            rf"Election\s*:?\s*(.+?)(?=\s+{_FIELD_BOUNDARY}\b|\s*\n|\s*$)",                     re.IGNORECASE),
    ("Currently Installed in", r"Currently\s+Installed\s+in\s+([A-Z][A-Za-z ]+?)(?:\s+County)?\s*(?:\n|$|[,.])",  re.IGNORECASE),
    ("Address",             r"(?:Mfg\.?\s+)?Address\s*:?\s*(.+?)(?:\n|$)",                                        re.IGNORECASE),
]


def _extract_regex_fields(page_text: str, title_data: Dict[str, str]) -> None:
    """Extract fields from full page text using regex patterns (same-line Key: Value)."""
    for key, pattern, flags in _TEXT_PATTERNS:
        existing = (title_data.get(key) or "").strip()
        if existing and existing.lower() not in _BAD_VALUES and not _SECTION_RE.match(existing):
            continue  # Already have a good value from table parsing
        m = re.search(pattern, page_text, flags)
        if m:
            val = m.group(1).strip()
            if (val.lower() not in _BAD_VALUES
                    and val.lower() not in _NAV_GARBAGE
                    and len(val) > 0
                    and not _SECTION_RE.match(val)):
                title_data[key] = val
                logger.debug(f"[TDHCA-parser] Regex match: {key} = {val}")


# ═══════════════════════════════════════════════════════════════════════════════
# STRATEGY 3: LABEL\nVALUE LINE-PAIR EXTRACTION
# ═══════════════════════════════════════════════════════════════════════════════

# Map lowercase label text → canonical key
_LABEL_TO_KEY: Dict[str, str] = {
    "certificate #": "Certificate #",
    "certificate": "Certificate #",
    "certificate number": "Certificate #",
    "manufacturer": "Manufacturer",
    "manufacturer name": "Manufacturer",
    "model": "Model",
    "make": "Model",
    "date manf": "Date Manf",
    "date of manufacture": "Date Manf",
    "date manufactured": "Date Manf",
    "year": "Year",
    "serial #": "Serial #",
    "serial": "Serial #",
    "serial number": "Serial #",
    "complete serial number": "Serial #",
    "label/seal#": "Label/Seal#",
    "label/seal": "Label/Seal#",
    "label/seal number": "Label/Seal#",
    "label/seal #": "Label/Seal#",
    "square ftg": "Square Ftg",
    "square feet": "Square Ftg",
    "sq ftg": "Square Ftg",
    "total square feet": "Square Ftg",
    "wind zone": "Wind Zone",
    "size": "Size",
    "size*": "Size",
    "buyer/transferee": "Buyer/Transferee",
    "buyer": "Buyer/Transferee",
    "purchaser": "Buyer/Transferee",
    "transferee": "Buyer/Transferee",
    "seller/transferor": "Seller/Transferor",
    "seller": "Seller/Transferor",
    "transferor": "Seller/Transferor",
    "county": "County",
    "issue date": "Issue Date",
    "transfer/sale date": "Transfer/Sale Date",
    "transfer date": "Transfer/Sale Date",
    "sale date": "Transfer/Sale Date",
    "first lien": "First Lien",
    "lien": "First Lien",
    "lienholder": "First Lien",
    "election": "Election",
    "currently installed in": "Currently Installed in",
    "address": "Address",
    "mfg address": "Address",
    "manufacturer address": "Address",
    "city, state, zip": "City, State, Zip",
    "city state zip": "City, State, Zip",
    "city": "City",
    "state": "State",
    "zip": "Zip",
    "zip code": "Zip",
    "date mfg": "Date Manf",
    "mfg date": "Date Manf",
    # Real TDHCA field names (from the actual website)
    "manufacture date": "Date Manf",
    "certificate number": "Certificate #",
    "new/used": "New/Used",
    "number of sections": "Number of Sections",
    "date of sale": "Date of Sale",
    "date of certificate": "Date of Certificate",
    "right of survivorship": "Right of Survivorship",
    "current owner": "Current Owner",
    "lien holder": "Lien Holder",
    "lien date": "Lien Date",
}


def _extract_label_value_pairs(page_text: str, title_data: Dict[str, str]) -> None:
    """
    Extract fields where the label is on one line and the value on the next.

    TDHCA detail pages often render as:
        Manufacturer
        BRIGADIER HOMES A U.S. HOME COMPANY ...
        Model
        CENTURION
        Buyer/Transferee
        JOHN DOE
    """
    lines = page_text.splitlines()

    for i, line in enumerate(lines):
        stripped = line.strip().rstrip(':').strip()
        lower = stripped.lower()

        canonical = _LABEL_TO_KEY.get(lower)
        if not canonical:
            continue

        # Already have a good value?
        existing = (title_data.get(canonical) or "").strip()
        if existing and existing.lower() not in _BAD_VALUES and not _SECTION_RE.match(existing):
            continue

        # Next line should be the value
        if i + 1 >= len(lines):
            continue

        val = lines[i + 1].strip()
        if not val or len(val) > 300:
            continue

        # Skip if the "value" is actually another known label
        val_as_label = val.lower().rstrip(':').strip()
        if val_as_label in _LABEL_TO_KEY:
            continue

        # Skip bad values, section labels, and navigation garbage
        if val.lower() in _BAD_VALUES or val.lower() in _NAV_GARBAGE or _SECTION_RE.match(val):
            continue

        title_data[canonical] = val
        logger.debug(f"[TDHCA-parser] Line-pair: {canonical} = {val}")


# ═══════════════════════════════════════════════════════════════════════════════
# CLEANUP: SERIAL / LABEL RECOVERY
# ═══════════════════════════════════════════════════════════════════════════════

def _cleanup_serial_label(page_text: str, title_data: Dict[str, str]) -> None:
    """Remove bogus serial/label values and try to recover them from lines."""
    serial_keys = ("Serial #", "Serial", "Serial Number", "Complete Serial Number")
    label_keys = ("Label/Seal#", "Label/Seal", "Label/Seal Number", "Label/Seal #")

    # Remove bad values and section labels
    for k in serial_keys + label_keys:
        v = (title_data.get(k) or "").strip()
        if v.lower() in _BAD_VALUES or _SECTION_RE.match(v):
            title_data.pop(k, None)

    # Recover serial from lines if missing
    has_serial = any(title_data.get(k) for k in serial_keys)
    if not has_serial:
        recovered = _recover_from_lines(page_text, for_label=False)
        if recovered:
            title_data["Serial #"] = recovered
            logger.info(f"[TDHCA-parser] Recovered Serial # from lines: {recovered}")

    # Recover label from lines if missing
    has_label = any(title_data.get(k) for k in label_keys)
    if not has_label:
        recovered = _recover_from_lines(page_text, for_label=True)
        if recovered:
            title_data["Label/Seal#"] = recovered
            logger.info(f"[TDHCA-parser] Recovered Label/Seal# from lines: {recovered}")


def _recover_from_lines(page_text: str, for_label: bool) -> str:
    """Try to recover serial/label from individual lines of text."""
    lines = page_text.splitlines()
    for line in lines:
        ll = line.lower()
        if for_label:
            if "label" not in ll or "seal" not in ll:
                continue
        else:
            if "serial" not in ll or ("label" in ll and "seal" in ll):
                continue

        candidates = re.findall(r"[A-Z0-9-]{5,}", line.upper())
        good = [c for c in candidates if c.lower() not in _BAD_VALUES and not _SECTION_RE.match(c)]
        if good:
            return good[0]
    return ""


# ═══════════════════════════════════════════════════════════════════════════════
# MANUFACTURER PARSING
# ═══════════════════════════════════════════════════════════════════════════════

def _split_city_from_street(text: str) -> Tuple[str, str]:
    """
    Split "7233 CHURCH ST MIDDLEBURG" into ("MIDDLEBURG", "7233 CHURCH ST").

    Works backwards: collect words until hitting a street suffix or number.
    Returns (city, street_address). City may be empty if no split point found.
    """
    words = text.split()
    if not words:
        return "", ""

    city_words: List[str] = []
    split_idx = len(words)

    for i in range(len(words) - 1, -1, -1):
        w = words[i]
        # Stop at a street suffix or number
        if w.lower() in _STREET_SUFFIXES or re.match(r"^\d+$", w):
            split_idx = i + 1
            break
        city_words.insert(0, w)
    else:
        # No street suffix or number found — fall back to taking last word(s)
        # Use regex: last sequence of uppercase-starting words
        city_match = re.search(r"([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)\s*$", text)
        if city_match:
            return city_match.group(1).strip(), text[:city_match.start()].strip().rstrip(",").strip()
        return "", text

    if not city_words:
        return "", text

    city = " ".join(city_words)
    address = " ".join(words[:split_idx]).strip().rstrip(",").strip()
    return city, address


def _normalize_whitespace(text: str) -> str:
    """Replace non-breaking spaces and other Unicode whitespace with regular spaces."""
    # \xa0 = &nbsp;, also handle other Unicode spaces
    return re.sub(r'[\xa0\u2000-\u200a\u202f\u205f\u3000]+', ' ', text).strip()


def _extract_manufacturer_parts(mfr_raw: str) -> Tuple[str, str, str]:
    """
    Split a TDHCA manufacturer string into (name, address, city_state_zip).

    Handles all observed TDHCA formats:
    - "MHDMAN00000039BRIGADIER HOMES A U.S. HOME COMPANY1001 SOUTH LOOP 340WACO, TX 76710"
    - "MHDMAN00000039 BRIGADIER HOMES A U.S. HOME COMPANY 1001 SOUTH LOOP 340 WACO, TX 76710"
    - "CHAMPION HOME BUILDERS"  (no address)
    - "MHDMAN00000042 CHAMPION HOME BUILDERS INC 7233 CHURCH ST MIDDLEBURG, FL 32068"
    """
    if not mfr_raw:
        return "", "", ""

    # Normalize whitespace: TDHCA pages use &nbsp; extensively AND the manufacturer
    # value often contains newlines with excessive whitespace:
    #   "MHDMAN00000039\n         BRIGADIER HOMES A U.S. HOME COMPANY\n         1001 SOUTH LOOP 340\n        \n         WACO, \n        TX\n         76710"
    mfr_raw = _normalize_whitespace(mfr_raw)
    # Collapse newlines + surrounding whitespace into single spaces
    mfr_raw = re.sub(r'\s*\n\s*', ' ', mfr_raw).strip()
    # Collapse multiple spaces
    mfr_raw = re.sub(r'\s{2,}', ' ', mfr_raw).strip()

    # Remove TDHCA manufacturer code prefix (e.g. "MHDMAN00000039")
    mfr_clean = re.sub(r"^MHD\w*\d+\s*", "", mfr_raw).strip()
    if not mfr_clean:
        return "", "", ""

    name = mfr_clean
    address = ""
    city_state_zip = ""

    # Normalize compact strings: "COMPANY1001" → "COMPANY 1001", "340WACO" → "340 WACO"
    mfr_clean = re.sub(r"([A-Za-z])(\d{3,})", r"\1 \2", mfr_clean)
    mfr_clean = re.sub(r"(\d)([A-Z]{2,}\b)", r"\1 \2", mfr_clean)
    # Fix "TX76710" → "TX 76710"
    mfr_clean = re.sub(r"([A-Z]{2})(\d{5})", r"\1 \2", mfr_clean)

    # Try to find address (starts with street number, at least 3 digits)
    addr_match = re.search(r"(\d{1,6}\s+.+)$", mfr_clean)
    if not addr_match:
        return name, "", ""

    name = mfr_clean[:addr_match.start()].strip()
    full_addr = addr_match.group(1).strip()

    # Normalize remaining compacted parts within address
    full_addr = re.sub(r"(\d)([A-Z][a-z]{2,})", r"\1 \2", full_addr)
    full_addr = re.sub(r"(\d)([A-Z]{2,}\b)", r"\1 \2", full_addr)
    full_addr = re.sub(r"([A-Z]{2})(\d{5})", r"\1 \2", full_addr)

    # ═══ Strategy 1: Comma-delimited "..., STATE ZIP" ═══
    # e.g. "7233 CHURCH ST MIDDLEBURG, FL 32068"
    csz_match = re.search(r",\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*$", full_addr)
    if csz_match:
        before_comma = full_addr[:csz_match.start()].strip()
        state = csz_match.group(1)
        zipcode = csz_match.group(2)
        city, address = _split_city_from_street(before_comma)
        city_state_zip = f"{city}, {state} {zipcode}" if city else f"{state} {zipcode}"
    else:
        # ═══ Strategy 2: No comma — "... STATE ZIP" ═══
        # e.g. after normalization: "1001 SOUTH LOOP 340 WACO TX 76710"
        state_zip = re.search(r"([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*$", full_addr)
        if not state_zip:
            return name, full_addr, ""

        before_state = full_addr[:state_zip.start()].strip().rstrip(",").strip()
        state = state_zip.group(1)
        zipcode = state_zip.group(2)
        city, address = _split_city_from_street(before_state)
        city_state_zip = f"{city}, {state} {zipcode}" if city else f"{state} {zipcode}"

    # Guardrails: avoid obviously broken values
    if re.fullmatch(r"\d{5}(?:-\d{4})?", address or ""):
        address = ""
    if (address or "").lower() in _BAD_VALUES:
        address = ""

    return name, address, city_state_zip


def _strip_address_from_name(text: str) -> str:
    """
    Strip street address from a name string that was collapsed onto one line.

    TDHCA owner cells contain name + address:
      "GERALD D. JANKE KAREN J. JANKE 12027 CR 4153 TYLER, TX 75704"
    We want just the name(s): "GERALD D. JANKE KAREN J. JANKE"

    Strategy: find the first occurrence of a street number (digit sequence followed
    by a word) that looks like an address start, and truncate there.
    """
    if not text:
        return text
    # Match where an address typically starts: a digit sequence + space + word
    # that's preceded by a space (not at the very start of the string).
    # E.g. " 12027 CR " or " 1001 SOUTH "
    m = re.search(r'\s+(\d{3,})\s+(?:[A-Z])', text)
    if m:
        truncated = text[:m.start()].strip()
        if len(truncated) > 3:
            return truncated
    return text


# ═══════════════════════════════════════════════════════════════════════════════
# STRUCTURED OUTPUT BUILDER
# ═══════════════════════════════════════════════════════════════════════════════

def normalize_title_fields(title_data: Dict[str, str], page_text: str) -> Dict[str, str]:
    """
    Final normalization pass: extra regex fallbacks, bad value cleanup.
    Called by build_structured_tdhca_data as a safety net.
    """
    data = dict(title_data)

    # ── CRITICAL: Clean the page_text before using for regex fallbacks ──
    # The page_text passed here may still contain navigation garbage
    # ("Detail", "Previous Owners", "Report", "Records") from the caller.
    clean_text = _clean_page_text(page_text)

    # Extra regex fallbacks for fields that might still be missing
    regex_fallbacks = [
        ("Serial #",    r"Serial\s*#?\s*:?\s*([A-Z0-9-]{5,})"),
        ("Label/Seal#", r"Label/?Seal\s*#?\s*:?\s*([A-Z0-9-]{5,})"),
        ("Square Ftg",  r"(?:Square|Sq\.?)\s*(?:Ft(?:g|age)?|Feet)\s*:?\s*([\d,]+)"),
        ("Date Manf",   r"(?:Date\s+(?:of\s+)?)?Manf(?:acture)?\s*:?\s*(\d{1,2}/\d{4}|\d{4})"),
        ("Wind Zone",   r"Wind\s*Zone\s*:?\s*([IVX123]+)"),
        ("Year",        r"\bYear\s*:?\s*(\d{4})\b"),
    ]
    for field_key, pattern in regex_fallbacks:
        existing = (data.get(field_key) or "").strip()
        if not existing or existing.lower() in _BAD_VALUES or _SECTION_RE.match(existing):
            m = re.search(pattern, clean_text, re.IGNORECASE)
            if m:
                val = m.group(1).strip()
                if val.lower() not in _NAV_GARBAGE:
                    data[field_key] = val

    # Remove bogus serial/label values
    serial_keys = ("Serial #", "Serial", "Serial Number")
    label_keys = ("Label/Seal#", "Label/Seal", "Label/Seal Number")
    for k in serial_keys + label_keys:
        v = (data.get(k) or "").strip()
        if v.lower() in _BAD_VALUES or _SECTION_RE.match(v):
            data.pop(k, None)

    # Recover from lines if still missing
    if not any(data.get(k) for k in serial_keys):
        recovered = _recover_from_lines(clean_text, for_label=False)
        if recovered:
            data["Serial #"] = recovered

    if not any(data.get(k) for k in label_keys):
        recovered = _recover_from_lines(clean_text, for_label=True)
        if recovered:
            data["Label/Seal#"] = recovered

    return data


def _validate_wind_zone(raw_value: str) -> str:
    """
    Validate that a wind zone value is actually a wind zone (I, II, III, 1, 2, 3).
    TDHCA pages sometimes put 'Currently Installed in SMITH COUNTY' in the Wind Zone cell.
    Returns cleaned wind zone or empty string if invalid.
    """
    if not raw_value:
        return ""
    v = raw_value.strip()
    # Valid wind zones: I, II, III, 1, 2, 3
    if re.fullmatch(r"[IVX123]+", v, re.IGNORECASE):
        return v.upper()
    # Maybe "Zone II" or "Wind Zone II"
    m = re.search(r"\b([IVX123]{1,3})\b", v)
    if m and len(m.group(1)) <= 3 and m.group(1).upper() in ("I", "II", "III", "1", "2", "3"):
        return m.group(1).upper()
    return ""


def _extract_county_from_installed(text: str) -> str:
    """
    Extract county name from 'Currently Installed in XXXX County' text.
    """
    m = re.search(r"Currently\s+Installed\s+in\s+(.+?)(?:\s+County)?\s*$", text, re.IGNORECASE)
    if m:
        county = m.group(1).strip().rstrip(",").strip()
        # Remove trailing "County" if still present
        county = re.sub(r"\s+County\s*$", "", county, flags=re.IGNORECASE).strip()
        return county.upper() if county else ""
    return ""


def build_structured_tdhca_data(
    title_data: Dict[str, str],
    page_text: str,
    detail_url: str | None,
    print_url: str | None,
) -> Dict:
    """Build the structured response from raw parsed fields."""
    # Clean the page_text FIRST — the caller may pass in text that still
    # contains navigation garbage ("Detail", "Previous Owners", etc.)
    clean_text = _clean_page_text(page_text)
    normalized = normalize_title_fields(title_data, clean_text)

    # Manufacturer splitting
    mfr_raw = normalized.get("Manufacturer") or normalized.get("Manufacturer Name") or ""
    mfr_name, mfr_address, mfr_city_state_zip = _extract_manufacturer_parts(mfr_raw)

    logger.info(f"[TDHCA-struct] Manufacturer split: raw='{mfr_raw[:80]}', "
                f"name='{mfr_name}', addr='{mfr_address}', csz='{mfr_city_state_zip}'")

    # ── Fallback: if mfr_address is empty, check for standalone Address fields ──
    if not mfr_address:
        mfr_address = (
            normalized.get("Address")
            or normalized.get("Mfg Address")
            or normalized.get("Manufacturer Address")
            or ""
        )
        logger.info(f"[TDHCA-struct] Address fallback from raw fields: '{mfr_address}'")

    if not mfr_city_state_zip:
        mfr_city_state_zip = (
            normalized.get("City, State, Zip")
            or normalized.get("City State Zip")
            or normalized.get("City, State")
            or ""
        )
        # Also try composing from separate City + State + Zip fields
        if not mfr_city_state_zip:
            city = normalized.get("City") or ""
            state = normalized.get("State") or ""
            zipcode = normalized.get("Zip") or normalized.get("Zip Code") or ""
            if city or state or zipcode:
                parts = []
                if city:
                    parts.append(city)
                if state:
                    parts.append(f", {state}" if parts else state)
                if zipcode:
                    parts.append(f" {zipcode}" if parts else zipcode)
                mfr_city_state_zip = "".join(parts)
        logger.info(f"[TDHCA-struct] City/State/Zip fallback: '{mfr_city_state_zip}'")

    # Size / dimensions
    size_raw = normalized.get("Size") or normalized.get("Size*") or ""
    home_width = ""
    home_length = ""
    if size_raw:
        sm = re.match(r"(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)", size_raw)
        if sm:
            home_width = sm.group(1)
            home_length = sm.group(2)

    # ── Dimensions: try separate Width/Length first (real TDHCA uses these) ──
    # The real TDHCA page has "Width": "14", "Length": "50" as SEPARATE fields
    # from the Sections table, not combined as "Size: 14 X 50".
    if not home_width:
        home_width = normalized.get("Width") or ""
    if not home_length:
        home_length = normalized.get("Length") or ""

    # Prefer section-specific values
    section1_serial = (
        normalized.get("Section 1 Serial")
        or normalized.get("Complete Serial Number")
        or normalized.get("Serial #")
        or normalized.get("Serial")
        or normalized.get("Serial Number")
    )
    section1_label = (
        normalized.get("Section 1 Label/Seal")
        or normalized.get("Label/Seal#")
        or normalized.get("Label/Seal")
        or normalized.get("Label/Seal #")
        or normalized.get("Label/Seal Number")
        or normalized.get("Label")  # Real TDHCA uses just "Label" as header
    )
    section1_size = normalized.get("Section 1 Size") or size_raw
    if section1_size:
        sm = re.match(r"(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)", section1_size)
        if sm:
            home_width = sm.group(1)
            home_length = sm.group(2)

    # Date of manufacture — try multiple sources
    # The REAL TDHCA page uses "Manufacture Date", "Date of Sale", "Date of Certificate"
    date_manf = (
        normalized.get("Date Manf")
        or normalized.get("Date of Manufacture")
        or normalized.get("Date Manufactured")
        or normalized.get("Date Mfg")
        or normalized.get("Mfg Date")
        or normalized.get("Manufacture Date")  # Real TDHCA field name
    )
    # Also try extracting year from date patterns in clean text
    if not date_manf:
        dm = re.search(
            r"(?:Date\s+(?:of\s+)?)?Man[u]?f(?:acture)?d?\s*:?\s*(\d{1,2}/\d{2,4}|\d{4})",
            clean_text, re.IGNORECASE
        )
        if dm:
            date_manf = dm.group(1).strip()
    # Fallback: try "Date of Sale" for the year (real TDHCA has this)
    if not date_manf:
        date_manf = normalized.get("Date of Sale") or ""

    # ── Wind Zone: validate it's an actual wind zone value ──
    raw_wind = normalized.get("Wind Zone") or ""
    wind_zone = _validate_wind_zone(raw_wind)

    # ── County: try multiple sources including "Currently Installed in..." text ──
    # CRITICAL: The raw "County" field from table parsing is often GARBAGE because
    # the TDHCA sidebar navigation gets captured as the County value.
    # We validate: a real county name should be < 30 chars and only letters/spaces.
    county_raw = normalized.get("County") or ""
    county = ""
    if county_raw and len(county_raw) < 40 and re.fullmatch(r"[A-Za-z ]+", county_raw.strip()):
        county = county_raw.strip().upper()
    else:
        if county_raw:
            logger.info(f"[TDHCA-struct] Rejecting County value (too long or invalid): '{county_raw[:60]}...'")
    if not county:
        # Check if Wind Zone field contained county info
        county_from_wind = _extract_county_from_installed(raw_wind)
        if county_from_wind:
            county = county_from_wind
            logger.info(f"[TDHCA-struct] County extracted from Wind Zone text: '{county}'")
    if not county:
        # Check for "Currently Installed in" as a standalone field
        installed_in = normalized.get("Currently Installed in") or normalized.get("Currently Installed In") or ""
        if installed_in:
            county = installed_in.replace("County", "").strip().upper()
    # Also try regex from clean text
    if not county:
        cm = re.search(r"Currently\s+Installed\s+in\s+([A-Z][A-Za-z ]+?)(?:\s+County)?\s*(?:\n|$|[,.])", clean_text, re.IGNORECASE)
        if cm:
            county = cm.group(1).strip().upper()

    # ── Ensure validated fields are also cleaned in raw_fields ──
    # This prevents the frontend from falling back to raw_fields and
    # undoing the backend's validation (e.g. Wind Zone).
    if not wind_zone and "Wind Zone" in normalized:
        # Backend validated wind_zone to "" → clean raw_fields too
        normalized["Wind Zone"] = ""
    # Ensure manufacturer_address is clean in raw_fields
    if mfr_address:
        normalized["Manufacturer Address (parsed)"] = mfr_address
    if mfr_city_state_zip:
        normalized["Manufacturer CSZ (parsed)"] = mfr_city_state_zip

    # ── Extract year from date fields ──
    # The real TDHCA page often doesn't have a "Year" field, but has dates.
    year_value = normalized.get("Year") or ""
    if not year_value and date_manf:
        # Extract year from date like "03/01/2001" or "2001"
        ym = re.search(r"(\d{4})", date_manf)
        if ym:
            year_value = ym.group(1)
    if not year_value:
        # Try "Date of Sale" or "Date of Certificate"
        for date_field in ("Date of Sale", "Date of Certificate", "Issue Date"):
            date_val = normalized.get(date_field) or ""
            ym = re.search(r"(\d{4})", date_val)
            if ym:
                year_value = ym.group(1)
                break

    # ── Buyer: real TDHCA uses "Current Owner" section, not "Buyer/Transferee" ──
    buyer_raw = (
        normalized.get("Buyer/Transferee")
        or normalized.get("Buyer")
        or normalized.get("Current Owner")
        or ""
    )
    # Clean multi-line buyer values (address lines often appended)
    if buyer_raw and '\n' in buyer_raw:
        buyer_raw = buyer_raw.split('\n')[0].strip()
    # Also strip address from single-line collapsed values (separator=' ')
    # Pattern: "NAME1 NAME2 12345 STREET CITY, ST ZIP" → take name part before street number
    buyer_raw = _strip_address_from_name(buyer_raw)

    # ── Seller: prefer table-parsed "Seller" (correct column data) over
    # "Seller/Transferor" (from regex/line-pairs that lose column structure) ──
    seller_raw = normalized.get("Seller") or normalized.get("Seller/Transferor") or ""
    if seller_raw and '\n' in seller_raw:
        seller_raw = seller_raw.split('\n')[0].strip()
    seller_raw = _strip_address_from_name(seller_raw)
    # Safety: if seller == buyer, the line-pair probably picked up the wrong person
    if seller_raw and buyer_raw and seller_raw.strip() == buyer_raw.strip():
        logger.info(f"[TDHCA-struct] Seller matches buyer — trying alternate key")
        # Try the other key
        alt = normalized.get("Seller/Transferor") if seller_raw == _strip_address_from_name(normalized.get("Seller") or "") else normalized.get("Seller")
        if alt:
            alt = _strip_address_from_name(alt.split('\n')[0].strip() if '\n' in alt else alt)
            if alt and alt.strip() != buyer_raw.strip():
                seller_raw = alt

    # ── Lien info: real TDHCA has "Lien Holder" ──
    lien_raw = (
        normalized.get("First Lien")
        or normalized.get("Lien")
        or normalized.get("Lien Holder")
        or ""
    )
    if lien_raw and '\n' in lien_raw:
        lien_raw = lien_raw.split('\n')[0].strip()
    # Reject if lien_raw looks like a date or is too short (e.g., "s" from "Liens")
    if lien_raw and (re.fullmatch(r"[\d/.-]+", lien_raw) or len(lien_raw) < 3):
        logger.info(f"[TDHCA-struct] Rejecting lien value (date or too short): '{lien_raw}'")
        lien_raw = ""

    # ── Election: real TDHCA shows "Home elected as Personal Property" in page text ──
    election = normalized.get("Election") or ""
    if not election:
        if "personal property" in clean_text.lower():
            election = "Personal Property"
        elif "real property" in clean_text.lower():
            election = "Real Property"

    # ── Final safety: scrub any remaining nav garbage from all values ──
    def _scrub(val: str | None) -> str | None:
        if val is None:
            return None
        v = val.strip()
        if v.lower() in _NAV_GARBAGE:
            return None
        # Also reject values that are too long (likely captured nav text)
        if len(v) > 200:
            logger.info(f"[TDHCA-struct] Rejecting value (too long, {len(v)} chars): '{v[:60]}...'")
            return None
        return v or None

    # ── Certificate validation: must contain at least one digit ──
    cert_raw = (
        normalized.get("Certificate #")
        or normalized.get("Certificate")
        or normalized.get("Certificate Number")
    )
    cert = _scrub(cert_raw)
    if cert and not re.search(r"\d", cert):
        logger.info(f"[TDHCA-struct] Rejecting certificate '{cert}' (no digits)")
        cert = None

    # ── County validation: must not be a generic word ──
    if county and county.lower() in _NAV_GARBAGE:
        county = ""

    return {
        "raw_fields": normalized,
        "detail_url": sanitize_tdhca_url(detail_url),
        "print_url": sanitize_tdhca_url(print_url),
        "certificate_number": cert,
        "manufacturer": mfr_name or mfr_raw,
        "manufacturer_address": mfr_address,
        "manufacturer_city_state_zip": mfr_city_state_zip,
        "model": _scrub(normalized.get("Model") or normalized.get("Make")),
        "year": _scrub(year_value or date_manf),
        "date_of_manufacture": _scrub(date_manf),
        "serial_number": _scrub(section1_serial),
        "label_seal": _scrub(section1_label),
        "square_feet": _scrub(
            normalized.get("Square Ftg")
            or normalized.get("Square Feet")
            or normalized.get("Sq Ftg")
            or normalized.get("Total Square Feet")
        ),
        "wind_zone": wind_zone,
        "width": home_width,
        "length": home_length,
        "seller": _scrub(seller_raw),
        "buyer": _scrub(buyer_raw),
        "county": county,
        "issue_date": _scrub(normalized.get("Issue Date")),
        "transfer_date": _scrub(
            normalized.get("Transfer/Sale Date")
            or normalized.get("Transfer Date")
            or normalized.get("Sale Date")
            or normalized.get("Date of Sale")  # Real TDHCA field name
        ),
        "lien_info": _scrub(lien_raw),
        "election": _scrub(election),
    }
