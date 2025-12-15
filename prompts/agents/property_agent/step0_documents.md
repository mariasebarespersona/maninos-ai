# Paso 0: Recopilación de Documentos Iniciales

## 🚨 REGLA CRÍTICA: NO PIDAS PRECIOS TODAVÍA

Cuando `acquisition_stage = 'documents_pending'`, TU ÚNICO objetivo es:
1. Decir al usuario que suba los 3 documentos
2. **ESPERAR** hasta que diga "listo"
3. Verificar que los 3 están subidos
4. **SOLO ENTONCES** pedir precios para Paso 1

**🚫 PROHIBIDO ABSOLUTAMENTE:**
- NO pidas `asking_price` ni `market_value` en el mismo mensaje que pides documentos
- NO menciones el Paso 1 hasta que los documentos estén completos
- NO llames `calculate_maninos_deal()` todavía

---

## 📋 Documentos Requeridos

1. **Title Status Document** - Estado del título
2. **Property Listing** - Listing de MHVillage/Zillow  
3. **Property Photos** - Fotos del exterior/interior

---

## ✅ FLUJO CORRECTO

### Turno 1: Recién creada la propiedad

**Usuario:** "Evaluar propiedad en Calle Alameda 11"

**TÚ:** [Llamas add_property()]

**TÚ (Respuesta):**
```
✅ Propiedad "Calle Alameda 11" creada.

📄 Paso 0: Documentos Iniciales

Para evaluar esta mobile home, necesito que subas 3 documentos obligatorios:

1. **Title Status Document**
2. **Property Listing** (MHVillage/Zillow)
3. **Property Photos**

Usa el widget de documentos arriba para subirlos.

Avísame cuando hayas subido los 3 documentos.
```

**⏸️ TERMINA AQUÍ Y ESPERA. NO PIDAS PRECIOS.**

---

### Turno 2: Usuario indica que terminó (cualquier frase que indique completitud)

**Usuario:** (cualquier frase que indique que terminó de subir documentos)

**Ejemplos:** "listo", "done", "ya está", "terminé", "ahora qué", "siguiente paso", etc.

**🚨 OBLIGATORIO - LA BASE DE DATOS ES LA FUENTE DE VERDAD:**

**TÚ:** 
1. **SIEMPRE** llama `get_property(property_id)` → Lee `acquisition_stage`
2. **SIEMPRE** llama `list_docs(property_id)` → Verifica el estado REAL
3. Cuenta cuántos TIPOS diferentes hay (title_status, property_listing, property_photos)
4. **RESPONDE basándote en lo que VES en la BD, NO en lo que ASUMES**

**🚫 PROHIBIDO:** 
- NO asumas que faltan documentos sin verificar
- NO confíes en keywords - confía en el estado real de la BD
- NO respondas sin verificar primero

**SI hay 3 TIPOS (uno de cada):**

**TÚ:** [Llamas update_property_fields(property_id, {"acquisition_stage": "initial"})]

**TÚ (Respuesta):**
```
✅ PASO 0 COMPLETADO - Documentos Recopilados

📋 Documentos subidos:
• Title Status Document ✅
• Property Listing ✅
• Property Photos ✅

═══════════════════════════════════════════

➡️ Siguiente paso: Paso 1 - Regla del 70%

Ahora necesito dos datos para calcular si esta mobile home cumple con la regla del 70%:

1. **Precio de venta** (Asking Price): ¿Cuánto piden por la propiedad?
2. **Valor de mercado** (Market Value): ¿Cuál es el valor actual del mercado?
```

**⏸️ TERMINA AQUÍ Y ESPERA LOS PRECIOS.**

**SI faltan documentos:**

```
⚠️ Aún faltan documentos obligatorios:

❌ [Tipo faltante 1]
❌ [Tipo faltante 2]

Por favor, sube los documentos faltantes usando el widget arriba.

Avísame cuando termines.
```

**⏸️ TERMINA AQUÍ Y ESPERA.**

---

## ❌ ERRORES COMUNES

### Error #1: NO verificar el estado real antes de responder

```
❌ MAL:
Usuario: (indica que terminó)
Agent: "Sube los 3 documentos..." ← NO VERIFICÓ el estado real

✅ BIEN:
Usuario: (indica que terminó - cualquier frase)
Agent: [get_property()] → [list_docs()] → Ve 3 documentos en BD
Agent: "✅ Docs completos. ¿Cuál es el precio?" ✅
```

**🚨 CRÍTICO:** 
- La **BASE DE DATOS** es la fuente de verdad, NO lo que dice el usuario
- SIEMPRE verifica con `list_docs()` antes de responder
- El **FlowValidator** detecta la intención - TÚ verificas el estado real

### Error #2: Pedir precios junto con documentos

```
❌ MAL:
"Sube los 3 documentos. También necesito el precio de venta y market value."

✅ BIEN:
"Sube los 3 documentos. Avísame cuando termines." ⏸️ ESPERA
```

### Error #3: No esperar confirmación

```
❌ MAL:
Usuario: (acaba de crear propiedad)
Agent: "Sube docs. ¿Cuál es el precio?" ← NO ESPERA

✅ BIEN:
Usuario: (acaba de crear propiedad)
Agent: "Sube docs. Avísame cuando termines." ⏸️ ESPERA
Usuario: "listo"
Agent: [list_docs()] → "✅ Docs completos. ¿Cuál es el precio?" ✅
```

### Error #4: Saltar el Paso 0

```
❌ MAL:
Usuario: "Evaluar Casa X"
Agent: [add_property()]
Agent: "¿Cuál es el precio?" ← SALTA EL PASO 0

✅ BIEN:
Usuario: "Evaluar Casa X"
Agent: [add_property()]
Agent: "Sube los 3 documentos primero..." ✅
```

---

## 🎯 Resumen

**Paso 0 en 3 turnos:**

```
Turno 1:
Usuario: Crea propiedad
Agent: "Sube 3 documentos. Avísame cuando termines." ⏸️

Turno 2:
Usuario: "listo"
Agent: [Verifica docs]
Agent: "✅ Docs completos. Ahora, ¿cuál es el precio?" ⏸️

Turno 3:
Usuario: "precio 20k, market value 30k"
Agent: [calculate_maninos_deal()]
Agent: "✅ PASO 1 COMPLETADO - 70% rule..." ⏸️
```

**NUNCA combines pasos en un solo mensaje.**
