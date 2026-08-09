# CLAUDE.md — Maninos AI

> Contexto operativo para Claude Code. Este archivo se auto-carga desde la raíz del repo,
> incluyendo sesiones en la nube / desde el móvil, que **no** tienen acceso a la memoria local.
> Léelo entero antes de tocar código.
>
> **Repo público.** No añadas aquí (ni en ningún archivo versionado) mapeos de cuentas bancarias,
> números de cuenta reales, nombres de inversionistas, saldos ni estado financiero. Ese contexto
> vive fuera del repo, en la memoria local de Claude Code de Maria.

---

## Qué es esto

App full-stack para **Maninos Homes LLC** y **Maninos Capital LLC** — compra, renovación y venta de
casas móviles en Texas. Sustituye un flujo de Excel + CRM. **Tres portales sobre una sola base de datos:**

| Portal | Ruta | Usuarios | Propósito |
|---|---|---|---|
| **Homes** | `/homes/*` | Empleados, yard managers | Comprar, renovar, vender propiedades |
| **Capital** | `/capital/*` | Equipo financiero | Contratos RTO, pagos, inversionistas, contabilidad |
| **Clientes** | `/clientes/*` | Público / clientes | Catálogo, compra, estado RTO, KYC |

Tipos de venta: **contado** o **RTO** (rent-to-own).

---

## Stack

| Capa | Tecnología | Notas |
|---|---|---|
| Backend | Python 3.12 + FastAPI | Entrypoint activo: `api/main.py` (arranque: `main.py`, `startup.py`) |
| Frontend | Next.js 14 App Router + TypeScript + Tailwind | Directorio `web/` |
| DB | Supabase (PostgreSQL) | SDK directo, **sin ORM**. 113 migraciones en `migrations/` |
| Auth | Supabase Auth | Realms separados: staff vs clientes |
| Storage | Supabase Storage | Ver reglas de buckets abajo |
| LLM | OpenAI | `gpt-5` y `gpt-5-mini` (ver sección IA) |
| Email | Resend | Transaccional |
| Scraping | Playwright + BeautifulSoup | MHVillage, Craigslist, 21st Mortgage, VMF |
| Scheduler | APScheduler | ~10 jobs en US/Central; `scheduler_runs` es log de auditoría |
| Deploy API | Railway | Docker, auto-deploy desde `main` |
| Deploy Web | Vercel | Auto-deploy desde `main` |

---

## Deploy — léelo antes de prometer nada

**Frontend y backend auto-despliegan desde `main` al hacer push.** No hay deploy manual.

- **Vercel** → proyecto `maninos-ai`, root dir `web`. (Existe un proyecto viejo `web`: no es ese.)
- **Railway** → proyecto `marvelous-quietude`, servicio `maninos-ai`, env `production`.

Después de `git push origin main`, ambos recogen el commit en unos minutos. Si un webhook se pierde,
un commit vacío lo re-dispara. **Nunca** le digas al usuario que "reinicie el backend" o corra
`npm run dev`: trabaja contra los entornos desplegados, no contra local.

`railway login` es interactivo y falla en el shell de Claude Code — lo debe correr el usuario en su
propia Terminal, o usar `RAILWAY_TOKEN`.

---

## Seguridad — invariantes que no debes romper

1. **Candado del API.** FastAPI exige `X-Internal-Key == INTERNAL_API_KEY` en toda request cuando la
   env var está definida (producción). Exentos: `/health`, `OPTIONS`, y el classify de
   bank-statements. `/docs`, `/redoc`, `/openapi.json` apagados en prod. Vercel inyecta la clave en
   `web/src/instrumentation.ts` (wrapper de fetch server-side) — cubre los ~200 route handlers del
   proxy desde un solo punto. La clave **nunca** va en `NEXT_PUBLIC_*`.
   *Las rutas nuevas del backend no necesitan nada especial: el candado es middleware global.*
2. **Buckets privados.** `kyc-documents` y `transaction-documents` son privados; el middleware
   `sign_private_storage_urls` reescribe sus URLs por firmadas (2h) en toda respuesta JSON.
   `property-photos` y `listing-photos` siguen públicos.
3. **Capital** se controla con una allow-list de *substrings* de email en
   `web/src/app/capital/layout.tsx` — **no** con roles ni flags en DB. El gate a nivel de layout cubre
   automáticamente cualquier página nueva bajo `/capital`. Homes sí usa el campo `role` de `users`.
   No lo migres a roles sin pedirlo primero.

---

## Contabilidad — la zona de mayor riesgo

El plan de cuentas **es la fuente de verdad y NUNCA se poda**. No inventes, renombres ni borres
cuentas. El de Capital viene de QuickBooks (migración 107).

Guards de raíz (`api/routes/accounting.py`), no los debilites:

- `_validate_postable_account(code, direction)` — una factura debe apuntar a una hoja real de P&L,
  no-header, del lado correcto (receivable→Income, payable→Expense/COGS). Se llama primero en
  `issue_invoice`.
- `issue_invoice` es **atómico**: si el par de devengo no puede postearse, revierte la factura y
  lanza. Nunca dejes una factura sin asientos (eso creaba facturas fantasma que jamás llegaban al P&L).
- Reclasificar sin re-emitir: `PATCH /accounting/invoices/{id}/reclassify` y
  `PATCH /accounting/transactions/{id}/reclassify`. Ojo: el CHECK de `accounting_audit_log` solo
  permite `create/update/delete/void/payment` — usa `"update"`, no `"reclassify"`.
- Las órdenes de pago salientes auto-crean una factura `[PO:]` **solo documental**: nunca la postees
  al ledger (doble conteo).
- Los saldos de banco se **derivan del ledger** al leer; el espejo `current_balance` lo ignora la UI.

Auditoría read-only: `scripts/audit_accounting.py`. E2E:
`web/e2e/financial-statements-reconcile.spec.ts`.

**Al borrar/limpiar datos, separa siempre Homes y Capital** — normalmente solo se quiere un lado.

---

## Sistemas de IA — son dos, no los confundas

1. **AIChatWidget** (`web/src/components/AIChatWidget.tsx`) → `/api/ai/chat`, `/api/ai/voice`
   (`api/routes/ai_assistant.py`). Modelo **gpt-5-mini**, patrón **tool-calling** con ~16 tools de
   consulta a DB. Cuando el usuario dice "el chatbot" o "el asistente", casi siempre es este.
2. **Agentes especializados** (`api/agents/`): `buscador`, `costos`, `precio`, `fotos`, `renovacion`,
   `voz`. Montados en `/api/agents/*` vía `router.py`. Modelo **gpt-5**, salida JSON estructurada
   validada con Pydantic, **sin** tool use.

No edites el prompt de `renovacion` para arreglar un bug del widget. Identifica primero el llamador
en el frontend. Nota: `renovacion` tiene precios hardcodeados en su prompt; `costos` los lee de DB.

---

## Gotchas que cuestan tiempo

- **Stripe NO está integrado.** Existen `STRIPE_*` en env y "stripe" aparece en dropdowns de
  `payment_method` (`stripe | zelle | transfer | cash | check`), pero **no hay un solo import del SDK**.
  El KYC de Capital es subida manual de documentos, no Stripe Identity. No hay pagos online en
  Clientes. Si te piden algo de "Stripe", pregunta si quieren integrarlo de verdad o solo mover una
  etiqueta. *(Nota: `docs/CLAUDE.md` afirma lo contrario y está obsoleto.)*
- El prefijo de `property_code` indica el yard: `H`=Houston, `B`=Conroe, `DFW`=Dallas. La tabla
  `yards` está vacía — derívalo del código.
- Carpetas con prefijo `_` en el App Router quedan fuera del routing.
- El frontend proxea `/api/*` al backend FastAPI vía `API_URL`.
- Las páginas nuevas de Capital necesitan su proxy de Next **por endpoint**.

---

## Cómo trabajar aquí

```bash
# Frontend
cd web && npm run build          # build de producción
cd web && npm test               # jest
npx playwright test              # 45 specs E2E en web/e2e/

# Backend
python -m pytest tests/
```

`npm run lint` no hace nada (no hay ESLint configurado) — no lo uses como señal de calidad.

**Flujo esperado:** implementar → probar → commit → push. El push despliega solo; verifica que ambos
entornos recogieron el commit en vez de asumirlo.

**No cambies configuración, fuentes de datos ni ajustes que el usuario haya definido** sin que te lo
pida explícitamente.

---

## Sesiones en la nube (móvil / claude.ai/code)

El entorno de nube está configurado para **paridad con el portátil**: mismas dependencias, mismas
variables, mismos tests. Setup script del entorno: `bash scripts/cloud_setup.sh` (instala
requirements.txt, `npm ci` en `web/` y el chromium de Playwright).

**Los E2E corren contra PRODUCCIÓN.** `playwright.config.ts` usa `baseURL =
https://maninos-ai.vercel.app` y los specs pegan al Railway de producción y a la Supabase de
producción con el `SERVICE_ROLE_KEY`. No hay staging (`STAGING_SUPABASE_URL` está vacío). Es decir:

- Correr la suite completa **escribe y borra datos reales**. Es intencional y así lo quiere Maria,
  pero no la lances "por si acaso": lánzala cuando quieras verificar algo concreto.
- Prefiere el spec concreto al barrido completo: `npx playwright test e2e/<archivo>.spec.ts`.
- Si una corrida deja basura, existe `scripts/cleanup_e2e_test_data.py`.

**Deploy desde una sesión de nube.** El proxy de GitHub solo permite `git push` contra la rama de
trabajo de la propia sesión: **no se puede pushear a `main` directamente**. Como Railway y Vercel
despliegan desde `main`, desplegar significa: crear el PR y mergearlo. El merge lo hace Maria desde
el móvil (app de GitHub o la UI de la sesión). No prometas "ya está desplegado" tras un push: hasta
que el PR no está en `main`, no hay deploy.

Los scrapers de Python necesitan su propio navegador, que no viene en el setup por presupuesto de
tiempo. Si hace falta: `python -m playwright install chromium`.

## Documentación relacionada

- `docs/CLAUDE.md` — documento largo y detallado, pero **desactualizado desde marzo de 2026** y con
  errores conocidos (Stripe). Útil como referencia estructural; verifica contra el código.
- `README.md` — visión general del proyecto.
- `TESTS_MANUAL.md` — guion de pruebas manuales.
- `migrations/README.md` — convenciones de migraciones.
