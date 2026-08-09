# Contexto de proyecto

Notas acumuladas sesión a sesión sobre cómo funciona realmente Maninos: decisiones tomadas,
trampas encontradas, y reglas que no se deducen leyendo el código. Antes vivían solo en la memoria
local de Claude Code (una máquina), así que las sesiones en la nube y desde el móvil arrancaban sin
ellas. Ahora están aquí.

**Son observaciones fechadas, no estado vivo.** Cada nota describe lo que era cierto cuando se
escribió. Si una cita un fichero, una función o un flag, verifícalo contra el código antes de darlo
por bueno.

> **Redactadas para repo público.** Se han sustituido nombres de inversionistas y clientes, importes
> de transacciones concretas y dígitos de cuentas bancarias. El contenido operativo está intacto: lo
> que importa es la regla, no el nombre. **No reintroduzcas esos datos** al editar estas notas.

## Cómo trabajar aquí

| Nota | De qué va |
|---|---|
| [feedback_wipe_homes_vs_capital](feedback_wipe_homes_vs_capital.md) | Al borrar datos, separar siempre Homes y Capital; incluye el reparto de tablas |
| [feedback_commit_push](feedback_commit_push.md) | Commit + push al terminar, sin esperar a que lo pidan |
| [feedback_deploy_flow](feedback_deploy_flow.md) | Desplegar tras el push; nunca sugerir reinicio local |
| [feedback_no_change_config](feedback_no_change_config.md) | No cambiar fuentes ni ajustes configurados por el usuario sin petición explícita |
| [feedback_no_copy_text](feedback_no_copy_text.md) | No devolverle al usuario el texto largo que acaba de pegar |

## Arquitectura y despliegue

| Nota | De qué va |
|---|---|
| [architecture](architecture.md) | Estructura de ficheros y patrones del proyecto |
| [project_deploy_railway_vercel](project_deploy_railway_vercel.md) | Vercel y Railway auto-despliegan desde `main`; mapeo de proyectos y el caveat del login de Railway |
| [project_api_lock_private_buckets](project_api_lock_private_buckets.md) | Candado `X-Internal-Key`; buckets kyc/transaction privados con firma al leer |
| [project_capital_auth](project_capital_auth.md) | Capital se controla por allow-list de emails, no por roles |
| [project_scheduler_jobs](project_scheduler_jobs.md) | Jobs de APScheduler en US/Central; `scheduler_runs` es log de auditoría |

## IA

| Nota | De qué va |
|---|---|
| [project_ai_chat_vs_agents](project_ai_chat_vs_agents.md) | AIChatWidget (gpt-5-mini, tool calling) ≠ los agentes especializados (gpt-5) |
| [project_renovacion_agent_quirks](project_renovacion_agent_quirks.md) | RenovacionAgent lleva precios hardcodeados en el prompt; CostosAgent los lee de DB |

## Contabilidad

La zona de mayor riesgo del proyecto. Léelas antes de tocar nada del ledger.

| Nota | De qué va |
|---|---|
| [project_accounting_link_guards](project_accounting_link_guards.md) | Guards de raíz: facturas solo a hoja no-header del lado correcto; `issue_invoice` atómico; tool de reclasificación; script de auditoría |
| [project_capital_source_of_truth_chart](project_capital_source_of_truth_chart.md) | El plan de cuentas de Capital viene de QuickBooks; nunca inventar ni borrar cuentas |
| [project_capital_accounting_parity](project_capital_accounting_parity.md) | Capital es espejo de Homes sobre el mismo motor de ledger |
| [project_cogs_per_house_policy](project_cogs_per_house_policy.md) | Costes de casa **capitalizados a Inventario** mientras no se vende, y a COGS al vender (política revertida el 2026-07-13; la versión anterior "COGS al pago" es incorrecta) |
| [project_homes_ap_ar_invoices](project_homes_ap_ar_invoices.md) | Obligaciones de Homes como facturas reales: un solo posteo, pagos parciales, sin doble conteo |
| [project_auto_payable_invoices](project_auto_payable_invoices.md) | Las órdenes de pago crean una factura `[PO:]` solo documental: nunca postearla al ledger |
| [project_desglose_accrual_buckets](project_desglose_accrual_buckets.md) | El desglose es accrual leído del ledger por cuenta→bucket; debe reconciliar con el P&L |
| [project_bank_account_qb_mapping](project_bank_account_qb_mapping.md) | Mapeo de los bancos de Homes a códigos del plan contable |
| [reference_derived_bank_balances](reference_derived_bank_balances.md) | Los saldos de banco se derivan del ledger al leer; el espejo `current_balance` se ignora |
| [project_capital_journal_entries_and_reports](project_capital_journal_entries_and_reports.md) | Asientos manuales balanceados y P&L en matriz customizable |

## Capital: inversionistas y RTO

| Nota | De qué va |
|---|---|
| [project_investor_interest_split](project_investor_interest_split.md) | Pagos a inversionista: principal e interés separados **por cuenta**, no por `txn_type` |
| [project_investor_ledger_estado_validado](project_investor_ledger_estado_validado.md) | El ledger de inversionistas fue validado tal cual; los depósitos `pending_confirmation` son estado aceptado, no bugs |
| [project_capital_financed_houses](project_capital_financed_houses.md) | "Casas Financiadas": agregación read-only de ventas RTO; nunca toca la contabilidad de Homes |
| [project_manual_capital_intake](project_manual_capital_intake.md) | Alta manual de clientes RTO antiguos: cadena `manual_capital` oculta en Homes, pagos históricos sin asientos |
| [project_rto_terms_authority](project_rto_terms_authority.md) | Quién manda en los términos de un contrato RTO |

## Operaciones y flujos

| Nota | De qué va |
|---|---|
| [project_consignment_flow](project_consignment_flow.md) | Casas en consignación: vendibles antes de pagar al dueño; deuda al ingreso, COGS al pago |
| [project_title_monitor_flow](project_title_monitor_flow.md) | Flujo TDHCA, fallback a BOS, y subidas manuales que saltan el scheduler |
| [project_property_code_prefix_yard](project_property_code_prefix_yard.md) | El prefijo de `property_code` indica el yard; la tabla `yards` está vacía |
| [project_stripe_not_integrated](project_stripe_not_integrated.md) | Stripe no está integrado: solo es una etiqueta de `payment_method` |
