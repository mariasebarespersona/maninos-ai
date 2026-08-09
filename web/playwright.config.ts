import { defineConfig } from '@playwright/test';

// En las sesiones de nube (móvil / claude.ai/code) TODO el tráfico saliente pasa
// por un proxy HTTP/HTTPS. Herramientas como curl lo respetan solas porque leen
// HTTPS_PROXY/HTTP_PROXY del entorno, pero Chromium NO lee esas variables: hay
// que pasarle el proxy explícitamente o los tests mueren con
// ERR_CONNECTION_RESET mientras curl llega a producción sin problema.
//
// En local estas variables no existen, así que el bloque queda desactivado y la
// configuración es exactamente la de siempre.
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
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
