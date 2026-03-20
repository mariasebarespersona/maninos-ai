import { Step } from 'react-joyride'

// ============================================================
// HOMES PORTAL — Main sidebar tour (first visit)
// ============================================================

export const HOMES_MAIN_TOUR: Step[] = [
  {
    target: 'body',
    content: 'Bienvenido a Maninos Homes. Este portal es para el equipo de operaciones: comprar casas, renovarlas, publicarlas y venderlas. Te mostraré cada sección del menú.',
    title: 'Portal Maninos Homes',
    disableBeacon: true,
    placement: 'center',
  },
  {
    target: 'a[href="/homes"]',
    content: 'Panel principal con KPIs en tiempo real: propiedades activas, ventas del mes, inversión total y pipeline de propiedades (compradas → publicadas → vendidas). Incluye gráficos de actividad financiera y mapa de Texas.',
    title: 'Dashboard',
    placement: 'right',
  },
  {
    target: 'a[href="/homes/market"]',
    content: 'Busca casas en 5 fuentes automáticamente: MHVillage, VMF Homes, 21st Mortgage, Craigslist y Facebook Marketplace. Puedes conectar Facebook importando cookies desde tu navegador.',
    title: 'Casas del Mercado',
    placement: 'right',
  },
  {
    target: 'a[href="/homes/properties"]',
    content: 'Inventario completo de propiedades. Crea nuevas con formulario de 4 pasos (datos → documentos → evaluación → pago). Cada propiedad tiene: fotos, evaluación AI de 28 puntos, Bill of Sale, Título TDHCA, cotización de renovación con 19 partidas + cronograma Gantt, y movidas.',
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
    content: 'Registro de ventas al contado. Seguimiento de transferencias bancarias, confirmación de pagos y desglose de comisiones. Las ventas RTO se gestionan desde Capital.',
    title: 'Ventas',
    placement: 'right',
  },
  {
    target: 'a[href="/homes/commissions"]',
    content: 'Comisiones automáticas: $1,500 por venta al contado, $1,000 por RTO. Split 50/50 entre quien encuentra y quien cierra. Ranking de empleados por mes. Gestión de equipo y roles.',
    title: 'Comisiones',
    placement: 'right',
  },
  {
    target: 'a[href="/homes/transfers"]',
    content: 'Monitoreo de títulos con integración TDHCA (Texas). Verifica automáticamente si el nombre del título ha cambiado y envía alertas. Gestiona los documentos de cada transferencia de propiedad.',
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
    content: 'Contabilidad completa: Resumen, Transacciones, Facturación, Estados Financieros, Estado de Cuenta bancario (subir CSV y conciliar con AI), Plan de Cuentas, P&L por Propiedad, Cuentas Bancarias, Presupuesto, Gastos Fijos y Auditoría.',
    title: 'Contabilidad',
    placement: 'right',
  },
]

// ============================================================
// HOMES — Per-page detailed tours
// ============================================================

export const HOMES_PAGE_TOURS: Record<string, Step[]> = {
  '/homes': [
    {
      target: 'body',
      content: 'Este es tu Dashboard. Arriba ves los KPIs principales: Total Propiedades, Clientes, Ventas e Inversión Total. Debajo tienes gráficos de actividad financiera y el mapa de propiedades en Texas.',
      title: 'Dashboard — Vista General',
      disableBeacon: true,
      placement: 'center',
    },
    {
      target: 'a[href="/homes/properties/new"]',
      content: 'Desde aquí creas una nueva propiedad. El formulario tiene 4 pasos: (1) Datos de la propiedad + documentos, (2) Evaluación en campo, (3) Orden de pago, (4) Confirmación.',
      title: 'Acción Rápida: Nueva Propiedad',
      placement: 'bottom',
    },
  ],
  '/homes/market': [
    {
      target: 'body',
      content: 'Aquí scrapeas casas del mercado. La app busca en 5 fuentes automáticamente y califica cada casa según precio, ubicación (200 millas de Houston/Dallas) y tipo.',
      title: 'Casas del Mercado',
      disableBeacon: true,
      placement: 'center',
    },
  ],
  '/homes/properties': [
    {
      target: 'body',
      content: 'Inventario de propiedades. Filtra por estado: Comprada, Publicada, Reservada, En Renovación, Vendida. Haz clic en cualquier propiedad para ver su detalle completo con fotos, documentos, evaluación y renovación.',
      title: 'Inventario de Propiedades',
      disableBeacon: true,
      placement: 'center',
    },
    {
      target: 'a[href="/homes/properties/new"]',
      content: 'Crea una nueva propiedad con el formulario de 4 pasos: datos + documentos (Bill of Sale, Título), evaluación de 28 puntos con fotos AI, orden de pago al vendedor, y confirmación.',
      title: 'Nueva Propiedad',
      placement: 'bottom',
    },
  ],
  '/homes/sales': [
    {
      target: 'body',
      content: 'Registro de ventas al contado. Cada venta muestra: precio, estado, datos bancarios del comprador y desglose de comisiones. Filtra por estado: Pendiente, Completada, Cancelada.',
      title: 'Ventas al Contado',
      disableBeacon: true,
      placement: 'center',
    },
  ],
  '/homes/commissions': [
    {
      target: 'body',
      content: 'Comisiones del equipo por mes. Reglas: $1,500 por venta al contado, $1,000 por RTO. Si la misma persona encuentra y cierra, se lleva 100%. Si son dos, 50/50. Usa los filtros de mes para ver períodos anteriores.',
      title: 'Comisiones',
      disableBeacon: true,
      placement: 'center',
    },
  ],
  '/homes/transfers': [
    {
      target: 'body',
      content: 'Monitoreo de títulos con integración TDHCA. La app verifica automáticamente si el nombre del título ha cambiado en el sistema de Texas. Cuando cambia, se envía una alerta. También gestiona los documentos de cada transferencia: Bill of Sale, Título y Aplicación.',
      title: 'Títulos y Monitoreo TDHCA',
      disableBeacon: true,
      placement: 'center',
    },
  ],
  '/homes/notificaciones': [
    {
      target: 'body',
      content: 'Centro de aprobaciones con 3 tipos de notificaciones que requieren acción:',
      title: 'Notificaciones',
      disableBeacon: true,
      placement: 'center',
    },
  ],
  '/homes/clients': [
    {
      target: 'body',
      content: 'Gestión de clientes compradores al contado. Ve el estado de cada cliente (Lead, Activo, Completado), su información de contacto y propiedades asociadas. Los clientes RTO se gestionan desde el Portal Capital.',
      title: 'Clientes',
      disableBeacon: true,
      placement: 'center',
    },
  ],
  '/homes/accounting': [
    {
      target: 'body',
      content: 'Contabilidad de Homes con 11 secciones: Resumen con KPIs financieros, Transacciones (registro de ingresos/gastos), Facturación, Estados Financieros (P&L, Balance), Estado de Cuenta (sube CSV del banco para conciliar movimientos con AI), Plan de Cuentas, P&L por Propiedad, Cuentas Bancarias, Presupuesto, Gastos Fijos recurrentes, y Auditoría.',
      title: 'Contabilidad Homes',
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
    content: 'Bienvenido a Maninos Capital. Este portal es para gestionar clientes RTO (Rent-to-Own), contratos, pagos mensuales, inversores y la contabilidad de Capital. Solo Sebastian y Abigail tienen acceso.',
    title: 'Portal Maninos Capital',
    disableBeacon: true,
    placement: 'center',
  },
  {
    target: 'a[href="/capital"]',
    content: 'Dashboard financiero: contratos activos, ingreso mensual esperado, pagos atrasados, salud de cartera (tasa de cobranza y morosidad), alertas de vencimiento de pagarés, y actividad reciente.',
    title: 'Dashboard Capital',
    placement: 'right',
  },
  {
    target: 'a[href="/capital/applications"]',
    content: 'Solicitudes RTO. Flujo completo: (1) Verificar identidad (KYC — cliente sube ID + selfie, tú apruebas), (2) Revisar solicitud de crédito de 9 secciones, (3) Cálculo inteligente de mensualidad con Precio Inteligente, (4) Aprobar y generar contrato con firma automática de Sebastian.',
    title: 'Solicitudes RTO',
    placement: 'right',
  },
  {
    target: 'a[href="/capital/contracts"]',
    content: 'Contratos RTO. Maninos firma automáticamente (Sebastian Zambrano), el cliente firma desde su portal. El PDF incluye ambas firmas. Puedes editar los términos del contrato en cualquier momento.',
    title: 'Contratos',
    placement: 'right',
  },
  {
    target: 'a[href="/capital/payments"]',
    content: 'Gestión de pagos mensuales. 4 vistas: Todos los pagos, Atrasados (con late fees de $15/día), Mora (clientes en riesgo por nivel), y Comisiones. Confirma pagos reportados por clientes.',
    title: 'Pagos',
    placement: 'right',
  },
  {
    target: 'a[href="/capital/mora"]',
    content: 'Gestión de morosidad. Clientes clasificados por riesgo: Crítico, Alto, Medio, Bajo. Muestra monto vencido total, promedio de pagos atrasados, y acciones por cliente.',
    title: 'Mora',
    placement: 'right',
  },
  {
    target: 'a[href="/capital/investors"]',
    content: 'Gestión de inversores: capital captado, invertido, disponible y retornado. Alertas de vencimiento de pagarés (3 meses antes). Crea perfiles de inversores y da seguimiento.',
    title: 'Inversores',
    placement: 'right',
  },
  {
    target: 'a[href="/capital/promissory-notes"]',
    content: 'Pagarés (Promissory Notes): documentos de deuda con inversores. Interés simple, plazo en meses. Alertas automáticas 3 meses antes del vencimiento. PDFs descargables.',
    title: 'Pagarés',
    placement: 'right',
  },
  {
    target: 'a[href="/capital/reports"]',
    content: 'Reportes financieros: Resumen integrado (cruza contabilidad + clientes + inversores), reportes mensuales en PDF, y estados de cuenta por inversionista individuales.',
    title: 'Reportes',
    placement: 'right',
  },
  {
    target: 'a[href="/capital/accounting"]',
    content: 'Contabilidad de Capital (separada de Homes): transacciones, estados financieros (P&L, Balance, Cash Flow), cuentas bancarias, reconciliación con estados de cuenta, y clasificación AI de movimientos.',
    title: 'Contabilidad Capital',
    placement: 'right',
  },
]

// ============================================================
// CAPITAL — Per-page detailed tours
// ============================================================

export const CAPITAL_PAGE_TOURS: Record<string, Step[]> = {
  '/capital': [
    {
      target: 'body',
      content: 'Dashboard de Capital. Arriba: KPIs de solicitudes pendientes, contratos activos, ingreso esperado y pagos atrasados. En el medio: alertas de vencimiento de pagarés y salud de cartera (tasa de cobranza, morosidad, clientes en riesgo). Abajo: actividad reciente.',
      title: 'Dashboard Capital',
      disableBeacon: true,
      placement: 'center',
    },
  ],
  '/capital/applications': [
    {
      target: 'body',
      content: 'Lista de solicitudes RTO. Cada tarjeta muestra: foto de propiedad, nombre del cliente, precio, estado (Nuevo/En Revisión/Aprobado/Rechazado), verificación de identidad y capacidad financiera. Haz clic en una solicitud para revisarla.',
      title: 'Solicitudes RTO',
      disableBeacon: true,
      placement: 'center',
    },
  ],
  '/capital/contracts': [
    {
      target: 'body',
      content: 'Contratos RTO activos. Cada contrato muestra: cliente, propiedad, mensualidad, plazo, y progreso de pagos. Filtra por estado: Borrador, Pendiente Firma, Activos, Completados, Incumplimiento. Los contratos se pueden editar incluso después de activados.',
      title: 'Contratos RTO',
      disableBeacon: true,
      placement: 'center',
    },
  ],
  '/capital/payments': [
    {
      target: 'body',
      content: '4 vistas de pagos: "Todos" muestra cada pago mensual con su estado. "Atrasados" filtra pagos vencidos con cálculo de late fees ($15/día tras 5 días de gracia). "Mora" clasifica clientes por nivel de riesgo. "Comisiones" muestra comisiones de vendedores. Arriba aparecen pagos reportados por clientes pendientes de confirmar.',
      title: 'Gestión de Pagos',
      disableBeacon: true,
      placement: 'center',
    },
  ],
  '/capital/mora': [
    {
      target: 'body',
      content: 'Clientes en mora ordenados por riesgo: Crítico (rojo), Alto (naranja), Medio (amarillo), Bajo (verde). Cada cliente muestra: pagos vencidos, monto total vencido, pago mensual, y último pago. Acciones rápidas para ver contrato o pagos.',
      title: 'Gestión de Morosidad',
      disableBeacon: true,
      placement: 'center',
    },
  ],
  '/capital/investors': [
    {
      target: 'body',
      content: 'Gestión de inversores. Arriba: alertas de pagarés por vencer. KPIs: total captado, invertido, disponible, retornado (capital e interés), y tasa de fondeo. Cada inversor tiene perfil con nombre, email, teléfono, empresa y capital. Filtra por período.',
      title: 'Inversores',
      disableBeacon: true,
      placement: 'center',
    },
  ],
  '/capital/promissory-notes': [
    {
      target: 'body',
      content: 'Pagarés con inversores. Cada nota muestra: monto, tasa anual, plazo, interés total y total al vencimiento. Estados: Borrador, Activa, Pagada, Vencida. Alertas automáticas 3 meses antes del vencimiento. Crea nuevas notas con cálculo de interés simple en tiempo real.',
      title: 'Pagarés (Promissory Notes)',
      disableBeacon: true,
      placement: 'center',
    },
  ],
  '/capital/reports': [
    {
      target: 'body',
      content: '3 secciones: "Resumen Integrado" cruza datos de contabilidad + clientes RTO + inversores con reconciliación de flujos. "Reportes Mensuales" genera PDFs descargables con ingreso, tasa de cobranza y morosidad. "Estado de Cuenta Inversionistas" genera reportes individuales por inversor con detalle de inversiones, pagarés y flujos del mes.',
      title: 'Reportes Financieros',
      disableBeacon: true,
      placement: 'center',
    },
  ],
  '/capital/accounting': [
    {
      target: 'body',
      content: 'Contabilidad de Capital (separada de Homes). Dashboard con ingresos/gastos por período, cuentas bancarias y transacciones recientes. Incluye: estados financieros (P&L, Balance, Cash Flow), reconciliación bancaria (sube CSV del banco y la AI clasifica movimientos automáticamente), y registro de transacciones.',
      title: 'Contabilidad Capital',
      disableBeacon: true,
      placement: 'center',
    },
  ],
  '/capital/kyc': [
    {
      target: 'body',
      content: 'Verificación de identidad de clientes. Flujo: (1) Solicitar verificación al cliente, (2) El cliente sube foto de ID + selfie desde su portal, (3) Tú revisas los documentos aquí — puedes ver las fotos en tamaño completo, (4) Apruebas o rechazas con razón. Los pendientes de revisión aparecen primero.',
      title: 'Verificación KYC',
      disableBeacon: true,
      placement: 'center',
    },
  ],
  '/capital/analysis': [
    {
      target: 'body',
      content: 'Análisis de adquisición de propiedades. Evalúa si una propiedad es buena inversión RTO: calcula ROI esperado, renta mensual sugerida, precio RTO, punto de equilibrio y nivel de riesgo. La recomendación es automática: Proceder, Precaución o Rechazar.',
      title: 'Análisis de Adquisición',
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
    content: 'Bienvenido al Portal de Clientes de Maninos Homes. Aquí puedes explorar casas disponibles, solicitar compra al contado o Rent-to-Own, verificar tu identidad, completar tu solicitud de crédito, firmar tu contrato y gestionar tus pagos mensuales.',
    title: 'Portal de Clientes',
    disableBeacon: true,
    placement: 'center',
  },
  {
    target: 'a[href="/clientes/casas"]',
    content: 'Catálogo de casas disponibles. Cada casa muestra fotos, precio, ubicación y características. Desde aquí inicias el proceso de compra al contado o Rent-to-Own.',
    title: 'Catálogo de Casas',
    placement: 'bottom',
  },
  {
    target: 'a[href="/clientes/mi-cuenta"]',
    content: 'Tu panel personal. Si tienes una compra RTO activa, verás 4 pasos visuales: (1) Verificar identidad — sube tu ID + selfie, (2) Solicitud de crédito — formulario de 9 secciones, (3) Firmar contrato — firma digital, (4) Pagos mensuales — consulta y reporta pagos.',
    title: 'Mi Cuenta',
    placement: 'bottom',
  },
]

// ============================================================
// COMBINED ACCESSORS
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
