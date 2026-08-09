#!/bin/bash
# =============================================================================
# Instala las dependencias del proyecto en sesiones de nube (móvil / web).
#
# NO se pega en el campo "Setup script" del entorno: ese corre ANTES de que se
# clone el repo (los entornos se reutilizan entre repositorios), así que no
# puede ver estos ficheros. Este script lo lanza un hook SessionStart definido
# en .claude/settings.json, que sí corre con el repo ya clonado.
#
# En sesiones locales sale de inmediato: tu Mac ya tiene todo instalado.
# =============================================================================

set -uo pipefail

# Solo en la nube. El VM de sesión define CLAUDE_CODE_REMOTE=true; en local
# nunca vale "true", así que esto no toca nada en tu Mac.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

REPO="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$REPO" || exit 0

echo "=== Maninos AI · dependencias de sesión en la nube ==="

# El hook corre en cada sesión, pero su trabajo NO entra en el snapshot cacheado
# del entorno. Las guardas de abajo evitan reinstalar lo que ya esté presente.

# --- Python -----------------------------------------------------------------
# Ubuntu 24.04 marca el Python del sistema como "externally managed" (PEP 668),
# de ahí el fallback. Es una VM efímera: no hay nada que contaminar.
install_python() {
  if python3 -c "import fastapi, supabase, openai" >/dev/null 2>&1; then
    echo "[python] ya instalado, salto"
    return 0
  fi
  echo "[python] instalando requirements.txt"
  pip install --no-cache-dir -q -r requirements.txt \
    || pip install --no-cache-dir -q --break-system-packages -r requirements.txt
}

# --- Node -------------------------------------------------------------------
install_node() {
  if [ -d "$REPO/web/node_modules/@playwright/test" ]; then
    echo "[node] ya instalado, salto"
    return 0
  fi
  echo "[node] instalando dependencias de web/"
  cd "$REPO/web" || return 1
  npm ci --no-audit --no-fund --silent || npm install --no-audit --no-fund --silent
}

install_python > /tmp/setup_python.log 2>&1 &
PID_PY=$!
install_node > /tmp/setup_node.log 2>&1 &
PID_NODE=$!

if wait "$PID_PY"; then echo "[python] OK"; else echo "[python] AVISO: falló"; tail -15 /tmp/setup_python.log; fi
if wait "$PID_NODE"; then echo "[node] OK"; else echo "[node] AVISO: falló"; tail -15 /tmp/setup_node.log; fi

# --- Navegador de Playwright ------------------------------------------------
# Los 45 specs E2E usan @playwright/test con chromium. La imagen base trae
# chromedriver, pero NO los navegadores de Playwright.
# Si el "Setup script" del entorno ya los dejó cacheados, esto no descarga nada.
if ls "$HOME"/.cache/ms-playwright/chromium-* >/dev/null 2>&1; then
  echo "[playwright] navegador ya presente, salto"
else
  echo "[playwright] descargando chromium"
  ( cd "$REPO/web" && npx --yes playwright install --with-deps chromium >/dev/null 2>&1 ) \
    || echo "[playwright] AVISO: falló; los E2E no correrán"
fi

# Los scrapers de Python usan el Playwright de Python, con su propia descarga.
# No se instala aquí para no alargar el arranque. Si hace falta, en la sesión:
#     python -m playwright install chromium

echo "=== Dependencias listas ==="
# Salida 0 incondicional: un fallo degrada la sesión, no debe impedir arrancarla.
exit 0
