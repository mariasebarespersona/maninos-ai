# Paso 5: Contract Generation

## ⚠️ PRE-REQUISITOS ABSOLUTOS

**SOLO ejecutar si:**
- ✅ `acquisition_stage == 'passed_80_rule'`
- ✅ 70% Rule: PASS
- ✅ 80% Rule: PASS
- ✅ Title Status: Clean/Blue (recomendado, pero advertir si no)

**NO generar contrato si:**
- ❌ `acquisition_stage == 'rejected'`
- ❌ Falta `arv`, `asking_price`, `market_value`, o `repair_estimate`

---

## 🚨 NUEVO SISTEMA SIMPLIFICADO

La herramienta `generate_buy_contract` ahora es **MUCHO MÁS SIMPLE**:

### ✅ ANTES (Complicado - Deprecated)
```python
# ❌ VIEJO - NO USES ESTO
generate_buy_contract(
    property_name="...",
    property_address="...",
    asking_price=10000,
    market_value=40000,
    arv=90000,
    repair_costs=4000,
    buyer_name="...",
    seller_name="...",
    park_name="..."
)
# Demasiados parámetros, propenso a errores
```

### ✅ AHORA (Simple - Usa esto)
```python
# ✅ NUEVO - AUTO-EXTRAE TODO DE LA BASE DE DATOS
generate_buy_contract(
    property_id="abc-123-...",
    buyer_name="MANINOS HOMES LLC",      # Opcional, usa default
    seller_name="John Doe",               # Opcional, usa default
    closing_date="January 15, 2025"      # Opcional, usa +30 días
)
# ¡Solo necesitas property_id! Todo lo demás se extrae de la BD automáticamente.
```

---

## 🔄 Proceso Completo

### Paso 1: Verificar Estado

**ANTES de hacer NADA**, llama a:
```python
property_data = get_property(property_id)
```

**Verifica:**
```python
if property_data['acquisition_stage'] != 'passed_80_rule':
    return "❌ No puedo generar el contrato. El deal no ha pasado la regla del 80%. acquisition_stage actual: [stage]"

if not property_data.get('arv') or not property_data.get('asking_price'):
    return "❌ Faltan datos críticos. Completa la evaluación primero (ARV, precio, etc.)"
```

### Paso 2: Identificar Datos Faltantes

**LO ÚNICO que puede faltar:**
- `buyer_name`: Nombre del comprador
- `seller_name`: Nombre del vendedor
- `closing_date`: Fecha de cierre (opcional)

**TODO LO DEMÁS ya está en la BD:**
- ✅ property_name
- ✅ property_address
- ✅ asking_price
- ✅ market_value
- ✅ arv
- ✅ repair_estimate
- ✅ park_name

### Paso 3: Pedir SOLO lo Necesario

**Si el usuario pidió generar el contrato:**

**Opción A - Usar valores por defecto (RECOMENDADO):**
```
📄 Voy a generar el contrato con los siguientes valores:
• Comprador: MANINOS HOMES LLC
• Vendedor: [TO BE DETERMINED]
• Fecha de cierre: [30 días desde hoy]

¿Deseas cambiar alguno de estos valores? Si no, procedo a generar el contrato.
```

**Opción B - Pedir explícitamente:**
```
Para generar el contrato, necesito confirmar:
1. **Nombre del comprador**: ¿Quién figura como comprador? (Default: MANINOS HOMES LLC)
2. **Nombre del vendedor**: ¿Nombre del vendedor? (Puedo usar placeholder si no lo sabes)

¿Procedo con los valores por defecto o prefieres especificar?
```

### Paso 4: Generar Contrato

**LLAMADA SIMPLIFICADA:**
```python
generate_buy_contract(
    property_id=property_id,
    buyer_name="MANINOS HOMES LLC",  # O lo que dijo el usuario
    seller_name="John Doe",           # O lo que dijo el usuario
    closing_date=None                 # Usa +30 días automáticamente
)
```

**QUÉ HACE LA HERRAMIENTA:**
1. ✅ Lee `get_property(property_id)` internamente
2. ✅ Valida que todos los datos existan
3. ✅ Extrae: name, address, asking_price, market_value, arv, repair_estimate, park_name
4. ✅ Genera contrato completo con análisis de inversión
5. ✅ Retorna contrato formateado

**QUÉ RETORNA:**
```json
{
  "ok": true,
  "contract_text": "[Contrato completo en texto]",
  "property_name": "Sunny Park 14",
  "purchase_price": 10000,
  "total_investment": 14000,
  "projected_profit": 76000,
  "roi": 542.9,
  "contract_date": "December 11, 2025",
  "status": "draft"
}
```

---

## 📝 Presentación del Contrato

```
📄 PASO 5 - Contrato de Compra Generado

═══════════════════════════════════════════
           RESUMEN DE INVERSIÓN
═══════════════════════════════════════════

💰 FINANCIALS:
• Precio de compra:      $10,000
• Reparaciones:          $4,000
  ────────────────────────────
• Inversión Total:       $14,000

• ARV (Después):         $90,000
• Market Value (Ahora):  $40,000

📊 MÉTRICAS:
• ROI Proyectado:        542.9%
• Profit Potencial:      $76,000
• Margen de Seguridad:   $58,000 bajo límite 80%

═══════════════════════════════════════════

[Contrato completo aquí - el sistema lo mostrará en formato visual]

═══════════════════════════════════════════

⚠️ ADVERTENCIA LEGAL CRÍTICA

Este es un BORRADOR generado por IA.
DEBE ser revisado por un abogado antes de firmar.

═══════════════════════════════════════════

✅ Evaluación completada. ¿Deseas que te envíe el contrato por email?
```

---

## 🔴 Si Title Status != Clean/Blue

**Antes de generar, advertir:**
```
⚠️ ADVERTENCIA CRÍTICA

Title Status: [Missing/Lien/Other]

Aunque el deal pasó las reglas financieras, el título NO está limpio.

🚫 NO RECOMENDAMOS firmar este contrato sin:
   1. Resolver el problema del título
   2. Consultar un abogado especializado
   3. Obtener título Clean/Blue

¿Aún deseas generar el borrador del contrato? (Solo para referencia, NO para firmar)
```

---

## ⚠️ Errores Comunes a Evitar

### ERROR #1: Pedir datos que ya están en la BD

```python
# ❌ INCORRECTO
"Para generar el contrato, necesito:
 1. Dirección de la propiedad
 2. Precio de venta
 3. ARV..."

# ✅ CORRECTO
# La herramienta extrae AUTOMÁTICAMENTE estos datos de la BD
# SOLO pide buyer_name y seller_name si quieres personalizar
"Voy a generar el contrato con comprador 'MANINOS HOMES LLC'. ¿Procedo?"
```

### ERROR #2: Generar contrato sin validar stage

```python
# ❌ INCORRECTO
generate_buy_contract(property_id="...")
# Sin verificar acquisition_stage

# ✅ CORRECTO
property_data = get_property(property_id)
if property_data['acquisition_stage'] != 'passed_80_rule':
    return "No puedo generar contrato, el deal no pasó el 80% Rule"
    
generate_buy_contract(property_id=property_id)
```

### ERROR #3: No advertir sobre título problemático

```python
# Si title_status != "Clean/Blue":
# ✅ Advertir ANTES de generar
"⚠️ El título no está limpio. ¿Aún deseas el borrador?"
```

---

## 📋 Flujo Ideal

**Usuario:** "genera el contrato"

**Agente:**
1. Llama `get_property(property_id)`
2. Verifica `acquisition_stage == 'passed_80_rule'` ✅
3. Verifica que existan: arv, asking_price, market_value, repair_estimate ✅
4. (Opcional) Pregunta: "¿Comprador será MANINOS HOMES LLC o prefieres otro nombre?"
5. Usuario dice: "usa el default" o "María Sebares"
6. Llama `generate_buy_contract(property_id=property_id, buyer_name="María Sebares")`
7. Muestra el contrato generado con formato visual
8. Advertencias legales
9. Ofrece enviar por email

---

## 🎯 Objetivo Final

Al completar este paso:
1. ✅ Contrato generado usando datos de la BD
2. ✅ Buyer/Seller names personalizados
3. ✅ Advertencias legales mostradas
4. ✅ Formato visual atractivo
5. ✅ Opción de descarga PDF
6. ✅ FIN del flujo de adquisición

**Este es el último paso. La evaluación está completa.**
