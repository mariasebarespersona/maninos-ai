# Database Persistence - MANINOS AI

Este documento detalla **todos los puntos donde se guardan datos en la base de datos** para asegurar que nada se pierde.

---

## 📊 Schema de la Tabla `properties`

```sql
CREATE TABLE properties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    address TEXT,
    
    -- Precios y Valores
    asking_price NUMERIC,
    market_value NUMERIC,
    arv NUMERIC,
    repair_estimate NUMERIC DEFAULT 0,
    
    -- Estado del Deal
    status TEXT,  -- 'Proceed to Inspection', 'Ready to Buy', 'Rejected', 'Review Required'
    acquisition_stage TEXT DEFAULT 'initial',  -- 'initial', 'passed_70_rule', 'inspection_done', 'passed_80_rule', 'rejected'
    title_status TEXT,  -- 'Clean/Blue', 'Missing', 'Lien', 'Other'
    
    -- Metadata
    park_name TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## ✅ Paso 1: Crear Propiedad Nueva

### Tool: `add_property(name, address)`

**Ubicación:** `tools/property_tools.py:10-41`

**Qué guarda:**
```python
sb.table("properties").insert({
    "name": name,
    "address": address,
    "acquisition_stage": "initial"
})
```

**Campos guardados:**
- ✅ `name`
- ✅ `address`
- ✅ `acquisition_stage` = "initial"
- ✅ `created_at` (automático)

**Retorna:**
```json
{
  "ok": true,
  "property": {
    "id": "abc-123...",
    "name": "123 Main St",
    "address": "123 Main St, Sunny Park",
    "acquisition_stage": "initial",
    ...
  }
}
```

---

## ✅ Paso 2: Calcular Regla 70% (Precios Iniciales)

### Tool: `calculate_maninos_deal(asking_price, market_value, property_id)`

**Ubicación:** `tools/numbers_tools.py:66-210`

**Qué guarda:**
```python
# Líneas 162-178
update_property_fields(property_id, {
    "asking_price": asking_price,
    "market_value": market_value,
    "status": result["status"]  # "Proceed to Inspection" o "Review Required"
})

# Líneas 180-202
if 70% rule PASS:
    update_acquisition_stage(property_id, "passed_70_rule")
```

**Campos guardados:**
- ✅ `asking_price` (precio de venta)
- ✅ `market_value` (valor actual as-is)
- ✅ `status` = "Proceed to Inspection" (si pasa) o "Review Required" (si falla)
- ✅ `acquisition_stage` = "passed_70_rule" (si pasa)
- ✅ `updated_at` (automático)

**Retorna:**
```json
{
  "status": "Proceed to Inspection",
  "metrics": {
    "asking_price": 10000,
    "market_value": 40000,
    "max_allowable_offer_70": 28000
  },
  "checks": {
    "70_percent_rule": "PASS"
  },
  "reasoning": ["✅ 70% Rule PASS: ..."]
}
```

---

## ✅ Paso 3: Guardar Inspección

### Tool: `save_inspection_results(property_id, defects, title_status, notes)`

**Ubicación:** `tools/inspection_tools.py:47-150`

**Qué guarda:**

**1. En tabla `property_inspections`:**
```python
# Líneas 107-114
sb.table("property_inspections").insert({
    "property_id": property_id,
    "defects": defects,  # ["roof", "hvac", "plumbing"]
    "title_status": title_status,  # "Clean/Blue"
    "repair_estimate": repair_estimate,  # Auto-calculado
    "notes": notes,
    "created_by": "agent"
})
```

**2. En tabla `properties`:**
```python
# Líneas 122-127
sb.table("properties").update({
    "title_status": title_status,
    "repair_estimate": repair_estimate,
    "acquisition_stage": "inspection_done",
    "updated_at": "NOW()"
})
```

**Campos guardados:**
- ✅ `defects` (en property_inspections)
- ✅ `title_status` (en properties y property_inspections)
- ✅ `repair_estimate` (auto-calculado, en properties y property_inspections)
- ✅ `acquisition_stage` = "inspection_done"
- ✅ `notes` (opcional, en property_inspections)
- ✅ `updated_at` (automático)

**Retorna:**
```json
{
  "ok": true,
  "inspection_id": "xyz-789...",
  "property_id": "abc-123...",
  "defects": ["roof", "hvac"],
  "title_status": "Clean/Blue",
  "repair_estimate": 5500,
  "repair_breakdown": {"roof": 3000, "hvac": 2500},
  "acquisition_stage": "inspection_done"
}
```

---

## ✅ Paso 4: Calcular Regla 80% (ARV)

### Tool: `calculate_maninos_deal(asking_price, repair_costs, arv, market_value, property_id)`

**Ubicación:** `tools/numbers_tools.py:66-210`

**Qué guarda:**
```python
# Líneas 162-178
update_property_fields(property_id, {
    "asking_price": asking_price,
    "market_value": market_value,
    "arv": arv,  # NUEVO - After Repair Value
    "status": result["status"]  # "Ready to Buy" o "Rejected"
})

# Líneas 180-202
if 80% rule PASS:
    update_acquisition_stage(property_id, "passed_80_rule")
elif 80% rule FAIL:
    update_acquisition_stage(property_id, "rejected")
```

**Campos guardados:**
- ✅ `arv` (After Repair Value)
- ✅ `status` = "Ready to Buy" (si pasa) o "Rejected" (si falla)
- ✅ `acquisition_stage` = "passed_80_rule" (si pasa) o "rejected" (si falla)
- ✅ `updated_at` (automático)

**Retorna:**
```json
{
  "status": "Ready to Buy",
  "metrics": {
    "asking_price": 10000,
    "repair_costs": 5500,
    "arv": 90000,
    "market_value": 40000,
    "total_investment": 15500,
    "max_investment_80": 72000
  },
  "checks": {
    "70_percent_rule": "PASS",
    "80_percent_rule": "PASS"
  },
  "reasoning": ["✅ 80% Rule PASS: ..."]
}
```

---

## ✅ Paso 5: Generar Contrato (Opcional)

### Tool: `generate_buy_contract(property_id, buyer_name, seller_name, closing_date)`

**Ubicación:** `tools/contract_tools.py:9-196`

**Qué guarda:**
```python
# ACTUALMENTE: NO guarda en DB automáticamente
# El contrato se genera y retorna como texto

# RECOMENDACIÓN: Agregar guardado opcional en tabla 'contracts'
```

**⚠️ PENDIENTE:** El contrato NO se guarda en la base de datos actualmente. Solo se genera y se muestra al usuario.

**Sugerencia:**
```sql
CREATE TABLE contracts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID REFERENCES properties(id),
    contract_text TEXT NOT NULL,
    buyer_name TEXT,
    seller_name TEXT,
    closing_date TEXT,
    status TEXT DEFAULT 'draft',  -- 'draft', 'sent', 'signed'
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🔍 Verificación de Persistencia

### ✅ Datos que SE GUARDAN correctamente

| Campo | Tool que lo guarda | Tabla | Paso |
|-------|-------------------|-------|------|
| `name` | `add_property` | `properties` | 1 |
| `address` | `add_property` | `properties` | 1 |
| `asking_price` | `calculate_maninos_deal` | `properties` | 2 |
| `market_value` | `calculate_maninos_deal` | `properties` | 2 |
| `arv` | `calculate_maninos_deal` | `properties` | 4 |
| `repair_estimate` | `save_inspection_results` | `properties` | 3 |
| `title_status` | `save_inspection_results` | `properties` | 3 |
| `status` | `calculate_maninos_deal` | `properties` | 2, 4 |
| `acquisition_stage` | `add_property`, `calculate_maninos_deal`, `save_inspection_results` | `properties` | 1-5 |
| `defects` | `save_inspection_results` | `property_inspections` | 3 |

### ⚠️ Datos que NO se guardan (actualmente)

| Campo | Por qué no se guarda |
|-------|---------------------|
| `park_name` | No se captura en el flujo actual |
| `contract_text` | Se genera pero no se persiste |
| `buyer_name` | Solo se usa en generación de contrato, no se guarda |
| `seller_name` | Solo se usa en generación de contrato, no se guarda |

---

## 🛠️ Herramientas de Actualización

### `update_property_fields(property_id, fields_dict)`

**Ubicación:** `tools/property_tools.py`

**Uso:**
```python
update_property_fields("abc-123", {
    "asking_price": 10000,
    "market_value": 40000,
    "park_name": "Sunny Park"
})
```

Permite actualizar cualquier campo de la tabla `properties`.

### `update_acquisition_stage(property_id, stage)`

**Ubicación:** `tools/property_tools.py`

**Uso:**
```python
update_acquisition_stage("abc-123", "passed_70_rule")
```

Actualiza solo el campo `acquisition_stage` y `updated_at`.

---

## 📈 Flujo Completo de Persistencia

```
Usuario: "Evaluar mobile home en 123 Main St"
    ↓
[add_property]
    → DB: name, address, acquisition_stage='initial'
    ↓
Usuario: "Precio $10,000, market value $40,000"
    ↓
[calculate_maninos_deal]
    → DB: asking_price, market_value, status, acquisition_stage='passed_70_rule'
    ↓
Usuario: [Completa checklist: roof, hvac. Title: Clean]
    ↓
[save_inspection_results]
    → DB (properties): title_status, repair_estimate, acquisition_stage='inspection_done'
    → DB (property_inspections): defects, title_status, repair_estimate, notes
    ↓
Usuario: "ARV es $90,000"
    ↓
[calculate_maninos_deal]
    → DB: arv, status='Ready to Buy', acquisition_stage='passed_80_rule'
    ↓
Usuario: "Genera el contrato"
    ↓
[generate_buy_contract]
    → NO GUARDA EN DB (solo retorna texto)
```

---

## 🎯 Resumen

### ✅ LO QUE FUNCIONA BIEN:
- Todos los datos críticos del flujo de evaluación se guardan correctamente
- Cada herramienta actualiza los campos correspondientes
- El `acquisition_stage` se actualiza en cada paso
- Las inspecciones se guardan en tabla separada con historial completo

### ⚠️ MEJORAS POTENCIALES:
1. **Guardar contratos en BD**: Crear tabla `contracts` para persistir contratos generados
2. **Capturar `park_name`**: Agregar campo en `add_property` o permitir actualización posterior
3. **Guardar `buyer_name` y `seller_name`**: Persistir en properties o contracts para referencia
4. **Auditoría completa**: Agregar tabla `property_updates_log` para tracking de cambios

### ✅ TODO SE GUARDA DONDE DEBE:
- ✅ Propiedades → `properties` table
- ✅ Inspecciones → `property_inspections` table
- ✅ Documentos → `storage.objects` (si se suben PDFs)
- ✅ Conversaciones → LangGraph checkpoint en PostgreSQL

**Conclusión:** El sistema actual guarda correctamente todos los datos esenciales para el flujo de adquisición. Los únicos datos que no se persisten son opcionales (park_name) o no críticos (contratos se pueden regenerar desde los datos guardados).

