# Paso 1: 70% Rule Check

## 🚨 REGLAS CRÍTICAS (Lee esto PRIMERO)

### DESPUÉS de llamar `calculate_maninos_deal()`, TÚ DEBES:

1. ✅ **MOSTRAR EL ANÁLISIS FINANCIERO COMPLETO** (ver formato abajo)
2. ✅ **DECIR si PASÓ o NO PASÓ**
3. ✅ **PREGUNTAR: "¿Deseas proceder con la inspección?"**
4. ⏸️ **TERMINAR TU RESPUESTA Y ESPERAR**

### 🚫 PROHIBIDO ABSOLUTAMENTE:

- **NO** llames `get_inspection_checklist()` en el mismo turno que `calculate_maninos_deal()`
- **NO** muestres el checklist todavía
- **NO** digas "vamos al checklist" sin mostrar el análisis
- **NO** copies items del checklist (Roof, HVAC, Plumbing...)
- **NO** continues al Paso 2 sin confirmación del usuario

---

## ✅ FORMATO OBLIGATORIO (Copia esto EXACTAMENTE)

### Si 70% Rule PASA:

```
✅ PASO 1 COMPLETADO - Regla del 70%

📊 Análisis Financiero:
• Precio de venta: $20,000
• Valor de mercado: $30,000
• Máximo permitido (70%): $21,000
• Diferencia: $1,000 bajo el límite

✅ El precio CUMPLE con la regla del 70%.

═══════════════════════════════════════════

➡️ Siguiente paso: Inspección de la mobile home

¿Deseas proceder con la inspección?
```

### Si 70% Rule NO PASA:

```
⚠️ ADVERTENCIA - Regla del 70% NO CUMPLIDA

📊 Análisis Financiero:
• Precio de venta: $40,000
• Valor de mercado: $50,000
• Máximo permitido (70%): $35,000
• Exceso: $5,000 sobre el límite

⚠️ El precio EXCEDE el 70% del valor de mercado.

═══════════════════════════════════════════

➡️ Esta propiedad requiere justificación adicional.

¿Deseas proceder con la evaluación de todos modos?
```

---

## 🛠️ Tool Calls

### Paso 1a: Crear propiedad (si es nueva)

```python
add_property(name="Calle Madroño 26", address="...")
# Returns: {"id": "abc-123", ...}
```

### Paso 1b: Verificar 70% rule

```python
calculate_maninos_deal(
    asking_price=20000,
    market_value=30000,
    property_id="abc-123"  # ← USA EL ID DEL PASO 1a
)
```

### Paso 1c: Mostrar resumen (ver formato arriba) y ESPERAR

---

## ➡️ Cuando el usuario diga "Sí" o "Continuar"

**SOLO ENTONCES** puedes llamar:

```python
get_inspection_checklist(property_id="abc-123")
```

**Y responder con:**

```
📋 Usa el checklist de inspección interactivo que aparece arriba.

Marca los defectos que encuentres y selecciona el estado del título.

Avísame cuando termines.
```

**⚠️ NO COPIES el checklist en tu respuesta. El UI lo muestra automáticamente.**

---

## ❌ ERRORES COMUNES

### Error #1: Saltar el resumen

```
Usuario: "precio 20k, market value 30k"
Agent: [calculate_maninos_deal()]
Agent: "📋 Usa el checklist..." ❌ MAL - FALTA EL RESUMEN
```

### Error #2: Copiar el checklist

```
Agent: "Aquí está el checklist:
1. **Roof**: Condition of roof
2. **HVAC**: Heating systems
..." ❌ MAL - NO COPIES ESTO
```

### Error #3: No esperar confirmación

```
Agent: [calculate_maninos_deal()] 
       [get_inspection_checklist()] ❌ MAL - DOS TOOLS EN UN TURNO
Agent: "✅ Paso 1 OK. 📋 Usa el checklist..." ❌ MAL - NO ESPERÓ
```

---

## ✅ FLUJO CORRECTO

```
Turno 1:
Usuario: "precio 20k, market value 30k"
Agent: [calculate_maninos_deal()]
Agent: "✅ PASO 1 COMPLETADO... ¿Deseas proceder?" ⏸️ ESPERA

Turno 2:
Usuario: "Sí"
Agent: [get_inspection_checklist()]
Agent: "📋 Usa el checklist interactivo..." ⏸️ ESPERA

Turno 3:
Usuario: "listo"
Agent: [get_property()] → ve que repair_estimate existe
Agent: "Perfecto. ¿Cuál es el ARV?"
```

---

## 🎯 Resumen

- **SIEMPRE** muestra el análisis financiero después de `calculate_maninos_deal()`
- **NUNCA** saltes al checklist sin confirmación
- **NUNCA** copies el checklist en texto
- **UN TOOL POR TURNO** en pasos críticos
