"""
Supabase JWT Authentication for client-facing API endpoints.

Extracts Bearer token from the Authorization header, verifies it
via Supabase Auth, and ensures the authenticated user owns the
requested client_id.
"""

import logging
from fastapi import HTTPException, Request

logger = logging.getLogger(__name__)

# We need a Supabase client initialized with the ANON key (not the service
# role key) so that `auth.get_user(token)` validates the JWT the same way
# the frontend issued it.  However, Supabase's Python client `auth.get_user`
# works fine with the service role key too — it simply verifies the JWT
# against the Supabase Auth server.  We reuse the existing service-role
# client to avoid requiring an extra env var on the backend.
from tools.supabase_client import sb


async def get_current_user_email(request: Request) -> str:
    """
    FastAPI dependency that extracts and verifies the Supabase JWT.

    Returns the authenticated user's email address.
    Raises HTTP 401 if the token is missing or invalid.
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="No autorizado — token de autenticación requerido",
        )

    token = auth_header.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(
            status_code=401,
            detail="No autorizado — token vacío",
        )

    try:
        user_response = sb.auth.get_user(token)
        user = user_response.user
        if not user or not user.email:
            raise HTTPException(
                status_code=401,
                detail="No autorizado — token inválido",
            )
        return user.email
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"[Auth] Token verification failed: {e}")
        raise HTTPException(
            status_code=401,
            detail="No autorizado — token inválido o expirado",
        )


def verify_client_ownership(client_id: str, user_email: str) -> None:
    """
    Verify that the given client_id belongs to the authenticated user's email.
    Raises HTTP 403 if the client record does not match.
    """
    client_check = (
        sb.table("clients")
        .select("id")
        .eq("id", client_id)
        .eq("email", user_email)
        .execute()
    )
    if not client_check.data:
        raise HTTPException(
            status_code=403,
            detail="No autorizado — este recurso no te pertenece",
        )
