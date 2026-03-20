# Maninos AI Platform — Reporte de Entrega V5

**Fecha:** 20 de marzo de 2026
**Preparado para:** Sebastian Zambrano, CEO — Maninos Homes LLC & Maninos Capital LLC
**Preparado por:** RAMA AI

---

## Accesos a los Portales

| Portal | URL |
|--------|-----|
| **Homes** (Operaciones) | [maninos-ai.vercel.app/homes](https://maninos-ai.vercel.app/homes) |
| **Capital** (Financiamiento & Inversionistas) | [maninos-ai.vercel.app/capital](https://maninos-ai.vercel.app/capital) |
| **Clientes** (Catálogo & Compra) | [maninos-ai.vercel.app/clientes](https://maninos-ai.vercel.app/clientes) |

---

## Resumen de Nuevas Funcionalidades — Versión 5

### 1. Lógica de Títulos

- Información del título integrada directamente en la aplicación mediante conexión con TDHCA.
- Cuando el nombre en el título cambia, se genera una alerta/notificación automática al portal Homes o directamente al cliente si aplica para la venta de la casa.

### 2. Lógica de Requisiciones (Payment Orders)

El flujo completo de requisiciones opera de la siguiente manera:

1. Cada vez que se requiere un pago, se genera una requisición que llega a Sebastian para su aprobación.
2. Una vez aprobada, la requisición pasa a Abigail para su ejecución.
3. Al ser ejecutada y confirmada por Abigail, el movimiento se envía a contabilidad, donde se almacena hasta que llega el estado de cuenta y se realiza la conciliación de movimientos.
4. Una vez conciliados y confirmados los movimientos por Abigail, se asignan automáticamente las cuentas contables correspondientes a cada movimiento.
5. Tras la confirmación final, los datos se envían a los estados financieros para la generación de reportes.

### 3. Lógica de Pagos (Casas + Mensualidades RTO)

1. El cliente confirma que ha realizado el pago, y la notificación llega a Abigail.
2. Abigail verifica y confirma la recepción del pago desde el portal Homes o Capital.
3. La información del pago se registra en contabilidad (Homes/Capital).
4. Los pagos pendientes del cliente se actualizan automáticamente en su cuenta.
5. Una vez completado el pago total de la casa, se transfieren los documentos al cliente: **Bill of Sale**, **Título** y **Aplicación de Título**.
6. Cuando se cambia el nombre en el título, se envía un email de alerta al cliente.

### 4. Nuevas Features

| Feature | Descripción |
|---------|-------------|
| **Voz inteligente** | Comandos de voz en español para la cotización de renovación, impulsado por GPT-4o-mini |
| **Solicitud de Crédito RTO** | Formulario de 9 secciones que el cliente completa desde su portal |
| **Cálculo RTO Inteligente** | Algoritmo que calcula la mensualidad basándose en la renta actual del cliente (Precio Inteligente) |
| **Predicción de valor futuro** | Modelo KNN con 93 datos históricos que predice el valor de la casa al final del plazo |
| **Firma digital de contratos** | Maninos firma automáticamente; el cliente firma desde su portal |
| **WhatsApp flyer + texto** | Compartir propiedades por WhatsApp con flyer visual y texto pre-formateado |
| **Sección Títulos** | Monitoreo de títulos con integración TDHCA |
| **Sección Notificaciones** | Requisiciones, transferencias y aprobaciones de renovación centralizadas |
| **Emails automáticos** | Documentos, recibos de pago y alertas de pagos atrasados enviados automáticamente al cliente |
| **Comprobante por WhatsApp** | Opción para que los clientes envíen su comprobante de pago vía WhatsApp |

---

## Renovación V5

- **19 partidas** con mano de obra y materiales separados.
- **Cronograma Gantt visual** para seguimiento de cada fase de renovación.
- **Importación inteligente** del reporte de evaluación mediante GPT-4o-mini.
- **Flujo de aprobación**: el empleado envía la cotización y Sebastian aprueba desde la sección de Notificaciones.
- **Comandos de voz**: instrucciones naturales como *"pon en demolición 500 de materiales y 4 días"*.

---

## Portal Capital — Mejoras

- **Login separado** con acceso exclusivo para Sebastian y Abigail.
- **Solicitud de crédito** de 9 secciones con vista read-only y plantilla vacía disponible.
- **Cálculo RTO** con 4 escenarios de financiamiento y Precio Inteligente.
- **Verificación de identidad** con revisión integrada de documentos del cliente.
- **Firma digital de contratos** con generación automática de PDF.

---

## Portal Clientes — Mejoras

- **Flujo RTO visual de 4 pasos**: Identidad > Crédito > Firma > Pagos.
- **Formulario de solicitud de crédito** completo y guiado.
- **Página de firma de contrato** integrada en el portal del cliente.
- **Diseño unificado** navy/blue con estética limpia estilo Airbnb.

---

## Stack Tecnológico

| Componente | Tecnología |
|------------|------------|
| **Backend** | Python 3.12, FastAPI, Supabase (PostgreSQL) |
| **Frontend** | Next.js 14, TypeScript, Tailwind CSS |
| **Inteligencia Artificial** | OpenAI GPT-4o / GPT-4o-mini |
| **Despliegue** | Railway (API) + Vercel (Web) |
| **Email** | Resend |
| **Pagos** | Stripe |

---

*Documento generado por RAMA AI — Marzo 2026*
