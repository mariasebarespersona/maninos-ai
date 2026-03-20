# Maninos AI Platform — Reporte de Entrega con Mejoras V5

**Fecha:** 20 de Marzo, 2026
**Preparado para:** Sebastian Zambrano, CEO — Maninos Homes LLC & Maninos Capital LLC
**Preparado por:** RAMA AI

---

## Links de Acceso

| Portal | URL | Usuarios |
|--------|-----|----------|
| **Maninos Homes** | https://maninos-ai.vercel.app/homes | Empleados (Gabriel, Romario, Abigail) |
| **Maninos Capital** | https://maninos-ai.vercel.app/capital | Sebastian, Abigail (acceso restringido) |
| **Portal Clientes** | https://maninos-ai.vercel.app/clientes | Clientes publicos |

---

## Resumen de Mejoras Implementadas

Esta version incluye **104+ mejoras** distribuidas en los 3 portales. A continuacion el detalle completo organizado por las categorias del tracker de desarrollo.

---

## PORTAL HOMES V2 — Mejoras Implementadas

### Propiedades y Documentos

| # | Mejora | Estado |
|---|--------|--------|
| 1 | Medidas de propiedad en pies cuadrados + largo x ancho | Implementado |
| 2 | Todo lo que se escribe en Bill of Sale + Aplicacion se guarda en los documentos de cada propiedad | Implementado |
| 3 | Relleno automatico de Aplicacion Cambio Titulo con datos del titulo (Block 2a, 2b default yes, Block 3 vacio pero siempre NO, Block 4a del titulo, Block 6 inventory ticket checked, HUD label + serial number de la seccion 1) | Implementado |
| 4 | La aplicacion cambio titulo no es compulsory (opcional) | Implementado |
| 5 | No dejar poner varias opciones en ticket (Yes or No) | Implementado |
| 6 | En "Nueva propiedad" meter todo el proceso de compra (formulario de 4 pasos: datos + documentos + evaluacion + pago) | Implementado |

### Seccion Titulos (NUEVA)

| # | Mejora | Estado |
|---|--------|--------|
| 7 | Seccion estados de titulos de casas con integracion TDHCA (Texas) | Implementado |
| 8 | Monitoreo automatico: cuando el nombre del titulo cambia en TDHCA, se envia alerta a Homes | Implementado |
| 9 | El titulo se actualiza automaticamente y se manda mensaje al cliente | Implementado |
| 10 | Documentos de compra y venta gestionados desde la misma seccion (Bill of Sale, Titulo, Aplicacion) | Implementado |

### Seccion Notificaciones (NUEVA)

| # | Mejora | Estado |
|---|--------|--------|
| 11 | Nueva seccion de notificaciones en Homes | Implementado |
| 12 | Requisiciones de pago: cuando hace falta pagar algo, le llega a Sebastian para aprobar | Implementado |
| 13 | Sebastian aprueba, le llega a Abigail para ejecutar el pago | Implementado |
| 14 | Abigail solo puede hacer el pago si Sebastian lo ha aprobado antes | Implementado |
| 15 | Para Sebastian: notificacion de check de los pagos por hacer | Implementado |
| 16 | Cotizaciones de renovacion pendientes de aprobacion (desde Notificaciones) | Implementado |
| 17 | Transferencias bancarias por confirmar (pagos de clientes al contado) | Implementado |

### Pagos y Requisiciones

| # | Mejora | Estado |
|---|--------|--------|
| 18 | Cuando se paga una casa: existing payee or new payee options | Implementado |
| 19 | Requisicion de pago casa, notificacion a Abigail para hacer el pago con toda la info | Implementado |
| 20 | Los pagos hechos por Abigail se mandan a contabilidad para la conciliacion cuando llegan estados de cuentas | Implementado |
| 21 | En contabilidad, recibos para cada transaccion | Implementado |

### Evaluacion de Casas

| # | Mejora | Estado |
|---|--------|--------|
| 22 | Evaluacion de casa: Reporte con checklist de 28 puntos (cajones mas generales) | Implementado |
| 23 | Analisis AI de fotos (GPT-4o) para auto-rellenar checklist de evaluacion | Implementado |
| 24 | Importacion inteligente de reporte de evaluacion a cotizacion de renovacion (GPT-4o-mini) | Implementado |

### Contabilidad Homes

| # | Mejora | Estado |
|---|--------|--------|
| 25 | Movimientos extra se guardan y concilian una vez se sube un estado de cuenta | Implementado |
| 26 | Integrar info en reportes (P&L, Balance General) | Implementado |
| 27 | Reportes no modificables (bloqueables por admin) | Implementado |
| 28 | Plan de cuentas contables completo | Implementado |
| 29 | Conciliacion bancaria con clasificacion AI de movimientos | Implementado |
| 30 | Presupuestos y gastos fijos recurrentes | Implementado |
| 31 | Auditoria de todas las transacciones | Implementado |

### Remodelacion Homes (V5)

| # | Mejora | Estado |
|---|--------|--------|
| 32 | Integrar feature de voz inteligente (GPT-4o-mini) — funciona en movil: "pon en demolicion 500 de materiales y 4 dias" | Implementado |
| 33 | Anadir: dias, Materiales, Persona responsable, gasto mano de obra (19 partidas con MO + Materiales separados) | Implementado |
| 34 | Anadir sugerencias editables (items personalizados) | Implementado |
| 35 | Una vez guardada la info, mandar a Sebastian/manager para aprobar y a Abigail (flujo de aprobacion desde Notificaciones) | Implementado |
| 36 | Cronograma Gantt visual para planificacion de obra | Implementado |
| 37 | Importacion de reporte de evaluacion, sugerencias automaticas de renovacion | Implementado |
| 38 | Sub-campos por partida (ej: tipo de siding, color de pintura, zona de pisos) | Implementado |
| 39 | Reglas de materiales del negocio integradas | Implementado |

### Movida de Casa

| # | Mejora | Estado |
|---|--------|--------|
| 40 | Meter numero telefono proveedores de movidas | Implementado |
| 41 | Mandar mensaje WhatsApp al numero del proveedor | Implementado |
| 42 | Meter datos bancos proveedor (la mayoria son efectivo) | Implementado |
| 43 | Una vez confirmado todo, mandar orden de pago a Abigail | Implementado |

### Precio Venta Post Remodelacion

| # | Mejora | Estado |
|---|--------|--------|
| 44 | Formula: $9,500 + venta (compra + gastos comision + reparacion + movida) | Implementado |
| 45 | Prediccion de precio basada en 93 datos historicos reales de Maninos (KNN) | Implementado |

### Clientes (en Homes)

| # | Mejora | Estado |
|---|--------|--------|
| 46 | Gestionar documentos a transferir tras venta de casa (Bill of Sale, Titulo, Aplicacion) | Implementado |
| 47 | Gestionar que se vea reflejado que llegan los pagos | Implementado |

### Comisiones

| # | Mejora | Estado |
|---|--------|--------|
| 48 | Creacion de cuenta empleados, asignar roles | Implementado |
| 49 | Los roles van ligados a la comision ($1,500 contado / $1,000 RTO) | Implementado |
| 50 | Control de quien puede ver que (restricciones por rol) | Implementado |
| 51 | Ranking de empleados por comisiones del mes | Implementado |

### WhatsApp y Acceso

| # | Mejora | Estado |
|---|--------|--------|
| 52 | WhatsApp flyer casas, compartir propiedades con texto + imagen | Implementado |
| 53 | Poner restricciones de acceso en la app (roles: admin, operations, treasury, yard_manager) | Implementado |

### Scraping Casas del Mercado

| # | Mejora | Estado |
|---|--------|--------|
| 54 | Scraping automatico de 5 fuentes: MHVillage, VMF Homes, 21st Mortgage, Craigslist, Facebook Marketplace | Implementado |
| 55 | Regla del 60% para identificar oportunidades de compra | Implementado |
| 56 | Conexion con Facebook Marketplace via importacion de cookies | Implementado |
| 57 | Calificacion automatica de casas (precio, zona 200mi Houston/Dallas, tipo) | Implementado |

---

## PORTAL CLIENTES V2 — Mejoras Implementadas

### Compra al Contado

| # | Mejora | Estado |
|---|--------|--------|
| 58 | Clientes que pagan al contado: Pagar por transferencia bancaria, se ofrece info bancaria de Maninos | Implementado |
| 59 | Clientes pagan contado: que les aparezcan los documentos Bill of Sale, Titulo, Aplicacion Cambio Titulo | Implementado |
| 60 | Bill of Sale viene con la info del cliente auto-rellenada | Implementado |
| 61 | Mandar email clientes al contado: Venta casa email + documentos | Implementado |
| 62 | Opcion de enviar comprobante de transferencia por WhatsApp | Implementado |

### Compra RTO (Rent-to-Own)

| # | Mejora | Estado |
|---|--------|--------|
| 63 | Flujo RTO visual de 4 pasos: Verificar identidad, Solicitud de credito, Firmar contrato, Pagos mensuales | Implementado |
| 64 | Verificacion de identidad: cliente sube foto ID + selfie desde su cuenta | Implementado |
| 65 | Solicitud de credito de 9 secciones (formato profesional basado en HUD 56001-MH): informacion personal, historial vivienda, empleo, otras fuentes de ingreso, propiedades, deudas, referencias, historial legal, contacto emergencia | Implementado |
| 66 | Pregunta clave: Es propietario de mas casas? Informacion muy importante | Implementado |
| 67 | Pregunta clave: Tiene otros ingresos? (SSI, SSDI, VA, child support, segundo trabajo, negocio propio) | Implementado |
| 68 | La aplicacion cambio de titulo a rellenar por cliente (desde su portal) | Implementado |
| 69 | Mostrar saldo pendiente en personas RTO (en Mi Cuenta) | Implementado |
| 70 | Firma digital de contrato: el cliente firma desde su portal (nombre + aceptacion de terminos obligatoria) | Implementado |
| 71 | Maninos firma automaticamente (Sebastian Zambrano, Maninos Capital LLC) | Implementado |
| 72 | PDF del contrato generado con ambas firmas y fecha | Implementado |
| 73 | Simulador RTO: quitar intereses + total a pagar (el cliente solo ve mensualidad, no interes) | Implementado |
| 74 | Simulador RTO minimo 30% enganche (pero sugerido 50%) | Implementado |

### Emails Automaticos al Cliente

| # | Mejora | Estado |
|---|--------|--------|
| 75 | Email de confirmacion de solicitud RTO | Implementado |
| 76 | Email cuando el contrato esta listo para firmar (con link directo) | Implementado |
| 77 | Mandar email cliente al finalizar RTO con sus documentos | Implementado |
| 78 | Emails de recordatorio de pagos mensuales | Implementado |
| 79 | Emails de pagos atrasados | Implementado |
| 80 | Mandar email cliente con opciones post compra casa RTO | Implementado |

### Diseno y UX

| # | Mejora | Estado |
|---|--------|--------|
| 81 | Diseno unificado navy/blue estilo Airbnb en todo el portal (eliminado naranja/verde anterior) | Implementado |
| 82 | Tutoriales interactivos paso a paso en cada portal | Implementado |

---

## PORTAL CAPITAL V2 — Mejoras Implementadas

### Solicitudes y Aprobacion RTO

| # | Mejora | Estado |
|---|--------|--------|
| 83 | Pagos clientes RTO llegan a Capital: Abi registra con toda la info | Implementado |
| 84 | Esos pagos se concilian con estados de cuenta | Implementado |
| 85 | Los pagos se meten en reportes automaticamente | Implementado |
| 86 | Verificacion de identidad (KYC): solicitar, cliente sube documentos, revisar fotos, aprobar/rechazar | Implementado |
| 87 | Solicitud de credito de 9 secciones visible en read-only + plantilla vacia de referencia | Implementado |

### Calculo Personalizado de Mensualidad RTO (NUEVO)

| # | Mejora | Estado |
|---|--------|--------|
| 88 | Algoritmo personalizado basado en 6 inputs: renta actual, valor casa, plazo, down payment, valor futuro, rendimiento | Implementado |
| 89 | Precio Inteligente: ancla la mensualidad a la renta actual del cliente (el cliente ahorra 10% vs su renta, Maninos captura la diferencia) | Implementado |
| 90 | Prediccion de valor futuro de la casa (modelo KNN con 93 datos historicos + depreciacion 3.5% anual) | Implementado |
| 91 | 4 escenarios comparativos (24, 36, 48, 60 meses) con ROI, DTI, y asequibilidad | Implementado |
| 92 | Tope justo: total que paga el cliente nunca supera 2x el precio de venta | Implementado |
| 93 | Quitar tabla amortizacion (el cliente solo ve mensualidad) | Implementado |

### Estados Financieros y Contabilidad

| # | Mejora | Estado |
|---|--------|--------|
| 94 | Estados financieros no editables (bloqueables) | Implementado |
| 95 | En estado de cuenta: montos se pueden dividir | Implementado |
| 96 | Abi puede anadir descripciones a movimientos | Implementado |
| 97 | Abi puede anadir notas a descripciones existentes | Implementado |
| 98 | Contabilidad de Capital separada de Homes | Implementado |
| 99 | Reconciliacion bancaria con clasificacion AI | Implementado |

### Down Payment e Inversores

| # | Mejora | Estado |
|---|--------|--------|
| 100 | Hacer el down payment divisible (pagos fraccionados del enganche) | Implementado |
| 101 | Promissory Notes: vencimiento 3 meses antes, alerta automatica a Capital | Implementado |
| 102 | Seguimiento de inversores con dashboard de capital captado/invertido/disponible | Implementado |
| 103 | KPIs financieros de Capital en el dashboard | Implementado |

### Acceso y Seguridad

| # | Mejora | Estado |
|---|--------|--------|
| 104 | Login separado para Capital (solo Sebastian y Abigail) | Implementado |
| 105 | Portal Capital no accesible desde Homes (separacion completa) | Implementado |

---

## Logicas de Negocio Principales

### Logica de Titulos
1. Informacion del titulo directamente en la aplicacion (integracion TDHCA Texas)
2. Relleno automatico de la Aplicacion de Cambio de Titulo con datos reales del TDHCA
3. Cuando el nombre del titulo cambia, alerta automatica a Homes
4. Si la casa se vende, alerta al cliente con sus documentos

### Logica de Requisiciones (Payment Orders)
1. Cada vez que hace falta hacer un pago, se genera requisicion
2. Le llega a **Sebastian** para aprobar desde Notificaciones
3. Le llega a **Abigail** para ejecutar el pago
4. Una vez ejecutada y confirmada por Abigail, se manda a Contabilidad
5. Se guarda hasta que llega estado de cuenta, conciliacion de movimientos
6. Una vez los movimientos conciliados y confirmados por Abigail, se anaden automaticamente las cuentas contables
7. Una vez confirmado, se manda a los estados financieros donde se generan los reportes

### Logica de Pagos (Casas + Mensualidades)
1. Un cliente confirma que ha hecho el pago, le llega a Abigail
2. Abigail confirma que el pago se ha recibido desde Homes o Capital
3. La info de los pagos se manda a Contabilidad (Homes o Capital segun corresponda)
4. Al cliente se le actualizan los pagos pendientes en su cuenta
5. Una vez se termine de pagar la casa, se transfieren los documentos: Bill of Sale, Titulo y Aplicacion Titulo al cliente
6. Una vez se cambia el nombre en el titulo, le llega al cliente un email de alerta

### Logica RTO Completa (End-to-End)
1. Cliente selecciona casa en el catalogo, elige RTO
2. Capital solicita verificacion de identidad, cliente sube ID + selfie
3. Capital revisa documentos, aprueba o rechaza identidad
4. Cliente completa solicitud de credito de 9 secciones
5. Capital calcula mensualidad inteligente (Precio Inteligente vs Estandar)
6. Capital aprueba, contrato se genera con firma automatica de Sebastian
7. Email al cliente con link para firmar
8. Cliente firma desde su portal
9. Contrato activo, se generan pagos mensuales
10. Recordatorios automaticos de pago por email
11. Late fees automaticos ($15/dia tras 5 dias de gracia)
12. Al completar todos los pagos, documentos transferidos al cliente

---

## Stack Tecnico

| Capa | Tecnologia |
|------|-----------|
| Backend | Python 3.12, FastAPI, Supabase (PostgreSQL) |
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| AI/LLM | OpenAI GPT-4o (fotos, evaluacion) + GPT-4o-mini (voz, importacion, parsing) |
| Scraping | Playwright + BeautifulSoup (MHVillage, Craigslist, Facebook) |
| Emails | Resend (transaccionales con templates de marca) |
| PDFs | ReportLab (contratos, Bill of Sale, Titulo, reportes financieros) |
| Deploy | Railway (API Docker) + Vercel (Frontend) |
| Auth | Supabase Auth (empleados + clientes separados) |

---

*Reporte generado automaticamente. Para preguntas o soporte, contactar a RAMA AI.*
