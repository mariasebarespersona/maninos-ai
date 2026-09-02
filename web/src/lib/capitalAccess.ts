// Allow-list del portal Capital. FUENTE ÚNICA: la usan tanto el layout
// (/capital/*) como la pantalla de login (/capital/login). No la dupliques:
// tenerla en dos sitios ya provocó que un alta nueva entrara solo en uno y la
// persona siguiera viendo "Acceso restringido".
//
// La comprobación es `email.includes(patrón)`, así que un patrón corto abre la
// puerta a cualquier email que lo contenga. Para altas nuevas se usa el email
// COMPLETO: da acceso a esa persona y a nadie más. Los patrones cortos son los
// históricos y se dejan como están.
export const CAPITAL_ALLOWED_PATTERNS = [
  'lupita', 'sebastian', 'mariasebares', 'cazabrothers', 'e2e-test',
  'sgonzalez', 'xvelasco', 'abigail', 'aruiz',
  'jorge@delatoro.com',
]

export function isCapitalAuthorized(email?: string | null): boolean {
  if (!email) return false
  const lower = email.toLowerCase()
  return CAPITAL_ALLOWED_PATTERNS.some(name => lower.includes(name))
}
