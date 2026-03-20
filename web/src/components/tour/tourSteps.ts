import { Step } from 'react-joyride'

/**
 * Tour steps for all 3 portals.
 *
 * Two types of tours:
 * 1. "main" tours — sidebar navigation overview (runs on first visit)
 * 2. "page" tours — detailed per-page tutorials (runs when visiting a specific page)
 *
 * Page tours are keyed by pathname prefix.
 */

// ============================================================
// HOMES PORTAL — Main sidebar tour
// ============================================================

export const HOMES_MAIN_TOUR: Step[] = [
  {
    target: 'body',
    content: 'Bienvenido a Maninos Homes. Este portal es para el equipo de operaciones: comprar casas, renovarlas, publicarlas y venderlas. Te mostraré cada sección.',
    title: 'Portal Maninos Homes',
    disableBeacon: true,
    placement: 'center',
  },
  {
    target: 'a[href="/homes"]',
    content: 'Panel principal con KPIs en tiempo real: propiedades activas, ventas del mes, inversión total y pipeline de propiedades (compradas → publicadas → vendidas).',
    title: 'Dashboard',
    placement: 'right',
  },
  {
    target: 'a[href="/homes/market"]',
    content: 'Busca casas en 5 fuentes automáticamente: MHVillage, VMF Homes, 21st Mortgage, Craigslist y Facebook Marketplace. Aplica la regla del 60% para identificar oportunidades de compra. Puedes conectar Facebook importando cookies.',
    title: 'Casas del Mercado',
    placement: 'right',
  },
  {
    target: 'a[href="/homes/properties"]',
    content: 'Inventario completo. Desde aquí creas propiedades nuevas (formulario de 4 pasos), evalúas con checklist de 28 puntos + fotos AI, generas documentos (Bill of Sale, Título TDHCA), y gestionas renovaciones con cotización de 19 partidas + cronograma Gantt.',
    title: 'Propiedades',
    placement: 'right',
  },
  {
    target: 'a[href="/homes/clients"]',
    content: 'Clientes compradores al contado. Ve el historial de cada cliente, estado de pago y documentos. Los clientes RTO se gestionan desde el Portal Capital.',
    title: 'Clientes',
    placement: 'right',
  },
  {
    target: 'a[href="/homes/sales"]',
    content: 'Registro de ventas al contado y RTO. Incluye seguimiento de transferencias bancarias, confirmación de pagos, desglose de comisiones y documentos por venta.',
    title: 'Ventas',
    placement: 'right',
  },
  {
    target: 'a[href="/homes/commissions"]',
    content: 'Comisiones automáticas: $1,500 por venta al contado, $1,000 por RTO. Split 50/50 entre quien encuentra y quien cierra. Ranking de empleados por mes.',
    title: 'Comisiones',
    placement: 'right',
  },
  {
    target: 'a[href="/homes/transfers"]',
    content: 'Dos funciones: (1) Monitoreo de títulos con TDHCA — alerta automática cuando cambia el nombre del título. (2) Gestión de documentos de compra y venta: Bill of Sale, Título, Aplicación de título.',
    title: 'Títulos',
    placement: 'right',
  },
  {
    target: 'a[href="/homes/notificaciones"]',
    content: 'Centro de aprobaciones: requisiciones de pago (Sebastian aprueba → Abigail ejecuta), transferencias bancarias por confirmar, y cotizaciones de renovación por aprobar.',
    title: 'Notificaciones',
    placement: 'right',
  },
  {
    target: 'a[href="/homes/accounting"]',
    content: 'Contabilidad completa de Homes: P&L, Balance General, transacciones, facturación, estados de cuenta bancarios, conciliación de movimientos, plan de cuentas, presupuestos y auditoría.',
    title: 'Contabilidad',
    placement: 'right',
  },
]

// ============================================================
// HOMES — Per-page tours
// ============================================================

export const HOMES_PAGE_TOURS: Record<string, Step[]> = {
  '/homes/market': [
    {
      target: 'body',
      content: 'Desde aquí scrapeas casas de 5 fuentes en automático. Primero conecta Facebook (importar cookies), luego dale a buscar.',
      title: 'Casas del Mercado',
      disableBeacon: true,
      placement: 'center',
    },
  ],
  '/homes/properties': [
    {
      target: 'body',
      content: 'Aquí ves todas tus propiedades. Filtra por estado: Comprada, Publicada, Reservada, En Renovación, Vendida. Haz clic en una propiedad para ver su detalle completo.',
      title: 'Inventario de Propiedades',
      disableBeacon: true,
      placement: 'center',
    },
  ],
  '/homes/notificaciones': [
    {
      target: 'body',
      content: 'Aquí llegan 3 tipos de notificaciones: (1) Cotizaciones de renovación por aprobar, (2) Transferencias bancarias por confirmar, (3) Órdenes de pago pendientes. Sebastian aprueba, Abigail ejecuta.',
      title: 'Centro de Notificaciones',
      disableBeacon: true,
      placement: 'center',
    },
  ],
  '/homes/transfers': [
    {
      target: 'body',
      content: 'Dos pestañas: "Monitoreo" revisa automáticamente en TDHCA si el nombre del título ha cambiado. "Documentos" gestiona los papers de cada compra/venta: Bill of Sale, Título y Aplicación.',
      title: 'Títulos y Documentos',
      disableBeacon: true,
      placement: 'center',
    },
  ],
  '/homes/accounting': [
    {
      target: 'body',
      content: 'Contabilidad completa con 11 secciones: Resumen, Transacciones, Facturación, Estados Financieros, Estado de Cuenta bancario (subir CSV y conciliar), Plan de Cuentas, P&L por Propiedad, Cuentas Bancarias, Presupuesto, Gastos Fijos y Auditoría.',
      title: 'Contabilidad Homes',
      disableBeacon: true,
      placement: 'center',
    },
  ],
  '/homes/sales': [
    {
      target: 'body',
      content: 'Registro de ventas. Cada venta muestra tipo (Contado/RTO), precio, estado, datos bancarios del comprador, y desglose de comisiones. Las ventas RTO se gestionan en detalle desde Capital.',
      title: 'Ventas',
      disableBeacon: true,
      placement: 'center',
    },
  ],
  '/homes/commissions': [
    {
      target: 'body',
      content: 'Comisiones por mes. Regla: $1,500 por venta al contado, $1,000 por RTO. Si la misma persona encuentra y cierra, se lleva el 100%. Si son dos personas, 50/50. Ranking de empleados incluido.',
      title: 'Comisiones',
      disableBeacon: true,
      placement: 'center',
    },
  ],
}

// ============================================================
// CAPITAL PORTAL — Main sidebar tour
// ============================================================

export const CAPITAL_MAIN_TOUR: Step[] = [
  {
    target: 'body',
    content: 'Bienvenido a Maninos Capital. Este portal es para el equipo financiero: gestionar clientes RTO (Rent-to-Own), contratos, pagos mensuales, inversores y contabilidad de Capital.',
    title: 'Portal Maninos Capital',
    disableBeacon: true,
    placement: 'center',
  },
  {
    target: 'a[href="/capital"]',
    content: 'Dashboard financiero: contratos activos, ingreso mensual esperado, pagos atrasados, salud de cartera (tasa de cobranza, morosidad), alertas de vencimiento de pagarés, y actividad reciente.',
    title: 'Dashboard Capital',
    placement: 'right',
  },
  {
    target: 'a[href="/capital/applications"]',
    content: 'Solicitudes RTO de clientes. Flujo completo: (1) Verificar identidad del cliente (KYC — sube ID + selfie), (2) Revisar solicitud de crédito de 9 secciones, (3) Cálculo inteligente de mensualidad con 4 escenarios + Precio Inteligente basado en la renta actual del cliente, (4) Aprobar y generar contrato.',
    title: 'Solicitudes RTO',
    placement: 'right',
  },
  {
    target: 'a[href="/capital/contracts"]',
    content: 'Contratos RTO activos. Maninos firma automáticamente (Sebastian Zambrano), el cliente firma desde su portal. El PDF se genera con ambas firmas. Muestra progreso de pagos por contrato.',
    title: 'Contratos',
    placement: 'right',
  },
  {
    target: 'a[href="/capital/payments"]',
    content: 'Seguimiento de pagos mensuales. 4 vistas: Todos, Atrasados, Mora (clientes en riesgo con scoring), Comisiones. Confirma pagos reportados por clientes, calcula late fees ($15/día), y envía recordatorios automáticos.',
    title: 'Pagos',
    placement: 'right',
  },
  {
    target: 'a[href="/capital/mora"]',
    content: 'Gestión de morosidad: clientes clasificados por riesgo (Crítico/Alto/Medio/Bajo). Muestra monto vencido, pagos atrasados, y acciones rápidas para cada cliente.',
    title: 'Mora',
    placement: 'right',
  },
  {
    target: 'a[href="/capital/investors"]',
    content: 'Gestión de inversores: capital captado, invertido, disponible, retornado. Alertas de vencimiento de pagarés. Crear nuevos inversores y ver detalle por cada uno.',
    title: 'Inversores',
    placement: 'right',
  },
  {
    target: 'a[href="/capital/promissory-notes"]',
    content: 'Pagarés (Promissory Notes): documentos de deuda con inversores. Interés simple, plazo en meses, alertas automáticas de vencimiento. Genera PDFs descargables.',
    title: 'Pagarés',
    placement: 'right',
  },
  {
    target: 'a[href="/capital/reports"]',
    content: 'Reportes: Resumen integrado (contabilidad + clientes RTO + inversores), reportes mensuales descargables en PDF, y estados de cuenta por inversionista.',
    title: 'Reportes',
    placement: 'right',
  },
  {
    target: 'a[href="/capital/accounting"]',
    content: 'Contabilidad de Capital separada de Homes: transacciones, estados financieros (P&L, Balance, Cash Flow), cuentas bancarias, reconciliación con estados de cuenta, y clasificación AI de movimientos.',
    title: 'Contabilidad Capital',
    placement: 'right',
  },
]

// ============================================================
// CAPITAL — Per-page tours
// ============================================================

export const CAPITAL_PAGE_TOURS: Record<string, Step[]> = {
  '/capital/applications': [
    {
      target: 'body',
      content: 'Lista de solicitudes RTO. Filtra por estado: Nuevo, En Revisión, Aprobado, Rechazado. Haz clic en una solicitud para revisar identidad, crédito, calcular mensualidad y aprobar.',
      title: 'Solicitudes RTO',
      disableBeacon: true,
      placement: 'center',
    },
  ],
  '/capital/payments': [
    {
      target: 'body',
      content: '4 pestañas: "Todos" muestra cada pago mensual. "Atrasados" filtra pagos vencidos con late fees. "Mora" clasifica clientes por riesgo. "Comisiones" muestra comisiones de vendedores. Arriba aparecen pagos reportados por clientes pendientes de confirmar.',
      title: 'Gestión de Pagos',
      disableBeacon: true,
      placement: 'center',
    },
  ],
  '/capital/investors': [
    {
      target: 'body',
      content: 'Gestiona inversores: crea perfiles, ve capital captado vs invertido vs disponible. Las alertas de vencimiento de pagarés aparecen arriba. Filtra por período: mes, trimestre, año.',
      title: 'Inversores',
      disableBeacon: true,
      placement: 'center',
    },
  ],
  '/capital/accounting': [
    {
      target: 'body',
      content: 'Contabilidad de Capital: dashboard con ingresos/gastos por período, cuentas bancarias, transacciones recientes, estados financieros (P&L, Balance, Cash Flow), y reconciliación bancaria con clasificación AI.',
      title: 'Contabilidad Capital',
      disableBeacon: true,
      placement: 'center',
    },
  ],
  '/capital/reports': [
    {
      target: 'body',
      content: '3 pestañas: "Resumen Integrado" cruza datos de contabilidad + clientes + inversores. "Reportes Mensuales" genera PDFs descargables. "Estado de Cuenta Inversionistas" genera reportes individuales por inversor.',
      title: 'Reportes',
      disableBeacon: true,
      placement: 'center',
    },
  ],
  '/capital/kyc': [
    {
      target: 'body',
      content: 'Verificación de identidad de todos los clientes. Flujo: solicitar verificación → cliente sube ID + selfie → revisar documentos → aprobar o rechazar. Los clientes pendientes aparecen primero.',
      title: 'Verificación KYC',
      disableBeacon: true,
      placement: 'center',
    },
  ],
}

// ============================================================
// CLIENTES PORTAL — Main tour
// ============================================================

export const CLIENTES_MAIN_TOUR: Step[] = [
  {
    target: 'body',
    content: 'Bienvenido al Portal de Clientes de Maninos Homes. Aquí puedes explorar casas disponibles, solicitar Rent-to-Own, verificar tu identidad, completar tu solicitud de crédito, firmar tu contrato y gestionar tus pagos mensuales.',
    title: 'Portal de Clientes',
    disableBeacon: true,
    placement: 'center',
  },
  {
    target: 'a[href="/clientes/casas"]',
    content: 'Catálogo de casas disponibles para compra al contado o Rent-to-Own. Cada casa muestra precio, ubicación, fotos y un botón para iniciar la compra.',
    title: 'Catálogo de Casas',
    placement: 'bottom',
  },
  {
    target: 'a[href="/clientes/mi-cuenta"]',
    content: 'Tu panel personal. Si tienes una compra RTO activa, verás 4 pasos: (1) Verificar identidad, (2) Solicitud de crédito, (3) Firmar contrato, (4) Pagos mensuales. También ves tus compras y documentos.',
    title: 'Mi Cuenta',
    placement: 'bottom',
  },
]

// ============================================================
// COMBINED ACCESSOR
// ============================================================

export const TOUR_STEPS: Record<string, Step[]> = {
  homes: HOMES_MAIN_TOUR,
  capital: CAPITAL_MAIN_TOUR,
  clientes: CLIENTES_MAIN_TOUR,
}

export const PAGE_TOURS: Record<string, Record<string, Step[]>> = {
  homes: HOMES_PAGE_TOURS,
  capital: CAPITAL_PAGE_TOURS,
}
