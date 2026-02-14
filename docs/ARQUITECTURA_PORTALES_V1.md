# Arquitectura de Portales - Maninos AI v1.0

**Fecha:** 27 Enero 2026  
**Estado:** Draft  
**Basado en:** `docs/Maninos_AI_Diagrama_Flujo_Completo.png`

---

## 📊 Visión General

La aplicación se divide en **3 portales independientes** que comparten la misma base de datos pero tienen funcionalidades específicas para cada tipo de usuario.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        BASE DE DATOS COMPARTIDA                      │
│                           (Supabase/PostgreSQL)                      │
└─────────────────────────────────────────────────────────────────────┘
                │                    │                    │
        ┌───────┴───────┐    ┌───────┴───────┐    ┌───────┴───────┐
        │   PORTAL      │    │   PORTAL      │    │   PORTAL      │
        │   MANINOS     │    │   MANINOS     │    │   CLIENTES    │
        │   HOMES       │    │   CAPITAL     │    │               │
        │  (Empleados)  │    │  (Empleados)  │    │  (Público)    │
        └───────────────┘    └───────────────┘    └───────────────┘
```

---

## 🏠 Portal 1: MANINOS HOMES (Empleados)

### Usuarios
- Empleados de Maninos Homes
- Roles: Admin, Comprador, Renovador, Vendedor

### Funcionalidades (Basado en diagrama)

#### **1. Compra Casa**
| Sub-paso | Funcionalidad | UI Component |
|----------|---------------|--------------|
| 1.1 Dashboard casas del mercado | Ver listado de casas disponibles en el mercado con filtros de análisis financiero (histórico + mercado) | `<MarketDashboard />` |
| 1.2 Checklist casa física | Formulario de inspección física de la propiedad (26 puntos) | `<PropertyChecklist />` |
| 1.3 Docs | Gestión de documentos: Página taxes, Bill of Sale (escritura), Cambio título | `<DocumentManager />` |
| 1.4 Pago casa | Registrar pago de la compra de la propiedad | `<PurchasePayment />` |

#### **2. Fotos / Publicar**
| Sub-paso | Funcionalidad | UI Component |
|----------|---------------|--------------|
| 2.1 Dashboard casas Maninos | Ver inventario de casas propias de Maninos | `<InventoryDashboard />` |
| 2.2 Cada casa con precio y fotos | Subir fotos, establecer precio, publicar en portal clientes | `<PropertyEditor />` |

#### **💰 Posible Punto de Venta (entre paso 2 y 3)**
- Si hay cliente interesado ANTES de renovar → Ir a "Cierre de Venta"
- Marcar propiedad como "Pre-venta sin renovar"

#### **3. Renovar**
| Sub-paso | Funcionalidad | UI Component |
|----------|---------------|--------------|
| 3.1 Incluye posibilidad de mover | Registrar si la casa necesita ser movida/reubicada | `<MoveTracker />` |
| 3.2 Checklist materiales por unidad + costes | Captura por voz de materiales y costos de renovación | `<RenovationChecklist />` con 🎤 entrada de voz |

#### **4. Volver a Publicar**
| Sub-paso | Funcionalidad | UI Component |
|----------|---------------|--------------|
| 4.1 Precio updated post reforma | Actualizar precio basado en costos de renovación | `<PriceUpdater />` |
| 4.2 Fotos nuevas | Subir fotos de la propiedad renovada | `<PhotoUploader />` |

#### **💰 Posible Punto de Venta (entre paso 4 y 5)**
- Si hay cliente interesado DESPUÉS de renovar → Ir a "Cierre de Venta"

#### **5. Cierre de Venta**
| Funcionalidad | Descripción |
|---------------|-------------|
| Verificar cliente | Confirmar datos del cliente interesado |
| Determinar tipo de pago | ¿Contado o RTO? |
| **Si Contado** → Procesar en este portal |
| **Si RTO** → Transferir a Portal Maninos Capital |

### Flujo Contado (dentro de Portal Homes)
```
Cliente paga contado → Datos Cliente (Nombre, Tel, Correo, Terreno) 
→ Pago (Stripe/Transferencia/Efectivo) → Transferencia de Título ✅
```

---

## 🏦 Portal 2: MANINOS CAPITAL (Empleados)

### Usuarios
- Empleados de Maninos Capital
- Roles: Admin, Analista Financiero, Gestor de Cartera, Cobranza

### Flujo Principal (RTO - Rent to Own)

> **Trigger:** Cliente de Maninos Homes elige RTO como forma de pago

```
Maninos Capital compra la casa (de Maninos Homes)
         ↓
    1. ADQUIRIR
         ↓
    2. INCORPORAR
         ↓
    3. GESTIONAR CARTERA
         ↓
    4. ENTREGAR ✅
         
    💰 FONDEAR (ciclo paralelo)
```

### Funcionalidades

#### **Inicio: Maninos Capital compra la casa**
| Funcionalidad | Descripción |
|---------------|-------------|
| Recibir notificación | Cliente de Homes eligió RTO |
| Verificar disponibilidad de capital | ¿Hay fondos disponibles? |
| Aprobar compra | Capital adquiere la propiedad de Homes |

#### **1. Adquirir**
| Funcionalidad | UI Component |
|---------------|--------------|
| Análisis financiero | Evaluar rentabilidad del RTO | `<FinancialAnalysis />` |
| Cambio de título a Maninos Capital | Gestionar transferencia legal | `<TitleTransfer />` |

#### **2. Incorporar**
| Funcionalidad | UI Component |
|---------------|--------------|
| Meter cliente | Registrar datos completos del cliente | `<ClientOnboarding />` |
| KYC (verificación identidad) | Stripe Identity / verificación manual | `<KYCVerification />` |
| DTI (capacidad de pago) | Calcular Debt-to-Income ratio | `<DTICalculator />` |
| Generar contrato RTO | Crear contrato Texas Residential Lease with Purchase Option | `<RTOContractGenerator />` |

#### **3. Gestionar Cartera**
| Funcionalidad | UI Component |
|---------------|--------------|
| Cobro de pagos mensuales | Dashboard de pagos pendientes/recibidos | `<PaymentsDashboard />` |
| Reportes mensuales | Generar reportes para inversionistas | `<MonthlyReports />` |
| Seguimiento cliente | Comunicación y recordatorios | `<ClientFollowUp />` |

#### **4. Entregar**
| Funcionalidad | UI Component |
|---------------|--------------|
| Verificación final | Confirmar que cliente completó todos los pagos | `<FinalVerification />` |
| Transferencia de título al cliente | Proceso legal de entrega | `<TitleDelivery />` |

#### **💰 FONDEAR (Ciclo Paralelo)**
| Funcionalidad | Descripción |
|---------------|-------------|
| Dashboard inversionistas | Ver capital disponible de cada inversionista |
| Gestionar deuda | Tracking de líneas de crédito |
| Ciclo de recuperación | Gestionar → Fondear (pagos recibidos) → Adquirir (nuevo capital) |

---

## 👥 Portal 3: CLIENTES (Público)

### Usuarios
- Cualquier persona buscando casa
- Clientes actuales de Maninos (Contado o RTO)

### Funcionalidades

#### **A. Visitante (No registrado)**
| Funcionalidad | UI Component |
|---------------|--------------|
| Ver catálogo de casas | Listado público de propiedades disponibles | `<PublicCatalog />` |
| Filtrar por precio, ubicación, características | Búsqueda avanzada | `<PropertyFilters />` |
| Ver detalles de casa | Fotos, precio, especificaciones | `<PropertyDetails />` |
| Registrarse / Crear cuenta | Sign up con email o teléfono | `<SignUp />` |

#### **B. Cliente Registrado (Pre-compra)**
| Funcionalidad | UI Component |
|---------------|--------------|
| Guardar casas favoritas | Wishlist de propiedades | `<Favorites />` |
| Solicitar información | Contactar sobre una propiedad | `<ContactForm />` |
| Iniciar proceso de compra | Seleccionar casa y comenzar | `<StartPurchase />` |
| Elegir tipo de pago | Contado vs RTO | `<PaymentTypeSelector />` |
| Ingresar datos personales | Formulario de solicitud | `<ApplicationForm />` |
| Subir documentos | ID, comprobantes, etc. | `<DocumentUpload />` |

#### **C. Cliente Contado (Post-compra)**
| Funcionalidad | UI Component |
|---------------|--------------|
| Ver estado de compra | Tracking del proceso | `<PurchaseStatus />` |
| Ver documentos | Bill of Sale, Título, etc. | `<MyDocuments />` |
| Historial de transacción | Recibo de pago | `<TransactionHistory />` |

#### **D. Cliente RTO (Post-contrato)**
| Funcionalidad | UI Component |
|---------------|--------------|
| Ver contrato RTO | Acceso al contrato firmado | `<MyRTOContract />` |
| Ver calendario de pagos | Fechas y montos pendientes | `<PaymentSchedule />` |
| Realizar pago mensual | Pagar con Stripe/Transferencia | `<MakePayment />` |
| Ver historial de pagos | Pagos realizados | `<PaymentHistory />` |
| Ver progreso hacia propiedad | % completado del RTO | `<OwnershipProgress />` |
| Comunicarse con Maninos Capital | Chat/Mensajes | `<SupportChat />` |

---

## 🗄️ Base de Datos (Estructura Propuesta)

### Tablas Principales

```sql
-- PROPIEDADES
properties (
    id, address, hud_number, year, bedrooms, bathrooms,
    purchase_price, renovation_cost, sale_price,
    status, -- 'market', 'purchased', 'renovating', 'published', 'sold'
    photos, documents, created_at, updated_at
)

-- CLIENTES
clients (
    id, name, email, phone, 
    address, ssn_itin, date_of_birth,
    employment_info, monthly_income,
    client_type, -- 'lead', 'contado', 'rto'
    created_at
)

-- VENTAS/TRANSACCIONES
sales (
    id, property_id, client_id,
    sale_type, -- 'contado', 'rto'
    sale_price, down_payment,
    status, -- 'pending', 'processing', 'completed'
    completed_at
)

-- CONTRATOS RTO
rto_contracts (
    id, sale_id, property_id, client_id,
    monthly_rent, purchase_price, term_months,
    start_date, end_date,
    contract_pdf_url,
    status -- 'active', 'completed', 'defaulted'
)

-- PAGOS
payments (
    id, rto_contract_id, client_id,
    amount, due_date, paid_date,
    payment_method, stripe_payment_id,
    status -- 'pending', 'paid', 'late', 'failed'
)

-- RENOVACIONES
renovations (
    id, property_id,
    materials_checklist, total_cost,
    started_at, completed_at
)

-- FONDEO (Inversionistas)
investors (
    id, name, email, phone,
    total_invested, available_capital
)

investments (
    id, investor_id, property_id,
    amount, return_rate, status
)

-- USUARIOS/EMPLEADOS
users (
    id, email, name, role,
    portal_access, -- 'homes', 'capital', 'admin'
    created_at
)
```

---

## 🔐 Autenticación y Permisos

| Portal | Autenticación | Roles |
|--------|---------------|-------|
| Maninos Homes | Supabase Auth (empleados) | Admin, Comprador, Renovador, Vendedor |
| Maninos Capital | Supabase Auth (empleados) | Admin, Analista, Gestor, Cobranza |
| Clientes | Supabase Auth (público) | Cliente |

### Row Level Security (RLS)
- Empleados Homes: Solo ven propiedades de Homes
- Empleados Capital: Solo ven contratos RTO y pagos
- Clientes: Solo ven SUS propiedades, contratos y pagos

---

## 🛠️ Stack Tecnológico Propuesto

| Capa | Tecnología |
|------|------------|
| Frontend | Next.js 14 (App Router) + Tailwind CSS |
| Backend | Python FastAPI (API) |
| Base de datos | Supabase (PostgreSQL) |
| Autenticación | Supabase Auth |
| Pagos | Stripe |
| Verificación identidad | Stripe Identity |
| Storage | Supabase Storage (fotos, docs) |
| Email | Resend / SendGrid |
| PDFs | ReportLab / WeasyPrint |
| Hosting | Vercel (frontend) + Railway/Render (API) |

---

## 📁 Estructura de Carpetas Propuesta

```
maninos-ai/
├── api/                        # Backend Python FastAPI
│   ├── routes/
│   │   ├── homes/              # Endpoints Portal Homes
│   │   ├── capital/            # Endpoints Portal Capital
│   │   └── clients/            # Endpoints Portal Clientes
│   ├── services/
│   ├── models/
│   └── main.py
│
├── web/                        # Frontend Next.js
│   └── src/
│       ├── app/
│       │   ├── homes/          # Portal Maninos Homes
│       │   │   ├── dashboard/
│       │   │   ├── properties/
│       │   │   ├── renovations/
│       │   │   └── sales/
│       │   ├── capital/        # Portal Maninos Capital
│       │   │   ├── dashboard/
│       │   │   ├── acquisitions/
│       │   │   ├── clients/
│       │   │   ├── contracts/
│       │   │   ├── payments/
│       │   │   └── investors/
│       │   └── (public)/       # Portal Clientes
│       │       ├── catalog/
│       │       ├── property/[id]/
│       │       ├── my-account/
│       │       ├── my-contract/
│       │       └── my-payments/
│       └── components/
│
├── migrations/                 # SQL migrations
├── docs/                       # Documentación
└── tools/                      # Utilidades compartidas
```

---

## 🎯 Próximos Pasos

1. [ ] Validar este documento con el cliente
2. [ ] Definir prioridades (¿qué portal primero?)
3. [ ] Crear migración inicial de base de datos
4. [ ] Configurar autenticación por portal
5. [ ] Empezar desarrollo del primer portal

---

## ❓ Preguntas para el Cliente

1. ¿Los empleados de Homes y Capital son personas diferentes o pueden ser los mismos?
2. ¿El portal de clientes debe tener la posibilidad de aplicar a financiamiento (RTO) directamente o siempre pasa por un vendedor?
3. ¿Qué información del inventario de casas debe ser pública vs privada?
4. ¿Los inversionistas (Fondear) necesitan su propio portal o es parte de Capital?
5. ¿Prioridad de desarrollo? ¿Empezamos por Clientes, Homes o Capital?

