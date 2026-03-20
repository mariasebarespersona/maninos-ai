import { Step } from 'react-joyride'

export const TOUR_STEPS: Record<string, Step[]> = {
  homes: [
    {
      target: 'a[href="/homes"]',
      content: 'Este es tu panel principal. Aquí ves los KPIs de operaciones: propiedades activas, ventas del mes, renovaciones en curso y comisiones.',
      title: '🏠 Dashboard',
      disableBeacon: true,
      placement: 'right',
    },
    {
      target: 'a[href="/homes/market"]',
      content: 'Busca casas en 5 fuentes automáticamente: MHVillage, VMF Homes, 21st Mortgage, Craigslist y Facebook Marketplace. La app aplica la regla del 60% para identificar oportunidades.',
      title: '🔍 Casas del Mercado',
      placement: 'right',
    },
    {
      target: 'a[href="/homes/properties"]',
      content: 'Inventario completo de casas: compradas, en renovación, publicadas y vendidas. Desde aquí creas nuevas propiedades, evalúas con el checklist de 28 puntos, generas documentos (Bill of Sale, Título) y gestionas renovaciones.',
      title: '🏘️ Propiedades',
      placement: 'right',
    },
    {
      target: 'a[href="/homes/clients"]',
      content: 'Gestión de clientes compradores y arrendatarios RTO. Ve el historial de cada cliente, sus pagos y estado de verificación.',
      title: '👥 Clientes',
      placement: 'right',
    },
    {
      target: 'a[href="/homes/sales"]',
      content: 'Registro de ventas al contado y Rent-to-Own. Incluye seguimiento de transferencias bancarias y confirmación de pagos.',
      title: '💰 Ventas',
      placement: 'right',
    },
    {
      target: 'a[href="/homes/commissions"]',
      content: 'Comisiones automáticas: $1,500 por venta al contado, $1,000 por RTO. Split 50/50 entre quien encuentra y quien cierra la venta.',
      title: '🏆 Comisiones',
      placement: 'right',
    },
    {
      target: 'a[href="/homes/transfers"]',
      content: 'Monitoreo de títulos con integración TDHCA (Texas). Cuando el nombre en el título cambia, se envía una alerta automática.',
      title: '📄 Títulos',
      placement: 'right',
    },
    {
      target: 'a[href="/homes/notificaciones"]',
      content: 'Centro de notificaciones: requisiciones de pago pendientes de aprobación, transferencias por confirmar y cotizaciones de renovación por aprobar.',
      title: '🔔 Notificaciones',
      placement: 'right',
    },
    {
      target: 'a[href="/homes/accounting"]',
      content: 'Estados financieros completos: P&L (Pérdidas y Ganancias), Balance General, estados de cuenta bancarios y conciliación de movimientos.',
      title: '📊 Contabilidad',
      placement: 'right',
    },
  ],

  capital: [
    {
      target: 'a[href="/capital"]',
      content: 'Panel financiero de Maninos Capital. KPIs de cartera: contratos activos, morosidad, rendimiento mensual y salud de la cartera.',
      title: '📊 Dashboard Capital',
      disableBeacon: true,
      placement: 'right',
    },
    {
      target: 'a[href="/capital/applications"]',
      content: 'Solicitudes RTO de clientes. Aquí revisas la identidad, la solicitud de crédito, calculas la mensualidad inteligente y apruebas o rechazas.',
      title: '📋 Solicitudes RTO',
      placement: 'right',
    },
    {
      target: 'a[href="/capital/contracts"]',
      content: 'Contratos RTO activos. Maninos firma automáticamente (Sebastian Zambrano), el cliente firma desde su portal. El PDF se genera con ambas firmas.',
      title: '📝 Contratos',
      placement: 'right',
    },
    {
      target: 'a[href="/capital/payments"]',
      content: 'Seguimiento de pagos mensuales de todos los contratos RTO. Recordatorios automáticos por email, cálculo de late fees ($15/día), y reportes de morosidad.',
      title: '💳 Pagos',
      placement: 'right',
    },
    {
      target: 'a[href="/capital/investors"]',
      content: 'Gestión de inversores: capital invertido, rendimientos, y pagarés (promissory notes) con interés compuesto.',
      title: '🤝 Inversores',
      placement: 'right',
    },
    {
      target: 'a[href="/capital/accounting"]',
      content: 'Contabilidad de Capital: flujos de capital, estados financieros separados de Homes, y reportes para inversores.',
      title: '📊 Contabilidad Capital',
      placement: 'right',
    },
  ],

  clientes: [
    {
      target: 'body',
      content: 'Bienvenido al Portal de Clientes de Maninos Homes. Aquí puedes explorar casas disponibles, iniciar tu compra y gestionar tus pagos.',
      title: '🏠 Portal Clientes',
      disableBeacon: true,
      placement: 'center',
    },
    {
      target: 'a[href="/clientes/casas"]',
      content: 'Explora el catálogo de casas disponibles para compra al contado o Rent-to-Own. Filtra por precio, ubicación y características.',
      title: '🏘️ Catálogo de Casas',
      placement: 'bottom',
    },
    {
      target: 'a[href="/clientes/mi-cuenta"]',
      content: 'Tu panel personal. Aquí ves el progreso de tu compra RTO en 4 pasos: verificar identidad, solicitud de crédito, firmar contrato y pagos mensuales.',
      title: '👤 Mi Cuenta',
      placement: 'bottom',
    },
  ],
}
