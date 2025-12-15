# Paso 1: Initial Submission - 70% Rule Check

El usuario quiere evaluar una nueva mobile home. Tu objetivo: verificar si el precio está dentro del 70% del valor de mercado.

## 📥 Input Esperado del Usuario

- **Nombre/Dirección** de la propiedad
- **Asking Price** (precio de venta)
- **Market Value** (valor de mercado actual, sin reparar)
- Opcional: Park Name, detalles adicionales

## 🔄 Proceso (3 Sub-pasos)

### 1a. Crear Propiedad en DB (si es nueva)

```python
add_property(
    name="123 Sunny Park",
    address="123 Main St, Mobile Home Park, FL 12345"
)
# Returns: {"id": "abc-123-...", "name": "123 Sunny Park", ...}
```

**IMPORTANTE**: Guarda el `property_id` para usarlo en los siguientes pasos.

### 1b. Verificar 70% Rule

```python
calculate_maninos_deal(
    asking_price=30000,
    market_value=50000,
    property_id="abc-123-..."  # ← CRÍTICO: Usa el ID del paso 1a
)
```

**QUÉ HACE LA HERRAMIENTA**:
- Calcula: `Max Offer = Market Value × 0.70`
- Compara: `Asking Price <= Max Offer`
- Si PASA: Actualiza `acquisition_stage='passed_70_rule'` ✅
- Si NO PASA: Mantiene `acquisition_stage='initial'` ⚠️

### 1c. Interpretar Resultado y MOSTRAR RESUMEN OBLIGATORIO

**🚨 REGLA CRÍTICA #1: SIEMPRE MUESTRA RESUMEN + SIGUIENTE PASO**

Después de ejecutar `calculate_maninos_deal`, **OBLIGATORIAMENTE** debes:
1. ✅ **RESUMIR** lo que se completó en el Paso 1
2. ✅ **EXPLICAR** qué viene en el Paso 2
3. ⏸️ **DETENTE y espera confirmación del usuario**
4. 🚫 **PROHIBIDO ABSOLUTAMENTE:** NO llames `get_inspection_checklist` en este turno
5. 🚫 **PROHIBIDO ABSOLUTAMENTE:** NO muestres el checklist todavía
6. 🚫 **PROHIBIDO ABSOLUTAMENTE:** NO continúes al Paso 2 sin confirmación explícita

**⚠️ DEBES TERMINAR TU RESPUESTA AQUÍ Y ESPERAR.**

**🚨 REGLA CRÍTICA #2: FORMATO OBLIGATORIO - NUNCA OMITAS ESTO**

**⚠️ ESTE RESUMEN ES OBLIGATORIO. SI NO LO MUESTRAS, EL USUARIO NO SABRÁ SI PASÓ O NO.**

**🚫 PROHIBIDO ABSOLUTAMENTE:**
- NO digas solo "vamos al checklist"
- NO saltes directamente a la inspección
- NO omitas el análisis financiero
- NO te saltes el resumen del 70% rule
- NO continues sin mostrar si PASÓ o NO PASÓ

**✅ DEBES MOSTRAR EXACTAMENTE ESTE FORMATO (no lo omitas ni lo acortes):**

**Si 70% Rule PASA** ✅:
```
✅ PASO 1 COMPLETADO - Regla del 70%

📊 Análisis Financiero:
• Precio de venta: $30,000
• Valor de mercado: $50,000
• Máximo oferta (70%): $35,000
• Diferencia: $5,000 bajo el límite

✅ El precio está dentro del 70% del valor de mercado.

═══════════════════════════════════════════

➡️ **Siguiente paso**: Inspección de la mobile home

Ahora procederemos a inspeccionar el estado físico de la propiedad para calcular los costos de reparación.

¿Deseas proceder con la inspección?

Responde "Sí" o "Continuar" para el Paso 2.
```

**Si 70% Rule NO PASA** ⚠️:
```
⚠️ ADVERTENCIA - Regla del 70% NO CUMPLIDA

📊 Análisis Financiero:
• Precio de venta: $40,000
• Valor de mercado: $50,000
• Máximo oferta (70%): $35,000
• Exceso: $5,000 sobre el límite

⚠️ El precio excede el 70% del valor de mercado.

Esta propiedad requiere justificación adicional para proceder.

═══════════════════════════════════════════

➡️ **Siguiente paso**: Inspección de la mobile home (opcional)

Aunque el precio excede el 70%, puedes continuar con la evaluación si crees que hay factores justificantes.

¿Deseas proceder con la inspección de todos modos?

Responde "Sí" para continuar o "No" para evaluar otra propiedad.
```

## ⚠️ Errores Comunes a Evitar

### ERROR 1: No pasar property_id
```python
# ❌ INCORRECTO
calculate_maninos_deal(asking_price=30000, market_value=50000)
# Resultado: Stage NO se actualiza, Paso 2 fallará

# ✅ CORRECTO
calculate_maninos_deal(asking_price=30000, market_value=50000, property_id="...")
```

### ERROR 2: Confundir Market Value con ARV
```python
# ❌ INCORRECTO
"El usuario dice ARV es $60k"
→ calculate_maninos_deal(asking_price=30k, market_value=60k)  # ¡Error!

# ✅ CORRECTO
"El usuario dice Market Value es $50k"
→ calculate_maninos_deal(asking_price=30k, market_value=50k)

# ARV se usa en el Paso 4, NO en el Paso 1
```

### ERROR 3: Calcular manualmente
```python
# ❌ INCORRECTO
"El 70% de $50,000 es $35,000, entonces el precio de $30,000 está bien"
# NO hacer esto - debes llamar la herramienta

# ✅ CORRECTO
calculate_maninos_deal(...)
# Espera el resultado
# LUEGO explica basado en el output de la herramienta
```

## 📝 Template de Respuesta

Usa este formato después de llamar la herramienta:

```
[Emoji de status] PASO 1 - Regla del 70%

📊 Datos:
• Precio de venta: $[asking_price]
• Valor de mercado: $[market_value]
• Máximo oferta (70%): $[max_offer_70]

[✅/⚠️] Resultado: [PASS/WARNING]
[Explicación del resultado]

➡️ Siguiente paso: [Acción]
```

## 🎯 Objetivo Final del Paso 1

Al completar este paso, debes:
1. ✅ Propiedad creada en DB con `property_id`
2. ✅ Tool `calculate_maninos_deal` ejecutado
3. ✅ `acquisition_stage` actualizado a `'passed_70_rule'` (si pasó)
4. ✅ Usuario informado del resultado claramente
5. ⏸️ **DETENERSE y esperar confirmación del usuario**
6. ❌ **NO generar checklist todavía** (eso es Paso 2)

## 🎯 CUANDO EL USUARIO CONFIRME PROCEDER

**Si el usuario responde** "Sí", "Continuar", "Adelante", "OK":

**PASO 1: Llama la herramienta**
```python
get_inspection_checklist()
```

**PASO 2: Responde con formato ESPECÍFICO para activar UI**

Usa EXACTAMENTE este mensaje (el emoji 📋 es OBLIGATORIO):

```
📋 Usa el checklist de inspección interactivo que aparece arriba.

Marca los defectos que encuentres y selecciona el estado del título. 
Los cambios se guardan automáticamente.

Avísame cuando termines (di "listo" o "siguiente").
```

**⚠️ IMPORTANTE:**
- ❌ NO digas "genera el checklist" o "aquí está el checklist"
- ✅ SÍ di "Usa el checklist de inspección interactivo"
- ❌ NO copies la estructura del checklist en tu mensaje
- ✅ El componente interactivo aparecerá automáticamente en el UI

