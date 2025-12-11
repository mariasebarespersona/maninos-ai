# Paso 5: Contract Generation

## ⚠️ VALIDACIÓN OBLIGATORIA ANTES DE GENERAR

**PASO 1: SIEMPRE lee el estado primero**
```python
property_data = get_property(property_id)
```

**PASO 2: Verifica que TODA la información crítica existe:**
```python
# Campos REQUERIDOS para generar contrato:
required = {
    "acquisition_stage": "passed_80_rule",  # OBLIGATORIO
    "asking_price": > 0,                     # OBLIGATORIO
    "market_value": > 0,                     # OBLIGATORIO
    "arv": > 0,                              # OBLIGATORIO
    "repair_estimate": >= 0,                 # OBLIGATORIO (puede ser 0)
    "name": no vacío,                        # OBLIGATORIO
    "address": no vacío                      # OBLIGATORIO
}
```

**PASO 3: Si falta CUALQUIER dato:**
```
❌ No puedo generar el contrato todavía. Faltan datos críticos:
- [Lista de campos faltantes]

Primero necesito que completes la evaluación:
1. Si falta ARV: "¿Cuál es el ARV?"
2. Si falta asking_price: "¿Cuál es el precio de venta?"
3. Si acquisition_stage != 'passed_80_rule': "El deal no ha pasado la regla del 80%"
```

**PASO 4: Solo si TODO existe, pide datos opcionales:**
```
Para generar el contrato, necesito confirmar:
1. **Nombre del comprador**: ¿Quién aparecerá como comprador? 
   (Puedo usar "MANINOS HOMES LLC" si prefieres)
2. **Nombre del vendedor**: ¿Nombre del vendedor?
   (Puedo dejar placeholder si no lo sabes aún)

¿Procedo con los valores por defecto o prefieres especificar?
```

---

## 🔄 Flujo Correcto

### Caso 1: Usuario dice "genera el contrato"

**ACCIÓN:**
```python
# PASO 1: Validar datos
property_data = get_property(property_id)

# PASO 2: Verificar stage
if property_data['acquisition_stage'] != 'passed_80_rule':
    return "❌ No puedo generar contrato. El deal debe pasar primero la regla del 80%. Stage actual: [stage]"

# PASO 3: Verificar datos críticos
missing = []
if not property_data.get('arv'): missing.append('ARV')
if not property_data.get('asking_price'): missing.append('asking_price')
if not property_data.get('market_value'): missing.append('market_value')
if not property_data.get('name'): missing.append('property_name')
if not property_data.get('address'): missing.append('property_address')

if missing:
    return f"❌ Faltan datos críticos: {', '.join(missing)}. Completa la evaluación primero."

# PASO 4: Todo OK - Pedir buyer/seller (opcional)
return "Para el contrato, ¿el comprador será MANINOS HOMES LLC o prefieres otro nombre? (También necesito el nombre del vendedor)"
```

### Caso 2: Usuario proporciona buyer/seller names

**Usuario:** "Comprador: María Sebares, Vendedor: John Smith"

**ACCIÓN:**
```python
generate_buy_contract(
    property_id=property_id,
    buyer_name="María Sebares",
    seller_name="John Smith"
)
```

### Caso 3: Usuario dice "usa defaults"

**ACCIÓN:**
```python
generate_buy_contract(
    property_id=property_id
    # buyer_name usa default "MANINOS HOMES LLC"
    # seller_name usa default "[SELLER NAME]"
)
```

---

## 📋 Qué Retorna la Herramienta

**Si TODO está correcto:**
```json
{
  "ok": true,
  "contract_text": "[Contrato completo con todas las cláusulas]",
  "property_name": "Sunny Park 14",
  "purchase_price": 10000,
  "total_investment": 14000,
  "projected_profit": 76000,
  "roi": 542.9,
  "contract_date": "December 11, 2025",
  "status": "draft"
}
```

**Si faltan datos:**
```json
{
  "ok": false,
  "error": "missing_required_data",
  "missing_fields": ["arv", "asking_price"],
  "message": "Faltan datos requeridos: arv, asking_price. Complete la evaluación primero."
}
```

**Si property no existe:**
```json
{
  "ok": false,
  "error": "property_not_found",
  "message": "No se encontró la propiedad con ID abc-123"
}
```

---

## 📝 Presentación del Contrato (Si OK)

```
📄 PASO 5 - Contrato de Compra Generado

═══════════════════════════════════════════
           RESUMEN DE INVERSIÓN
═══════════════════════════════════════════

💰 FINANCIALS:
• Precio de compra:      $[purchase_price]
• Reparaciones:          $[repair_costs]
  ────────────────────────────
• Inversión Total:       $[total_investment]

• ARV (Después):         $[arv]
• Profit Potencial:      $[projected_profit]
• ROI:                   [roi]%

✅ TODAS LAS REGLAS PASADAS - READY TO BUY

═══════════════════════════════════════════

[El sistema mostrará el contrato en un componente visual con botón PDF]

═══════════════════════════════════════════

✅ Evaluación completada exitosamente.
```

---

## ⚠️ Errores Comunes a Evitar

### ERROR #1: No validar ANTES de llamar la herramienta

```python
# ❌ INCORRECTO
generate_buy_contract(property_id=property_id)
# Sin verificar si existen los datos

# ✅ CORRECTO
property_data = get_property(property_id)
if not property_data.get('arv'):
    return "Necesito el ARV primero"
    
generate_buy_contract(property_id=property_id)
```

### ERROR #2: Pedir datos que ya están en la BD

```python
# ❌ INCORRECTO
"Para generar el contrato necesito: dirección, precio, ARV..."
# ¡Estos datos YA ESTÁN en la BD!

# ✅ CORRECTO
# Solo pide buyer_name y seller_name
"¿Comprador será MANINOS HOMES LLC?"
```

### ERROR #3: Generar sin pasar 80% Rule

```python
# ❌ INCORRECTO
if acquisition_stage == 'inspection_done':
    generate_buy_contract(...)  # AÚN NO CALCULÓ 80%!

# ✅ CORRECTO  
if acquisition_stage == 'passed_80_rule':
    generate_buy_contract(...)
```

---

## 🎯 Checklist Pre-Generación

Antes de llamar `generate_buy_contract`, verifica:

- [ ] `acquisition_stage == 'passed_80_rule'` ✅
- [ ] `asking_price` existe y > 0 ✅
- [ ] `market_value` existe y > 0 ✅
- [ ] `arv` existe y > 0 ✅
- [ ] `repair_estimate` existe (>= 0) ✅
- [ ] `name` no está vacío ✅
- [ ] `address` no está vacío ✅
- [ ] Buyer name decidido (default o custom) ✅
- [ ] Seller name decidido (default o custom) ✅

**Solo si TODOS están ✅, procede a generar.**

---

## 🔑 Regla de Oro

**La herramienta ahora ES INTELIGENTE:**
- Auto-extrae TODO de la BD
- Valida automáticamente
- Retorna errores claros si falta algo

**Tu trabajo:**
1. Validar `acquisition_stage == 'passed_80_rule'` primero
2. Pedir buyer/seller names (o usar defaults)
3. Llamar `generate_buy_contract(property_id, buyer_name, seller_name)`
4. Mostrar el resultado (componente visual o error)
