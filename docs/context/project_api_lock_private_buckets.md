---
name: project-api-lock-private-buckets
description: API de Railway cerrada con X-Internal-Key (instrumentation.ts en Vercel) y buckets kyc/transaction privados con firma-al-leer
metadata: 
  node_type: memory
  type: project
  originSessionId: 1d733b40-7d67-4f5d-9584-546762af48be
  modified: 2026-08-07T14:30:58.051Z
---

Desde 2026-08-07 la seguridad base es:

1. **Candado del API**: FastAPI (api/main.py) exige header `X-Internal-Key == INTERNAL_API_KEY` en TODA request cuando la env var está definida (Railway prod). Exentos: `/health`, OPTIONS, y `POST .../bank-statements/*/classify` (llamada directa del navegador >60s). `/docs`, `/redoc`, `/openapi.json` apagados en prod. El lado Vercel añade la clave en `web/src/instrumentation.ts` (wrapper de fetch server-side, requiere `experimental.instrumentationHook` en next.config.js) — cubre los ~200 route handlers del proxy desde un punto. La clave vive en env `INTERNAL_API_KEY` de Railway y Vercel (nunca NEXT_PUBLIC).
2. **Buckets privados**: `kyc-documents` y `transaction-documents` son private. Las URLs públicas guardadas históricamente en DB/JSONB NO se migraron: el middleware `sign_private_storage_urls` (api/main.py + api/utils/storage_sign.py) reescribe cualquier URL de esos buckets por una firmada (2h, caché en memoria) en toda respuesta JSON. Los sitios de subida siguen guardando `get_public_url` — es intencional. `property-photos` y `listing-photos` siguen públicos.

**Gotchas**: (a) al añadir env vars con `vercel` CLI desde `web/`, el dir estaba linkado al proyecto **"web"**, NO a `maninos-ai` — ya se corrigió el link (`.vercel/project.json`), pero verificar `vercel env ls` muestra el proyecto correcto; (b) carpetas `_prefijo` en app router quedan fuera del routing; (c) rutas nuevas del backend NO necesitan nada especial — el candado y la firma son middlewares globales.

Pendiente conocido (no urgente): rotar password del usuario e2e-test committeado en specs, restringir CORS (hoy permite *.vercel.app), roles reales en Capital (ver [[project-capital-auth]]).
