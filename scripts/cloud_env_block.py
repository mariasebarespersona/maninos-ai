#!/usr/bin/env python3
"""
Genera el bloque de variables de entorno para pegar en el entorno de nube de
Claude Code (claude.ai/code -> icono de nube -> Environment variables).

Lee tus ficheros locales (.env, web/.env.local, web/.env.test) y compone un
bloque en formato .env con exactamente lo que necesitan el backend, el build de
Next y los 45 specs E2E.

Uso:
    python3 scripts/cloud_env_block.py

Escribe el resultado en  .env.cloud-paste  (ignorado por git) e imprime SOLO los
nombres de las claves, nunca los valores: así puedes correrlo desde Claude Code
sin que tus credenciales acaben en el historial de la conversación.

Cuando termines de pegarlo en el navegador, borra el fichero:
    rm .env.cloud-paste
"""
from __future__ import annotations

import os
import sys

RAILWAY = "https://maninos-ai-production.up.railway.app"
VERCEL = "https://maninos-ai.vercel.app"
OUT = ".env.cloud-paste"


def load(path: str) -> dict[str, str]:
    """Parseo mínimo de .env: KEY=VALUE, ignorando comentarios y líneas vacías."""
    data: dict[str, str] = {}
    if not os.path.exists(path):
        return data
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            data[key.strip()] = value.strip()
    return data


def main() -> int:
    repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(repo)

    root = load(".env")
    weblocal = load("web/.env.local")
    webtest = load("web/.env.test")

    if not root:
        print("ERROR: no encuentro .env en la raíz del repo. ¿Estás en el sitio correcto?")
        return 1

    sections: list[tuple[str, list[tuple[str, str | None]]]] = [
        ("Backend / Supabase (PRODUCCION)", [
            ("SUPABASE_URL", root.get("SUPABASE_URL")),
            ("SUPABASE_KEY", root.get("SUPABASE_KEY")),
            ("SUPABASE_SERVICE_ROLE_KEY", root.get("SUPABASE_SERVICE_ROLE_KEY")),
            ("SUPABASE_BUCKET", root.get("SUPABASE_BUCKET")),
        ]),
        ("OpenAI / agentes", [
            ("OPENAI_API_KEY", root.get("OPENAI_API_KEY")),
            ("OPENAI_MODEL", root.get("OPENAI_MODEL")),
            ("USE_DIRECT_EXECUTION", root.get("USE_DIRECT_EXECUTION")),
            ("USE_MULTI_AGENT", root.get("USE_MULTI_AGENT")),
        ]),
        ("Email", [
            ("RESEND_API_KEY", root.get("RESEND_API_KEY")),
            ("RESEND_EMAIL_FROM", root.get("RESEND_EMAIL_FROM")),
            ("SMTP_HOST", root.get("SMTP_HOST")),
            ("SMTP_PORT", root.get("SMTP_PORT")),
            ("SMTP_USER", root.get("SMTP_USER")),
            ("SMTP_PASS", root.get("SMTP_PASS")),
        ]),
        ("Frontend (build de Next)", [
            ("NEXT_PUBLIC_SUPABASE_URL", weblocal.get("NEXT_PUBLIC_SUPABASE_URL")),
            ("NEXT_PUBLIC_SUPABASE_ANON_KEY", weblocal.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")),
            # En la nube el backend NO es localhost: apunta a Railway.
            ("API_URL", RAILWAY),
            ("APP_URL", root.get("APP_URL") or VERCEL),
        ]),
        ("E2E (Playwright contra PRODUCCION)", [
            ("E2E_BASE_URL", webtest.get("E2E_BASE_URL") or VERCEL),
            ("E2E_API_URL", webtest.get("E2E_API_URL") or RAILWAY),
            ("E2E_RAILWAY_URL", webtest.get("E2E_API_URL") or RAILWAY),
            ("E2E_TEST_EMAIL", webtest.get("E2E_TEST_EMAIL")),
            ("E2E_TEST_PASSWORD", webtest.get("E2E_TEST_PASSWORD")),
        ]),
    ]

    lines: list[str] = []
    included: list[str] = []
    missing: list[str] = []

    for title, pairs in sections:
        lines.append(f"# --- {title} ---")
        for key, value in pairs:
            if not value:
                missing.append(key)
                lines.append(f"# {key}=   <-- FALTA: rellenar a mano")
            else:
                included.append(key)
                lines.append(f"{key}={value}")
        lines.append("")

    lines.append("# --- Candado del API: copiar de Railway > Variables ---")
    lines.append("# Sin esto, las llamadas directas al backend de Railway responden 401.")
    lines.append("# INTERNAL_API_KEY=")
    lines.append("")

    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))
    os.chmod(OUT, 0o600)

    print(f"Escrito: {os.path.join(repo, OUT)}  (permisos 600, ignorado por git)")
    print(f"\nVariables con valor ({len(included)}):")
    for key in included:
        print(f"  {key}")
    if missing:
        print(f"\nSIN valor, rellena a mano ({len(missing)}):")
        for key in missing:
            print(f"  {key}")
    print("\nAcuérdate de INTERNAL_API_KEY (está solo en Railway, no en tu .env).")
    print(f"Cuando lo hayas pegado en el navegador:  rm {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
