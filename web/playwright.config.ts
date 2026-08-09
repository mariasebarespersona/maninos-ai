import { defineConfig } from '@playwright/test';

// En las sesiones de nube (móvil / claude.ai/code) TODO el tráfico saliente pasa
// por un proxy HTTP/HTTPS. Herramientas como curl lo respetan solas porque leen
// HTTPS_PROXY/HTTP_PROXY del entorno, pero los navegadores NO leen esas
// variables: hay que pasarles el proxy explícitamente o no salen a la red.
//
// Pasar el proxy es necesario pero no basta: además hay que usar WebKit en vez
// de Chromium (ver el comentario de `projects` más abajo).
//
// En local estas variables no existen, así que el bloque queda desactivado y la
// configuración es exactamente la de siempre: chromium, sin proxy.
const proxyServer =
  process.env.HTTPS_PROXY || process.env.https_proxy ||
  process.env.HTTP_PROXY || process.env.http_proxy;

const proxyConfig = proxyServer
  ? {
      proxy: {
        server: proxyServer,
        ...(process.env.NO_PROXY || process.env.no_proxy
          ? { bypass: (process.env.NO_PROXY || process.env.no_proxy)! }
          : {}),
      },
      // El proxy termina TLS con su propia CA, que Chromium no conoce. Aceptable
      // aquí: solo aplica cuando hay proxy, y los destinos son dominios propios.
      ignoreHTTPSErrors: true,
    }
  : {};

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  timeout: 60000,
  retries: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    ...proxyConfig,
  },
  projects: proxyServer
    ? [
        // Detrás del proxy hay que cambiar de motor, no solo de configuración.
        // Chromium abre bien el túnel CONNECT, pero su ClientHello ocupa ~1750
        // bytes (1263 solo de key_share X25519MLKEM768, el intercambio de claves
        // post-cuántico) y el otro extremo corta la conexión durante el
        // handshake TLS, antes del ServerHello: ERR_CONNECTION_RESET. No hay
        // forma de apagar ese key_share en Chromium 145 — ni los flags
        // --disable-features ni la política PostQuantumKeyAgreementEnabled lo
        // reducen. Firefox tampoco pasa (se queda colgado hasta el timeout).
        // WebKit construye un ClientHello clásico y pequeño, y la suite entera
        // pasa contra producción.
        {
          name: 'webkit',
          use: { browserName: 'webkit' },
        },
      ]
    : [
        {
          name: 'chromium',
          use: { browserName: 'chromium' },
        },
      ],
});
