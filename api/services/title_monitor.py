"""
Title Monitor Service
Checks TDHCA for title name changes on purchased properties.

Flow:
1. Find title_transfers where next_tdhca_check <= now AND title_name_updated = FALSE
2. For each, look up the serial number on TDHCA
3. Compare the TDHCA buyer/transferee name with the transfer's to_name
4. Update the transfer record with results
"""

import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


def _normalize_name(name: str) -> str:
    """Normalize a name for comparison (lowercase, strip whitespace/punctuation)."""
    import re
    if not name:
        return ""
    return re.sub(r'[^a-z0-9\s]', '', name.lower()).strip()


def _names_match(tdhca_name: str, expected_name: str) -> bool:
    """Check if the TDHCA owner name matches the expected name (fuzzy)."""
    a = _normalize_name(tdhca_name)
    b = _normalize_name(expected_name)
    if not a or not b:
        return False
    # Exact match
    if a == b:
        return True
    # One contains the other
    if a in b or b in a:
        return True
    # Check if all words in expected appear in TDHCA name
    b_words = set(b.split())
    a_words = set(a.split())
    if b_words and b_words.issubset(a_words):
        return True
    return False


def populate_tdhca_fields_from_document_data(transfer_id: str) -> dict:
    """
    Populate tdhca_serial/tdhca_label on a transfer from the property's
    document_data (title application form).
    Returns {"ok": bool, "serial": str, "label": str}
    """
    from tools.supabase_client import sb

    # Get transfer with property
    transfer = sb.table("title_transfers").select(
        "id, property_id, tdhca_serial, tdhca_label, transfer_type"
    ).eq("id", transfer_id).single().execute()

    if not transfer.data:
        return {"ok": False, "error": "Transfer not found"}

    t = transfer.data

    # Already has serial — skip
    if t.get("tdhca_serial"):
        return {"ok": True, "serial": t["tdhca_serial"], "label": t.get("tdhca_label", "")}

    # Get property document_data
    prop = sb.table("properties").select(
        "id, document_data"
    ).eq("id", t["property_id"]).single().execute()

    if not prop.data or not prop.data.get("document_data"):
        return {"ok": False, "error": "No document_data on property"}

    doc_data = prop.data["document_data"]

    # Look in title_app_purchase or title_app_sale depending on transfer type
    key = f"title_app_{t['transfer_type']}"
    title_app = doc_data.get(key, {})

    # Try multiple field names for serial/label
    serial = (
        title_app.get("section1_serial") or
        title_app.get("serial_number") or
        title_app.get("page2_serial") or
        ""
    )
    label = (
        title_app.get("section1_label") or
        title_app.get("label_seal_number") or
        title_app.get("page2_hud_label") or
        ""
    )

    if not serial and not label:
        return {"ok": False, "error": f"No serial/label in document_data[{key}]"}

    # Save to transfer and set next check to 30 days from now
    update = {}
    if serial:
        update["tdhca_serial"] = serial
    if label:
        update["tdhca_label"] = label
    if not t.get("tdhca_serial"):
        update["next_tdhca_check"] = (datetime.utcnow() + timedelta(days=30)).isoformat()

    sb.table("title_transfers").update(update).eq("id", transfer_id).execute()

    return {"ok": True, "serial": serial, "label": label}


async def check_single_transfer(transfer_id: str) -> dict:
    """
    Check TDHCA for a single transfer. Returns result dict.
    Uses the existing TDHCA scraper from market_listings.
    """
    from tools.supabase_client import sb

    transfer = sb.table("title_transfers").select(
        "id, tdhca_serial, tdhca_label, to_name, tdhca_owner_name, title_name_updated, tdhca_check_count"
    ).eq("id", transfer_id).single().execute()

    if not transfer.data:
        return {"ok": False, "error": "Transfer not found"}

    t = transfer.data
    serial = t.get("tdhca_serial", "")
    label = t.get("tdhca_label", "")

    if not serial and not label:
        return {"ok": False, "error": "No serial/label to look up"}

    if t.get("title_name_updated"):
        return {"ok": True, "already_updated": True, "tdhca_owner": t.get("tdhca_owner_name")}

    # Do the TDHCA lookup using Playwright
    try:
        from playwright.async_api import async_playwright
        from bs4 import BeautifulSoup
        import asyncio

        search_type = "serial" if serial else "label"
        search_value = serial or label

        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            page = await browser.new_page()

            await page.goto(
                "https://mhweb.tdhca.state.tx.us/mhweb/title_view.jsp",
                wait_until='domcontentloaded',
                timeout=30000
            )

            if search_type == 'serial':
                await page.fill('input[name="serial"]', search_value)
            else:
                await page.fill('input[name="label"]', search_value)

            await page.click('input[type="submit"], button[type="submit"]')
            await page.wait_for_load_state('domcontentloaded', timeout=15000)
            await asyncio.sleep(2)

            content = await page.content()

            # Check for no results
            no_records = ['No records', 'no records', 'total_rec" value="0"', '0 records']
            if any(ind in content for ind in no_records):
                await browser.close()
                # Update check timestamp
                sb.table("title_transfers").update({
                    "last_tdhca_check": datetime.utcnow().isoformat(),
                    "next_tdhca_check": (datetime.utcnow() + timedelta(days=30)).isoformat(),
                    "tdhca_check_count": (t.get("tdhca_check_count") or 0) + 1,
                }).eq("id", transfer_id).execute()
                return {"ok": True, "found": False, "message": "No TDHCA records found"}

            # Try to navigate to detail page if on results page
            url_lower = page.url.lower()
            if 'title_detail' not in url_lower and 'titledetail' not in url_lower:
                detail_link = page.locator(
                    'table td a[href*="title_detail"], table td a[href*="titleDetail"], '
                    'table td a[href*="certnum"], a[href*="title_detail"]'
                )
                if await detail_link.count() > 0:
                    await detail_link.first.click()
                    await page.wait_for_load_state('domcontentloaded', timeout=15000)
                    await asyncio.sleep(2)
                    content = await page.content()

            await browser.close()

            # Parse the page to extract buyer name
            from api.utils.tdhca_parser import parse_tdhca_detail_page
            soup = BeautifulSoup(content, 'html.parser')
            page_text = soup.get_text('\n', strip=True)
            title_data = parse_tdhca_detail_page(soup, page_text)

            tdhca_owner = (
                title_data.get("buyer_transferee") or
                title_data.get("buyer") or
                title_data.get("transferee") or
                ""
            )

            # Compare names
            expected_name = t.get("to_name", "")
            matched = _names_match(tdhca_owner, expected_name)

            # Update transfer
            now = datetime.utcnow()
            update = {
                "tdhca_owner_name": tdhca_owner,
                "last_tdhca_check": now.isoformat(),
                "tdhca_check_count": (t.get("tdhca_check_count") or 0) + 1,
                "title_name_updated": matched,
            }
            if not matched:
                update["next_tdhca_check"] = (now + timedelta(days=30)).isoformat()
            else:
                update["next_tdhca_check"] = None

            sb.table("title_transfers").update(update).eq("id", transfer_id).execute()

            return {
                "ok": True,
                "found": True,
                "tdhca_owner": tdhca_owner,
                "expected_owner": expected_name,
                "matched": matched,
                "check_count": update["tdhca_check_count"],
            }

    except Exception as e:
        logger.error(f"[title_monitor] Error checking transfer {transfer_id}: {e}")
        # Still update timestamps so we don't retry immediately
        sb.table("title_transfers").update({
            "last_tdhca_check": datetime.utcnow().isoformat(),
            "next_tdhca_check": (datetime.utcnow() + timedelta(days=30)).isoformat(),
            "tdhca_check_count": (t.get("tdhca_check_count") or 0) + 1,
        }).eq("id", transfer_id).execute()
        return {"ok": False, "error": str(e)}


def run_title_monitor_job() -> dict:
    """
    Cron job entry point: find all transfers due for a TDHCA check and process them.
    Runs synchronously (APScheduler wrapper handles async).
    """
    import asyncio

    try:
        from tools.supabase_client import sb

        # First, populate serial/label from document_data for transfers missing them
        missing = sb.table("title_transfers").select("id").is_(
            "tdhca_serial", "null"
        ).eq("title_name_updated", False).execute()

        populated = 0
        for row in (missing.data or []):
            result = populate_tdhca_fields_from_document_data(row["id"])
            if result.get("ok") and result.get("serial"):
                populated += 1

        # Now find transfers due for a check
        now = datetime.utcnow().isoformat()
        due = sb.table("title_transfers").select("id").lte(
            "next_tdhca_check", now
        ).eq("title_name_updated", False).not_.is_(
            "tdhca_serial", "null"
        ).execute()

        if not due.data:
            return {"ok": True, "populated": populated, "checked": 0, "matched": 0}

        async def _check_all():
            results = []
            for row in due.data:
                r = await check_single_transfer(row["id"])
                results.append(r)
            return results

        # Run async checks
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                results = pool.submit(asyncio.run, _check_all()).result()
        else:
            results = asyncio.run(_check_all())

        matched = sum(1 for r in results if r.get("matched"))
        checked = len(results)

        return {
            "ok": True,
            "populated": populated,
            "checked": checked,
            "matched": matched,
            "errors": sum(1 for r in results if not r.get("ok")),
        }

    except Exception as e:
        logger.error(f"[title_monitor] Job error: {e}")
        return {"ok": False, "error": str(e)}


def get_title_monitor_summary() -> dict:
    """Get a summary of title monitoring status for the dashboard."""
    from tools.supabase_client import sb

    # Fetch transfers with serial OR label (either one allows monitoring)
    serial_transfers = sb.table("title_transfers").select(
        "id, property_id, transfer_type, to_name, status, "
        "tdhca_serial, tdhca_label, tdhca_owner_name, title_name_updated, "
        "last_tdhca_check, next_tdhca_check, tdhca_check_count, "
        "created_at"
    ).not_.is_("tdhca_serial", "null").execute()

    label_transfers = sb.table("title_transfers").select(
        "id, property_id, transfer_type, to_name, status, "
        "tdhca_serial, tdhca_label, tdhca_owner_name, title_name_updated, "
        "last_tdhca_check, next_tdhca_check, tdhca_check_count, "
        "created_at"
    ).is_("tdhca_serial", "null").not_.is_("tdhca_label", "null").execute()

    # Merge both sets (serial transfers + label-only transfers)
    seen_ids = set()
    transfers = []
    for t in (serial_transfers.data or []) + (label_transfers.data or []):
        if t["id"] not in seen_ids:
            seen_ids.add(t["id"])
            transfers.append(t)

    updated = [t for t in transfers if t.get("title_name_updated")]
    pending = [t for t in transfers if not t.get("title_name_updated")]
    never_checked = [t for t in transfers if not t.get("last_tdhca_check")]

    # Also count transfers without serial AND without label (not yet populated)
    no_serial = sb.table("title_transfers").select(
        "id", count="exact"
    ).is_("tdhca_serial", "null").is_("tdhca_label", "null").execute()

    return {
        "total_monitored": len(transfers),
        "title_updated": len(updated),
        "title_pending": len(pending),
        "never_checked": len(never_checked),
        "no_serial": no_serial.count if hasattr(no_serial, 'count') else len(no_serial.data or []),
        "transfers": transfers,
    }
