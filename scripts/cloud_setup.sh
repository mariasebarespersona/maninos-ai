#!/bin/bash
# =============================================================================
# Setup para sesiones de nube de Claude Code (claude.ai/code y app móvil).
#
# Se pega tal cual en el campo "Setup script" del entorno de nube, o mejor:
#   bash scripts/cloud_setup.sh
# así el script vive versionado en el repo y se edita como cualquier código.
#
# Contexto del entorno (Anthropic-hosted):
#   - Ubuntu 24.04 x86_64, corre como root, ANTES de que arranque Claude.
#   - Debe salir con código 0 o la sesión no arranca.
#   - Presupuesto ~5 minutos: los installs pesados van en paralelo.
#   - El resultado se cachea en snapshot, así que esto corre una vez por
#     entorno (y de nuevo si cambias el script, los dominios, o pasados ~7 días).
# =============================================================================

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

echo "=== Maninos AI · setup de sesión en la nube ==="
echo "Repo: $REPO"

# --- Python -----------------------------------------------------------------
# Ubuntu 24.04 marca el Python del sistema como "externally managed" (PEP 668),
# así que pip puede negarse; el fallback --break-system-packages lo resuelve.
# Es una VM efímera y desechable: no hay nada que proteger de contaminar.
install_python() {
  echo "[python] instalando requirements.txt"
  pip install --no-cache-dir -r requirements.txt \
    || pip install --no-cache-dir --break-system-packages -r requirements.txt
}

# --- Node -------------------------------------------------------------------
install_node() {
  echo "[node] instalando dependencias de web/"
  cd "$REPO/web" || return 1
  npm ci --no-audit --no-fund || npm install --no-audit --no-fund
}

install_python > /tmp/setup_python.log 2>&1 &
PID_PY=$!
install_node > /tmp/setup_node.log 2>&1 &
PID_NODE=$!

if wait "$PID_PY"; then echo "[python] OK"; else echo "[python] AVISO: falló, ver /tmp/setup_python.log"; tail -20 /tmp/setup_python.log; fi
if wait "$PID_NODE"; then echo "[node] OK"; else echo "[node] AVISO: falló, ver /tmp/setup_node.log"; tail -20 /tmp/setup_node.log; fi

# --- Navegador de Playwright ------------------------------------------------
# Los 45 specs E2E usan @playwright/test con chromium. La imagen base trae
# chromedriver, pero NO los navegadores de Playwright: hay que bajarlos.
# Solo chromium — es el único proyecto configurado en playwright.config.ts.
echo "[playwright] instalando chromium + dependencias del sistema"
( cd "$REPO/web" && npx --yes playwright install --with-deps chromium ) \
  || echo "[playwright] AVISO: falló la instalación del navegador; los E2E no correrán"

# Nota: los scrapers de Python (MHVillage, Craigslist…) usan el Playwright de
# Python, con su propia descarga de navegador. No se instala aquí para no
# agotar el presupuesto de 5 minutos. Si una tarea lo necesita, en la sesión:
#     python -m playwright install chromium

echo "=== Setup terminado ==="
# Salida 0 incondicional: un fallo de instalación degrada la sesión, pero no
# debe impedir que arranque. Los avisos de arriba quedan en el log.
exit 0
