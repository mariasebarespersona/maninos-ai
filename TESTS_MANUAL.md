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
