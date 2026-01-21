# Maninos AI Platform
## Propuesta de Desarrollo - Versión Definitiva

---

# 📋 RESUMEN EJECUTIVO

## ¿Qué van a recibir?

Un **sistema completo de gestión para Maninos Capital LLC** con 3 portales conectados a un asistente de Inteligencia Artificial:

| Portal | Usuarios | Para qué sirve |
|--------|----------|----------------|
| **Portal Empleados** | Staff de Maninos | Gestionar todo el negocio con ayuda de IA |
| **Portal Clientes** | Compradores RTO | Ver casas, comparar, aplicar, ver su contrato y pagos |
| **Portal Inversionistas** | Inversionistas | Ver sus inversiones, rendimientos y documentos |

---

# 🎯 LO QUE VAN A PODER HACER

## Portal Empleados (Staff Maninos)

### Dashboard Principal
- Vista general de **propiedades, clientes, contratos y pagos**
- **Alertas automáticas** de morosidad, tareas pendientes y vencimientos
- **KPIs del negocio** en tiempo real (morosidad, ocupación, ingresos)

### Asistente IA (Chat)
- Crear y editar propiedades, clientes, contratos **hablando naturalmente**
- Preguntar el estado de cualquier cosa ("¿cuántos pagos atrasados hay?")
- Ejecutar tareas automáticamente ("envía recordatorio a clientes morosos")

### Gestión de Propiedades
- Base de datos completa de **125+ propiedades**
- Tracking del proceso de adquisición (desde sourcing hasta registrado)
- **Evaluación automática** con el checklist de 26 puntos
- Regla del 70% calculada automáticamente

### Gestión de Clientes
- Base de datos de todos los clientes
- Perfil completo: datos personales, KYC, DTI, historial
- **Pre-calificación automática**

### Gestión de Contratos
- **Generación automática de contratos RTO** (Anexo 3 completo con 33 cláusulas)
- Tracking de estado (activo, completado, cancelado)
- Documentos asociados descargables

### Gestión de Pagos
- Registro de todos los pagos
- **Detección automática de morosidad**
- **Recordatorios automáticos** por email
- Late fees calculados automáticamente ($15/día después del 5to)

### Administración de Propiedades
- Sistema de tickets para mantenimiento/reparaciones
- Historial de mantenimiento por propiedad
- Costos asociados

### Reportes Automáticos
- Reporte mensual automático
- Reporte por propiedad
- Reporte de morosidad
- Resumen diario a las 8am

---

## Portal Clientes (Compradores RTO)

### Catálogo de Casas (Público)
- Ver todas las propiedades disponibles
- Fotos, descripción, precio, ubicación
- Filtros por precio, ubicación, habitaciones

### Comparador de Casas
- Seleccionar hasta **3 propiedades** para comparar
- Ver lado a lado: precio, tamaño, pago mensual estimado
- **Calcular pago según plazo** (24/36/48 meses)

### Pre-calificación (Sin registro)
- Formulario rápido (ingreso, gastos)
- **Resultado instantáneo**: "Calificas" o "No calificas"
- Cálculo automático de DTI (Debt-to-Income)

### Solicitud Formal
- Formulario completo de aplicación (**Anexo 1**)
- Subir documentos requeridos
- Tracking de estado de solicitud

### Mi Contrato (Clientes activos - con login)
- Ver detalles de su contrato RTO
- Meses restantes, pagos completados
- **Calendario visual de pagos**
- Descargar documentos

### Mis Pagos
- Historial completo de pagos
- Próximo pago y fecha
- Descargar recibos
- Recordatorio 5 días antes por email

### Mis Referidos
- Código único de referido
- Lista de referidos y estado
- Bonificaciones ganadas

---

## Portal Inversionistas

### Mi Portafolio
- Lista de todas sus inversiones activas
- Monto invertido, tasa, plazo

### Rendimientos
- Intereses ganados por período
- Proyección de rendimientos futuros

### Documentos
- Pagarés firmados
- Reportes fiscales
- Estados de cuenta

---

# ⚡ LO QUE SE AUTOMATIZA

| Proceso | Tarea | ANTES | DESPUÉS |
|---------|-------|-------|---------|
| **ADQUIRIR** | Evaluar propiedad (26 puntos) | Cálculo manual en Excel | IA evalúa automáticamente |
| **ADQUIRIR** | Registrar propiedad | Ingreso manual | IA extrae datos de documentos |
| **COMERCIALIZAR** | Mostrar inventario | Email manual | Portal online siempre actualizado |
| **COMERCIALIZAR** | Recibir solicitudes | Email/llamada | Formulario + pre-calif. automática |
| **INCORPORAR** | Calcular DTI | Cálculo manual | Cálculo automático instantáneo |
| **INCORPORAR** | Generar contrato | Plantilla Word manual | PDF generado automáticamente |
| **GESTIONAR** | Detectar morosidad | Revisar Excel | Alertas automáticas en dashboard |
| **GESTIONAR** | Enviar recordatorios | Email manual | Emails automáticos programados |
| **GESTIONAR** | Calcular late fees | Manual | Automático ($15/día después 5to) |
| **GESTIONAR** | Reportes | Excel manual | Generación automática |
| **ENTREGAR** | Verificar elegibilidad | Revisión manual | Verificación automática |
| **ENTREGAR** | Generar docs TDHCA | Manual | Template listo para enviar |

---

# 📧 EMAILS AUTOMÁTICOS

## Emails a Clientes

| Cuándo | Email que recibe el cliente |
|--------|----------------------------|
| Al crearse como cliente | "Bienvenido a Maninos" |
| Al enviar solicitud | "Recibimos tu solicitud" |
| Al ser aprobado | "¡Felicidades! Estás aprobado" |
| Al ser rechazado | "Sobre tu solicitud..." |
| Al generar contrato | "Tu contrato está listo" |
| 5 días antes de pago | "Recordatorio: tu pago vence el día X" |
| Al recibir pago | "Confirmación de pago - Recibo #123" |
| 1 día después de mora | "Pago atrasado - Evita cargos" |
| 5 días de mora | "Late fee aplicado ($15/día)" |
| 90 días para vencimiento | "Tu opción de compra vence pronto" |
| Su referido se registró | "Tu referido X se registró" |

## Emails a Empleados/Admin

| Cuándo | Email |
|--------|-------|
| Nueva solicitud recibida | "Nueva solicitud de [Nombre]" |
| Morosidad >15 días | "Escalar a cobranza: [Cliente]" |
| KPI morosidad >5% | "⚠️ Alerta: Morosidad X%" |
| Ratio D/C >1.8 | "⚠️ Ratio acercándose a límite" |

---

# 📊 DASHBOARDS ESPECIALIZADOS

## 1. Dashboard Cartera (Portal Empleados)

Clasificación automática de morosidad:
- ✅ **Al día** 
- 🟡 **Preventivo** (1-5 días de mora)
- 🟠 **Administrativo** (6-30 días)
- 🔴 **Extrajudicial** (31-60 días)
- ⚫ **Judicial** (>60 días)

Con filtros, acciones rápidas y KPIs.

## 2. Dashboard Seguimiento (Portal Clientes)

- Estado del contrato
- Calendario visual de pagos (hechos vs pendientes)
- Meses restantes
- Próximo pago
- Documentos descargables

## 3. Dashboard Referidos (Portal Clientes)

- Lista de referidos
- Estado (pendiente/convertido/pagado)
- Bonificaciones ganadas
- Código de referido único

---

# 📄 DOCUMENTOS QUE SE GENERAN AUTOMÁTICAMENTE

| Documento | Descripción |
|-----------|-------------|
| **Contrato RTO (Anexo 3)** | PDF completo con las 33 cláusulas, datos del cliente y propiedad |
| **Solicitud de Crédito (Anexo 1)** | Formulario pre-llenado con datos del cliente |
| **Título TDHCA** | Formato listo para enviar a TDHCA |
| **IRS 1099-S** | Para reportes fiscales |
| **Recibos de pago** | Con número de confirmación |
| **Pagarés** | Para inversionistas |
| **Estados de cuenta** | Mensuales |

---

# 📅 CALENDARIO DE DESARROLLO

## Duración Total: 10 Semanas

- **Semanas 1-5:** Desarrollo del sistema
- **Semanas 6-10:** Margen para ajustes, mejoras y buffer

---

## 📌 SEMANA 1: Infraestructura + Base del Sistema

| Día | Qué se hace |
|-----|-------------|
| Lunes | Sistema de login y base de datos |
| Martes | Seguridad de datos + flujo de procesos |
| Miércoles | IA para comercializar (7 funciones) |
| Jueves | IA para adquirir propiedades (5 funciones) |
| Viernes | IA para incorporar clientes (5 funciones) |

### 🧪 ENTREGA SEMANA 1:
**Demo del chat con IA funcionando**

### ✅ CHECKLIST - El cliente prueba:
- [ ] Iniciar sesión con email/password
- [ ] Chat: "Crear propiedad en 123 Main St" → verificar que se crea
- [ ] Chat: "Evaluar propiedad con checklist" → ver los 26 puntos
- [ ] Chat: "Crear cliente Juan Pérez" → ver datos del Anexo 1
- [ ] Verificar que llegó email de bienvenida
- [ ] Chat: "Generar contrato para Juan Pérez"
- [ ] Reportar cualquier error o sugerencia

---

## 📌 SEMANA 2: Completar IA + Pagos + Documentos

| Día | Qué se hace |
|-----|-------------|
| Lunes | IA para gestionar cartera (5 funciones) |
| Martes | IA para fondear/inversionistas (7 funciones) |
| Miércoles | IA para entregar/cerrar (4 funciones) |
| Jueves | Integración pagos con tarjeta (Stripe) + PDFs de contratos |
| Viernes | Documentos TDHCA + IRS + pruebas |

### 🧪 ENTREGA SEMANA 2:
**6 agentes de IA completos + pagos + generación de documentos**

### ✅ CHECKLIST - El cliente prueba:
- [ ] "Generar contrato RTO" → debe generar PDF con 33 cláusulas
- [ ] "Configurar pago automático" → verificar en Stripe
- [ ] "Crear documento TDHCA" → ver formato de título
- [ ] Hacer un pago de prueba → verificar email de confirmación
- [ ] Ver alertas en el dashboard
- [ ] Probar los 6 tipos de asistente IA
- [ ] Reportar errores o sugerencias

---

## 📌 SEMANA 3: Portal Empleados Completo

| Día | Qué se hace |
|-----|-------------|
| Lunes | Dashboard con KPIs (propiedades, clientes, contratos, pagos, morosidad) |
| Martes | Pantallas para gestionar propiedades y clientes |
| Miércoles | Pantallas para contratos y pagos |
| Jueves | Chat IA integrado + reportes automáticos |
| Viernes | Pruebas completas + publicación |

### 🚀 ENTREGA SEMANA 3:
**Portal Empleados EN VIVO en producción**

### ✅ CHECKLIST - El cliente prueba:
- [ ] Iniciar sesión en el portal empleados
- [ ] Ver Dashboard: KPIs de propiedades, clientes, contratos, pagos
- [ ] Crear una propiedad desde la interfaz
- [ ] Crear un cliente con el formulario Anexo 1
- [ ] Ver Dashboard Cartera: clasificación de morosidad
- [ ] Crear un contrato → asociar cliente + propiedad
- [ ] Registrar un pago manual
- [ ] Chat: "¿Cuántos pagos atrasados?"
- [ ] Verificar que llegó el reporte diario por email
- [ ] Verificar que los late fees se calculan automáticamente ($15/día)
- [ ] Reportar errores o sugerencias

---

## 📌 SEMANA 4: Portal Clientes Completo

| Día | Qué se hace |
|-----|-------------|
| Lunes | Catálogo de casas con fotos y filtros |
| Martes | Comparador de casas + calculadora de pagos |
| Miércoles | Pre-calificación + formulario de solicitud |
| Jueves | Sección "Mi Contrato" + "Mis Pagos" |
| Viernes | Pruebas completas + publicación |

### 🚀 ENTREGA SEMANA 4:
**Portal Clientes EN VIVO en producción**

### ✅ CHECKLIST - El cliente prueba:
- [ ] Ver catálogo público (sin necesidad de login)
- [ ] Usar filtros: precio, ubicación, habitaciones
- [ ] Ver detalle de una casa: fotos, descripción, mapa
- [ ] Usar comparador: seleccionar 3 casas y ver lado a lado
- [ ] Usar calculadora: ver pagos a 24/36/48 meses
- [ ] Hacer pre-calificación DTI → ver resultado instantáneo
- [ ] Llenar solicitud Anexo 1 → verificar email de confirmación
- [ ] Iniciar sesión y ver "Mi Contrato" con calendario de pagos
- [ ] Ver "Mis Pagos": historial y recibos
- [ ] Verificar email de recordatorio 5 días antes de pago
- [ ] Reportar errores o sugerencias

---

## 📌 SEMANA 5: Portal Inversionistas + Sistema Completo

| Día | Qué se hace |
|-----|-------------|
| Lunes | Sección "Mi Portafolio" |
| Martes | Sección "Rendimientos" |
| Miércoles | Sección "Documentos" (pagarés, reportes fiscales) |
| Jueves | Pruebas completas + publicación |
| Viernes | Documentación y capacitación |

### 🚀 ENTREGA SEMANA 5:
**Sistema COMPLETO EN VIVO**

### ✅ CHECKLIST FINAL - El cliente prueba:
- [ ] Iniciar sesión como inversionista: ver "Mi Portafolio"
- [ ] Ver rendimientos: intereses y proyección
- [ ] Descargar: pagaré y reporte fiscal
- [ ] Iniciar sesión como cliente: ver "Dashboard Referidos"
- [ ] Ver código de referido, lista de referidos y bonos
- [ ] Verificar que la clasificación automática de cartera funciona
- [ ] Verificar que la notificación de elegibilidad de compra funciona
- [ ] **PRUEBA FINAL:** usar el sistema como empleado, cliente e inversionista
- [ ] **APROBAR** para uso en producción

---

## 📌 SEMANAS 6-10: Margen y Ajustes

| Semana | Para qué se usa |
|--------|-----------------|
| **Semana 6** | Ajustes basados en feedback de semanas 1-3 |
| **Semana 7** | Ajustes basados en feedback de semanas 4-5 |
| **Semana 8** | Corregir bugs encontrados + pulir diseño |
| **Semana 9** | Mejoras opcionales (SMS, WhatsApp, extras) |
| **Semana 10** | Buffer final + documentación + capacitación + cierre |

**NOTA:** Si todo va bien, las semanas 9-10 se pueden usar para features adicionales o terminar antes.

---

# 📊 CALENDARIO VISUAL

```
════════════════════════════════════════════════════════════════════════════════
                    CALENDARIO MANINOS AI PLATFORM - 10 SEMANAS
════════════════════════════════════════════════════════════════════════════════

         DESARROLLO                                    MARGEN
    ┌────────────────────────────────────┐    ┌────────────────────────────────┐
    │   S1    S2    S3    S4    S5       │    │   S6    S7    S8    S9   S10   │
    │   ▼     ▼     ▼     ▼     ▼        │    │   ▼     ▼     ▼     ▼    ▼    │
    └────────────────────────────────────┘    └────────────────────────────────┘

════════════════════════════════════════════════════════════════════════════════
                              ENTREGAS POR SEMANA
════════════════════════════════════════════════════════════════════════════════

S1  [████████████████████] IA Base (3 asistentes)         ──► 🧪 Demo chat
S2  [████████████████████] IA Completa + Pagos + Docs     ──► 🧪 Demo completo
S3  [████████████████████] Portal Empleados               ──► 🚀 v1.0 EN VIVO
S4  [████████████████████] Portal Clientes                ──► 🚀 v2.0 EN VIVO
S5  [████████████████████] Portal Inversionistas          ──► 🚀 v3.0 EN VIVO
S6  [░░░░░░░░░░░░░░░░░░░░] Ajustes según feedback         ──► ✏️ Cambios
S7  [░░░░░░░░░░░░░░░░░░░░] Ajustes según feedback         ──► ✏️ Cambios
S8  [░░░░░░░░░░░░░░░░░░░░] Bugs + pulir diseño            ──► 🔧 Refinamiento
S9  [░░░░░░░░░░░░░░░░░░░░] Mejoras opcionales             ──► ⭐ Extras
S10 [░░░░░░░░░░░░░░░░░░░░] Buffer + cierre                ──► ✅ Proyecto cerrado

════════════════════════════════════════════════════════════════════════════════
                                 HITOS CLAVE
════════════════════════════════════════════════════════════════════════════════

🚀 SEMANA 3: Portal Empleados EN VIVO
   → Dashboard completo
   → Gestión de propiedades, clientes, contratos, pagos
   → Chat con IA
   → Reportes automáticos

🚀 SEMANA 4: Portal Clientes EN VIVO  
   → Catálogo de casas con comparador
   → Pre-calificación automática
   → Solicitud de crédito online
   → "Mi Contrato" y "Mis Pagos"

🚀 SEMANA 5: Sistema COMPLETO EN VIVO
   → Portal Inversionistas
   → Dashboard de Referidos
   → Todo funcionando en producción

✅ SEMANA 10: Proyecto cerrado con 5 semanas de margen

════════════════════════════════════════════════════════════════════════════════
```

---

# 📈 KPIs QUE EL SISTEMA VA A MEDIR

| Área | KPI | Meta |
|------|-----|------|
| **Adquisición** | Tiempo promedio de identificación de propiedad | ≤10 días |
| **Adquisición** | Propiedades verificadas antes de oferta | 100% |
| **Adquisición** | Compras con defectos estructurales | 0% |
| **Adquisición** | Precio compra vs valor de mercado | ≤70% |
| **Incorporación** | Tasa de cumplimiento de perfil | ≥95% |
| **Incorporación** | Cumplimiento KYC | 100% |
| **Incorporación** | Evaluaciones DTI completadas | ≤48 horas |
| **Incorporación** | Tiempo de generación de contrato | ≤2 días |
| **Incorporación** | Satisfacción del cliente (NPS) | ≥80 |
| **Fondeo** | Cumplimiento presupuestal | 100% |
| **Fondeo** | Cumplimiento de pagos | 100% |
| **Fondeo** | Ratio deuda-capital | ≤2:1 |
| **Gestión** | Contratos validados legalmente | 100% |
| **Gestión** | Cobranza puntual | ≥95% |
| **Gestión** | Morosidad | ≤5% |
| **Gestión** | Reportes entregados a tiempo | 100% |
| **Entrega** | Casos aprobados para compra | ≥80% |
| **Entrega** | Cumplimiento legal TDHCA | 100% |
| **Entrega** | Retención de clientes | ≥20% |
| **Entrega** | Clientes por referidos | 10% |

---

# 🔧 SISTEMAS QUE REEMPLAZA

Esta plataforma **reemplaza** los siguientes sistemas que actualmente usan o pensaban usar:

| Sistema actual | Lo que construimos |
|----------------|-------------------|
| AppFolio/Buildium | Sistema propio de gestión + Stripe para pagos |
| Excel de inventario | Base de datos de propiedades con dashboard |
| CRM de clientes | Portal completo con perfiles y seguimiento |
| CRM de inversionistas | Portal de inversionistas con reportes |
| Sistema de contratos Word | Generación automática de PDFs |
| Excel de pagos | Sistema de pagos integrado con alertas |
| Emails manuales | Sistema de emails automáticos |

**Lo ÚNICO que se integra externamente es Stripe** para procesar pagos con tarjeta.

---

# 💰 INVERSIÓN

## Precio: $50, 000 USD

### Estructura de Pagos:

| Hito | Porcentaje | Monto | Cuándo |
|------|------------|-------|--------|
| Al firmar contrato | 30% | 15,000| Inicio |
| Al entregar v1.0 (Semana 3) | 30% | 15,000| Portal Empleados listo |
| Al entregar v3.0 (Semana 5) | 30% | 15,000| Sistema completo |
| Al cierre (Semana 10) | 10% | 5 000 | Proyecto cerrado |

### Incluye:
- ✅ 6 Asistentes de IA con 33 herramientas
- ✅ 3 Portales completos (Empleados, Clientes, Inversionistas)
- ✅ 3 Dashboards especializados
- ✅ Sistema de emails automáticos (10+ templates)
- ✅ Integración Stripe para pagos
- ✅ Generación automática de documentos (contratos, TDHCA, IRS)
- ✅ 10 semanas de desarrollo con margen
- ✅ Soporte durante todo el desarrollo
- ✅ 30 días de soporte post-lanzamiento
- ✅ Revisión semanal con el cliente

### Opcional (cotización aparte):
- Mantenimiento mensual: $1,500/mes
- Integración SMS/WhatsApp
- Integración con otros sistemas

---

# 📞 PRÓXIMOS PASOS

1. **Revisar esta propuesta**
2. **Aprobar propuesta y firmar contrato**
4. **Pago inicial (30%)**
5. **Inicio del proyecto**

---

*Documento generado: Enero 2026*
*Proyecto: Maninos AI Platform*

