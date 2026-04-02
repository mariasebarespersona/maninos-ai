# DOSSIER ENISA - TUMAI
## Plataforma de Automatización con IA para Empresas

---

# 1. RESUMEN EJECUTIVO

## ¿Qué problema relevante existe?

Las pequeñas y medianas empresas (PyMEs) del sector inmobiliario y servicios enfrentan un problema crítico: **la automatización con inteligencia artificial es inaccesible para ellas**. Las herramientas existentes (N8N, Make, Zapier) son horizontales, requieren configuración técnica avanzada, no incluyen capacidades nativas de IA (visión artificial, procesamiento de voz, agentes inteligentes) y obligan al usuario a construir todo desde cero. El resultado: solo las grandes empresas con equipos técnicos pueden beneficiarse de la IA, mientras que las PyMEs quedan fuera de la revolución tecnológica más importante de la década.

En España, donde el 99,8% del tejido empresarial son PyMEs, esta brecha tecnológica amenaza la competitividad del ecosistema. Sectores como el inmobiliario, financiero y de servicios siguen operando con procesos manuales, hojas de Excel y flujos de trabajo fragmentados.

## ¿Qué solución innovadora propones?

**Tumai** es una plataforma de **"Automatización como Producto" (Automation as a Product)** — una biblioteca de 35 módulos de automatización pre-construidos, probados en producción y potenciados por IA, que pueden componerse como bloques LEGO para crear soluciones empresariales personalizadas en días, no meses.

A diferencia de las herramientas existentes, Tumai integra de forma nativa:
- **Visión artificial** (GPT-4 Vision) para inspección de activos y clasificación de imágenes
- **Procesamiento de voz** (Whisper) para entrada de datos manos libres en campo
- **Agentes inteligentes** con razonamiento (LLM function calling) para estimación de costes, análisis de precios y asistencia de datos
- **Módulos verticales** pre-configurados por industria (inmobiliario, financiero, servicios, contabilidad)

El cliente no programa: solo configura variables. Onboarding en 1-3 días frente a semanas de desarrollo custom.

## ¿Por qué ahora?

1. **Madurez de la IA generativa**: GPT-4o, Whisper y los modelos de visión han alcanzado calidad de producción en 2024-2025, permitiendo por primera vez automatizaciones inteligentes fiables.
2. **Regulación europea favorable**: El AI Act europeo incentiva el uso responsable de IA en empresas, creando demanda de soluciones compliance-ready.
3. **Brecha digital en PyMEs**: La digitalización post-COVID ha acelerado la urgencia, pero las herramientas disponibles no sirven al segmento PyME.
4. **Ventana de oportunidad**: No existe ninguna plataforma que combine automatización vertical + IA nativa + módulos pre-construidos para PyMEs. El mercado está en fase de formación.

## ¿Qué ventaja competitiva tienes?

| Aspecto | Competidores (N8N/Make/Zapier) | Tumai |
|---------|-------------------------------|-------|
| Agentes IA | Solo plugins | Nativos en el core |
| Visión artificial | No | Sí (GPT-4 Vision) |
| Procesamiento de voz | No | Sí (Whisper) |
| LLM Function Calling | Limitado | Función central |
| Configuración | DIY (hazlo tú mismo) | Listo en minutos |
| Expertise vertical | Solo horizontal | Específico por industria |
| Probado en producción | Marketplace | Casos reales con clientes |

**Ventaja clave**: Los 35 módulos ya están **probados en producción** con un cliente real (Maninos Homes LLC, Texas), procesando operaciones financieras, contratos, pagos y agentes de IA en un entorno empresarial activo con +672 commits de desarrollo iterativo.

## ¿Qué impacto tendrá en España?

- **Creación de empleo**: Plan de contratación de 8-12 personas en los primeros 3 años (desarrolladores, ventas, soporte)
- **Transferencia tecnológica**: Tecnología de automatización con IA desarrollada y validada internacionalmente, ahora aplicada al tejido empresarial español
- **Democratización de la IA**: Hacer accesible la IA a miles de PyMEs españolas que actualmente no pueden permitirse equipos técnicos
- **Exportación digital**: Plataforma diseñada para escalar a Latinoamérica y Europa desde España
- **Ecosistema**: Potencial de colaboración con universidades y centros tecnológicos españoles para investigación en agentes de IA verticales

---

# 2. DESCRIPCION DETALLADA DEL PROYECTO

## Producto/Servicio

Tumai es una **plataforma SaaS de automatización empresarial potenciada por IA**, organizada en módulos independientes y componibles. El producto se estructura en tres capas:

### Capa 1: Biblioteca de Automatizaciones (35 módulos)

Organizados en 8 categorías:

| Categoría | Módulos | Innovación clave |
|-----------|---------|------------------|
| **Pagos y Cobros** | 8 | Máquina de estados para ciclo de vida de pagos, scoring de morosidad, análisis de inversiones |
| **Contabilidad** | 5 | Clasificador de transacciones con GPT-4o, reconciliación automática, motor de KPIs |
| **Agentes IA** | 7 | Visión (GPT-4), Voz (Whisper), Function calling, estimación de costes/precios con LLM |
| **Comunicación** | 3 | Cola de emails, recordatorios de pago, alertas de morosidad |
| **Data Collection** | 3 | Scraper de APIs JSON, automatización de navegador (Playwright), extracción con visión |
| **Documentos** | 4 | Generación de PDFs, almacenamiento automático, contratos, reportes periódicos |
| **Analytics y Reglas** | 3 | Predicción de precios, motor de reglas de negocio, análisis financiero |
| **Infraestructura** | 2 | Scheduler centralizado, sincronización entre sistemas |

### Capa 2: Plataforma Visual de Composición

- Editor de nodos tipo canvas basado en React Flow v12
- Drag-and-drop para diseñar flujos de automatización
- Visualización en tiempo real de dependencias entre módulos
- Panel de detalle con variables configurables, dependencias y casos de uso
- Búsqueda y filtrado por categoría, vertical e industria

### Capa 3: Paquetes Verticales por Industria

| Vertical | Automatizaciones | Cliente objetivo |
|----------|-----------------|------------------|
| Alquiler de propiedades | 20 módulos | Empresas de alquiler |
| Compra-Reforma-Venta | 35 módulos (todos) | Flippers inmobiliarios |
| Negocio de servicios | 15 módulos | Empresas de servicios (HVAC, limpieza, etc.) |
| Financiación/Préstamos | 18 módulos | Empresas de préstamos, microfinanzas |
| Contabilidad | 12 módulos | Despachos contables, PyMEs |

### Cada módulo contiene:

```
automatizacion/
├── skill.md              # Documentación: casos de uso, limitaciones, origen
├── config.schema.json    # Schema JSON para validación de configuración
├── script.py             # Código Python ejecutable
└── requirements.txt      # Dependencias específicas del módulo
```

## Tecnología utilizada

**Stack tecnológico completo:**

- **Backend**: Python 3.12, FastAPI (framework asíncrono de alto rendimiento)
- **Frontend**: Next.js 14 (React), TypeScript, Tailwind CSS, React Flow v12
- **Base de datos**: PostgreSQL (vía Supabase)
- **IA/ML**: OpenAI GPT-4o (razonamiento y clasificación), GPT-4 Vision (análisis de imágenes), Whisper (transcripción de voz), LangChain/LangGraph (orquestación de agentes)
- **Infraestructura**: Docker, Railway (backend), Vercel (frontend)
- **Integraciones**: Stripe (pagos y KYC), Resend (email), Playwright (scraping), APScheduler (tareas programadas)
- **Observabilidad**: Logfire + Langfuse

## Estado de desarrollo

**Estado actual: MVP funcional en producción.**

- **35 automatizaciones operativas** en producción con un cliente real (Maninos Homes LLC)
- **672+ commits** de desarrollo iterativo
- **74+ migraciones de base de datos** aplicadas
- **30+ endpoints API** activos
- **6 agentes de IA** funcionando en producción
- **3 portales web** desplegados y en uso diario

**Fase de desarrollo de la plataforma Tumai:**
- Fase 1 (Catálogo visual + documentación): **70% completada**
- Fase 2 (Modularización + core): Planificada
- Fase 3 (Composición + CLI): Planificada
- Fase 4 (Multi-cliente + verticales): Planificada

## Grado de innovación

La innovación de Tumai es **triple**:

### 1. Innovación tecnológica
- **Agentes de IA nativos**: No son plugins añadidos; la IA está integrada en el core de cada módulo. Un clasificador de transacciones contables usa GPT-4o para entender el contexto, no reglas if/else.
- **Visión artificial aplicada**: GPT-4 Vision inspecciona activos (propiedades, vehículos, equipos), clasifica fotos y extrae datos de capturas de pantalla — capacidades inexistentes en plataformas de automatización actuales.
- **Procesamiento de voz en campo**: Whisper permite entrada de datos manos libres durante inspecciones de campo, algo que ningún competidor ofrece.

### 2. Innovación de modelo de negocio
- **"Automation as a Product"**: Frente al modelo DIY (hazlo tú mismo) de los competidores, Tumai vende automatizaciones pre-construidas y probadas. El cliente configura variables, no construye flujos.
- **Verticalización**: En lugar de ser una herramienta horizontal genérica, Tumai ofrece paquetes específicos por industria con configuraciones optimizadas.

### 3. Innovación de proceso
- **Onboarding en 1-3 días** frente a semanas de desarrollo custom
- **Módulos componibles**: La arquitectura LEGO permite escalar de 5 a 35 módulos según la necesidad
- **Production-first**: Cada módulo nace de un caso real, no de una especificación teórica

### ¿Por qué no es una actividad profesional tradicional?

Una consultoría de automatización tradicional cobra por proyecto, entrega código custom que no escala y depende del consultor para mantenimiento. Tumai es una **plataforma de producto tecnológico**: módulos estandarizados, configuración sin código, escalables a miles de clientes simultáneamente, con IA nativa como diferenciador. Es un modelo de negocio de software (SaaS), no de servicios profesionales.

---

# 3. ANALISIS DE MERCADO

## Tamaño del mercado

### TAM (Total Addressable Market) — Mercado global de automatización empresarial con IA

- **$15.8 mil millones (2024)**, proyectado a **$46.4 mil millones para 2029** (CAGR 24%)
- Fuentes: Gartner, McKinsey, Grand View Research

### SAM (Serviceable Addressable Market) — Automatización para PyMEs en Europa y Latinoamérica

- **~$3.2 mil millones** — PyMEs en sectores inmobiliario, financiero y servicios en España, Europa occidental y Latinoamérica
- España: 3.2 millones de PyMEs, penetración de automatización < 15%
- Latinoamérica: mercado emergente con alta demanda de digitalización

### SOM (Serviceable Obtainable Market) — Primeros 3 años

- **Objetivo año 1**: 20-30 clientes en España y LATAM = ~€300K ARR
- **Objetivo año 2**: 80-120 clientes = ~€1.2M ARR
- **Objetivo año 3**: 250-400 clientes = ~€3.5M ARR

[NOTA: Estos números son estimaciones iniciales. Se recomienda validar con datos de mercado actualizados y ajustar las proyecciones según el plan financiero detallado.]

## Tendencias del sector

1. **Explosión de la IA generativa en empresas**: Adopción acelerada de GPT-4, Claude y herramientas de IA en flujos empresariales (McKinsey: 72% de empresas han adoptado alguna forma de IA en 2024).
2. **Automatización vertical sobre horizontal**: Las empresas prefieren soluciones específicas para su industria sobre herramientas genéricas.
3. **Low-code/no-code en auge**: El mercado de plataformas low-code crece al 25% anual, validando la demanda de soluciones sin programación.
4. **Regulación favorable**: El AI Act europeo crea un marco que incentiva la adopción responsable de IA.
5. **Digitalización de PyMEs**: Post-COVID, el 67% de las PyMEs europeas han acelerado sus planes de digitalización.

## Competencia

| Competidor | Tipo | Fortaleza | Debilidad vs Tumai |
|------------|------|-----------|---------------------|
| **Zapier** | Horizontal, no-code | Gran ecosistema de integraciones | Sin IA nativa, sin verticalización, DIY |
| **Make (Integromat)** | Horizontal, visual | Buen editor visual | Sin agentes IA, sin módulos pre-construidos |
| **N8N** | Open source, horizontal | Flexibilidad, self-hosted | Requiere conocimiento técnico, sin IA nativa |
| **UiPath/Automation Anywhere** | RPA enterprise | Mercado enterprise consolidado | Demasiado caro y complejo para PyMEs |
| **Consultorías IA** | Servicios custom | Soluciones a medida | No escalable, alto coste, dependencia del consultor |

**Espacio vacío que ocupa Tumai**: No existe ninguna plataforma que combine automatización vertical + IA nativa (visión, voz, agentes) + módulos pre-construidos + precio accesible para PyMEs. Tumai ocupa el espacio entre las herramientas horizontales genéricas y las consultorías caras.

## Ventaja competitiva clara

1. **Probado en producción**: 35 módulos con +672 commits de iteración real, no prototipos
2. **IA nativa, no añadida**: Visión, voz y agentes inteligentes desde el diseño
3. **Time-to-value**: 1-3 días de onboarding vs semanas de desarrollo
4. **Verticalización**: Paquetes específicos por industria con best practices incluidas
5. **Barrera de entrada**: Conocimiento profundo de procesos inmobiliarios y financieros codificado en los módulos

---

# 4. MODELO DE NEGOCIO

## Cómo generas ingresos

**Modelo SaaS (Software as a Service) con suscripción mensual + setup fee:**

### Estructura de precios

| Tier | Automatizaciones incluidas | Precio mensual |
|------|---------------------------|----------------|
| **Starter** (Alquiler) | 20 módulos | €499/mes |
| **Pro** (Alquiler + IA) | 20 módulos + agentes IA | €999/mes |
| **Enterprise** (Buy-Renovate-Sell) | 35 módulos (todos) | €1.499/mes |
| **Servicios** | 15 módulos | €499/mes |
| **Financiación** | 18 módulos | €799/mes |
| **Contabilidad** | 12 módulos | €399/mes |
| **Custom Vertical** | Setup nuevo vertical | €2.999/mes + desarrollo |

### Ingresos adicionales
- **Setup fee**: €1.000-€3.000 por cliente (configuración + formación)
- **Custom modules**: Desarrollo de automatizaciones a medida (bajo demanda)
- **Soporte premium**: SLA garantizado para clientes enterprise

## Estructura de costes

| Concepto | Estimación mensual (Año 1) |
|----------|---------------------------|
| Infraestructura cloud (Railway, Vercel, Supabase) | €500-€1.500 |
| APIs de IA (OpenAI GPT-4o, Whisper) | €500-€2.000 |
| Salarios equipo (2-3 personas iniciales) | €8.000-€15.000 |
| Marketing y ventas | €1.000-€3.000 |
| Herramientas y licencias | €200-€500 |
| **Total estimado** | **€10.200-€22.000/mes** |

[NOTA: Costes a detallar según plan de contratación real y estrategia de crecimiento.]

## Estrategia de pricing

- **Precios basados en valor**: El ahorro que genera la automatización (horas de trabajo, errores evitados, velocidad) justifica ampliamente el coste mensual.
- **Land & expand**: Entrar con un vertical básico (€399-€499) y expandir a módulos adicionales según el cliente crece.
- **Descuentos anuales**: 15-20% de descuento por compromiso anual.
- **Free trial**: 14 días de prueba con módulos limitados para reducir fricción.

## Canales de captación

1. **Venta directa**: Enfoque en inmobiliarias, gestorías y empresas de servicios en España
2. **Content marketing**: Blog técnico, casos de estudio (Maninos como caso flagship), webinars sobre IA para PyMEs
3. **Partnerships**: Acuerdos con asociaciones sectoriales (APCE, AEI, cámaras de comercio)
4. **Referral program**: Descuentos por referidos entre clientes
5. **LinkedIn + comunidades**: Posicionamiento como experto en automatización con IA para inmobiliario
6. **Canal indirecto**: Partners integradores/consultoras que implementen Tumai en sus clientes

## Métricas clave proyectadas

| Métrica | Objetivo Año 1 | Objetivo Año 3 |
|---------|----------------|----------------|
| **CAC** (Coste de adquisición) | €1.500-€2.500 | €800-€1.200 |
| **LTV** (Valor de vida del cliente) | €12.000-€18.000 | €24.000-€36.000 |
| **LTV/CAC ratio** | 5x-8x | 20x-30x |
| **Margen bruto** | 65-70% | 75-85% |
| **Churn mensual** | <5% | <3% |
| **ARPU** (Ingreso medio por usuario) | €700/mes | €900/mes |

[NOTA: Métricas estimadas. Se recomienda ajustar con datos reales una vez se tengan los primeros 10 clientes.]

---

# 5. PLAN FINANCIERO (3 ANOS)

## Proyección de ingresos

| Concepto | Año 1 | Año 2 | Año 3 |
|----------|-------|-------|-------|
| Clientes nuevos | 25 | 80 | 200 |
| Clientes acumulados (con churn) | 22 | 85 | 250 |
| ARPU mensual | €700 | €800 | €900 |
| **Ingresos recurrentes (ARR)** | **€185.000** | **€816.000** | **€2.700.000** |
| Setup fees | €50.000 | €120.000 | €200.000 |
| Custom development | €30.000 | €80.000 | €150.000 |
| **Ingresos totales** | **€265.000** | **€1.016.000** | **€3.050.000** |

## Gastos operativos

| Concepto | Año 1 | Año 2 | Año 3 |
|----------|-------|-------|-------|
| Salarios (3→6→12 personas) | €120.000 | €300.000 | €720.000 |
| Infraestructura cloud | €12.000 | €36.000 | €96.000 |
| APIs de IA | €15.000 | €48.000 | €120.000 |
| Marketing y ventas | €24.000 | €72.000 | €180.000 |
| Oficina y operaciones | €12.000 | €24.000 | €48.000 |
| Legal y contabilidad | €6.000 | €12.000 | €18.000 |
| Herramientas y licencias | €3.000 | €6.000 | €12.000 |
| Otros/contingencia | €8.000 | €15.000 | €30.000 |
| **Gastos totales** | **€200.000** | **€513.000** | **€1.224.000** |

## EBITDA estimado

| Concepto | Año 1 | Año 2 | Año 3 |
|----------|-------|-------|-------|
| Ingresos | €265.000 | €1.016.000 | €3.050.000 |
| Gastos | €200.000 | €513.000 | €1.224.000 |
| **EBITDA** | **€65.000** | **€503.000** | **€1.826.000** |
| **Margen EBITDA** | **24,5%** | **49,5%** | **59,9%** |

## Necesidades de financiación

| Concepto | Importe |
|----------|---------|
| Desarrollo de plataforma (Fases 2-4) | €80.000 |
| Contratación equipo inicial (2 desarrolladores + 1 comercial) | €60.000 |
| Marketing de lanzamiento | €20.000 |
| Capital circulante (6 meses de operaciones) | €60.000 |
| Infraestructura y herramientas | €10.000 |
| Legal (constitución, propiedad intelectual, contratos) | €10.000 |
| Contingencia | €10.000 |
| **Total necesario** | **€250.000** |

**Solicitud ENISA**: €250.000 en préstamo participativo.

[NOTA: Ajustar la cantidad solicitada según los límites y condiciones del programa ENISA aplicable (Jóvenes Emprendedores: hasta €75K / Emprendedores: hasta €300K / Crecimiento: hasta €1.5M). Confirmar con la UGE cuál aplica.]

## Punto de equilibrio

- **Breakeven mensual estimado**: ~€17.000/mes de gastos fijos
- **Clientes necesarios para breakeven**: ~25 clientes a €700 ARPU
- **Punto de equilibrio estimado**: **Mes 10-12 del Año 1**

### Hipótesis clave del plan financiero

1. **Churn mensual**: 3-5% (conservador para SaaS B2B vertical)
2. **Ciclo de venta**: 30-60 días para PyMEs, 60-90 días para enterprise
3. **Crecimiento orgánico**: 40% de nuevos clientes por referral a partir del Año 2
4. **Expansión de ARPU**: Clientes añaden módulos adicionales (+15% ARPU anual)
5. **Coste de APIs de IA**: Se asume reducción progresiva por competencia entre proveedores y optimización de uso

---

# 6. IMPACTO ECONOMICO EN ESPANA

## Creación de empleo prevista

| Periodo | Puestos | Perfiles |
|---------|---------|----------|
| Año 1 | 3 nuevos | 2 desarrolladores full-stack, 1 comercial/customer success |
| Año 2 | 3 adicionales | 1 desarrollador IA, 1 comercial, 1 soporte técnico |
| Año 3 | 6 adicionales | 2 desarrolladores, 1 product manager, 1 marketing, 1 comercial, 1 operaciones |
| **Total Año 3** | **12 empleados** | Equipo multidisciplinar con alto componente tecnológico |

**Tipo de empleo**: Cualificado, indefinido, con salarios competitivos. Perfiles STEM con especialización en IA, desarrollo de software y producto.

## Inversión en España

- **Sede fiscal y operativa en España**: La empresa se constituye como S.L. española
- **Inversión directa**: €250.000 (financiación ENISA) + fondos propios invertidos en desarrollo, infraestructura y equipo
- **Gasto recurrente en España**: Salarios, oficina, servicios profesionales (legal, contable), proveedores locales
- **Propiedad intelectual**: Registrada en España, generando valor de activo intangible en el país

## Transferencia de conocimiento

- **De EE.UU. a España**: La tecnología ha sido desarrollada y validada con un cliente real en Texas (Maninos Homes LLC). Todo ese know-how — 35 automatizaciones probadas en producción, 6 agentes de IA, 74+ migraciones de base de datos — se transfiere al ecosistema español como base del producto.
- **Expertise en IA aplicada**: Conocimiento práctico (no teórico) de cómo implementar GPT-4 Vision, Whisper y agentes inteligentes en procesos empresariales reales.
- **Formación**: El equipo contratado en España recibirá formación en tecnologías de IA de vanguardia.

## Colaboración con universidades y centros tecnológicos

[PENDIENTE DE DEFINIR: Se recomienda identificar posibles colaboraciones con:]
- Universidades con programas de IA/ML (UPM, UPC, UPV, UAM)
- Centros tecnológicos (CTIC, Barcelona Supercomputing Center, AI+)
- Programas de prácticas y becas de investigación
- Cátedras de empresa o proyectos de I+D+i colaborativos

## Atracción de inversión extranjera

- **Cliente anchor internacional**: Maninos (Texas) como primer cliente que valida el modelo
- **Mercado LATAM desde España**: España como hub natural para expandir a Latinoamérica (idioma, zona horaria, conexiones comerciales)
- **Potencial de rondas futuras**: Con tracción demostrada, España ofrece un ecosistema de venture capital creciente (JME, K Fund, Samaipata, Nauta, etc.)

## Efecto tractor

1. **Ecosistema de partners**: Consultoras e integradores locales que implementen Tumai en sus clientes, generando empleo indirecto
2. **Open source parcial**: Posibilidad de liberar componentes del core como open source, contribuyendo al ecosistema tecnológico español
3. **Caso de estudio replicable**: Demostrar que una startup de IA puede nacer con validación internacional y escalar desde España
4. **Digitalización de PyMEs**: Cada cliente de Tumai es una PyME que se digitaliza, multiplicando el impacto económico

---

# 7. PERFIL DEL EMPRENDEDOR

## CV detallado

[⚠️ PENDIENTE — INFORMACION QUE NECESITO DE TI:]

- **Nombre completo**
- **Fecha de nacimiento / Edad**
- **Nacionalidad**
- **Formación académica** (universidad, máster, certificaciones)
- **Experiencia laboral detallada** (empresas, puestos, duración, logros)
- **LinkedIn URL**

## Experiencia previa relevante

### Fundadora y CEO de Tumai
- Creación de una plataforma de automatización con IA para empresas del sector inmobiliario
- Desarrollo de 35 módulos de automatización probados en producción
- Implementación de 6 agentes de IA (visión, voz, razonamiento)
- Stack tecnológico completo: Python, FastAPI, Next.js, GPT-4, Whisper, LangChain

### Proyecto Maninos Homes LLC (Cliente flagship, Texas, EE.UU.)
- Diseño y desarrollo de plataforma completa de gestión inmobiliaria (3 portales, 30+ APIs, 74+ tablas)
- Sistema de financiación RTO (Rent-to-Own) con gestión de contratos, pagos e inversores
- Integración de Stripe (pagos + KYC), Resend (email), Playwright (scraping)
- +672 commits de desarrollo iterativo en producción
- Resultado: transformación digital completa de la operación (de Excel a plataforma integrada con IA)

## Logros profesionales

- Plataforma SaaS con 35 automatizaciones en producción
- 6 agentes de IA funcionales en entorno empresarial real
- Sistema financiero completo (contratos, pagos, inversores, contabilidad)
- Validación internacional del producto con cliente en EE.UU.

## Experiencia internacional

- Trabajo con clientes en Estados Unidos (Texas)
- Desarrollo de producto con enfoque multi-mercado (EE.UU., España, Latinoamérica)
- Plataforma diseñada desde el inicio para ser multi-idioma y multi-región

## Logros adicionales

[⚠️ PENDIENTE — POR FAVOR INDICA SI TIENES:]

- [ ] Exits anteriores (venta de empresas)
- [ ] Publicaciones (artículos, papers, conferencias)
- [ ] Patentes
- [ ] Financiación previa obtenida (inversores, subvenciones, premios)
- [ ] Premios o reconocimientos
- [ ] Participación en aceleradoras o incubadoras
- [ ] Mentoring o advisory en otras startups
- [ ] Certificaciones técnicas relevantes (AWS, Google Cloud, etc.)

---

# ANEXOS RECOMENDADOS

[Se recomienda adjuntar al dossier:]

1. **Capturas de pantalla** de la plataforma Tumai (canvas visual, panel de automatizaciones)
2. **Capturas de pantalla** de la plataforma Maninos en producción (portales, dashboards, agentes IA)
3. **Demo en vídeo** (2-3 minutos) mostrando el flujo de configuración de automatizaciones
4. **Diagrama de arquitectura** técnica
5. **Listado completo de las 35 automatizaciones** con descripción breve
6. **Carta de referencia** de Maninos Homes LLC como cliente
7. **CV detallado** del emprendedor
8. **Plan de hitos** con milestones trimestrales

---

*Documento preparado para la solicitud de préstamo participativo ENISA, tramitada a través de la Unidad de Grandes Empresas (UGE).*
*Fecha de preparación: Marzo 2026*
