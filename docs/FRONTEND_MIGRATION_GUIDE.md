# 🎨 FRONTEND MIGRATION GUIDE: RAMA → MANINOS AI

**Objetivo**: Adaptar el frontend de Next.js para MANINOS AI (mobile home acquisition)

---

## 📋 PASOS A SEGUIR

### **PASO 1: Eliminar componentes de Numbers/Excel** 🗑️

Estos componentes son específicos de RAMA (plantillas Excel R2B):

```bash
cd /Users/mariasebares/Documents/RAMA_AI/maninos-ai/web/src

# Mover a legacy (no eliminar por si acaso)
mkdir -p components/legacy
mv components/EditableExcel.tsx components/legacy/
mv components/Spreadsheet.tsx components/legacy/
```

**Razón**: MANINOS no usa plantillas Excel. Usa cálculos simples (70%/80% rules).

---

### **PASO 2: Eliminar API routes de Numbers/Excel** 🗑️

Estos endpoints no se necesitan en MANINOS:

```bash
cd /Users/mariasebares/Documents/RAMA_AI/maninos-ai/web/src/app/api

# Mover a legacy
mkdir -p legacy
mv excel/ legacy/
mv numbers/ legacy/
```

**Razón**: MANINOS no tiene Excel API, solo chat con backend Python.

---

### **PASO 3: Eliminar/Simplificar DocumentFramework** 🔧

El `DocumentFramework.tsx` es específico de RAMA (R2B/Promoción hierarchy):

```bash
cd /Users/mariasebares/Documents/RAMA_AI/maninos-ai/web/src/components

# Mover a legacy
mv DocumentFramework.tsx legacy/
```

**Opción alternativa**: Crear un componente simple `DocumentList.tsx` para MANINOS que solo muestre PDFs genéricos.

---

### **PASO 4: Actualizar PropertyHeader.tsx** 🔧

Este componente debe mostrar métricas de **Maninos** en lugar de RAMA.

**Cambios necesarios**:
```typescript
// ANTES (RAMA):
- Mostrar "estrategia" (R2B/Promoción)
- Mostrar "números template"
- Mostrar "documentos framework"

// DESPUÉS (MANINOS):
+ Mostrar "acquisition_stage" (initial, passed_70_rule, etc.)
+ Mostrar "70% Rule status" (PASS/FAIL)
+ Mostrar "80% Rule status" (PASS/FAIL)
+ Mostrar "Asking Price, Market Value, ARV, Repair Estimate"
+ Mostrar "Title Status" (Clean/Blue = verde, Other = rojo)
```

**Archivo**: `web/src/components/PropertyHeader.tsx`

---

### **PASO 5: Actualizar página principal (page.tsx)** 🎨

La página principal debe mostrar el **Acquisition Flow** de MANINOS.

**Cambios necesarios**:
```typescript
// ANTES (RAMA):
- Panel izquierdo: Numbers (Excel)
- Panel central: Chat
- Panel derecho: Documents Framework

// DESPUÉS (MANINOS):
- Panel izquierdo: Property Info + Acquisition Status
- Panel central: Chat (igual)
- Panel derecho: Inspection Checklist (si stage >= passed_70_rule)
```

**Archivo**: `web/src/app/page.tsx`

---

### **PASO 6: Crear nuevos componentes MANINOS** ✨

Crear componentes específicos para el flujo de adquisición:

#### **6.1. AcquisitionStageIndicator.tsx**
```typescript
// Muestra el stage actual con iconos visuales
// initial → passed_70_rule → inspection_done → passed_80_rule → contract_ready
```

#### **6.2. DealMetrics.tsx**
```typescript
// Muestra las métricas del deal:
// - Asking Price
// - Market Value (70% Rule)
// - Repair Estimate
// - ARV (80% Rule)
// - Total Investment
// - ROI
```

#### **6.3. InspectionChecklist.tsx**
```typescript
// Muestra el checklist de inspección
// - Roof, HVAC, Plumbing, etc.
// - Permite marcar defectos
// - Muestra repair costs en tiempo real
```

#### **6.4. TitleStatusBadge.tsx**
```typescript
// Badge para mostrar Title Status
// - Clean/Blue = verde ✅
// - Missing/Lien/Other = rojo ⚠️
```

---

### **PASO 7: Actualizar OnboardingGuide.tsx** 📖

Cambiar el onboarding de RAMA a MANINOS:

```typescript
// ANTES (RAMA):
- "Crea propiedades"
- "Selecciona plantilla R2B"
- "Sube documentos según framework"

// DESPUÉS (MANINOS):
- "Crea mobile home property"
- "Evalúa con 70% Rule (Market Value)"
- "Inspección y checklist"
- "Valida con 80% Rule (ARV)"
- "Genera contrato de compra"
```

**Archivo**: `web/src/components/OnboardingGuide.tsx`

---

### **PASO 8: Actualizar branding y estilos** 🎨

Cambiar de RAMA AI a MANINOS AI:

#### **8.1. Layout.tsx**
```typescript
// Cambiar título
- title: "RAMA AI"
+ title: "MANINOS AI - Mobile Home Acquisition"

// Cambiar descripción
- description: "Real Estate Management"
+ description: "Smart Mobile Home Investment Analysis"
```

#### **8.2. globals.css**
```css
/* Cambiar colores primarios si es necesario */
/* RAMA: Azul (#3B82F6) */
/* MANINOS: Puedes elegir otro color (ej: verde #10B981 para "deals") */
```

#### **8.3. Favicon y logo**
```bash
# Actualizar archivos en web/public/
# - favicon.ico
# - logo.png
```

---

### **PASO 9: Eliminar páginas dev innecesarias** 🗑️

Páginas de desarrollo que no se necesitan:

```bash
cd /Users/mariasebares/Documents/RAMA_AI/maninos-ai/web/src/app

# Mover a legacy
mkdir -p legacy
mv dev/ legacy/
mv dashboard/evals/ legacy/
```

**Razón**: Excel inspector y evals dashboard son de RAMA.

---

### **PASO 10: Actualizar tipos TypeScript** 📝

Crear nuevos tipos para MANINOS:

**Archivo**: `web/src/types/maninos.ts`

```typescript
export type AcquisitionStage = 
  | 'initial' 
  | 'passed_70_rule' 
  | 'inspection_done' 
  | 'passed_80_rule' 
  | 'rejected';

export type TitleStatus = 
  | 'Clean/Blue' 
  | 'Missing' 
  | 'Lien' 
  | 'Other';

export interface MobileHomeProperty {
  id: string;
  name: string;
  address: string;
  park_name?: string;
  asking_price?: number;
  market_value?: number;
  arv?: number;
  repair_estimate?: number;
  title_status?: TitleStatus;
  acquisition_stage: AcquisitionStage;
  created_at: string;
  updated_at: string;
}

export interface InspectionItem {
  category: string;
  key: string;
  description: string;
  defect?: boolean;
  cost?: number;
}

export interface DealMetrics {
  asking_price: number;
  market_value: number;
  arv: number;
  repair_costs: number;
  total_investment: number;
  max_offer_70: number;
  max_investment_80: number;
  rule_70_status: 'PASS' | 'FAIL';
  rule_80_status: 'PASS' | 'FAIL';
  roi?: number;
  potential_profit?: number;
}
```

---

## 🎯 RESUMEN DE CAMBIOS

### **Eliminar** ❌
- `EditableExcel.tsx`
- `Spreadsheet.tsx`
- `DocumentFramework.tsx` (o simplificar)
- `/api/excel/*` routes
- `/api/numbers/*` routes
- `/dev/excel-inspector` page
- `/dashboard/evals` page

### **Actualizar** 🔧
- `PropertyHeader.tsx` → Métricas de Maninos
- `page.tsx` → Layout de Acquisition Flow
- `OnboardingGuide.tsx` → Onboarding de Maninos
- `layout.tsx` → Branding de Maninos
- `globals.css` → Colores de Maninos

### **Crear** ✨
- `AcquisitionStageIndicator.tsx`
- `DealMetrics.tsx`
- `InspectionChecklist.tsx`
- `TitleStatusBadge.tsx`
- `types/maninos.ts`

---

## 📂 ESTRUCTURA FINAL DEL FRONTEND

```
web/src/
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.ts          ✅ (mantener)
│   ├── chat/
│   │   └── page.tsx              ✅ (mantener)
│   ├── globals.css               🔧 (actualizar)
│   ├── layout.tsx                🔧 (actualizar - branding)
│   └── page.tsx                  🔧 (actualizar - acquisition flow)
├── components/
│   ├── AcquisitionStageIndicator.tsx  ✨ (nuevo)
│   ├── DealMetrics.tsx                ✨ (nuevo)
│   ├── InspectionChecklist.tsx        ✨ (nuevo)
│   ├── TitleStatusBadge.tsx           ✨ (nuevo)
│   ├── PropertyHeader.tsx             🔧 (actualizar)
│   ├── OnboardingGuide.tsx            🔧 (actualizar)
│   └── legacy/
│       ├── EditableExcel.tsx          ❌ (legacy)
│       ├── Spreadsheet.tsx            ❌ (legacy)
│       └── DocumentFramework.tsx      ❌ (legacy)
├── types/
│   ├── index.ts                  ✅ (mantener)
│   └── maninos.ts                ✨ (nuevo)
└── lib/
    └── mcp/
        └── client.ts             ✅ (mantener)
```

---

## 🚀 ORDEN DE EJECUCIÓN RECOMENDADO

### **Fase 1: Limpieza (30 min)**
1. Mover componentes Excel/Numbers a `legacy/`
2. Mover API routes de Excel/Numbers a `legacy/`
3. Mover páginas dev a `legacy/`

### **Fase 2: Actualizar existentes (1 hora)**
4. Actualizar `PropertyHeader.tsx` con métricas Maninos
5. Actualizar `OnboardingGuide.tsx` con flujo Maninos
6. Actualizar `layout.tsx` con branding Maninos

### **Fase 3: Crear nuevos componentes (2 horas)**
7. Crear `types/maninos.ts`
8. Crear `AcquisitionStageIndicator.tsx`
9. Crear `DealMetrics.tsx`
10. Crear `InspectionChecklist.tsx`
11. Crear `TitleStatusBadge.tsx`

### **Fase 4: Integración (1 hora)**
12. Actualizar `page.tsx` con nuevo layout
13. Integrar nuevos componentes
14. Testear flujo completo

**Total estimado**: ~4.5 horas

---

## ✅ CHECKLIST DE VERIFICACIÓN

Antes de considerar el frontend completo, verifica:

- [ ] ✅ Componentes Excel/Numbers movidos a legacy
- [ ] ✅ API routes Excel/Numbers movidos a legacy
- [ ] ✅ PropertyHeader muestra métricas de Maninos
- [ ] ✅ Page.tsx muestra Acquisition Flow
- [ ] ✅ Branding actualizado (MANINOS AI)
- [ ] ✅ Nuevos componentes creados y funcionando
- [ ] ✅ Chat funciona correctamente con backend
- [ ] ✅ Acquisition stages se muestran visualmente
- [ ] ✅ Deal metrics se calculan en tiempo real
- [ ] ✅ Inspection checklist es interactivo
- [ ] ✅ Title status se muestra con colores
- [ ] ✅ Sin errores de TypeScript
- [ ] ✅ Sin errores en consola del browser

---

## 🎨 DISEÑO SUGERIDO PARA page.tsx

```
┌─────────────────────────────────────────────────────────────┐
│  MANINOS AI - Mobile Home Acquisition                  🏠   │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────┐  ┌──────────────────┐  ┌─────────────┐│
│  │  Property Info  │  │                  │  │ Inspection  ││
│  │  ───────────── │  │                  │  │ Checklist   ││
│  │                 │  │                  │  │             ││
│  │  Name: ...      │  │      CHAT        │  │ □ Roof      ││
│  │  Address: ...   │  │                  │  │ □ HVAC      ││
│  │                 │  │   Messages...    │  │ □ Plumbing  ││
│  │  Stage:         │  │                  │  │ □ ...       ││
│  │  ○─○─○─○─●     │  │                  │  │             ││
│  │  initial  80%   │  │                  │  │ Total Cost  ││
│  │                 │  │                  │  │ $X,XXX      ││
│  │  Deal Metrics:  │  │                  │  │             ││
│  │  • 70% Rule: ✅ │  │                  │  │             ││
│  │  • 80% Rule: ⏳ │  │                  │  │             ││
│  │  • ROI: X%      │  │                  │  │             ││
│  │                 │  │   [Input box]    │  │             ││
│  └─────────────────┘  └──────────────────┘  └─────────────┘│
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 📞 ¿NECESITAS AYUDA?

Si encuentras problemas durante la migración:
1. Revisa los logs del backend (`uvicorn app:app`)
2. Revisa la consola del browser (F12)
3. Verifica que el backend esté en puerto 8080
4. Verifica que las rutas API apunten a `http://localhost:8080`

---

**¿Quieres que empiece con la Fase 1 (Limpieza)?** 🧹

