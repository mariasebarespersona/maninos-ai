import re
from typing import Dict, Tuple


_BAD_VALUES = {
    "weight",
    "size",
    "label/seal",
    "label/seal#",
    "serial",
    "serial#",
    "serial #",
    "n/a",
    "na",
    "-",
}


def sanitize_tdhca_url(url: str | None) -> str | None:
    if not url:
        return url
    return re.sub(r";jsessionid=[^?]*", "", url, flags=re.IGNORECASE)


def _extract_manufacturer_parts(mfr_raw: str) -> Tuple[str, str, str]:
    if not mfr_raw:
        return "", "", ""

    # Remove TDHCA manufacturer code prefix, e.g. MHDMAN00000039
    mfr_clean = re.sub(r"^MHD\w*\d+\s*", "", mfr_raw).strip()
    if not mfr_clean:
        return "", "", ""

    name = mfr_clean
    address = ""
    city_state_zip = ""

    # Split "NAME ... 1001 SOUTH LOOP 340 WACO, TX 76710"
    addr_match = re.search(r"(\d{3,}.+)$", mfr_clean)
    if not addr_match:
        return name, "", ""

    name = mfr_clean[: addr_match.start()].strip()
    full_addr = addr_match.group(1).strip()

    # Normalize no-space cases like "...340WACO, TX 76710"
    full_addr = re.sub(r"(\d)([A-Z][a-z]{2,})", r"\1 \2", full_addr)

    state_zip = re.search(r"([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*$", full_addr)
    if not state_zip:
        return name, full_addr, ""

    before_state = full_addr[: state_zip.start()].strip().rstrip(",").strip()
    state = state_zip.group(1)
    zipcode = state_zip.group(2)

    # City at the tail of "before_state"
    city_match = re.search(r"([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)\s*$", before_state)
    if city_match:
        city = city_match.group(1).strip()
        address = before_state[: city_match.start()].strip().rstrip(",").strip()
        city_state_zip = f"{city}, {state} {zipcode}"
    else:
        address = before_state
        city_state_zip = f"{state} {zipcode}"

    return name, address, city_state_zip


def _recover_serial_or_label(page_text: str, for_label: bool) -> str:
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
        good = [c for c in candidates if c.lower() not in _BAD_VALUES]
        if good:
            return good[0]
    return ""


def normalize_title_fields(title_data: Dict[str, str], page_text: str) -> Dict[str, str]:
    data = dict(title_data)

    # Regex fallbacks for common fields.
    regex_fallbacks = [
        ("Serial #", r"Serial\s*#?\s*:?\s*([A-Z0-9-]{5,})"),
        ("Label/Seal#", r"Label/?Seal\s*#?\s*:?\s*([A-Z0-9-]{5,})"),
        ("Square Ftg", r"(?:Square|Sq\.?)\s*(?:Ft(?:g|age)?|Feet)\s*:?\s*([\d,]+)"),
        ("Date Manf", r"(?:Date\s+(?:of\s+)?)?Manf(?:acture)?\s*:?\s*(\d{1,2}/\d{4}|\d{4})"),
        ("Wind Zone", r"Wind\s*Zone\s*:?\s*([IVX123]+)"),
        ("Year", r"\bYear\s*:?\s*(\d{4})\b"),
    ]
    for field_key, pattern in regex_fallbacks:
        if not data.get(field_key):
            m = re.search(pattern, page_text, re.IGNORECASE)
            if m:
                data[field_key] = m.group(1).strip()

    # Remove bogus serial/label values captured from table headers.
    serial_keys = ("Serial #", "Serial", "Serial Number")
    label_keys = ("Label/Seal#", "Label/Seal", "Label/Seal Number")
    for k in serial_keys + label_keys:
        v = (data.get(k) or "").strip().lower()
        if v in _BAD_VALUES:
            data.pop(k, None)

    # Recover serial/label from lines when missing.
    if not any(data.get(k) for k in serial_keys):
        recovered = _recover_serial_or_label(page_text, for_label=False)
        if recovered:
            data["Serial #"] = recovered

    if not any(data.get(k) for k in label_keys):
        recovered = _recover_serial_or_label(page_text, for_label=True)
        if recovered:
            data["Label/Seal#"] = recovered

    return data


def build_structured_tdhca_data(
    title_data: Dict[str, str],
    page_text: str,
    detail_url: str | None,
    print_url: str | None,
) -> Dict[str, str]:
    normalized = normalize_title_fields(title_data, page_text)

    mfr_raw = normalized.get("Manufacturer", "")
    mfr_name, mfr_address, mfr_city_state_zip = _extract_manufacturer_parts(mfr_raw)

    size_raw = normalized.get("Size") or normalized.get("Size*") or ""
    home_width = ""
    home_length = ""
    if size_raw:
        sm = re.match(r"(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)", size_raw)
        if sm:
            home_width = sm.group(1)
            home_length = sm.group(2)

    return {
        "raw_fields": normalized,
        "detail_url": sanitize_tdhca_url(detail_url),
        "print_url": sanitize_tdhca_url(print_url),
        "certificate_number": normalized.get("Certificate #")
        or normalized.get("Certificate")
        or normalized.get("Certificate Number"),
        "manufacturer": mfr_name or mfr_raw,
        "manufacturer_address": mfr_address,
        "manufacturer_city_state_zip": mfr_city_state_zip,
        "model": normalized.get("Model"),
        "year": normalized.get("Date Manf")
        or normalized.get("Year")
        or normalized.get("Date of Manufacture"),
        "serial_number": normalized.get("Serial #")
        or normalized.get("Serial")
        or normalized.get("Serial Number"),
        "label_seal": normalized.get("Label/Seal#")
        or normalized.get("Label/Seal")
        or normalized.get("Label/Seal #")
        or normalized.get("Label/Seal Number"),
        "square_feet": normalized.get("Square Ftg")
        or normalized.get("Square Feet")
        or normalized.get("Sq Ftg"),
        "wind_zone": normalized.get("Wind Zone"),
        "width": home_width,
        "length": home_length,
        "seller": normalized.get("Seller/Transferor") or normalized.get("Seller"),
        "buyer": normalized.get("Buyer/Transferee") or normalized.get("Buyer"),
        "county": normalized.get("County"),
        "issue_date": normalized.get("Issue Date"),
        "transfer_date": normalized.get("Transfer/Sale Date") or normalized.get("Transfer Date"),
        "lien_info": normalized.get("First Lien") or normalized.get("Lien"),
        "election": normalized.get("Election"),
    }


