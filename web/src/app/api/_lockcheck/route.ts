// TEMPORAL: diagnóstico del candado del API (se borra tras verificar).
// No expone secretos — solo booleanos y códigos de estado.
export const dynamic = 'force-dynamic'

export async function GET() {
  const API = process.env.API_URL || ''
  let health = 0
  let clients = 0
  try { health = (await fetch(`${API}/health`, { cache: 'no-store' })).status } catch { health = -1 }
  try { clients = (await fetch(`${API}/api/clients`, { cache: 'no-store' })).status } catch { clients = -1 }
  return Response.json({
    registerRan: (globalThis as any).__lockRegisterRan === true,
    fetchWrapped: (globalThis.fetch as any).__lockWrapped === true,
    hasKey: !!process.env.INTERNAL_API_KEY,
    hasApiUrl: !!API,
    healthStatus: health,
    clientsStatus: clients,
  })
}
