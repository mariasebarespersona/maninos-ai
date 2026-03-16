# Tests Manuales - Cambios 9-10 Marzo 2026

## 1. Flujo Contado: "Ya he hecho la transferencia" (6 pasos)

### 1.1 Cliente reporta transferencia
- [ ] Ir a `/clientes/casas` → elegir una casa publicada → "Comprar"
- [ ] Rellenar datos (o verificar que se pre-rellenan si ya tienes sesion)
- [ ] En "Forma de Pago" → click "Pagar al Contado"
- [ ] Verificar que aparecen los datos bancarios (Chase Bank, Maninos Homes LLC, etc.)
- [ ] Click en "Ya he hecho la transferencia"
- [ ] Verificar toast "Transferencia registrada!"
- [ ] Verificar que aparece la tarjeta verde de confirmacion con boton "Ir a Mi Cuenta"
- [ ] Verificar que el cliente recibe email "Transferencia Registrada" (NO dice pago confirmado)
- [ ] Verificar que la casa desaparece del catalogo (status = reserved)

### 1.2 Abigail confirma pago en Homes
- [ ] Ir a `/homes/notificaciones`
- [ ] Verificar que aparece la seccion "Transferencias Pendientes de Confirmar" con la transferencia
- [ ] Verificar que muestra: nombre cliente, email, telefono, propiedad, monto, fecha reporte
- [ ] Click "El pago ha sido recibido"
- [ ] Aparece dialogo de confirmacion → click "Si, confirmar"
- [ ] Verificar que la transferencia desaparece de la lista de pendientes

### 1.3 Post-confirmacion
- [ ] Verificar que la casa aparece como "sold" (no vuelve al catalogo)
- [ ] Verificar que en `/homes/clients` el cliente aparece como "active"
- [ ] Verificar que el cliente recibe email "Venta Completada" con link a documentos
- [ ] Verificar que los documentos (Bill of Sale, Title) se generaron en Supabase Storage

### 1.4 Documentos del cliente
- [ ] El cliente entra a `/clientes/mi-cuenta/documentos`
- [ ] Verificar que aparecen los 3 documentos: Bill of Sale, Aplicacion Cambio Titulo, Titulo
- [ ] Verificar que Bill of Sale tiene los datos correctos (nombre comprador, propiedad, precio)

### 1.5 Titulo transferido (paso 6)
- [ ] Desde Homes, marcar el title_transfer como "completed"
- [ ] Verificar que el cliente recibe email "Tu titulo ha sido transferido"

---

## 2. Sesion activa: formulario de compra pre-rellenado

### 2.1 Cliente logueado compra casa
- [ ] Iniciar sesion en `/clientes/login`
- [ ] Ir a `/clientes/casas` → elegir casa → "Comprar"
- [ ] Verificar que el formulario tiene nombre, email, telefono y terreno pre-rellenados
- [ ] Verificar que el email esta en gris y no se puede editar
- [ ] Verificar que NO aparecen los campos de contrasena
- [ ] Verificar que el boton dice "Continuar" y funciona sin pedir contrasena

### 2.2 Cliente nuevo (sin sesion)
- [ ] Abrir ventana incognito → ir a una casa → "Comprar"
- [ ] Verificar que el formulario esta vacio
- [ ] Verificar que SI aparecen los campos de contrasena
- [ ] Rellenar todo y verificar que se crea la cuenta

---

## 3. Limpieza: Stripe eliminado

- [ ] Verificar que la app no muestra errores en consola relacionados con Stripe
- [ ] Verificar que en el flujo de compra contado no aparece nada de Stripe
- [ ] Verificar que la pagina `/clientes/comprar/[id]/pago` ya no existe (404)

---

## 4. Limpieza: BuscadorAgent eliminado

- [ ] Verificar que la app Homes carga sin errores
- [ ] Verificar que el mercado de casas (`/homes/market`) funciona (listados de partners VMF/21st Mortgage siguen funcionando)

---

## 5. Limpieza: PWA banner eliminado

- [ ] Verificar que NO aparece el banner "Instalar app Maninos" en ninguna pagina

---

## 6. Contabilidad: transaccion creada automaticamente

- [ ] Despues de que Abigail confirme un pago contado, ir a `/homes/accounting`
- [ ] Verificar que aparece una transaccion tipo "sale_cash" con:
  - Monto correcto (precio de la casa)
  - Cliente correcto
  - Propiedad correcta
  - Status "confirmed" (pendiente de reconciliar)
  - Cuenta contable "ventas_contado"

---

## 7. Seguimiento de Clientes en Homes

### 7.1 Empleado asignado
- [ ] Ir a `/homes/clients` → click en un cliente
- [ ] En la sidebar derecha, verificar que aparece la seccion "Seguimiento"
- [ ] Verificar que hay un dropdown "Empleado Asignado" con la lista de empleados del equipo
- [ ] Seleccionar un empleado → verificar toast "Empleado asignado"
- [ ] Recargar la pagina → verificar que el empleado sigue asignado

### 7.2 Notas y observaciones
- [ ] En la misma seccion, verificar que hay un formulario para agregar notas
- [ ] Seleccionar tipo "Observacion" → escribir texto → click "Agregar"
- [ ] Verificar que la nota aparece en la lista con: autor, fecha, badge azul "Observacion", contenido
- [ ] Agregar otra nota tipo "Llamada" → verificar badge verde
- [ ] Agregar nota tipo "Seguimiento" → verificar badge ambar
- [ ] Verificar que las notas estan ordenadas de mas reciente a mas antigua

---

## 8. Flujo RTO: Cliente reporta pago mensual

### 8.1 Cliente reporta pago
- [ ] Como cliente RTO, ir a `/clientes/mi-cuenta`
- [ ] En la tarjeta de pago pendiente, click "Pagar"
- [ ] Elegir metodo (Transferencia o Efectivo en oficina)
- [ ] Click "Reportar Pago"
- [ ] Verificar toast de confirmacion
- [ ] Verificar que el pago aparece como "Reportado por cliente" (badge azul)

### 8.2 Abigail confirma pago en Capital
- [ ] Ir a `/capital/payments`
- [ ] Verificar que aparece la seccion azul "Pagos Reportados por Clientes" en la parte superior
- [ ] Verificar que muestra: nombre cliente, numero de pago, propiedad, monto, metodo, telefono, email
- [ ] Click "El pago ha sido recibido"
- [ ] Aparece confirmacion → click "Si, confirmar"
- [ ] Verificar que el pago desaparece de la seccion de reportados
- [ ] Verificar que el pago aparece como "Pagado" en la tabla principal

### 8.3 Transaccion contable creada
- [ ] Ir a `/capital/accounting`
- [ ] Verificar que aparece una transaccion tipo "rto_payment" con:
  - Monto correcto (mensualidad)
  - Cliente correcto
  - Status "confirmed" (pendiente de reconciliar)
- [ ] Si habia mora, verificar transaccion adicional tipo "late_fee"

---

## 9. Flujo RTO: Contrato completado

### 9.1 Ultimo pago
- [ ] Cuando se confirma el ultimo pago de un contrato RTO (todos los pagos pagados)
- [ ] Verificar que el contrato cambia a status "completed"
- [ ] Verificar que la venta cambia a status "completed"
- [ ] Verificar que la propiedad cambia a status "sold"
- [ ] Verificar que el cliente cambia a status "completed"

### 9.2 Documentos y email
- [ ] Verificar que el cliente recibe email "Contrato RTO Completado!"
- [ ] Verificar que se generaron los documentos (Bill of Sale, Title) en Supabase Storage
- [ ] El cliente entra a `/clientes/mi-cuenta/documentos` → verificar que aparecen los 3 documentos

### 9.3 Completar desde Homes (alternativa)
- [ ] Ir a `/homes/clients` → click en un cliente RTO activo
- [ ] En su historial de ventas, si todos los pagos estan completados, verificar que aparece el boton verde "Completar Contrato RTO"
- [ ] Click → confirmacion → verificar que se ejecuta todo el flujo (documentos, email, status changes)

---

## 10. Portal Cliente: Saldo Pendiente RTO

- [ ] Como cliente RTO, ir a `/clientes/mi-cuenta`
- [ ] Verificar que aparece la tarjeta "Saldo Pendiente" en la sidebar con:
  - Monto pendiente (grande, visible)
  - Barra de progreso (pagado vs total)
  - Valor total del contrato
  - Pagos restantes (X/Y)
  - Proxima fecha de pago y monto
- [ ] Si hay pago vencido, verificar que se muestra en rojo

---

---

## 11. Reportes Financieros Inmutables (PDF)

### 11.1 Guardar reporte en Homes
- [ ] Ir a `/homes/accounting` → tab "Estados Financieros" (o Statements)
- [ ] Seleccionar tipo: "Estado de Resultados" (Income Statement)
- [ ] Seleccionar periodo (ej: mes actual)
- [ ] Click "Guardar Reporte"
- [ ] Verificar que aparece aviso de que el reporte sera inmutable
- [ ] Confirmar → verificar toast de exito
- [ ] Verificar que el reporte guardado muestra:
  - Badge "Inmutable" con icono de candado
  - Boton "PDF" para descargar
  - NO hay boton de editar
- [ ] Click "PDF" → verificar que se descarga un PDF con:
  - Header: "Maninos Homes LLC", titulo del reporte, periodo
  - Secciones: Ingresos, COGS, Gastos con montos
  - Totales y ganancia neta
  - Footer: "Este reporte es inmutable y no puede ser editado"

### 11.2 Guardar reporte en Capital
- [ ] Ir a `/capital/accounting` → seccion de reportes guardados
- [ ] Guardar un Estado de Resultados o Balance General
- [ ] Verificar misma logica: inmutable, PDF descargable, no editable

### 11.3 Intentar editar reporte guardado
- [ ] Intentar modificar un reporte guardado via API directa
- [ ] Verificar que devuelve error 403 "inmutables y no pueden ser editados"

---

## 12. Conciliacion Bancaria (paso a paso)

### Contexto
La conciliacion conecta los movimientos que la app registra automaticamente con los movimientos reales del estado de cuenta del banco. No siempre hay match y eso esta bien.

### 12.1 Preparar: tener movimientos en la app
- [ ] Asegurate de haber completado al menos 1 venta contado (test 1) o 1 pago RTO (test 8)
- [ ] Ir a `/homes/accounting` → tab "Transacciones"
- [ ] Verificar que aparecen transacciones con status "confirmed" (son las pendientes de conciliar)
- [ ] Anotar los montos y fechas de las transacciones

### 12.2 Subir estado de cuenta del banco
- [ ] Ir a `/homes/accounting` → tab "Conciliacion" (Reconciliation)
- [ ] Seleccionar la cuenta bancaria (ej: "Chase Business Checking")
- [ ] Verificar que aparecen las transacciones "confirmed" (no reconciliadas)
- [ ] Para cada transaccion que coincida con un movimiento del banco:
  - Marcar el checkbox de la transaccion
- [ ] Click "Conciliar Seleccionados"
- [ ] Verificar que las transacciones cambian a status "reconciled"
- [ ] Las transacciones sin match en el banco se quedan como "confirmed" — esto es normal

### 12.3 Verificar en reportes
- [ ] Ir a tab "Estados Financieros"
- [ ] Generar un Estado de Resultados del periodo
- [ ] Verificar que incluye TODAS las transacciones (tanto reconciliadas como no)
- [ ] Guardar como PDF inmutable

---

## 13. Ejemplo de Conciliacion con Estado de Cuenta

### Estado de cuenta ejemplo (Chase Bank - Marzo 2026)

| Fecha      | Descripcion                  | Deposito  | Retiro    | Balance   |
|------------|------------------------------|-----------|-----------|-----------|
| 01/03/2026 | Saldo inicial                |           |           | $50,000   |
| 03/03/2026 | ZELLE - JUAN PEREZ           | $1,500.00 |           | $51,500   |
| 05/03/2026 | WIRE - MARIA GARCIA          | $45,000   |           | $96,500   |
| 07/03/2026 | CHECK #1234 - HOME DEPOT     |           | $3,200.00 | $93,300   |
| 10/03/2026 | ZELLE - CARLOS LOPEZ         | $1,500.00 |           | $94,800   |
| 15/03/2026 | ACH - AT&T UTILITIES         |           | $189.00   | $94,611   |
| 20/03/2026 | ZELLE - UNKNOWN SENDER       | $500.00   |           | $95,111   |

### Movimientos registrados en la app (automaticos)

| Fecha      | Tipo          | Descripcion                          | Monto     | Status    |
|------------|---------------|--------------------------------------|-----------|-----------|
| 03/03/2026 | rto_payment   | Pago RTO #3 - Juan Perez             | $1,500.00 | confirmed |
| 05/03/2026 | sale_cash     | Venta Contado: 123 Oak St → M.Garcia | $45,000   | confirmed |
| 07/03/2026 | renovation    | Renovacion: 456 Pine Ave - Home Depot| $3,200.00 | confirmed |
| 10/03/2026 | rto_payment   | Pago RTO #5 - Carlos Lopez           | $1,500.00 | confirmed |

### Proceso de conciliacion

**Paso 1:** Comparar movimientos de la app con el estado de cuenta

| App                          | Estado de Cuenta              | Match? |
|------------------------------|-------------------------------|--------|
| RTO Juan Perez $1,500        | ZELLE JUAN PEREZ $1,500       | SI     |
| Venta M.Garcia $45,000       | WIRE MARIA GARCIA $45,000     | SI     |
| Renovacion Home Depot $3,200 | CHECK HOME DEPOT $3,200       | SI     |
| RTO Carlos Lopez $1,500      | ZELLE CARLOS LOPEZ $1,500     | SI     |
| (nada)                        | ACH AT&T $189                | NO (gasto no registrado) |
| (nada)                        | ZELLE UNKNOWN $500           | NO (deposito sin identificar) |

**Paso 2:** Marcar como "reconciled" los 4 que coinciden

**Paso 3:** Los 2 sin match se quedan sin conciliar:
- El gasto de AT&T $189 → se puede crear manualmente como transaccion tipo "operating_expense"
- El deposito de $500 → se puede investigar despues o dejarlo pendiente

**Resultado:** 4 de 6 movimientos conciliados. Los otros 2 se resuelven cuando se identifiquen.

---


## Notas

- Los datos bancarios son placeholder (000000000) hasta que se proporcionen los reales
- Migraciones 055 y 056 ya ejecutadas
- Migracion 057 (immutable_financial_reports) pendiente de ejecutar en Supabase
- La reconciliacion permite que haya movimientos sin match con el banco (no es obligatorio)
- Los reportes financieros guardados son inmutables (no se pueden editar, solo descargar PDF)
- Cada pago confirmado (contado o RTO) crea automaticamente una transaccion contable para conciliacion


---
---

# Tests Bloque 1 Capital — Marzo 14, 2026

**Prerequisito:** Ejecutar `migrations/062_capital_bloque1_improvements.sql` en Supabase antes de probar.

---

## B1.1 Dividir Movimientos Bancarios

### B1.1.1 Dividir un movimiento en 2 partes
- [X] Ir a `/capital/accounting` → tab "Estado de Cuenta"
- [X] Subir un estado de cuenta PDF o usar uno existente
- [X] En un movimiento pendiente/sugerido, hacer clic en el icono de tijeras (Scissors)
- [X] Verificar que aparece el formulario de division con 2 filas por defecto
- [X] Rellenar: Parte 1 = $500 "Consulting", Parte 2 = $89 "Office supplies" (total debe ser = monto original)
- [X] Clic "+ Añadir parte" → verificar que aparece una tercera fila
- [X] Quitar la tercera fila con X → verificar que vuelve a 2
- [X] Intentar dividir con montos que NO suman al total → verificar mensaje de error
- [X] Rellenar con montos correctos → clic "Dividir"
- [X] Verificar toast de éxito "Movimiento dividido en 2 partes"
- [X] Verificar que el movimiento original aparece tachado con badge "Dividido" (gris)
- [X] Verificar que aparecen 2 nuevos sub-movimientos debajo con "↳" y las descripciones/montos correctos
- [X] Verificar que los sub-movimientos se pueden clasificar individualmente (asignar cuentas)

### B1.1.2 Sub-movimientos no se pueden dividir
- [ ] En un sub-movimiento (tiene ↳), verificar que NO aparece el botón de tijeras

---

## B1.2 Editar Descripciones de Movimientos

### B1.2.1 Editar descripción
- [ ] En un movimiento pendiente/sugerido/confirmado, hacer clic sobre la descripción
- [ ] Verificar que aparece un input editable con el texto actual
- [ ] Cambiar el texto → presionar Enter (o clic ✓)
- [ ] Verificar que la descripción se actualiza sin recargar la página
- [ ] Hacer clic en la descripción de nuevo → presionar Escape
- [ ] Verificar que se cancela la edición sin guardar

### B1.2.2 No se puede editar si está publicado
- [ ] En un movimiento con status "Publicado" (azul), verificar que al hacer clic NO se abre el editor
- [ ] Verificar que no aparece el icono del lápiz al hacer hover

---

## B1.3 Notas en Movimientos

### B1.3.1 Añadir nota
- [ ] En un movimiento editable, verificar que aparece el link "Añadir nota" debajo de la descripción
- [ ] Clic → verificar que aparece un textarea
- [ ] Escribir "Verificar con Abi si es gasto recurrente" → clic ✓
- [ ] Verificar que la nota aparece en itálica debajo de la descripción con icono 💬
- [ ] Verificar que la nota se mantiene al recargar la página

### B1.3.2 Editar nota existente
- [ ] Hacer clic sobre una nota existente
- [ ] Verificar que se abre el textarea para editar
- [ ] Cambiar el texto → guardar
- [ ] Verificar actualización

### B1.3.3 Nota no editable si publicado
- [ ] En un movimiento "Publicado", verificar que no aparece "Añadir nota" ni se puede editar

---

## B1.4 Tabla Amortización Eliminada

- [ ] Ir a `/capital/applications` → abrir cualquier aplicación RTO
- [ ] Verificar que NO aparece la tabla de amortización en la página
- [ ] Verificar que la página carga sin errores en consola

---

## B1.5 Down Payment Divisible

### B1.5.1 Crear plan de cuotas
- [ ] Ir a un contrato RTO en Capital que tenga down payment > 0
- [ ] Verificar que aparece la sección "Enganche" con el monto total
- [ ] Clic "Dividir Enganche" (si hay botón)
- [ ] Crear 3 cuotas: $2000, $1500, $1500 con fechas distintas
- [ ] Verificar que se muestra el plan con cada cuota y su fecha

### B1.5.2 Registrar pago de cuota
- [ ] En una cuota "scheduled", clic "Registrar Pago"
- [ ] Seleccionar método de pago y referencia
- [ ] Verificar que la cuota cambia a "paid" con la fecha de hoy
- [ ] Verificar que el saldo pendiente del enganche se actualiza

### B1.5.3 Backend: GET /contracts/{id}/down-payment
- [ ] Llamar al endpoint directamente
- [ ] Verificar que devuelve: total, paid, remaining, installments[]

---

## B1.6 Alertas Promissory Notes

### B1.6.1 Banner de alertas
- [ ] Ir a `/capital` (dashboard principal)
- [ ] Si hay promissory notes con vencimiento en < 90 días, verificar que aparece un banner de alerta
- [ ] Verificar colores: rojo (< 30 días), naranja (< 60 días), amarillo (< 90 días)
- [ ] Si no hay notas próximas a vencer, verificar que no aparece el banner

### B1.6.2 Scheduler (backend)
- [ ] Verificar en logs del backend que el job `_job_promissory_maturity_alerts` está registrado
- [ ] Crear una promissory note con `maturity_date` = hoy + 30 días
- [ ] Ejecutar el job manualmente o esperar a que corra
- [ ] Verificar que se envía email de alerta
- [ ] Verificar que `last_maturity_alert_at` se actualiza en la DB
- [ ] Verificar que no se envía otro email si se ejecuta de nuevo antes de 7 días

---

## B1.7 Pagos RTO en Capital

### B1.7.1 Registrar pago RTO manualmente
- [ ] Ir a `/capital/accounting`
- [ ] Usar el endpoint POST /accounting/rto-payments/register (o la UI si se añadió)
- [ ] Registrar un pago con: nombre cliente, monto, método, referencia, fecha, cuenta bancaria
- [ ] Verificar que se crea una transacción tipo "rto_payment" en Capital
- [ ] Verificar que aparece en el listado de transacciones

### B1.7.2 Listar pagos RTO
- [ ] Llamar GET /accounting/rto-payments
- [ ] Verificar que devuelve la lista de pagos RTO registrados
- [ ] Verificar que incluye info de cliente y estado de conciliación

### B1.7.3 Conciliar pago RTO con estado de cuenta
- [ ] Subir un estado de cuenta que incluya el depósito del pago RTO
- [ ] Ejecutar "Buscar coincidencias" (paso 1 del wizard)
- [ ] Verificar que el pago RTO aparece como match con el movimiento del banco
- [ ] Confirmar la conciliación → verificar que el movimiento pasa a "conciliado"

---

## B1.8 Flujo Completo: Estado de Cuenta → Reportes (verificación post-fixes)

### B1.8.1 Doble partida cuadra
- [ ] Subir un estado de cuenta nuevo en Capital
- [ ] Clasificar con IA (verificar que few-shot learning funciona si hay correcciones previas)
- [ ] Verificar cuenta contable QB vinculada al banco (dropdown en Estado de Cuenta)
- [ ] Publicar → verificar toast éxito
- [ ] Ir a P&L → anotar Net Income
- [ ] Ir a Balance Sheet → verificar que el banco muestra el mismo monto que Net Income
- [ ] Si no cuadra, reportar la diferencia exacta

### B1.8.2 Vaciar cifras y re-publicar
- [ ] Vaciar todas las cifras
- [ ] Verificar que P&L y Balance Sheet quedan en $0
- [ ] Re-clasificar → re-publicar
- [ ] Verificar que vuelven los montos correctos y siguen cuadrando

### B1.8.3 Reportes read-only
- [ ] Verificar que NO aparece el mensaje "clic en un monto para editar" (ni en Capital ni en Homes)
- [ ] Verificar que los montos en P&L y Balance Sheet no son clickeables

### B1.8.4 Renombrar reporte guardado
- [ ] Guardar un reporte financiero
- [ ] Hacer hover sobre el nombre → verificar que aparece icono lápiz
- [ ] Clic → editar nombre → Enter
- [ ] Verificar que el nombre se actualiza
- [ ] Recargar página → verificar que persiste

---

## Notas Bloque 1

- Migración 062 debe ejecutarse ANTES de probar splits y down payment installments
- El scheduler de alertas requiere que el backend esté corriendo (Railway)
- Los fixes de doble partida (bank_is_income basado en account_type) ya están en producción
- El few-shot learning ahora busca correcciones en movimientos "confirmed" Y "posted"


---
---

# Tests Bloque 2 Capital — Marzo 16, 2026

**Prerequisitos:**
- Ejecutar `migrations/063_capital_split_status.sql` en Supabase
- Ejecutar `migrations/064_dp_installment_client_reported.sql` en Supabase
- Ejecutar `migrations/065_capital_txn_pending_confirmation_status.sql` en Supabase

---

## B2.1 Notificaciones en Capital (Abigail)

### B2.1.1 Navegación
- [ ] Ir a `/capital`
- [ ] Verificar que en el sidebar "Notificaciones" aparece en sección propia "General" (arriba de todo, NO dentro de "Clientes")
- [ ] Verificar que el sidebar dice "Maninos Capital" (NO "Maninos Homes")
- [ ] Verificar que el dashboard dice "Panel Maninos Capital"
- [ ] Clic "Notificaciones" → verificar que carga `/capital/notificaciones`

### B2.1.2 Secciones de notificaciones
- [ ] Verificar que la página muestra hasta 4 secciones:
  - **Roja**: "Alertas de Vencimiento — Pagarés" (vencidos, esta semana, próximos 90 días)
  - **Azul**: "Pagos RTO Reportados por Clientes" (pagos mensuales)
  - **Morada**: "Cuotas de Enganche Reportadas por Clientes"
  - **Dorada**: "Transacciones Pendientes de Confirmar" (inversiones, pagares, comisiones, etc.)
- [ ] Si no hay pendientes en alguna sección, verificar que no aparece esa sección
- [ ] Si no hay nada pendiente, verificar mensaje "No hay notificaciones pendientes"

### B2.1.3 Alertas de pagarés en notificaciones
- [ ] Crear un pagaré con vencimiento dentro de 90 días
- [ ] Ir a `/capital/notificaciones`
- [ ] Verificar que aparece la sección roja con la alerta
- [ ] Verificar colores: rojo (vencido), naranja (≤7 días), ámbar (≤90 días)
- [ ] Clic en la alerta → verificar que navega al detalle del pagaré

---

## B2.2 Flujo Completo: Cliente Reporta Pago RTO → Notificación → Confirmación

### B2.2.1 Cliente reporta pago mensual
- [ ] Como cliente RTO, ir a `/clientes/mi-cuenta/rto/[saleId]`
- [ ] En un pago pendiente, clic "Pagar"
- [ ] Elegir "Transferencia" o "Efectivo en oficina"
- [ ] Clic "Reportar Pago"
- [ ] Verificar toast de confirmación
- [ ] Verificar que el pago aparece como "Reportado — pendiente confirmar" (badge azul)

### B2.2.2 Abigail ve notificación en Capital
- [ ] Ir a `/capital/notificaciones`
- [ ] Verificar que aparece el pago en la sección azul "Pagos RTO Reportados"
- [ ] Verificar que muestra: nombre cliente, número de pago, propiedad, monto, método, contacto

### B2.2.3 Abigail confirma
- [ ] Clic "El pago ha sido recibido"
- [ ] Verificar diálogo de confirmación → clic "Sí, confirmar"
- [ ] Verificar que la notificación desaparece de la lista
- [ ] Verificar que el pago aparece como "paid" en la tabla de pagos del contrato

### B2.2.4 Transacción creada para conciliación
- [ ] Ir a `/capital/accounting` → tab "Transacciones"
- [ ] Verificar que existe una transacción tipo "rto_payment" con status "confirmed"
- [ ] Verificar monto, cliente y fecha correctos
- [ ] Esta transacción se puede conciliar cuando se suba el estado de cuenta del banco

### B2.2.5 Portal cliente actualizado
- [ ] Como cliente, volver a `/clientes/mi-cuenta/rto/[saleId]`
- [ ] Verificar que el pago ahora muestra "Pago recibido" (badge verde)

---

## B2.3 Flujo Completo: Enganche Divisible → Pago → Notificación → Confirmación

### B2.3.1 Dividir enganche en Capital
- [ ] Ir a un contrato RTO en `/capital/contracts/[id]`
- [ ] Verificar que aparece sección "Enganche" con el monto total
- [ ] Clic "Dividir Enganche"
- [ ] Crear 3 cuotas con fechas futuras (ej: $2000, $1500, $1500)
- [ ] Clic "Guardar Plan de Cuotas"
- [ ] Verificar toast de éxito
- [ ] Verificar que aparece tabla de cuotas con barra de progreso

### B2.3.2 Cliente ve cuotas en su portal
- [ ] Como cliente, ir a `/clientes/mi-cuenta/rto/[saleId]`
- [ ] Verificar que aparece sección "Cuotas del Enganche" ANTES de la tabla de pagos
- [ ] Verificar que muestra barra de progreso del enganche
- [ ] Verificar que cada cuota muestra fecha, monto y status "Pendiente" (ámbar)

### B2.3.3 Cliente reporta pago de cuota
- [ ] En una cuota con status "Pendiente", verificar que aparecen botones "Pagué en efectivo" y "Transferencia"
- [ ] Clic en uno de los botones
- [ ] Verificar que la cuota cambia a "Reportado — pendiente confirmar" (badge azul)
- [ ] Verificar que aparece mensaje "Maninos está verificando tu pago"
- [ ] Verificar que los botones de pago desaparecen para esa cuota

### B2.3.4 Abigail ve notificación de enganche
- [ ] Ir a `/capital/notificaciones`
- [ ] Verificar que aparece en la sección morada "Cuotas de Enganche Reportadas"
- [ ] Verificar que muestra: nombre cliente, propiedad, monto cuota, método, fecha

### B2.3.5 Abigail confirma cuota de enganche
- [ ] Clic "Confirmar Recibido"
- [ ] Verificar diálogo → confirmar
- [ ] Verificar que desaparece de la lista

### B2.3.6 Transacción creada
- [ ] Ir a `/capital/accounting` → tab "Transacciones"
- [ ] Verificar que existe transacción tipo "down_payment" con status "confirmed"
- [ ] Esta transacción se puede conciliar con el estado de cuenta del banco

### B2.3.7 Portal cliente actualizado
- [ ] Como cliente, verificar que la cuota ahora muestra "Pago recibido" (badge verde)

---

## B2.4 Inversiones → Notificación → Confirmación

### B2.4.1 Crear inversión
- [ ] Ir a `/capital/investors` → crear nueva inversión (o usar endpoint directamente)
- [ ] Verificar que se crea correctamente

### B2.4.2 Notificación generada
- [ ] Ir a `/capital/notificaciones`
- [ ] Verificar que aparece en la sección dorada "Transacciones Pendientes"
- [ ] Verificar tipo "investor_deposit" con el monto correcto

### B2.4.3 Confirmar
- [ ] Clic "Confirmar" → verificar que desaparece
- [ ] Verificar transacción "confirmed" en accounting para conciliación

---

## B2.5 Pagarés → Notificación → Confirmación

### B2.5.1 Crear pagaré (recibir dinero)
- [ ] Ir a `/capital/promissory-notes` → crear nuevo pagaré
- [ ] Verificar notificación tipo "investor_deposit" en `/capital/notificaciones`

### B2.5.2 Registrar pago de pagaré (devolver dinero)
- [ ] En un pagaré activo, registrar un pago
- [ ] Verificar notificación tipo "investor_return" (is_income=false)

### B2.5.3 Confirmar ambos
- [ ] Confirmar cada notificación
- [ ] Verificar que ambas transacciones quedan "confirmed" para conciliación

---

## B2.6 Conciliación: Transacciones de Capital con Estado de Cuenta

### B2.6.1 Verificar transacciones disponibles
- [ ] Después de confirmar varios pagos/inversiones en Notificaciones
- [ ] Ir a `/capital/accounting` → subir estado de cuenta bancario
- [ ] Ejecutar "Buscar coincidencias" (wizard paso 1)
- [ ] Verificar que las transacciones confirmadas (RTO payments, dp payments, inversiones, pagarés) aparecen como posibles matches
- [ ] Confirmar las coincidencias → verificar que se concilian correctamente

---

## B2.7 Branding Capital (verificación rápida)

- [ ] `/capital` → header dice "Maninos Capital" (NO Homes)
- [ ] `/capital` → sidebar dice "Maninos Capital"
- [ ] `/capital` → dashboard dice "Panel Maninos Capital"
- [ ] `/capital/accounting` → subtítulo dice "Maninos Capital LLC"
- [ ] `/capital/notificaciones` → título dice "Notificaciones Capital"

---

## Notas Bloque 2

- Migraciones 063 y 064 deben ejecutarse ANTES de probar
- El flujo de notificaciones es: evento → `record_txn()` crea transacción `pending_confirmation` → Abigail confirma → `confirmed` → disponible para conciliación bancaria
- Todos los pagos de Capital (RTO, enganche, inversiones, pagarés, comisiones) pasan por este flujo
- En el portal cliente, los pagos pasan por: `scheduled` → `client_reported` → `paid`
- Las notificaciones en Homes son solo para ventas al contado; todo lo RTO/Capital va a `/capital/notificaciones`


