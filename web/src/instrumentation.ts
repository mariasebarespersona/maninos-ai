/**
 * Candado del API (lado Vercel): el backend de Railway exige X-Internal-Key
 * en toda request (ver api/main.py). Aquí envolvemos el fetch global del
 * SERVIDOR Next para añadir esa clave a cualquier llamada dirigida al
 * backend — así los ~200 route handlers del proxy quedan cubiertos desde un
 * solo punto y la clave nunca llega al navegador (INTERNAL_API_KEY no lleva
 * prefijo NEXT_PUBLIC_).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const key = process.env.INTERNAL_API_KEY
  const targets = [process.env.API_URL, process.env.NEXT_PUBLIC_API_URL]
    .filter((u): u is string => !!u)
    .map(u => u.replace(/\/$/, ''))
  if (!key || targets.length === 0) return

  const origFetch = globalThis.fetch
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string' ? input :
      input instanceof URL ? input.href :
      input.url
    if (targets.some(t => url.startsWith(t))) {
      const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined)
      )
      headers.set('x-internal-key', key)
      init = { ...init, headers }
    }
    return origFetch(input as any, init)
  }) as typeof fetch
}
