"""
Firma-al-leer de URLs de Storage privados.

Los buckets kyc-documents y transaction-documents son PRIVADOS (contienen
identificaciones y contratos). Históricamente la app guardó URLs públicas
(/object/public/...) en muchas tablas y dentro de JSONB (checklists de
títulos, adjuntos, etc.), así que en vez de perseguir cada endpoint, este
módulo reescribe cualquier URL de esos buckets dentro de las respuestas
JSON del API por una URL firmada con caducidad. Las URLs guardadas en la
base NO se tocan: la conversión ocurre solo al servir la respuesta.
"""
import re
import time
import threading
import logging
from urllib.parse import unquote

logger = logging.getLogger(__name__)

PRIVATE_BUCKETS = ("kyc-documents", "transaction-documents")

# URL pública tal y como la guardó get_public_url():
#   https://<proj>.supabase.co/storage/v1/object/public/<bucket>/<path>[?]
_URL_RE = re.compile(
    r"https://[A-Za-z0-9.-]+/storage/v1/object/public/"
    r"(kyc-documents|transaction-documents)/([^\"?\\\s]+)"
)

_SIGN_TTL = 2 * 60 * 60      # la URL firmada vive 2 horas
_CACHE_TTL = 100 * 60        # se reusa de caché 100 min (margen sobre las 2h)
_cache: dict = {}            # (bucket, path) -> (signed_url, cached_at)
_lock = threading.Lock()


def _signed_url(bucket: str, path: str) -> str | None:
    now = time.time()
    key = (bucket, path)
    with _lock:
        hit = _cache.get(key)
        if hit and now - hit[1] < _CACHE_TTL:
            return hit[0]
    try:
        from tools.supabase_client import sb
        res = sb.storage.from_(bucket).create_signed_url(unquote(path), _SIGN_TTL)
        signed = res.get("signedURL") or res.get("signedUrl") if isinstance(res, dict) else None
        if signed:
            with _lock:
                _cache[key] = (signed, now)
            return signed
    except Exception as e:
        logger.warning(f"[storage-sign] No se pudo firmar {bucket}/{path[:60]}: {e}")
    return None


def sign_private_urls(body: bytes) -> bytes:
    """Reemplaza en un body JSON toda URL pública de bucket privado por su
    URL firmada. Si algo falla, devuelve el body intacto (nunca rompe la
    respuesta)."""
    try:
        text = body.decode("utf-8")
    except Exception:
        return body
    if "/storage/v1/object/public/" not in text:
        return body

    def _repl(m: re.Match) -> str:
        signed = _signed_url(m.group(1), m.group(2))
        return signed if signed else m.group(0)

    try:
        return _URL_RE.sub(_repl, text).encode("utf-8")
    except Exception as e:
        logger.warning(f"[storage-sign] Error reescribiendo respuesta: {e}")
        return body
