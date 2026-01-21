---
name: Producto Final Maninos
overview: Documento completo para el cliente Maninos describiendo el producto final, calendario de 10 semanas (5 desarrollo + 5 margen/ajustes), y lista de automatizaciones. Incluye version ejecutiva y tecnica con revision semanal del cliente y checklists de testing.
todos:
  - id: esperar-diagrama
    content: Esperar diagrama de relaciones entre procesos del cliente
    status: pending
  - id: draft2-tronco
    content: Actualizar Draft 2 del tronco comun con respuestas del cliente
    status: pending
    dependencies:
      - esperar-diagrama
---

# Maninos AI Platform - Producto Final y Calendario

---

## PARTE A: RESUMEN EJECUTIVO (Para Cliente)

### Que van a recibir

Un sistema completo con 3 portales conectados a un asistente de IA:| Portal | Usuarios | Funcionalidad Principal ||--------|----------|------------------------|| Portal Empleados | Staff de Maninos | Gestionar todo el negocio con ayuda de IA || Portal Clientes | Compradores RTO | Ver casas, comparar, aplicar, ver su contrato || Portal Inversionistas | Inversionistas | Ver sus inversiones y rendimientos |---

### Funcionalidades por Entrega

#### v1.0 - Portal Empleados (Semana 3)

**Dashboard:**

- Vista general de propiedades, clientes, contratos, pagos
- Alertas automaticas (morosidad, tareas pendientes, vencimientos)
- KPIs del negocio en tiempo real

**Asistente IA (Chat):**

- Crear/editar propiedades, clientes, contratos hablando naturalmente
- Preguntar estado de cualquier cosa ("cuantos pagos atrasados hay?")
- Ejecutar tareas automaticamente ("envia recordatorio a clientes morosos")

**Gestion de Propiedades:**

- Base de datos completa de 125+ propiedades
- Tracking del proceso de adquisicion (sourcing -> registrado)
- Evaluacion automatica (regla del 70%)

**Gestion de Clientes:**

- Base de datos de todos los clientes
- Perfil completo: datos personales, KYC status, DTI, historial
- Pre-calificacion automatica

**Gestion de Contratos:**

- Generacion automatica de contratos RTO (Anexo 3)
- Tracking de estado (activo, completado, cancelado)
- Documentos asociados

**Gestion de Pagos:**

- Registro de todos los pagos
- Deteccion automatica de morosidad
- Recordatorios automaticos por email

**Administracion de Propiedades:**

- Sistema de tickets para mantenimiento/reparaciones
- Historial de mantenimiento por propiedad
- Costos asociados

**Reportes:**

- Reporte mensual automatico
- Reporte por propiedad
- Reporte de morosidad

---

#### v2.0 - Portal Clientes (Semana 4)

**Catalogo de Casas:**

- Ver todas las propiedades disponibles
- Fotos, descripcion, precio, ubicacion
- Filtros (precio, ubicacion, habitaciones)

**Comparador de Casas:**

- Seleccionar hasta 3 propiedades
- Ver lado a lado: precio, tamano, pago mensual estimado
- Calcular pago segun plazo (24/36/48 meses)

**Pre-calificacion:**

- Formulario rapido (ingreso, gastos)
- Resultado instantaneo: "Calificas" o "No calificas"
- Calculo automatico de DTI

**Solicitud Formal:**

- Formulario completo de aplicacion (Anexo 1)
- Subir documentos requeridos
- Tracking de estado de solicitud

**Mi Contrato (clientes activos):**

- Ver detalles de su contrato RTO
- Meses restantes, pagos completados
- Descargar documentos

**Mis Pagos:**

- Historial completo de pagos
- Proximo pago y fecha
- Descargar recibos

---

#### v3.0 - Portal Inversionistas (Semana 5)

**Mi Portafolio:**

- Lista de todas sus inversiones activas
- Monto invertido, tasa, plazo

**Rendimientos:**

- Intereses ganados por periodo
- Proyeccion de rendimientos futuros

**Documentos:**

- Pagares firmados
- Reportes fiscales
- Estados de cuenta

---

### Que se Automatiza

| Proceso | Tarea | Antes | Despues ||---------|-------|-------|---------|| ADQUIRIR | Evaluar propiedad (26 puntos) | Calculo manual Excel | IA evalua automaticamente || ADQUIRIR | Registrar propiedad | Ingreso manual | IA extrae datos de docs || COMERCIALIZAR | Mostrar inventario | Email manual | Portal online actualizado || COMERCIALIZAR | Recibir solicitudes | Email/llamada | Formulario + pre-calif. automatica || INCORPORAR | Calcular DTI | Calculo manual | Calculo automatico || INCORPORAR | Generar contrato | Plantilla Word | PDF generado automaticamente (Anexo 3) || GESTIONAR | Detectar morosidad | Revisar Excel | Alertas automaticas || GESTIONAR | Enviar recordatorios | Email manual | Emails automaticos || GESTIONAR | Reportes | Excel manual | Generacion automatica || ENTREGAR | Verificar elegibilidad | Revision manual | Verificacion automatica || ENTREGAR | Generar TDHCA | Manual | Template listo para enviar |---

## PARTE B: LOS 33 PROCEDIMIENTOS COMPLETOS (Del Excel)

### COMERCIALIZAR (7 procedimientos) - TRANSVERSAL

| # | Procedimiento | Rol | Descripcion | Formato | KPI | Tool ||---|---------------|-----|-------------|---------|-----|------|| 1 | Adquirir activos | Operaciones | Identificacion de mercados, analisis tecnico/legal/financiero, inspeccion certificada | Checklist tecnico, expediente, acta de comite | % activos con expediente completo, ROI proyectado vs real | `create_acquisition_committee_record` || 2 | Finiquitar activos | Tesoreria | Autorizacion final, ejecucion del desembolso, registro contable | Solicitud de desembolso | Errores en desembolso, Conciliaciones correctas | `process_disbursement` || 3 | Promover activos | Promotor | Recepcion de solicitud, integracion de documentos, validacion de identidad | Solicitud de credito | % solicitudes completas, Tiempo de integracion | `promote_property_listing` || 4 | Evaluar credito y riesgo | Analista Credito | Consulta de buro, calculo capacidad de pago, analisis de riesgo | Dictamen crediticio, minutas | Tasa de aprobacion, Morosidad temprana | `evaluate_credit_risk` || 5 | Formalizar venta | Operaciones | Elaboracion contrato, validacion legal, verificacion expediente | Contrato estandarizado, checklist | % expedientes sin observaciones | `formalize_sale` || 6 | Administrar cartera | CxC | Cobro automatizado, clasificacion cartera, gestion de recuperacion | Bitacoras, clasificacion | Cartera vencida, Tasa de recuperacion | `manage_portfolio_recovery` || 7 | Fidelizar | Promotor | Inspeccion final, transferencia titulo, reportes fiscales | TDHCA, IRS 1099-S | NPS, % recompra/upgrade | `process_loyalty_program` |---

### ADQUIRIR (5 procedimientos) - LINEAL

| # | Procedimiento | Rol | Descripcion | Formato | KPI | Tool ||---|---------------|-----|-------------|---------|-----|------|| 1 | Investigar y abastecer | Agente de exito | Identificar zonas con alta demanda en Texas | Fuentes: mobilehomeparkstore, Zillow, Realtor, Loopnet, mhvillage, Reonomy, Crexi, Costar, Har | Tiempo identificacion ≤10 dias | `search_property_sources` || 2 | Evaluar atributos | Adquisiciones | Revisar estado fisico, ubicacion, valor mercado | **Checklist 26 puntos** (memoria 13475557) | 100% verificadas antes de oferta | `evaluate_property_criteria` || 3 | Inspeccionar y due diligence | Adquisiciones | Inspeccionar unidades, revisar historial titulos | Expediente de casa | 0% compras con defectos | `create_inspection_record` || 4 | Establecer condiciones | Adquisiciones | Establecer precio de compra dentro del margen | - | Precio ≤70% valor mercado | `calculate_acquisition_offer` || 5 | Registrar en inventario | Legal | Registrar vivienda con atributos financieros y ubicacion | Base de datos inventario | 100% registradas en 24h | `register_property_inventory` |---

### INCORPORAR (5 procedimientos) - LINEAL

| # | Procedimiento | Rol | Descripcion | Formato | KPI | Tool ||---|---------------|-----|-------------|---------|-----|------|| 1 | Perfilar cliente | Agente de exito | Capturar info personal y financiera | **Anexo 1** (memoria 13475561) | Tasa cumplimiento ≥95% | `create_client_profile` || 2 | Verificar identidad (KYC) | Cumplimiento | Confirmar identidad, historial crediticio, antecedentes | Anexo 1 | KYC 100% | `verify_client_kyc` || 3 | Evaluar DTI | Finanzas | Revisar relacion deuda/ingreso y estabilidad | Anexo 1 | Evaluaciones ≤48h | `calculate_client_dti` || 4 | Personalizar contrato | Agente de exito | Ajustar plan RTO (24, 36, 48 meses) segun perfil | **Anexo 3** (memoria 13475662) | Generacion ≤2 dias | `generate_rto_contract` || 5 | Comunicar y seguimiento | Agente de exito | Informar estatus, condiciones, calendario pagos | Dashboard seguimiento | NPS ≥80 | `send_client_update` |---

### FONDEAR (7 procedimientos) - LINEAL

| # | Procedimiento | Rol | Descripcion | Formato | KPI | Tool ||---|---------------|-----|-------------|---------|-----|------|| 1 | Planear financieramente | Finanzas | Proyectar necesidades de fondeo segun metas | Presupuesto anual (modelo 5 anos) | Cumplimiento presupuestal 100% | `create_financial_plan` || 2 | Contactar inversionistas | Fondeo | Buscar inversionistas alineados al modelo | Pipeline inversionistas | 90% presentaciones completadas | `manage_investor_pipeline` || 3 | Onboarding inversionistas | Fondeo | Verificar identidad y documentos | KYC | - | `onboard_investor` || 4 | Estructurar notas de deuda | Legal | Elaborar contratos deuda 12% anual, plazo 12 meses | Contrato + pagare | Cumplimiento pagos 100% | `generate_debt_note` || 5 | Cumplir regulatorio SEC | Legal | Asegurar cumplimiento Reg. D | Expediente inversionistas | Cumplimiento legal 100% | `validate_sec_compliance` || 6 | Alinear deuda con flujo | Finanzas | Evitar sobreapalancamiento | - | Ratio deuda-capital ≤2:1 | `calculate_debt_ratio` || 7 | Comunicar seguimiento | Relacion inversionistas | Mantener comunicacion | - | - | `send_investor_update` |---

### GESTIONAR CARTERA (5 procedimientos) - LINEAL

| # | Procedimiento | Rol | Descripcion | Formato | KPI | Tool ||---|---------------|-----|-------------|---------|-----|------|| 1 | Generar contrato RTO | Legal | Crear contratos con condiciones claras de renta y opcion compra | **Anexo 3** (memoria 13475662) | 100% contratos validados | `generate_rto_contract` || 2 | Cobro automatizado | Finanzas | Establecer cobros automaticos via tarjeta (Stripe) | Motor de pagos, recaudacion | Cobranza puntual ≥95% | `setup_automatic_payment` || 3 | Monitorear morosidad | Finanzas | Revisar cartera semanalmente, activar alertas | Dashboard cartera | Morosidad ≤5% | `monitor_payment_status` || 4 | Gestionar riesgos | Finanzas | Revision cartera por nivel de riesgo | Mapeo de riesgos | Reduccion impagos ≥10%/ano | `assess_portfolio_risk` || 5 | Reporte mensual | Finanzas | Generar informes rentabilidad y ocupacion | Reporte dashboard | Reportes 100% | `generate_monthly_report` |---

### ENTREGAR (4 procedimientos) - LINEAL

| # | Procedimiento | Rol | Descripcion | Formato | KPI | Tool ||---|---------------|-----|-------------|---------|-----|------|| 1 | Verificar elegibilidad | Legal | Confirmar cliente cumplio condiciones contractuales | Anexo 1 | Casos aprobados ≥80% | `verify_purchase_eligibility` || 2 | Transferir titulo y cerrar | Legal | Formalizar transferencia ante TDHCA e IRS | **Titulo de Propiedad TDHCA** | Cumplimiento legal 100% | `process_title_transfer` || 3 | Ofrecer recompra/upgrade | Agente de exito | Ofrecer programas de recompra o renovacion | - | Retencion ≥20% | `offer_upgrade_options` || 4 | Programa fidelizacion | Agente de exito | Bonificar referidos, descuentos recurrentes | Dashboard | 10% clientes por referidos | `process_referral_bonus` |---

## PARTE B2: RESUMEN TOOLS TECNICOS (33 tools)

| Agente | Tools | Cantidad ||--------|-------|----------|| **ComercializarAgent** | `create_acquisition_committee_record`, `process_disbursement`, `promote_property_listing`, `evaluate_credit_risk`, `formalize_sale`, `manage_portfolio_recovery`, `process_loyalty_program` | 7 || **AdquirirAgent** | `search_property_sources`, `evaluate_property_criteria`, `create_inspection_record`, `calculate_acquisition_offer`, `register_property_inventory` | 5 || **IncorporarAgent** | `create_client_profile`, `verify_client_kyc`, `calculate_client_dti`, `generate_rto_contract`, `send_client_update` | 5 || **FondearAgent** | `create_financial_plan`, `manage_investor_pipeline`, `onboard_investor`, `generate_debt_note`, `validate_sec_compliance`, `calculate_debt_ratio`, `send_investor_update` | 7 || **GestionarAgent** | `generate_rto_contract`, `setup_automatic_payment`, `monitor_payment_status`, `assess_portfolio_risk`, `generate_monthly_report` | 5 || **EntregarAgent** | `verify_purchase_eligibility`, `process_title_transfer`, `offer_upgrade_options`, `process_referral_bonus` | 4 || **TOTAL** | | **33** |---

## PARTE B3: KPIs DEL SISTEMA

| Proceso | KPI | Meta | Automatizable ||---------|-----|------|---------------|| ADQUIRIR | Tiempo promedio identificacion | ≤10 dias | Si || ADQUIRIR | Propiedades verificadas antes de oferta | 100% | Si || ADQUIRIR | Compras con defectos estructurales | 0% | Si || ADQUIRIR | Precio compra vs valor mercado | ≤70% | Si || ADQUIRIR | Viviendas registradas en 24h | 100% | Si || INCORPORAR | Tasa cumplimiento perfil | ≥95% | Si || INCORPORAR | Cumplimiento KYC | 100% | Manual v1.0 || INCORPORAR | Evaluaciones DTI completadas | ≤48h | Si || INCORPORAR | Tiempo generacion contrato | ≤2 dias | Si || INCORPORAR | Satisfaccion cliente (NPS) | ≥80 | Parcial || FONDEAR | Cumplimiento presupuestal | 100% | Si || FONDEAR | Presentaciones completadas | 90% | Parcial || FONDEAR | Cumplimiento pagos | 100% | Si || FONDEAR | Cumplimiento legal SEC | 100% | Manual || FONDEAR | Ratio deuda-capital | ≤2:1 | Si || GESTIONAR | Contratos validados legalmente | 100% | Si || GESTIONAR | Cobranza puntual | ≥95% | Si (Stripe) || GESTIONAR | Morosidad | ≤5% | Si || GESTIONAR | Reduccion impagos anual | ≥10% | Si || GESTIONAR | Reportes entregados | 100% | Si || ENTREGAR | Casos aprobados | ≥80% | Si || ENTREGAR | Cumplimiento legal TDHCA | 100% | Parcial || ENTREGAR | Retencion clientes | ≥20% | Parcial || ENTREGAR | Clientes por referidos | 10% | Parcial |---

## PARTE B4: CALENDARIO AGIL CON REVISION SEMANAL (10 semanas)

**Duracion total: 10 semanas** (5 semanas desarrollo + 5 semanas margen/ajustes)

> Desarrollo con AI (Opus 4.5) + revision semanal del cliente + margen generoso para imprevistos

---

### SEMANA 1: Infraestructura + 3 Agentes Core

| Dia | Tarea | Detalle | Entregable ||-----|-------|---------|------------|| Lun | Auth + BD | Supabase Auth, 5 tablas (clients, investors, contracts, payments, properties) | Backend base || Mar | RLS + FlowValidator | Row Level Security, 6 macroprocesos + COMERCIALIZAR transversal | Seguridad + flujo || Mie | ComercializarAgent | 7 tools: committee, disbursement, promote, credit, formalize, recovery, loyalty | Agente 1 || Jue | AdquirirAgent | 5 tools: search, evaluate (checklist 26), inspect, offer, register | Agente 2 || Vie | IncorporarAgent | 5 tools: profile (Anexo 1), kyc, dti, contract (Anexo 3), update | Agente 3 |**🧪 ENTREGA S1:** Demo chat con 3 agentes funcionando**📋 CLIENTE PRUEBA:** "Crear propiedad", "Evaluar checklist", "Crear cliente", "Generar contrato"---

### SEMANA 2: 3 Agentes Restantes + Stripe + Documentos

| Dia | Tarea | Detalle | Entregable ||-----|-------|---------|------------|| Lun | GestionarAgent | 5 tools: rto_contract, auto_payment, monitor, risk, report | Agente 4 || Mar | FondearAgent | 7 tools: plan, pipeline, onboard, debt_note, sec, ratio, update | Agente 5 || Mie | EntregarAgent | 4 tools: eligibility, title_transfer (TDHCA), upgrade, referral | Agente 6 || Jue | Stripe + PDFs | Stripe Payments API, generador contratos Anexo 3 PDF | Integraciones || Vie | TDHCA + Testing | Template titulo propiedad, IRS 1099-S, testing 6 agentes | Docs legales |**🧪 ENTREGA S2:** 6 agentes completos + Stripe + generacion de documentos**📋 CLIENTE PRUEBA:** "Generar contrato RTO PDF", "Configurar pago Stripe", "Crear documento TDHCA"---

### SEMANA 3: Portal Empleados + Deploy v1.0

| Dia | Tarea | Detalle | Entregable ||-----|-------|---------|------------|| Lun | Dashboard | KPIs: propiedades, clientes, contratos, pagos, morosidad | Dashboard || Mar | CRUD Props + Clients | Lista, filtros, detalle, checklist 26, perfil Anexo 1 | Gestion core || Mie | CRUD Contracts + Pays | Contratos Anexo 3, calendario pagos, alertas morosidad | Gestion financiera || Jue | Chat IA + Reportes | Interfaz conversacional 6 agentes, reportes automaticos | IA integrada || Vie | Testing + Deploy | QA completo, Vercel + Supabase prod | **🚀 v1.0 LIVE** |**🧪 ENTREGA S3:** Portal Empleados LIVE en produccion**📋 CLIENTE PRUEBA:** Usar el sistema completo como empleado de Maninos---

### SEMANA 4: Portal Clientes + Deploy v2.0

| Dia | Tarea | Detalle | Entregable ||-----|-------|---------|------------|| Lun | Catalogo + Detalle | Grid casas disponibles, filtros, fotos, descripcion, mapa | Catalogo || Mar | Comparador + Calc | Seleccionar 3 casas lado a lado, simular pago 24/36/48 meses | Herramientas || Mie | Pre-calif + Solicitud | Formulario DTI rapido, formulario Anexo 1 completo | Aplicacion || Jue | Mi Contrato + Pagos | Vista contrato activo, historial pagos, recibos | Portal cliente || Vie | Testing + Deploy | QA completo, deploy produccion | **🚀 v2.0 LIVE** |**🧪 ENTREGA S4:** Portal Clientes LIVE en produccion**📋 CLIENTE PRUEBA:** Flujo completo como si fuera un comprador RTO---

### SEMANA 5: Portal Inversionistas + Deploy v3.0

| Dia | Tarea | Detalle | Entregable ||-----|-------|---------|------------|| Lun | Portafolio | Lista inversiones activas, monto, tasa, plazo | Portafolio || Mar | Rendimientos | Intereses ganados, proyeccion futura | Rendimientos || Mie | Documentos | Pagares firmados, reportes fiscales, estados cuenta | Documentos || Jue | Testing + Deploy | QA completo, deploy produccion | **🚀 v3.0 LIVE** || Vie | Documentacion | Handoff, guias de uso, capacitacion | Cierre |**🧪 ENTREGA S5:** Sistema COMPLETO en produccion**📋 CLIENTE PRUEBA:** Los 3 portales funcionando, aprobar para uso real---

### SEMANAS 6-10: MARGEN + AJUSTES + MEJORAS

| Semana | Uso | Detalle |

|--------|-----|---------|

| S6 | Ajustes S1-S3 | Cambios de primeras 3 semanas |

| S7 | Ajustes S4-S5 | Cambios portales clientes/inversionistas |

| S8 | Bugs + polish | Corregir bugs, pulir UI/UX |

| S9 | Mejoras opcionales | SMS, WhatsApp, integraciones extra |

| S10 | Buffer final | Documentacion, capacitacion, cierre |

**NOTA:** Si todo va bien, S9-S10 para features extra o terminar antes.

---

## PARTE B6: CHECKLISTS DE TESTING PARA CLIENTE

### CHECKLIST S1 - Agentes Core + Emails

- [ ] Login con email/password
- [ ] Chat: "Crear propiedad en 123 Main St" → verificar BD
- [ ] Chat: "Evaluar propiedad con checklist" → 26 puntos
- [ ] Chat: "Crear cliente Juan Perez" → datos Anexo 1
- [ ] Verificar email bienvenida recibido
- [ ] Chat: "Generar contrato para Juan Perez"
- [ ] Reportar errores

### CHECKLIST S2 - 6 Agentes + Stripe + PDFs

- [ ] "Generar contrato RTO" → PDF con 33 clausulas
- [ ] "Configurar pago automatico" → verificar Stripe
- [ ] "Crear documento TDHCA" → formato titulo
- [ ] Pago prueba → email confirmacion
- [ ] Ver alertas en dashboard
- [ ] Probar 6 agentes diferentes
- [ ] Reportar errores

### CHECKLIST S3 - Portal Empleados v1.0

- [ ] Login portal empleados
- [ ] Dashboard: KPIs (propiedades, clientes, contratos, pagos)
- [ ] Crear propiedad desde UI
- [ ] Crear cliente con Anexo 1
- [ ] Dashboard Cartera: clasificacion morosidad
- [ ] Crear contrato → asociar cliente + propiedad
- [ ] Registrar pago manual
- [ ] Chat: "Cuantos pagos atrasados?"
- [ ] Verificar reporte diario email
- [ ] Verificar late fees auto ($15/dia)
- [ ] Reportar errores/sugerencias

### CHECKLIST S4 - Portal Clientes v2.0

- [ ] Catalogo publico (sin login)
- [ ] Filtros: precio, ubicacion, habitaciones
- [ ] Detalle: fotos, descripcion, mapa
- [ ] Comparador: 3 casas lado a lado
- [ ] Calculadora: 24/36/48 meses
- [ ] Pre-calificacion DTI → resultado instantaneo
- [ ] Solicitud Anexo 1 → email confirmacion
- [ ] Login: "Mi Contrato" calendario pagos
- [ ] "Mis Pagos": historial, recibos
- [ ] Email recordatorio 5 dias antes
- [ ] Reportar errores/sugerencias

### CHECKLIST S5 - Sistema Completo

- [ ] Login inversionista: "Mi Portafolio"
- [ ] Rendimientos: intereses, proyeccion
- [ ] Descargar: pagare, reporte fiscal
- [ ] Login cliente: "Dashboard Referidos"
- [ ] Codigo referido, lista, bonos
- [ ] Clasificacion auto cartera funciona
- [ ] Elegibilidad compra notifica
- [ ] **PRUEBA FINAL:** empleado + cliente + inversionista
- [ ] **APROBAR** para produccion

---

## RESUMEN CALENDARIO

```
================================================================================
           CALENDARIO AGIL MANINOS - 10 SEMANAS (con margen)
================================================================================

DESARROLLO CORE (5 semanas):
┌─────────┬──────────────────────────────┬─────────────────────────────┐
│ SEMANA  │ ENTREGABLE                   │ CLIENTE REVISA              │
├─────────┼──────────────────────────────┼─────────────────────────────┤
│ S1      │ 3 agentes (17 tools)         │ Chat: crear, evaluar        │
│ S2      │ 6 agentes + Stripe + PDFs    │ Contratos, pagos, TDHCA     │
│ S3      │ 🚀 Portal Empleados v1.0     │ Dashboard completo          │
│ S4      │ 🚀 Portal Clientes v2.0      │ Catalogo, comparar, aplicar │
│ S5      │ 🚀 Portal Inversores v3.0    │ Sistema completo            │
└─────────┴──────────────────────────────┴─────────────────────────────┘

MARGEN (5 semanas):
┌─────────┬──────────────────────────────┬─────────────────────────────┐
│ S6      │ Ajustes feedback S1-S3       │ Cambios primeras semanas    │
│ S7      │ Ajustes feedback S4-S5       │ Cambios portales            │
│ S8      │ Bugs + polish                │ Refinamiento UI/UX          │
│ S9      │ Mejoras opcionales           │ SMS, WhatsApp, extras       │
│ S10     │ Buffer final                 │ Docs, capacitacion, cierre  │
└─────────┴──────────────────────────────┴─────────────────────────────┘

================================================================================
                           ENTREGAS SEMANALES
================================================================================

S1 → 3 agentes + emails                → Cliente prueba chat + recibe email
S2 → 6 agentes + Stripe + PDFs         → Cliente genera contrato PDF real
S3 → 🚀 Portal Empleados v1.0          → Cliente usa dashboard completo
S4 → 🚀 Portal Clientes v2.0           → Cliente simula ser comprador
S5 → 🚀 Sistema completo v3.0          → Cliente aprueba produccion
S6-10 → Ajustes + mejoras + cierre     → Feedback, bugs, extras, docs

================================================================================
                              HITOS
================================================================================

🚀 Semana 3: v1.0 - Portal Empleados + Dashboard Cartera
🚀 Semana 4: v2.0 - Portal Clientes + Dashboard Seguimiento
🚀 Semana 5: v3.0 - Sistema COMPLETO + Dashboard Referidos
✅ Semana 10: Proyecto cerrado (con 5 semanas de margen)

================================================================================
```

---

## PARTE B5: AUTOMATIZACIONES EXTRA (Value Add)

### 3 Dashboards Especializados (Incluidos en calendario)

| Dashboard | Ubicación | Funcionalidad |

|-----------|-----------|---------------|

| **Dashboard Cartera** | Portal Empleados (S3) | Clasificación morosidad: Al día → Preventivo (1-5 días) → Administrativo (6-30) → Extrajudicial (31-60) → Judicial (>60). Filtros, acciones, KPIs |

| **Dashboard Seguimiento** | Portal Clientes (S4) | Estado contrato, calendario visual pagos (hechos vs pendientes), meses restantes, próximo pago, documentos descargables |

| **Dashboard Referidos** | Portal Clientes (S5) | Lista referidos, estado (pendiente/convertido/pagado), bonificaciones ganadas, código de referido único |

---

### Sistema de Emails Automáticos (10+ templates)

**Emails a Clientes:**

| Trigger | Email | Cuándo se envía |

|---------|-------|-----------------|

| Cliente creado | "Bienvenido a Maninos" | Inmediato |

| Solicitud recibida | "Recibimos tu solicitud" | Inmediato |

| Solicitud aprobada | "¡Felicidades! Estás aprobado" | Al aprobar |

| Solicitud rechazada | "Sobre tu solicitud..." | Al rechazar |

| Contrato generado | "Tu contrato está listo" | Al generar PDF |

| 5 días antes de pago | "Recordatorio: tu pago vence el día X" | Automático |

| Pago recibido | "Confirmación de pago - Recibo #123" | Al recibir |

| 1 día después de mora | "Pago atrasado - Evita cargos" | Automático |

| 5 días de mora | "Late fee aplicado ($15/día)" | Automático |

| 90 días para vencimiento | "Tu opción de compra vence pronto" | Automático |

| Referido se registró | "Tu referido X se registró" | Inmediato |

**Emails a Empleados/Admin:**

| Trigger | Email | Destinatario |

|---------|-------|--------------|

| Nueva solicitud | "Nueva solicitud de [Nombre]" | Agente asignado |

| Morosidad >15 días | "Escalar a cobranza: [Cliente]" | Supervisor |

| KPI morosidad >5% | "⚠️ Alerta: Morosidad X%" | Admin |

| Ratio D/C >1.8 | "⚠️ Ratio acercándose a límite" | CFO |

---

### Alertas en Dashboard (Tiempo Real)

| Alerta | Condición | Acción |

|--------|-----------|--------|

| 🔴 Pago atrasado | >1 día de mora | Mostrar en dashboard + badge |

| 🟡 Pago próximo | <3 días para vencer | Mostrar recordatorio |

| 🔵 Nueva solicitud | Solicitud recibida | Notificación + contador |

| ⚠️ Morosidad alta | >5% de cartera | Banner de alerta |

| 📊 Contrato por vencer | <30 días | Lista de acción |

---

### Reportes Automáticos (Cron Jobs)

| Reporte | Frecuencia | Contenido | Destinatario |

|---------|------------|-----------|--------------|

| Resumen diario | Diario 8am | Pagos recibidos, morosidad del día | Admin |

| Reporte morosidad | Lunes 9am | Lista clientes morosos, clasificación, acciones | Admin + Finanzas |

| Estado de cartera | Día 1 y 15 | KPIs, comparativa vs mes anterior | Gerencia |

| Reporte mensual | Día 1 del mes | Completo: ingresos, ocupación, morosidad, tendencias | Gerencia + Inversionistas |

| Proyección flujo | Día 1 del mes | Pagos esperados próximos 3 meses | CFO |

---

### Automatizaciones de Proceso

| Proceso | Automatización | Beneficio |

|---------|---------------|-----------|

| **Clasificación cartera** | Auto-mover contratos según días de mora | Ahorra revisión manual |

| **Late fees** | Calcular y registrar $15/día después del 5to | Consistencia, sin errores |

| **Pre-calificación** | Aprobar/rechazar si DTI claramente dentro/fuera | Respuesta instantánea |

| **Elegibilidad compra** | Notificar cuando cliente cumple 90% pagos | No se pierde oportunidad |

| **Recordatorios** | Crear reminder si no hay respuesta en 3 días | Seguimiento automático |

| **Expediente completo** | Marcar ✅ cuando todos docs están subidos | Visual de progreso |

---

### Integración en Calendario

Todas estas automatizaciones están distribuidas en el calendario de 5 semanas:

| Semana | Automatizaciones incluidas |

|--------|---------------------------|

| S1 | Emails base: bienvenida, solicitud recibida/aprobada |

| S2 | Emails pago: recordatorio, confirmación, mora. Sistema alertas |

| S3 | Dashboard Cartera, clasificación auto, late fees, reportes cron |

| S4 | Dashboard Seguimiento, emails 90 días, calendario visual |

| S5 | Dashboard Referidos, todas las automatizaciones restantes |

**Tiempo adicional: 0 semanas** (redistribuido en el calendario existente)

---

## PARTE C: REQUISITOS ESPECIFICOS DEL CLIENTE

### 1. Comparativa de casas + Base de datos clientes

**Implementacion:** Portal Clientes (Fase 2)

- Catalogo publico de propiedades disponibles
- Comparador lado a lado (hasta 3 propiedades)
- Calculo automatico de pago mensual segun plazo
- Base de datos de clientes centralizada con historial completo

### 2. Pre-solicitud creditos / Pre-calificacion

**Implementacion:** Portal Clientes (Fase 2)

- Formulario rapido: ingreso mensual + gastos
- Calculo automatico de DTI (Debt-to-Income)
- Resultado instantaneo: califica / no califica
- Datos guardados en base de datos para seguimiento

### 3. Administracion de la casa

**Implementacion:** Portal Empleados (Fase 1D)

- Sistema de tickets para mantenimiento/reparaciones
- Tracking de pagos mensuales
- Estado del contrato RTO (meses restantes, pagos hechos)
- Historial completo por propiedad

---

## PARTE D: DOCUMENTOS Y ANEXOS DEL CLIENTE

### Documentos recibidos y guardados

| Documento | Descripcion | Uso en el sistema | ID Memoria ||-----------|-------------|-------------------|------------|| **Checklist Compra de Casa** | 26 puntos de evaluacion de propiedades | AdquirirAgent - tool `evaluate_property_criteria` | 13475557 || **Solicitud de Credito (Anexo 1)** | Formulario de perfil del cliente | IncorporarAgent - tool `create_client` | 13475561 || **Lease Agreement RTO (Anexo 3)** | Contrato rent-to-own de 33 clausulas | GestionarAgent - tool `generate_rto_contract` | 13475662 |---

### Checklist Compra de Casa (26 puntos) - ID: 13475557

Usado por **AdquirirAgent** para evaluar propiedades antes de comprar:| Categoria | Items ||-----------|-------|| **Estructura** | Marco de acero, suelos/subfloor, techo/techumbre, paredes/ventanas || **Instalaciones** | Regaderas/tinas/coladeras, electricidad, plomeria, A/C, gas || **Documentacion** | Titulo limpio sin adeudos, VIN revisado, docs vendedor, aplicacion firmada vendedor/comprador, Bill of Sale || **Financiero** | Precio compra + costo obra, reparaciones < 30% valor venta, comparativa precios mercado, costos extra (traslado/movida/alineacion) || **Especificaciones** | Ano, condiciones, numero cuartos, lista reparaciones necesarias, recorrido completo || **Cierre** | Deposito inicial, Deposit Agreement firmado, contrato firmado si financiamiento, pago total si contado, entrega sobre con aplicacion y factura firmada |---

### Solicitud de Credito - Anexo 1 (Schema tabla `clients`) - ID: 13475561

Campos capturados del formulario de solicitud:| Seccion | Campos ||---------|--------|| **Info Solicitante** | nombre_completo, fecha_nacimiento, ssn_itin, estado_civil (soltero/casado/otro), telefono, email, direccion, ciudad, estado, codigo_postal, tipo_residencia (propia/rentada/otra) || **Info Laboral** | empleador, ocupacion, direccion_empleador, telefono_empleador, ingreso_mensual, tiempo_empleo_anos, tiempo_empleo_meses, otra_fuente_ingresos (si/no), monto_otra_fuente || **Credito Solicitado** | monto_solicitado, proposito (compra vivienda/remodelacion/otro), plazo_deseado_anos, plazo_deseado_meses, forma_pago_preferida (transferencia/cheque/otro) || **Referencias** | referencia1_nombre, referencia1_telefono, referencia1_relacion, referencia2_nombre, referencia2_telefono, referencia2_relacion || **Autorizacion** | firma_solicitante, fecha_firma, autoriza_verificacion_credito |---

### Lease Agreement RTO - Anexo 3 (Contrato de 33 clausulas) - ID: 13475662

**Campos variables para generacion automatica de contratos:**| Campo | Descripcion | Ejemplo ||-------|-------------|---------|| `tenant_name` | Nombre del cliente | Juan Garcia || `property_address` | Direccion de la propiedad | 123 Oak St, Houston TX || `hud_number` | Numero HUD del mobile home | TEX123456 || `property_year` | Ano del mobile home | 2018 || `lease_term_months` | Duracion del contrato | 36 || `monthly_rent` | Pago mensual | $850 || `down_payment` | Enganche | $5,000 || `purchase_price` | Precio de compra total | $45,000 || `start_date` | Fecha de inicio | 2026-02-01 || `end_date` | Fecha de terminacion | 2029-01-31 |**Terminos fijos del contrato:**| Termino | Valor ||---------|-------|| Dia de pago | Dia 15 del mes || Late fee | $15/dia despues del 5to dia || NSF fee (cheque devuelto) | $250 || Hold over rent | $695/mes si se queda despues del termino || Pago Zelle | 832-745-9600 || Closing period | 21 dias tras ejercer opcion de compra || Depositos | No reembolsables si cancela || Warranty | Solo interior por remodelacion, AS IS || Default cure period | 7 dias para corregir incumplimiento |**Las 33 clausulas del contrato:**

1. REAL AND/OR PERSONAL PROPERTY (HUD, Year, ubicacion)
2. TERM (duracion, fecha terminacion)
3. RENT (A-E: Delinquent, Prorated, Returned Checks, Order of funds, Increases)
4. CONDITION OF PREMISES
5. ASSIGNMENT AND SUB-LETTING (no sin consentimiento)
6. ALTERATIONS AND IMPROVEMENTS (no sin consentimiento)
7. NON-DELIVERY OF POSSESSION (30 dias)
8. HAZARDOUS MATERIALS (prohibidos)
9. UTILITIES (tenant responsable)
10. MAINTENANCE, REPAIR, AND RULES (12 reglas A-L)
11. DAMAGE TO PREMISES
12. ACCESS BY LANDLORD (6 motivos A-F)
13. SUBORDINATION OF LEASE
14. TENANT'S HOLD OVER ($695/mes)
15. SURRENDER OF PREMISES
16. WATERBEDS (prohibidas)
17. QUIET ENJOYMENT
18. INDEMNIFICATION
19. DEFAULT (7 dias para corregir)
20. ABANDONMENT
21. ATTORNEYS' FEES
22. RECORDING OF TEXAS LEASE AGREEMENT (no registrar)
23. GOVERNING LAW (Texas)
24. SEVERABILITY
25. BINDING EFFECT
26. DESCRIPTIVE HEADINGS
27. CONSTRUCTION
28. NON-WAIVER
29. MODIFICATION (solo escrito)
30. NOTICE
31. LEAD-BASED PAINT DISCLOSURE (si antes 1978)
32. ARBITRATION (excepto pagos)
33. OPTION TO PURCHASE (precio, cierre 21 dias)

---

## PARTE E: ESTADO DEL PROYECTO

### TODAS las preguntas RESPONDIDAS ✅

| # | Pregunta | Respuesta ||---|----------|-----------|| 1 | Orden de los 6 macroprocesos | ✅ COMERCIALIZAR = Transversal. Resto lineales || 2 | Relaciones exactas entre procesos | ⏳ Diagrama pendiente hoy || 3 | Multiples contratos por cliente? | ✅ Normalmente 1, soportar multiples || 4 | Usuarios iniciales | ✅ Solo empleados || 5 | AppFolio/Buildium? | ✅ NO - Reemplazamos con Stripe || 6 | Catalogo de casas? | ✅ Lo creamos nosotros || 7 | Volumen clientes/mes | ✅ **20-30 clientes/mes** || 8 | Volumen inversionistas/mes | ✅ **10-15 activos/mes** || 9 | Metodo de pago | ✅ **Tarjeta** (eliminar cash) || 10 | Procesos prioritarios | ✅ **COMERCIALIZAR + ADQUIRIR** || 11 | TDHCA | ✅ **Generar docs listos para enviar** || 12 | Proveedor KYC | ✅ **NO tienen** - KYC manual v1.0 || 13 | Plantillas Anexo 1 y 3 | ✅ **RECIBIDAS Y GUARDADAS** |

### Documentos RECIBIDOS ✅

| Documento | Estado | ID Memoria ||-----------|--------|------------|| Checklist Compra de Casa (26 puntos) | ✅ Guardado | 13475557 || Solicitud de Credito (Anexo 1) | ✅ Guardado | 13475561 || Lease Agreement RTO (Anexo 3) | ✅ Guardado | 13475662 |

### Decisiones CONFIRMADAS

| Decision | Detalle ||----------|---------|| **AppFolio = REEMPLAZADO** | Sistema propio + Stripe (solo tarjeta) || **Catalogo de casas = NUEVO** | Lo creamos desde cero || **Contratos multiples = SOPORTADO** | Schema BD permite 1:N || **COMERCIALIZAR = TRANSVERSAL** | Siempre disponible || **KYC = MANUAL v1.0** | 20-30 clientes/mes es manejable || **Prioridad = COMERCIALIZAR + ADQUIRIR** | Peticion explicita del cliente || **TDHCA = GENERAR DOCS** | Formato listo para enviar |

### Metricas de volumen

| Metrica | Valor | Impacto ||---------|-------|---------|| Clientes nuevos/mes | 20-30 | KYC manual es viable || Inversionistas activos/mes | 10-15 | FondearAgent no sera el mas usado || Propiedades totales | ~125 | BD manejable |

### Documentos del Cliente

| Documento | Estado ||-----------|--------|| **Checklist Compra Casa** | ✅ RECIBIDO || **Anexo 1** (perfil cliente) | ✅ RECIBIDO || **Anexo 3** (contrato RTO) | ✅ RECIBIDO || Diagrama relaciones procesos | ⏳ Cliente lo envia hoy |

### Riesgos ACTUALIZADOS

- ~~Si quieren integracion con Buildium~~ → **ELIMINADO** (confirmado que no)
- ~~Volumen desconocido~~ → **ELIMINADO** (20-30 clientes/mes, manejable)
- ~~Si no nos dan Anexo 1 y 3~~ → **ELIMINADO** (ya los tenemos)
- Diagrama de relaciones pendiente: puede ajustar FlowValidator (+1-2 dias)

---

## PARTE F: ANALISIS DE SISTEMAS E INTEGRACIONES

### Estrategia General

**Objetivo:** Reemplazar la mayor cantidad posible de sistemas actuales con nuestra plataforma, integrando solo los servicios externos que son obligatorios.

### Sistemas que REEMPLAZAMOS (construimos en la app)

| Sistema del Excel | Lo que construimos | Modulo ||-------------------|-------------------|--------|| ERP de inventarios | Base de datos de propiedades + CRUD | Portal Empleados || Sistema documental / gestor documental | Supabase Storage + gestion de docs | Tools de documentos || Sistema de evaluacion de propiedades | Tool `evaluate_property_criteria` | AdquirirAgent || CRM / ERP general | Base de datos clientes + inversionistas | Portal Empleados || CRM de adquisiciones | Modulo de propiedades | AdquirirAgent || CRM de inversionistas | Modulo de inversionistas | FondearAgent || CRM de clientes | Modulo de clientes | IncorporarAgent || Sistema de contratos | Generacion automatica de PDFs | GestionarAgent || Sistema legal (docs) | Generacion de documentos legales | Tools de contratos || Sistema de gestion contractual | Tracking de contratos RTO | GestionarAgent || BI Dashboard | Dashboard con KPIs | Portal Empleados || Plataforma web/app movil | **ES LO QUE ESTAMOS CREANDO** | Toda la app || Dashboard de cartera | Vista de contratos y pagos | Portal Empleados || Dashboard de seguimiento | Vista de estado del cliente | Portal Clientes || Plataforma de recompensas/referidos | Sistema de referidos | EntregarAgent || Base documental ERP | Supabase Storage | Tools de documentos || Sistema de control legal | Generacion y tracking de docs | Tools de contratos |

### Sistemas que INTEGRAMOS (APIs externas obligatorias)

| Sistema | Por que no podemos reemplazarlo | Solucion de integracion | Costo estimado ||---------|--------------------------------|------------------------|----------------|| **Procesador de pagos** | Necesitamos procesar dinero real (tarjeta) | **Stripe Payments** | 2.9% + $0.30/transaccion || **Buro de credito** | Solo Experian/Equifax/TransUnion tienen datos crediticios | Experian API o Nova Credit | $1-5 por consulta || **Sistema bancario** | Verificar cuentas y transferencias | Plaid | $0.30-$1.50 por conexion |

### Sistemas OPCIONALES (depende de lo que quiera el cliente)

| Sistema | Opcion A: Reemplazar | Opcion B: Integrar | Decision ||---------|---------------------|-------------------|----------|| ~~Buildium / AppFolio~~ | ~~Nuestro sistema~~ | ~~API Buildium~~ | ✅ **REEMPLAZAMOS** (confirmado) || **KYC / Validacion digital** | Manual: empleado verifica docs | Stripe Identity ($1.50/verificacion) | Manual v1.0 || **ERP financiero / contable** | Reportes basicos en nuestra app | QuickBooks/Xero API | ⏳ Pendiente || **TDHCA (titulos)** | Generar docs, proceso manual | No tiene API publica | Manual |

### Costos estimados de integraciones

| Integracion | Costo fijo | Costo por uso | Notas ||-------------|-----------|---------------|-------|| Stripe Payments | $0 | 2.9% + $0.30/tx | Obligatorio para cobros || Stripe Identity | $0 | $1.50/verificacion | Solo si quieren KYC auto || Experian API | Setup ~$500 | $1-5/consulta | Solo si quieren consulta credito || Plaid | $0 | $0.30-$1.50/conexion | Solo si quieren verificar cuentas || QuickBooks API | $0 | $0 (con suscripcion) | Solo si lo necesitan |---

## PARTE G: CALENDARIO VISUAL

```javascript
================================================================================
        CALENDARIO AGIL MANINOS AI PLATFORM - 7-8 SEMANAS (con margen)
================================================================================

        DESARROLLO CORE                              MARGEN
   ┌─────────────────────────────────────────┐  ┌─────────────────┐
   │  S1    S2    S3    S4    S5             │  │  S6   S7   S8   │
   │  ▼     ▼     ▼     ▼     ▼              │  │  ▼    ▼    ▼    │
   └─────────────────────────────────────────┘  └─────────────────┘

SEMANA 1      │ SEMANA 2      │ SEMANA 3      │ SEMANA 4      │ SEMANA 5
──────────────│───────────────│───────────────│───────────────│──────────────
INFRA +       │ AGENTES +     │ PORTAL        │ PORTAL        │ PORTAL
3 AGENTES     │ STRIPE + DOCS │ EMPLEADOS     │ CLIENTES      │ INVERSORES
──────────────│───────────────│───────────────│───────────────│──────────────
Auth + BD     │ Gestionar     │ Dashboard     │ Catalogo      │ Portafolio
RLS           │ Fondear       │ CRUD Props    │ Comparador    │ Rendimientos
FlowValidator │ Entregar      │ CRUD Clients  │ Pre-calif     │ Documentos
Comercializar │ Stripe        │ Contratos     │ Solicitud     │ Testing
Adquirir      │ PDFs Anexo 3  │ Pagos         │ Mi Contrato   │ Deploy v3.0
Incorporar    │ TDHCA + IRS   │ Chat IA       │ Mis Pagos     │ Handoff
17 tools      │ 16 tools      │ Deploy v1.0   │ Deploy v2.0   │
──────────────│───────────────│───────────────│───────────────│──────────────
🧪 Demo 3 ag. │ 🧪 6 agentes  │ 🚀 v1.0 LIVE  │ 🚀 v2.0 LIVE  │ 🚀 v3.0 LIVE
Cliente prueba│ Cliente prueba│ Cliente usa   │ Cliente simula│ Cliente aprueba

================================================================================
                        SEMANAS 6-8: MARGEN DE SEGURIDAD
================================================================================

SEMANA 6           │ SEMANA 7           │ SEMANA 8
───────────────────│────────────────────│────────────────────
AJUSTES FEEDBACK   │ BUGS + POLISH      │ BUFFER EMERGENCIA
───────────────────│────────────────────│────────────────────
Cambios pedidos    │ Corregir bugs      │ Solo si necesario
por el cliente     │ encontrados        │ o para mejoras
                   │ Pulir UI/UX        │ adicionales
───────────────────│────────────────────│────────────────────

================================================================================
                              ENTREGAS SEMANALES
================================================================================

S1 ──► Demo chat IA con 3 agentes       ──► Cliente prueba comandos basicos
S2 ──► 6 agentes + Stripe + PDFs        ──► Cliente genera contrato real
S3 ──► 🚀 Portal Empleados LIVE         ──► Cliente usa dashboard completo
S4 ──► 🚀 Portal Clientes LIVE          ──► Cliente simula ser comprador
S5 ──► 🚀 Sistema COMPLETO LIVE         ──► Cliente aprueba produccion
S6-8 ► Ajustes + Margen                 ──► Incorporar feedback final

================================================================================
                           HITOS POR SEMANA (GANTT)
================================================================================

S1  [████████████████████] Infra + 3 Agentes (17 tools) ─────────► 🧪 Demo
S2  [████████████████████] 3 Agentes + Stripe + Docs (16 tools) ► 🧪 Demo
S3  [████████████████████] Portal Empleados + Deploy ────────────► 🚀 v1.0
S4  [████████████████████] Portal Clientes + Deploy ─────────────► 🚀 v2.0
S5  [████████████████████] Portal Inversores + Deploy ───────────► 🚀 v3.0
S6  [░░░░░░░░░░░░░░░░░░░░] Ajustes feedback cliente ─────────────► ✏️
S7  [░░░░░░░░░░░░░░░░░░░░] Bugs + polish ────────────────────────► 🔧
S8  [░░░░░░░░░░░░░░░░░░░░] Buffer emergencia ────────────────────► ⚡

================================================================================
                           DOCUMENTOS INTEGRADOS
================================================================================

📄 Anexo 1 (Solicitud Credito) → create_client_profile, verify_client_kyc
📄 Anexo 3 (Lease Agreement)   → generate_rto_contract (33 clausulas)
📄 Checklist 26 puntos         → evaluate_property_criteria
📄 TDHCA Titulo Propiedad      → process_title_transfer
📄 IRS 1099-S                  → process_loyalty_program

================================================================================
                              TOOLS POR AGENTE
================================================================================

ComercializarAgent (7):
├── create_acquisition_committee_record
├── process_disbursement
├── promote_property_listing
├── evaluate_credit_risk
├── formalize_sale
├── manage_portfolio_recovery
└── process_loyalty_program

AdquirirAgent (5):
├── search_property_sources
├── evaluate_property_criteria ← Checklist 26 puntos
├── create_inspection_record
├── calculate_acquisition_offer
└── register_property_inventory

IncorporarAgent (5):
├── create_client_profile ← Anexo 1
├── verify_client_kyc
├── calculate_client_dti
├── generate_rto_contract ← Anexo 3
└── send_client_update

FondearAgent (7):
├── create_financial_plan
├── manage_investor_pipeline
├── onboard_investor
├── generate_debt_note
├── validate_sec_compliance
├── calculate_debt_ratio
└── send_investor_update

GestionarAgent (5):
├── generate_rto_contract ← Anexo 3
├── setup_automatic_payment ← Stripe
├── monitor_payment_status
├── assess_portfolio_risk
└── generate_monthly_report

EntregarAgent (4):
├── verify_purchase_eligibility
├── process_title_transfer ← TDHCA
├── offer_upgrade_options
└── process_referral_bonus

================================================================================
                          TOTAL: 33 TOOLS, 6 AGENTES
================================================================================
```

---

## PARTE H: PROXIMO PASO

**UNICO PENDIENTE:** Diagrama de relaciones entre los 6 macroprocesos del cliente.Una vez recibido:

1. Actualizar FlowValidator con las relaciones exactas