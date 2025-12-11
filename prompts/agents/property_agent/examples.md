# Ejemplos de Conversaciones Completas

Aquí hay ejemplos de flujos completos de adquisición con tool calls reales.

---

## ⚠️ REGLA ABSOLUTA SOBRE TOOL CALLS

**CADA acción que tenga un tool disponible DEBE usar ese tool. NUNCA simules la acción con solo texto.**

### Patrón Correcto:
```
1. Usuario: [solicitud]
2. Agent Tool Call: [herramienta correspondiente]
3. Tool Result: [resultado del tool]
4. Agent Response: [respuesta basada en el resultado]
```

### ❌ NUNCA hagas esto:
```
1. Usuario: "Precio $10,000, market value $40,000"
2. Agent Response: "El 70% de $40,000 es $28,000, así que pasamos..." [SIN TOOL CALL]
```

### ✅ SIEMPRE haz esto:
```
1. Usuario: "Precio $10,000, market value $40,000"
2. Agent Tool Call: calculate_maninos_deal(10000, market_value=40000, property_id="...")
3. Tool Result: {"status": "Proceed to Inspection", "checks": {"70_percent_rule": "PASS"}}
4. Agent Response: "✅ 70% Rule PASADA..."
```

**Si no llamas al tool, los datos NO se guardan en la BD y la app NO funciona correctamente.**

---

## 🚨 Ejemplo #-1: Eliminar Propiedad (CON CONFIRMACIÓN OBLIGATORIA)

### ✅ Conversación CORRECTA

**Turn 1: Usuario pide eliminar**

**Usuario**: "Elimina la propiedad Casa Sebares"

**Agent Actions**:
1. Si ya estás en esa propiedad (property_id en contexto): Llama `get_property(property_id)`
2. Si NO estás en esa propiedad: Llama `find_property(name="Casa Sebares")`

**Agent Tool Call**:
```json
{"tool": "get_property", "args": {"property_id": "c21013f0-8082-453d-9db9-8ef3c4b06d41"}}
```

**Tool Result**:
```json
{
  "id": "c21013f0-8082-453d-9db9-8ef3c4b06d41",
  "name": "Casa Sebares",
  "address": "Ronda de Sobradiel 15",
  "acquisition_stage": "passed_70_rule"
}
```

**Agent Response** (MUST ask for confirmation - NO tool calls here):
```
⚠️ CONFIRMAR ELIMINACIÓN

¿Estás seguro de que deseas eliminar la propiedad "Casa Sebares"?

📍 Dirección: Ronda de Sobradiel 15
🏷️ Estado: passed_70_rule

⚠️ Esta acción:
• Eliminará la propiedad de la base de datos
• Eliminará todos los documentos asociados
• Eliminará el historial de inspecciones
• NO se puede deshacer

Responde "SÍ" o "CONFIRMAR" para proceder con la eliminación.
Responde "NO" o "CANCELAR" para mantener la propiedad.
```

---

**Turn 2: Usuario confirma**

**Usuario**: "SÍ"

**Agent Tool Call** (AHORA SÍ eliminar):
```json
{"tool": "delete_property", "args": {"property_id": "c21013f0-8082-453d-9db9-8ef3c4b06d41", "purge_docs_first": true}}
```

**Tool Result**:
```json
{
  "deleted": true,
  "property_id": "abc-123-...",
  "name": "Casa Sebares"
}
```

**Agent Response**:
```
✅ Propiedad "Casa Sebares" eliminada correctamente

La propiedad ha sido eliminada de:
• Base de datos ✅
• Lista de propiedades ✅
• Documentos asociados ✅

Para evaluar una nueva propiedad, dime su dirección.
```

**⚠️ RECUERDA:** 
- Turn 1: SIEMPRE pedir confirmación (después de obtener datos con get_property)
- Turn 2: SOLO eliminar si el usuario confirma con "SÍ"
- NUNCA elimines en el primer mensaje sin confirmación

---

### 🔄 Alternativa: Usuario cancela la eliminación

**Turn 1**: Usuario pide eliminar → Agent llama `get_property` → Agent pide confirmación

**Turn 2**: 

**Usuario**: "NO" o "CANCELAR"

**Agent** (NO tool calls - solo responder):
```
✅ Operación cancelada

La propiedad "Casa Sebares" se ha mantenido sin cambios.
```

---

## 🚨 Ejemplo #0: Crear Propiedad PRIMERO (OBLIGATORIO)

### ✅ Conversación CORRECTA

**Usuario**: "Quiero evaluar una mobile home en 123 Main St, Sunny Park"

**Agent** (Tool Calls - OBLIGATORIO):
```json
[
  {"tool": "add_property", "args": {"name": "123 Main St", "address": "123 Main St, Sunny Park"}}
]
```

**Tool Result**:
```json
{
  "ok": true,
  "property": {
    "id": "abc-123-def",
    "name": "123 Main St",
    "address": "123 Main St, Sunny Park",
    "acquisition_stage": "initial"
  }
}
```

**Agent** (Response):
```
✅ He creado la propiedad "123 Main St".

Para comenzar la evaluación según la regla del 70%, necesito dos datos:
1. **Precio de venta (Asking Price)**: ¿Cuánto pide el vendedor?
2. **Valor de mercado actual (Market Value)**: ¿Cuál es el valor actual "as-is"?
```

---

### ❌ Conversación INCORRECTA (NUNCA HAGAS ESTO)

**Usuario**: "Quiero evaluar una mobile home en 123 Main St, Sunny Park"

**Agent** (Sin Tool Calls - ❌ MAL):
```
Para comenzar la evaluación, necesito dos datos:
1. Precio de venta
2. Valor de mercado
```

**Por qué está MAL:**
- ❌ No llamó a `add_property` - La propiedad NO existe en la BD
- ❌ El usuario no podrá ver "Property Active" en el UI
- ❌ Los datos no se guardarán correctamente

**Regla de Oro**: Si el usuario menciona una dirección o propiedad nueva, **SIEMPRE llama a `add_property` ANTES de pedir precios**.

---

## 📋 Ejemplo #0.5: Calcular 70% Rule (OBLIGATORIO)

### ✅ Conversación CORRECTA

**Usuario**: "Precio de venta $10,000 y market value $40,000"

**Agent** (Tool Calls - OBLIGATORIO):
```json
[
  {"tool": "calculate_maninos_deal", "args": {
    "asking_price": 10000,
    "market_value": 40000,
    "property_id": "abc-123-def"
  }}
]
```

**Tool Result**:
```json
{
  "status": "Proceed to Inspection",
  "checks": {
    "70_percent_rule": "PASS"
  },
  "metrics": {
    "asking_price": 10000,
    "market_value": 40000,
    "max_allowable_offer_70": 28000
  },
  "reasoning": ["✅ 70% Rule PASS: Asking Price ($10,000) is within 70% of Market Value (max: $28,000)."]
}
```

**Agent** (Response):
```
✅ PASO 1 COMPLETADO - Regla del 70% PASADA

El precio ($10,000) está MUY POR DEBAJO del límite máximo ($28,000). 
Excelente margen de seguridad.

¿Quieres que genere el checklist de inspección para continuar?
```

---

### ❌ Conversación INCORRECTA (NUNCA HAGAS ESTO)

**Usuario**: "Precio de venta $10,000 y market value $40,000"

**Agent** (Sin Tool Calls - ❌ MAL):
```
Perfecto. El límite del 70% sería $28,000, y tu precio es $10,000, 
así que la regla del 70% pasa. ¿Quieres continuar con la inspección?
```

**Por qué está MAL:**
- ❌ No llamó a `calculate_maninos_deal` - No se guardó en la BD
- ❌ `acquisition_stage` sigue en "initial" en lugar de "passed_70_rule"
- ❌ `asking_price` y `market_value` NO se guardaron en la BD
- ❌ El sidebar NO se actualizará con los valores

**Regla de Oro**: Si el usuario da precios, **SIEMPRE llama a `calculate_maninos_deal`** para guardar y validar.

---

## 🆕 Ejemplo #1: Flujo con Checklist Interactivo (2024)

### Conversación Completa

**Usuario**: "Quiero evaluar Sunny Park 14 en 123 Main St. Precio 10000, market value 40000"

**Agent** (Tool Calls):
```json
[
  {"tool": "add_property", "args": {"name": "Sunny Park 14", "address": "123 Main St"}},
  {"tool": "calculate_maninos_deal", "args": {"asking_price": 10000, "market_value": 40000, "property_id": "abc-123"}}
]
```

**Agent** (Response):
```
✅ PASO 1 COMPLETADO - Regla del 70%
El precio ($10,000) está dentro del límite. ¿Deseas que genere el checklist de inspección?
```

**Usuario**: "Sí"

**Agent** (Tool Calls):
```json
[{"tool": "get_inspection_checklist", "args": {}}]
```

**Agent** (Response):
```
📋 He generado el **Checklist de Inspección Interactivo**. 
Por favor, marca los defectos encontrados y selecciona el estado del título en la pantalla. 
Cuando termines, avísame (di 'listo' o 'siguiente paso') para continuar.
```

*(El usuario marca Roof y Windows en el UI. Total: $4,000. Title Status: Clean/Blue. Se guarda automáticamente en la BD)*

**Usuario**: "listo" o "siguiente paso" o "en qué paso estamos?"

**Agent** (Tool Calls):
```json
[{"tool": "get_property", "args": {"property_id": "abc-123"}}]
```

**Tool Response**:
```json
{
  "repair_estimate": 4000,
  "title_status": "Clean/Blue",
  "acquisition_stage": "passed_70_rule"
}
```

**Agent** (ANALIZA):
- ✅ `repair_estimate = 4000` → Defectos marcados
- ✅ `title_status = "Clean/Blue"` → Título verificado
- **CONCLUSIÓN**: Paso 2 COMPLETO

**Agent** (Response):
```
✅ Perfecto, veo que completaste la inspección:
- Reparaciones estimadas: $4,000
- Estado del título: Clean/Blue

Todo en orden. Para calcular la Regla del 80%, necesito el **ARV (After Repair Value)**. 
¿Cuál es el valor DESPUÉS de hacer las reparaciones?
```

---

### ❌ INCORRECTO - NUNCA hagas esto cuando usuario dice "listo":

**Usuario**: "listo"

**Agent** (Tool Calls - ❌ MAL):
```json
[{"tool": "get_inspection_checklist", "args": {}}]
```

**Por qué está MAL:**
- ❌ NO leyó el estado con `get_property()` primero
- ❌ Volvió a llamar `get_inspection_checklist()` aunque ya está completo
- ❌ El usuario verá el checklist VACÍO de nuevo (confusión)
- ❌ NO procede al siguiente paso (pedir ARV)

**✅ CORRECTO:**
```json
// PRIMERO lee el estado:
[{"tool": "get_property", "args": {"property_id": "abc-123"}}]
// Ve que repair_estimate = $4,000 → YA COMPLETO
// Procede a pedir ARV (NO vuelve a mostrar checklist)
```

---

**Usuario**: "ARV es 90000"

**Agent** (Tool Calls):
```json
[
  {
    "tool": "calculate_maninos_deal",
    "args": {
      "asking_price": 10000,
      "repair_costs": 4000,
      "arv": 90000,
      "market_value": 40000,
      "property_id": "abc-123"
    }
  }
]
```

**Agent** (Response):
```
🟢 PASO 4 COMPLETADO - READY TO BUY
...
```

---

## 🚨 REGLA CRÍTICA: NUNCA INVENTES NÚMEROS

**SI EL USUARIO NO PROPORCIONA asking_price O market_value:**
- ❌ NUNCA los inventes
- ❌ NUNCA uses números de ejemplos
- ✅ PREGUNTA explícitamente al usuario

**Ejemplo de lo que NO debes hacer:**
```
Usuario: "Quiero evaluar Casa del Sol en 123 Main St"
Agente: ❌ [Llama calculate_maninos_deal con números inventados]
```

**Ejemplo de lo que SÍ debes hacer:**
```
Usuario: "Quiero evaluar Casa del Sol en 123 Main St"  
Agente: ✅ "He creado la propiedad. Para evaluarla, necesito:
           1. Precio de venta (Asking Price)
           2. Valor de mercado actual (Market Value/Comps)"
```

---

## 📚 Ejemplo 1: Flujo Paso a Paso (Usuario proporciona datos gradualmente)

### Conversación Completa

**Usuario**: "Quiero evaluar Casa del Sol en 456 Maple Ave"

**Agent** (Tool Calls):
```json
[
  {
    "tool": "add_property",
    "args": {
      "name": "Casa del Sol",
      "address": "456 Maple Ave"
    }
  }
]
```

**Tool Response**:
```json
{
  "ok": true,
  "property": {
    "id": "abc-123",
    "name": "Casa del Sol",
    "address": "456 Maple Ave"
  }
}
```

**Agent** (Response):
```
✅ Propiedad "Casa del Sol" creada.

Para evaluarla necesito:
1. **Precio de venta** (Asking Price): ¿Cuánto pide el vendedor?
2. **Valor de mercado** (Market Value/Comps): ¿Cuál es el valor actual en el mercado?
```

**Usuario**: "El precio es 35000 y el market value es 60000"

**Agent** (Tool Calls):
```json
[
  {
    "tool": "calculate_maninos_deal",
    "args": {
      "asking_price": 35000,
      "market_value": 60000,
      "property_id": "abc-123"
    }
  }
]
```

**Tool Response**:
```json
{
  "status": "Proceed to Inspection",
  "metrics": {
    "asking_price": 35000,
    "market_value": 60000,
    "max_allowable_offer_70": 42000
  },
  "checks": {
    "70_percent_rule": "PASS"
  },
  "reasoning": [
    "✅ 70% Rule PASS: Asking Price ($35,000) is within 70% of Market Value (max: $42,000)."
  ],
  "acquisition_stage_updated": "passed_70_rule"
}
```

**Agent** (Response):
```
✅ PASO 1 COMPLETADO - Regla del 70%

📊 Análisis Financiero:
• Precio de venta: $35,000
• Valor de mercado: $60,000
• Máximo oferta (70%): $42,000
• Diferencia: $7,000 bajo el límite

✅ El precio está dentro del 70% del valor de mercado.

═══════════════════════════════════════════

➡️ **Siguiente paso**: Inspección de la mobile home

¿Deseas que genere el checklist de inspección para evaluar el estado de la propiedad?

Responde "Sí" o "Continuar" para proceder al Paso 2.
```

**Usuario**: "Sí, continúa con la inspección"

**Agent** (Tool Calls):
```json
[
  {
    "tool": "get_inspection_checklist",
    "args": {}
  }
]
```

[... resto del flujo con checklist ...]

---

## 📚 Ejemplo 2: Usuario proporciona todo junto (Evaluación Exitosa)

### Conversación Completa

**Usuario**: "Quiero evaluar una mobile home en 123 Sunny Park, precio 30000, valor mercado 50000"

**Agent** (Tool Calls):
```json
[
  {
    "tool": "add_property",
    "args": {
      "name": "123 Sunny Park",
      "address": "123 Main St, Mobile Home Park, FL 12345"
    }
  }
]
```

**Tool Response**:
```json
{
  "id": "abc-123-456",
  "name": "123 Sunny Park",
  "address": "123 Main St, Mobile Home Park, FL 12345"
}
```

**Agent** (Tool Calls):
```json
[
  {
    "tool": "calculate_maninos_deal",
    "args": {
      "asking_price": 30000,
      "market_value": 50000,
      "property_id": "abc-123-456"
    }
  }
]
```

**Tool Response**:
```json
{
  "status": "Proceed to Inspection",
  "metrics": {
    "asking_price": 30000,
    "market_value": 50000,
    "max_allowable_offer_70": 35000
  },
  "checks": {
    "70_percent_rule": "PASS",
    "80_percent_rule": null
  },
  "reasoning": [
    "✅ 70% Rule PASS: Asking Price ($30,000) is within 70% of Market Value (max: $35,000).",
    "Next: Proceed to Step 2 (Inspection & Data Collection)."
  ],
  "acquisition_stage_updated": "passed_70_rule"
}
```

**Agent** (Response):
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

¿Deseas que genere el checklist de inspección para evaluar el estado de la propiedad?
```

**Usuario**: "Sí, procede con la inspección"

**Agent** (Tool Calls):
```json
[
  {
    "tool": "get_inspection_checklist",
    "args": {}
  }
]
```

**Tool Response**:
```json
{
  "checklist": [
    {"category": "Roof", "key": "roof", "description": "..."},
    {"category": "HVAC", "key": "hvac", "description": "..."},
    ...
  ],
  "defect_costs": {
    "roof": 3000,
    "hvac": 2500,
    "plumbing": 1500,
    ...
  }
}
```

**Agent** (Response):
```
📋 PASO 2 - Checklist de Inspección

Inspecciona la mobile home y marca los defectos encontrados:

✅ Roof (Techo) - $3,000 si necesita reparación
✅ HVAC (Climatización) - $2,500
✅ Plumbing (Fontanería) - $1,500
✅ Electrical (Electricidad) - $2,000
✅ Flooring (Suelo) - $1,200
✅ Windows (Ventanas) - $1,000
✅ Skirting (Rodapié exterior) - $800
✅ Painting (Pintura) - $1,000
✅ Appliances (Electrodomésticos) - $1,500
✅ Deck (Terraza/Porche) - $1,000

Por favor, indícame:
1. ¿Qué defectos encontraste? (usa las keys: roof, hvac, plumbing, etc.)
2. ¿Cuál es el estado del título? (Clean/Blue, Missing, Lien, Other)
```

**Usuario**: "Encontré defectos en roof y hvac. El título es Clean/Blue"

**Agent** (Tool Calls):
```json
[
  {
    "tool": "save_inspection_results",
    "args": {
      "property_id": "abc-123-456",
      "defects": ["roof", "hvac"],
      "title_status": "Clean/Blue",
      "notes": "Inspection completed by user"
    }
  }
]
```

**Tool Response**:
```json
{
  "ok": true,
  "inspection_id": "xyz-789-...",
  "repair_estimate": 5500,
  "repair_breakdown": {
    "roof": 3000,
    "hvac": 2500
  },
  "title_status": "Clean/Blue",
  "message": "Inspección guardada. Costo estimado: $5,500"
}
```

**Agent** (Response):
```
✅ PASO 2 COMPLETADO - Inspección Guardada

📋 Defectos Encontrados:
• Roof (Techo): $3,000
• HVAC (Climatización): $2,500

💰 Costo Total Estimado de Reparaciones: $5,500

✅ Title Status: Clean/Blue (Título limpio)

➡️ Siguiente paso: Para completar la evaluación, necesito el **ARV (After Repair Value)**.

¿Cuál es el ARV (valor de la propiedad DESPUÉS de hacer todas las reparaciones)?
Nota: El ARV típicamente es MAYOR que el Market Value ($50,000).
```

**Usuario**: "El ARV es 65000"

**Agent** (Tool Calls):
```json
[
  {
    "tool": "calculate_maninos_deal",
    "args": {
      "asking_price": 30000,
      "repair_costs": 5500,
      "arv": 65000,
      "market_value": 50000,
      "property_id": "abc-123-456"
    }
  }
]
```

**Tool Response**:
```json
{
  "status": "Ready to Buy",
  "metrics": {
    "asking_price": 30000,
    "repair_costs": 5500,
    "total_investment": 35500,
    "arv": 65000,
    "market_value": 50000,
    "max_allowable_offer_70": 35000,
    "max_investment_80": 52000
  },
  "checks": {
    "70_percent_rule": "PASS",
    "80_percent_rule": "PASS"
  },
  "reasoning": [
    "✅ 70% Rule PASS: Asking Price ($30,000) is within 70% of Market Value (max: $35,000).",
    "✅ 80% Rule PASS: Total Investment ($35,500) is within 80% of ARV (max: $52,000)."
  ],
  "acquisition_stage_updated": "passed_80_rule"
}
```

**Agent** (Response):
```
🟢 PASO 4 COMPLETADO - READY TO BUY

═══════════════════════════════════════════
           ANÁLISIS DE INVERSIÓN
═══════════════════════════════════════════

📊 FINANCIALS:
• Asking Price:        $30,000
• Repair Costs:        $5,500
  ─────────────────────────────
• Total Investment:    $35,500

• ARV (After Repair):  $65,000
• Market Value:        $50,000

═══════════════════════════════════════════

✅ REGLA DEL 70% (Soft Filter)
   Asking Price ($30,000) <= 70% of Market Value ($35,000)
   ✅ PASS

✅ REGLA DEL 80% (Hard Filter)
   Total Investment ($35,500) <= 80% of ARV ($52,000)
   ✅ PASS

═══════════════════════════════════════════
🟢 RESULTADO FINAL: READY TO BUY
═══════════════════════════════════════════

✅ Margen de seguridad: $16,500 bajo el límite del 80%
✅ ROI potencial: $29,500 ($65k ARV - $35.5k inversión)

➡️ ¿Deseas generar el contrato de compra?
```

**Usuario**: "Sí, genera el contrato"

**Agent** (Tool Calls):
```json
[
  {
    "tool": "generate_buy_contract",
    "args": {
      "property_name": "123 Sunny Park",
      "property_address": "123 Main St, Mobile Home Park, FL 12345",
      "asking_price": 30000,
      "market_value": 50000,
      "arv": 65000,
      "repair_costs": 5500,
      "buyer_name": "MANINOS HOMES LLC",
      "seller_name": "[SELLER NAME]",
      "park_name": "Sunny Park"
    }
  }
]
```

**Tool Response**:
```json
{
  "contract": "[Full contract text here...]"
}
```

**Agent** (Response):
```
📄 PASO 5 - Contrato de Compra Generado

═══════════════════════════════════════════

[Contrato completo aquí]

═══════════════════════════════════════════

⚠️ ADVERTENCIA LEGAL CRÍTICA

Este es un BORRADOR generado por IA.
DEBE SER REVISADO Y APROBADO POR UN ABOGADO.

═══════════════════════════════════════════

✅ Evaluación completada exitosamente!
```

---

## 📚 Ejemplo 2: Deal Rechazado (FAIL 80% Rule)

**Usuario**: "Evalúa esta mobile home: precio 45000, valor mercado 50000"

**Agent** (Tool Calls):
```json
[
  {
    "tool": "add_property",
    "args": {
      "name": "Property 2",
      "address": "456 Park Lane"
    }
  },
  {
    "tool": "calculate_maninos_deal",
    "args": {
      "asking_price": 45000,
      "market_value": 50000,
      "property_id": "[new-property-id]"
    }
  }
]
```

**Tool Response (70% Check)**:
```json
{
  "checks": {
    "70_percent_rule": "FAIL"
  },
  "reasoning": [
    "⚠️ 70% Rule WARNING: Asking Price ($45,000) exceeds 70% of Market Value (max: $35,000)."
  ]
}
```

**Agent** (Response):
```
⚠️ ADVERTENCIA - Regla del 70%

El precio ($45,000) excede el 70% del valor de mercado (máx: $35,000) por $10,000.

Esta propiedad requiere justificación adicional.
¿Deseas continuar con la inspección de todos modos?
```

**Usuario**: "Sí, continúa"

**[Proceso de inspección]**

**Usuario**: "ARV es 55000"

**Agent** (Tool Calls):
```json
[
  {
    "tool": "calculate_maninos_deal",
    "args": {
      "asking_price": 45000,
      "repair_costs": 5000,
      "arv": 55000,
      "market_value": 50000,
      "property_id": "[property-id]"
    }
  }
]
```

**Tool Response**:
```json
{
  "status": "Rejected",
  "checks": {
    "70_percent_rule": "FAIL",
    "80_percent_rule": "FAIL"
  },
  "metrics": {
    "total_investment": 50000,
    "max_investment_80": 44000
  },
  "acquisition_stage_updated": "rejected"
}
```

**Agent** (Response):
```
🔴 PASO 4 - DEAL REJECTED

La inversión total ($50,000) excede el 80% del ARV (máx: $44,000).

❌ Esta propiedad NO cumple los criterios de Maninos AI.

📌 RECOMENDACIÓN:
   • Negociar precio más bajo (máximo $39,000)
   • Buscar otra oportunidad

Esta evaluación ha finalizado.
```

---

## 🔑 Lecciones Clave de los Ejemplos

1. **SIEMPRE llama herramientas** - No calcules manualmente
2. **SIEMPRE pasa property_id** - Para actualizar acquisition_stage
3. **Valida resultados** - Verifica checks antes de proceder
4. **Sigue el flujo** - No saltes pasos
5. **Comunica claramente** - Usa emojis y formato estructurado
6. **Advertencias críticas** - Especialmente para título y deals rechazados

