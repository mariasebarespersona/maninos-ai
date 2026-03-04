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
_HEADER_HINTS = ("serial", "label", "seal", "weight", "size", "section")

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

    # ── Strategy 1: Parse HTML tables ──
    _parse_tables(soup, title_data)
    logger.info(f"[TDHCA-parser] After tables: {list(title_data.keys())}")

    # ── Clean page text for strategies 2 & 3: remove nav-only lines ──
    clean_text = _clean_page_text(page_text)

    # ── Strategy 2: Regex extraction from cleaned text ──
    _extract_regex_fields(clean_text, title_data)
    logger.info(f"[TDHCA-parser] After regex: {list(title_data.keys())}")

    # ── Strategy 3: Label\nValue line pairs from cleaned text ──
    _extract_label_value_pairs(clean_text, title_data)
    logger.info(f"[TDHCA-parser] After line-pairs: {list(title_data.keys())}")

    # ── Cleanup: remove nav garbage that slipped through + serial/label ──
    _cleanup_nav_garbage(title_data)
    _cleanup_serial_label(page_text, title_data)

    logger.info(f"[TDHCA-parser] Final fields ({len(title_data)}): "
                f"{dict((k, v[:60] if isinstance(v, str) and len(v) > 60 else v) for k, v in title_data.items())}")
    return title_data


def _strip_nav_elements(soup) -> None:
    """Remove navigation links and non-data elements from the soup BEFORE parsing."""
    for link in soup.find_all('a'):
        text = link.get_text(strip=True).lower()
        # Remove links whose ENTIRE text is a nav term
        if text in _NAV_GARBAGE:
            link.decompose()

    # Also remove <script>, <style>, <nav>, <header>, <footer>
    for tag_name in ('script', 'style', 'nav', 'header', 'footer'):
        for tag in soup.find_all(tag_name):
            tag.decompose()


def _clean_page_text(page_text: str) -> str:
    """Remove lines that consist solely of navigation/chrome terms."""
    clean_lines = []
    for line in page_text.splitlines():
        stripped = line.strip().lower()
        if stripped in _NAV_GARBAGE:
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

            row_texts = [c.get_text(separator=' ').strip().rstrip(':') for c in cells]

            # Detect header-like <td> rows (≥50% of cells contain header keywords)
            header_cell_count = sum(1 for t in row_texts if any(h in t.lower() for h in _HEADER_HINTS))
            is_header_like_td_row = (
                all_td
                and len(row_texts) > 2
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
    first_text = cells[0].get_text(separator=' ').strip() if cells else ""
    m_sec = re.search(r"section\s*(\d+)", first_text, re.IGNORECASE)
    section_idx = m_sec.group(1) if m_sec else None

    # If this is a "Section N" label row with empty remaining cells, skip it
    if _SECTION_RE.match(first_text):
        has_real_data = any(c.get_text(separator=' ').strip() for c in cells[1:])
        if not has_real_data:
            return  # Empty section label row — skip

    for header, cell in zip(headers, cells):
        val = cell.get_text(separator=' ').strip()
        if not header or not val or len(header) >= 60:
            continue

        # Skip section labels and bad values
        if _SECTION_RE.match(val) or val.lower() in _BAD_VALUES:
            continue

        existing = (title_data.get(header) or "").strip()
        # Overwrite if empty, bad, or a section label
        if not existing or existing.lower() in _BAD_VALUES or _SECTION_RE.match(existing):
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
        key = cells[i].get_text(separator=' ').strip().rstrip(':')
        val = cells[i + 1].get_text(separator=' ').strip()
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
    ("County",              rf"\bCounty\s*:?\s*([A-Z][A-Za-z ]+?)(?=\s+{_FIELD_BOUNDARY}\b|\s*[,\n]|\s*$|\d)",  0),
    ("Issue Date",          r"Issue\s+Date\s*:?\s*([\d/.-]+)",                                                  re.IGNORECASE),
    ("Transfer/Sale Date",  r"(?:Transfer|Sale)\s*/?(?:Sale)?\s*Date\s*:?\s*([\d/.-]+)",                        re.IGNORECASE),
    ("First Lien",          rf"(?:First\s+)?Lien(?:holder)?\s*:?\s*(.+?)(?=\s+{_FIELD_BOUNDARY}\b|\s*\n|\s*$)", re.IGNORECASE),
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


# ═══════════════════════════════════════════════════════════════════════════════
# STRUCTURED OUTPUT BUILDER
# ═══════════════════════════════════════════════════════════════════════════════

def normalize_title_fields(title_data: Dict[str, str], page_text: str) -> Dict[str, str]:
    """
    Final normalization pass: extra regex fallbacks, bad value cleanup.
    Called by build_structured_tdhca_data as a safety net.
    """
    data = dict(title_data)

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
            m = re.search(pattern, page_text, re.IGNORECASE)
            if m:
                data[field_key] = m.group(1).strip()

    # Remove bogus serial/label values
    serial_keys = ("Serial #", "Serial", "Serial Number")
    label_keys = ("Label/Seal#", "Label/Seal", "Label/Seal Number")
    for k in serial_keys + label_keys:
        v = (data.get(k) or "").strip()
        if v.lower() in _BAD_VALUES or _SECTION_RE.match(v):
            data.pop(k, None)

    # Recover from lines if still missing
    if not any(data.get(k) for k in serial_keys):
        recovered = _recover_from_lines(page_text, for_label=False)
        if recovered:
            data["Serial #"] = recovered

    if not any(data.get(k) for k in label_keys):
        recovered = _recover_from_lines(page_text, for_label=True)
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
    normalized = normalize_title_fields(title_data, page_text)

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
    )
    section1_size = normalized.get("Section 1 Size") or size_raw
    if section1_size:
        sm = re.match(r"(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)", section1_size)
        if sm:
            home_width = sm.group(1)
            home_length = sm.group(2)

    # Date of manufacture — try multiple sources
    date_manf = (
        normalized.get("Date Manf")
        or normalized.get("Date of Manufacture")
        or normalized.get("Date Manufactured")
        or normalized.get("Date Mfg")
        or normalized.get("Mfg Date")
    )
    # Also try extracting year from date patterns in page text
    if not date_manf:
        # Look for patterns like "Date Manf 01/1999" or "Date of Manufacture: 1999"
        dm = re.search(
            r"(?:Date\s+(?:of\s+)?)?Man[u]?f(?:acture)?d?\s*:?\s*(\d{1,2}/\d{2,4}|\d{4})",
            page_text, re.IGNORECASE
        )
        if dm:
            date_manf = dm.group(1).strip()

    # ── Wind Zone: validate it's an actual wind zone value ──
    raw_wind = normalized.get("Wind Zone") or ""
    wind_zone = _validate_wind_zone(raw_wind)

    # ── County: try multiple sources including "Currently Installed in..." text ──
    county = normalized.get("County") or ""
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
    # Also try regex from page text
    if not county:
        cm = re.search(r"Currently\s+Installed\s+in\s+([A-Z][A-Za-z ]+?)(?:\s+County)?\s*(?:\n|$|[,.])", page_text, re.IGNORECASE)
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

    # ── Final safety: scrub any remaining nav garbage from all values ──
    def _scrub(val: str | None) -> str | None:
        if val is None:
            return None
        v = val.strip()
        if v.lower() in _NAV_GARBAGE:
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
        "year": _scrub(date_manf or normalized.get("Year")),
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
        "seller": _scrub(normalized.get("Seller/Transferor") or normalized.get("Seller")),
        "buyer": _scrub(normalized.get("Buyer/Transferee") or normalized.get("Buyer")),
        "county": county,
        "issue_date": _scrub(normalized.get("Issue Date")),
        "transfer_date": _scrub(
            normalized.get("Transfer/Sale Date")
            or normalized.get("Transfer Date")
            or normalized.get("Sale Date")
        ),
        "lien_info": _scrub(normalized.get("First Lien") or normalized.get("Lien")),
        "election": _scrub(normalized.get("Election")),
    }
