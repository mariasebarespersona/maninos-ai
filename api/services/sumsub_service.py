"""
Sumsub KYC Integration Service

Provides authentication, applicant management, and status checking
for Sumsub identity verification.

Sumsub handles:
- Document verification (ID, passport, driver's license)
- Selfie matching (face comparison with document photo)
- Liveness detection (anti-spoofing)
- Automated approval/rejection

Environment variables:
    SUMSUB_APP_TOKEN: App token from Sumsub dashboard
    SUMSUB_SECRET_KEY: Secret key from Sumsub dashboard
    SUMSUB_LEVEL_NAME: KYC level name (default: "basic-kyc-level")
    SUMSUB_WEBHOOK_SECRET: Webhook secret for signature verification
"""

import hashlib
import hmac
import json
import logging
import os
import time
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# ─── Configuration ───────────────────────────────────────────────────────────
SUMSUB_APP_TOKEN = os.getenv("SUMSUB_APP_TOKEN", "")
SUMSUB_SECRET_KEY = os.getenv("SUMSUB_SECRET_KEY", "")
SUMSUB_BASE_URL = "https://api.sumsub.com"
SUMSUB_LEVEL_NAME = os.getenv("SUMSUB_LEVEL_NAME", "basic-kyc-level")
SUMSUB_WEBHOOK_SECRET = os.getenv("SUMSUB_WEBHOOK_SECRET", "")


def is_configured() -> bool:
    """Check if Sumsub credentials are properly set."""
    return bool(SUMSUB_APP_TOKEN and SUMSUB_SECRET_KEY)


# ─── HMAC-SHA256 Request Signing ─────────────────────────────────────────────

def _sign_request(method: str, url_path: str, body: bytes = b"") -> dict:
    """
    Generate Sumsub HMAC-SHA256 authentication headers.

    Sumsub requires:
    - X-App-Token: your app token
    - X-App-Access-Sig: HMAC-SHA256(secret, timestamp + method + url_path + body)
    - X-App-Access-Ts: unix timestamp (seconds)
    """
    ts = str(int(time.time()))
    sig_string = ts + method.upper() + url_path
    if body:
        sig_string += body.decode("utf-8")

    signature = hmac.new(
        SUMSUB_SECRET_KEY.encode("utf-8"),
        sig_string.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    return {
        "X-App-Token": SUMSUB_APP_TOKEN,
        "X-App-Access-Sig": signature,
        "X-App-Access-Ts": ts,
        "Content-Type": "application/json",
    }


# ─── Applicant Management ───────────────────────────────────────────────────

async def create_applicant(
    external_user_id: str,
    email: str = "",
    phone: str = "",
    name: str = "",
) -> dict:
    """
    Create a Sumsub applicant.

    Args:
        external_user_id: Your internal client ID (used as Sumsub externalUserId)
        email: Client's email
        phone: Client's phone
        name: Client's full name

    Returns:
        Sumsub applicant object with 'id' field
    """
    url_path = f"/resources/applicants?levelName={SUMSUB_LEVEL_NAME}"

    # Split name into first/last for Sumsub
    name_parts = name.strip().split(" ", 1) if name else ["", ""]
    first_name = name_parts[0] if name_parts else ""
    last_name = name_parts[1] if len(name_parts) > 1 else ""

    body_data = {
        "externalUserId": external_user_id,
        "email": email,
        "phone": phone,
        "fixedInfo": {
            "firstName": first_name,
            "lastName": last_name,
        },
    }
    body_bytes = json.dumps(body_data).encode("utf-8")
    headers = _sign_request("POST", url_path, body_bytes)

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{SUMSUB_BASE_URL}{url_path}",
            content=body_bytes,
            headers=headers,
            timeout=30.0,
        )
        resp.raise_for_status()
        result = resp.json()
        logger.info(f"[Sumsub] Created applicant {result.get('id')} for user {external_user_id}")
        return result


async def get_applicant_by_external_id(external_user_id: str) -> Optional[dict]:
    """
    Get an existing Sumsub applicant by your internal client ID.
    Returns None if not found.
    """
    url_path = f"/resources/applicants/-;externalUserId={external_user_id}/one"
    headers = _sign_request("GET", url_path)

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{SUMSUB_BASE_URL}{url_path}",
            headers=headers,
            timeout=30.0,
        )
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json()


# ─── Access Token for Web SDK ────────────────────────────────────────────────

async def get_access_token(external_user_id: str) -> dict:
    """
    Generate an access token for the Sumsub Web SDK.

    The frontend uses this token to initialize the embedded verification widget.
    The token has a limited lifetime (~30 min), after which the frontend
    should call this again to refresh.

    Returns:
        dict with 'token' and 'userId' fields
    """
    url_path = f"/resources/accessTokens?userId={external_user_id}&levelName={SUMSUB_LEVEL_NAME}"
    headers = _sign_request("POST", url_path)

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{SUMSUB_BASE_URL}{url_path}",
            headers=headers,
            timeout=30.0,
        )
        resp.raise_for_status()
        result = resp.json()
        logger.info(f"[Sumsub] Generated access token for user {external_user_id}")
        return result


# ─── Applicant Status ────────────────────────────────────────────────────────

async def get_applicant_status(applicant_id: str) -> dict:
    """
    Get the verification/review status of a Sumsub applicant.

    Returns the full status object including:
    - reviewStatus: "init", "pending", "prechecked", "queued", "completed"
    - reviewResult.reviewAnswer: "GREEN" (approved) or "RED" (rejected)
    - reviewResult.rejectLabels: reasons for rejection
    - reviewResult.reviewRejectType: "RETRY" or "FINAL"
    """
    url_path = f"/resources/applicants/{applicant_id}/status"
    headers = _sign_request("GET", url_path)

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{SUMSUB_BASE_URL}{url_path}",
            headers=headers,
            timeout=30.0,
        )
        resp.raise_for_status()
        return resp.json()


# ─── Webhook Verification ────────────────────────────────────────────────────

def verify_webhook_signature(payload: bytes, signature: str) -> bool:
    """
    Verify a Sumsub webhook signature.

    Sumsub sends HMAC-SHA1 digest in the X-Payload-Digest header,
    signed with the webhook secret key.
    """
    if not SUMSUB_WEBHOOK_SECRET:
        logger.warning("[Sumsub] No webhook secret configured — skipping signature verification")
        return True

    expected = hmac.new(
        SUMSUB_WEBHOOK_SECRET.encode("utf-8"),
        payload,
        hashlib.sha1,
    ).hexdigest()

    return hmac.compare_digest(expected, signature)

