/**
 * Explicaciones de las tarjetas KPI de inversionistas (Capital).
 * Compartidas entre el dashboard de Seguimiento y el detalle de inversionista,
 * para que ambas pantallas expliquen cada cifra exactamente igual.
 */
export const KPI_EXPLANATIONS: Record<string, string> = {
  'Total Invertido':
    'Dinero que el inversionista ha prestado y está trabajando: la suma del principal de sus pagarés activos más los tickets de inversión sin pagaré. Un pagaré ES el dinero del inversionista, por eso cuenta como invertido.',
  'Total Captado':
    'Igual que Total Invertido: capital del inversionista desplegado en pagarés y tickets.',
  'Total Disponible':
    'Capital que el inversionista aportó pero que aún NO está en ningún pagaré ni ticket (aportado − invertido). Si marca $0, todo su dinero está colocado. Si marca algo, hay dinero por desplegar — o un dato por revisar.',
  'Pagado a hoy':
    'Lo que ya se le ha pagado al inversionista a la fecha, calculado del cronograma de sus pagarés: todas las mensualidades del día 15 que ya vencieron (capital + interés). Los pagos se hacen fuera de la app, por eso se usa el cronograma como fuente.',
  'Queda por pagar':
    'Lo que falta por pagarle de aquí al final del plazo: Obligación total − Pagado a hoy.',
  'Capital devuelto (a hoy)':
    'La parte del "Pagado a hoy" que corresponde a DEVOLVERLE su capital prestado (según la amortización del cronograma). No es ganancia: es su propio dinero regresando.',
  'Interés pagado (a hoy)':
    'La parte del "Pagado a hoy" que corresponde a INTERESES: la ganancia del inversionista hasta la fecha.',
  'Obligación total':
    'Todo lo que Maninos le pagará al inversionista durante la vida completa de sus pagarés: el capital prestado + todos los intereses del plazo. Es el compromiso total, no lo que se debe hoy.',
  'Tasa Fondeo':
    'La tasa anual promedio de sus pagarés, ponderada por monto. Es lo que le cuesta a Maninos el dinero de este inversionista (o del conjunto, en el dashboard).',
  'Inversiones activas':
    'Número de tickets de inversión activos (inversiones sin pagaré). Los pagarés se cuentan aparte, en Promissory Notes.',
}
