# Maninos AI - Demo Plan

**Duracion estimada:** 35-40 minutos
**Preparacion:** Ejecutar `scripts/cleanup_demo.sql` en Supabase SQL Editor antes del demo.

---

## Pre-Demo Checklist

- [ ] Ejecutar script de limpieza en Supabase
- [ ] Verificar que el backend esta corriendo (Railway)
- [ ] Verificar que el frontend esta corriendo (Vercel)
- [ ] Tener cookies de Facebook listas en `system_config`
- [ ] Abrir los 3 portales en tabs separadas:
  - Homes: `https://homes.maninos.ai`
  - Capital: `https://capital.maninos.ai`
  - Clientes: `https://clientes.maninos.ai`
- [ ] Login como admin en Homes y Capital
- [ ] Tener datos de prueba listos (direccion de propiedad, fotos de ejemplo)

---

## Parte 1: Portal Homes (Operaciones) — 15 min

### 1.1 Dashboard
- Mostrar KPIs principales: propiedades activas, ventas del mes, renovaciones en progreso
- Actividad reciente: ultimas acciones del equipo
- **Talking point:** "Todo el equipo ve en tiempo real el estado de cada propiedad"

### 1.2 Casas del Mercado (Market Listings)
- Mostrar la lista de casas escaneadas automaticamente
- Explicar las 5 fuentes: VMF Homes, 21st Mortgage, MHVillage, Craigslist, Facebook Marketplace
- Filtrar por precio, ubicacion, calificacion
- Mostrar la **regla del 60%**: precio maximo = 60% del valor de mercado
- Calificar/descalificar una casa del mercado
- **Talking point:** "El sistema escanea automaticamente y califica — solo vemos las oportunidades reales"

### 1.3 Conexion Facebook
- Ir a Configuracion > Facebook
- Mostrar como se importan cookies para scraping de Marketplace
- Ejecutar un scrape en vivo (si el tiempo lo permite)
- **Talking point:** "Facebook Marketplace es nuestra fuente #1 de deals"

### 1.4 Propiedades (Property Management)
- Crear una nueva propiedad con el formulario de 4 pasos:
  1. **Datos basicos**: direccion, ano, dimensiones, precio de compra
  2. **Detalles**: marca, modelo, dormitorios, banos
  3. **Ubicacion**: yarda asignada, notas de ubicacion
  4. **Documentos**: Bill of Sale, titulo
- Mostrar la lista de propiedades con filtros por estado
- **Talking point:** "Cada propiedad tiene su expediente digital completo"

### 1.5 Evaluacion (28-Point Checklist)
- Abrir una propiedad y crear reporte de evaluacion
- Mostrar el checklist de 28 puntos (estructura, plomeria, electrico, etc.)
- Demostrar **analisis de fotos con IA**: subir foto y GPT-4o identifica problemas
- **Talking point:** "La IA analiza las fotos y sugiere items de renovacion automaticamente"

### 1.6 Documentos
- Mostrar generacion automatica de:
  - **Bill of Sale**: se llena con datos de la propiedad
  - **Title Application (Form 130-U)**: datos auto-llenados desde TDHCA
- **Talking point:** "Documentos que antes tomaban 30 minutos ahora se generan en segundos"

### 1.7 Titulos (Title Monitoring)
- Mostrar el modulo de seguimiento de titulos
- Explicar el monitoreo automatico de cambios de nombre en TDHCA
- Alertas cuando un titulo cambia de estado
- **Talking point:** "Monitoreo 24/7 — sabemos al instante cuando un titulo se transfiere"

### 1.8 Renovacion (V4)
- Abrir el modulo de renovacion de una propiedad
- Mostrar el checklist de **19 items** con materiales, mano de obra, costos
- Demostrar **importacion desde evaluacion**: items marcados como "necesita reparacion" se importan automaticamente
- Mostrar el **cronograma Gantt**: timeline visual de la renovacion
- Demostrar **comandos de voz**: hablar para actualizar progreso (GPT-4o-mini)
- Mostrar **flujo de aprobacion**: enviar a aprobacion, aprobar/rechazar
- Materiales con defaults predefinidos (H06) y subfields
- **Talking point:** "Desde la evaluacion hasta la renovacion terminada — todo conectado y con IA"

### 1.9 Ventas
- Registrar una venta de ejemplo:
  - Seleccionar propiedad y cliente
  - Tipo: **Contado** o **RTO** (Rent-to-Own)
  - Precio de venta, comisiones ($1,500 contado / $1,000 RTO)
  - Split 50/50 finder/closer
- Mostrar como la venta cambia el estado de la propiedad
- **Talking point:** "Una venta genera automaticamente ordenes de pago, comisiones y contratos"

### 1.10 Notificaciones
- Mostrar el centro de notificaciones:
  - Ordenes de pago pendientes
  - Transferencias de titulo
  - Aprobaciones de renovacion pendientes
- **Talking point:** "Nada se pierde — cada accion pendiente tiene su notificacion"

### 1.11 Contabilidad
- Mostrar los 3 reportes principales:
  - **P&L (Estado de Resultados)**: ingresos vs gastos
  - **Balance Sheet**: activos, pasivos, capital
  - **Reconciliacion bancaria**: importar estado de cuenta, match automatico
- **Talking point:** "Contabilidad en tiempo real — no esperamos al cierre de mes"

---

## Parte 2: Portal Capital (Finanzas) — 10 min

### 2.1 Dashboard Capital
- Mostrar KPIs del portafolio: contratos activos, cartera total, cobranza del mes
- Salud de la cartera: contratos al dia vs atrasados
- **Talking point:** "Vision completa del negocio de financiamiento en una pantalla"

### 2.2 Solicitudes (RTO Applications)
- Mostrar lista de solicitudes de clientes
- Estados: pendiente, en revision, aprobada, rechazada
- **Talking point:** "Los clientes aplican desde su portal y nosotros revisamos aqui"

### 2.3 Identidad (KYC)
- Mostrar el flujo de verificacion:
  1. Solicitar verificacion al cliente (se envia email automatico)
  2. Cliente sube ID + selfie desde su portal
  3. Revisar documentos: aprobar o rechazar
- Opcion de **KYC manual** para casos especiales
- **Talking point:** "Verificacion de identidad integrada — sin salir de la plataforma"

### 2.4 Solicitud de Credito
- Mostrar el formulario de 9 secciones que llena el cliente:
  1. Datos personales
  2. Empleo actual
  3. Historial laboral
  4. Ingresos
  5. Gastos mensuales
  6. Deudas
  7. Referencias personales
  8. Co-solicitante (opcional)
  9. Declaracion y firma
- Vista read-only desde Capital con toda la informacion
- **Talking point:** "El cliente llena todo desde su celular — nosotros lo revisamos organizado"

### 2.5 Calculo RTO (Smart Pricing)
- Mostrar el algoritmo de pricing:
  - **Anclado a renta de mercado** (el pago mensual no puede exceder la renta del area)
  - **4 escenarios**: 12, 24, 36, 48 meses
  - Enganche, pagos mensuales, total a pagar
  - **Prediccion de valor futuro** basada en 93 deals historicos
- **Talking point:** "Precios justos calculados con datos reales — no adivinamos"

### 2.6 Contrato
- Mostrar generacion automatica del contrato RTO:
  - Terminos calculados automaticamente
  - Firma digital del admin
  - Se envia al cliente para firma
  - PDF final con ambas firmas
- **Talking point:** "Contrato firmado digitalmente — sin papel, sin notario"

### 2.7 Pagos
- Mostrar el tracking de pagos:
  - Calendario de pagos programados
  - Pagos recibidos vs pendientes
  - Recordatorios automaticos por email
  - Late fees automaticos
  - Pagos reportados por el cliente (requieren confirmacion)
- **Talking point:** "Cobranza automatizada — el sistema hace el seguimiento por nosotros"

### 2.8 Inversores
- Mostrar gestion de inversores:
  - Perfil del inversor
  - Pagares (promissory notes) vinculados a propiedades
  - Tracking de pagos a inversores
- **Talking point:** "Transparencia total para nuestros inversores"

---

## Parte 3: Portal Clientes (Publico) — 10 min

### 3.1 Catalogo
- Mostrar la vista publica de casas disponibles
- Filtros por precio, ubicacion, dormitorios
- Fotos, descripcion, precio
- **Talking point:** "El cliente encuentra su casa desde el celular"

### 3.2 Comprar
- Seleccionar una propiedad del catalogo
- Ingresar datos basicos del cliente
- Elegir metodo de pago:
  - **Contado**: pago completo
  - **RTO**: renta con opcion a compra
- **Talking point:** "Proceso de compra tan simple como pedir comida en una app"

### 3.3 Mi Cuenta (4-Step Progress)
- Mostrar el dashboard del cliente con progreso visual:
  1. **Verificacion de identidad** (pendiente/completado)
  2. **Solicitud de credito** (pendiente/completado)
  3. **Firma de contrato** (pendiente/completado)
  4. **Pagos** (en progreso/al dia/atrasado)
- **Talking point:** "El cliente siempre sabe en que paso esta — sin llamar para preguntar"

### 3.4 Verificacion de Identidad
- Demostrar el flujo de subida de documentos:
  - Foto de ID (frente y reverso)
  - Selfie de verificacion
  - Envio para revision
- **Talking point:** "KYC desde el celular — como abrir una cuenta de banco moderna"

### 3.5 Solicitud de Credito
- Mostrar el formulario de 9 secciones desde la perspectiva del cliente
- Formulario responsive, guardado automatico
- Firma digital al final
- **Talking point:** "Todo el papeleo digitalizado — el cliente lo llena a su ritmo"

### 3.6 Firmar Contrato
- Mostrar la pantalla de revision de contrato:
  - Terminos del RTO claramente presentados
  - Firma digital con el dedo o mouse
  - Confirmacion y descarga de PDF
- **Talking point:** "Firma digital legalmente valida en Texas"

### 3.7 Pagos
- Mostrar la vista de pagos del cliente:
  - Calendario de pagos futuros
  - Historial de pagos realizados
  - Boton para reportar un pago
  - Estado de cada pago (pendiente, confirmado, atrasado)
- **Talking point:** "Transparencia total — el cliente ve exactamente lo que debe y lo que ha pagado"

---

## Puntos Clave para Enfatizar

### Inteligencia Artificial
- **GPT-4o**: Analisis de fotos en evaluaciones, identificacion automatica de problemas
- **GPT-4o-mini**: Comandos de voz en renovaciones, actualizacion de progreso hablando
- **Smart Pricing**: Algoritmo de precios anclado a renta de mercado, predicciones basadas en 93 deals historicos

### Automatizaciones
- Emails automaticos en cada paso del proceso (Resend)
- Notificaciones push para acciones pendientes
- Generacion automatica de contratos con firma digital
- Monitoreo automatico de titulos (TDHCA)
- Scraping automatico de 5 fuentes de mercado
- Late fees y recordatorios de pago automaticos

### Datos y Predicciones
- 93 deals historicos alimentan las predicciones de precio
- Regla del 60% para compra, 80% para venta
- Rango de operacion: $5K-$80K por propiedad
- Radio geografico: 200 millas desde Houston/Dallas

### Seguridad
- Autenticacion separada para staff (Homes/Capital) y clientes
- KYC integrado con verificacion de identidad
- Audit log de todas las acciones
- Roles y permisos por usuario

---

## Tips para el Presentador

1. **Mantener el flujo narrativo**: Seguir el ciclo de vida de una propiedad (encontrar > comprar > evaluar > renovar > vender > financiar > cobrar)
2. **Usar datos reales**: Si es posible, crear una propiedad de ejemplo con fotos reales antes del demo
3. **Mostrar la perspectiva del cliente**: Cuando llegues a la Parte 3, cambiar de tab y mostrar como el cliente ve el proceso
4. **Destacar la velocidad**: Enfatizar cuanto tiempo se ahorra vs el proceso manual
5. **Preparar respuestas para**:
   - "Que pasa si el cliente no paga?" > Late fees automaticos, notificaciones, tracking
   - "Como saben que el precio es justo?" > Algoritmo anclado a renta + 93 deals historicos
   - "Es seguro?" > Supabase Auth, KYC, audit logs, roles
   - "Cuantas propiedades manejan?" > Escalable, actualmente optimizado para 50-100 propiedades activas
