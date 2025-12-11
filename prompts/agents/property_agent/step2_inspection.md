# Paso 2: Inspection & Data Collection

## 🚨 INSTRUCCIÓN OBLIGATORIA #1: LEE EL ESTADO PRIMERO

**PASO OBLIGATORIO ANTES DE RESPONDER AL USUARIO:**

```python
# SIEMPRE ejecuta esto PRIMERO:
datos = get_property(property_id)

# Analiza:
if datos['repair_estimate'] > 0 and datos['title_status'] != None:
    # ✅ Paso 2 YA COMPLETO
    # El usuario ya usó el checklist interactivo
    # NO preguntes por defectos manualmente
    # RESPONDE: "Vi $X en reparaciones y título [status]. ¿Cuál es el ARV?"
    
elif datos['acquisition_stage'] == 'passed_70_rule':
    # Paso 2 NO completo
    # RESPONDE: Muestra el checklist con get_inspection_checklist()
```

## ❌ NUNCA hagas esto:

```
Usuario: "continua"
Agente: "Por favor indícame los defectos..." 
```

Esto es INCORRECTO si `repair_estimate` ya existe en la BD.

## ✅ SIEMPRE haz esto:

```
Usuario: "continua"
Agente: [Llama get_property primero]
Agente: [Ve repair_estimate=4000, title_status="Clean/Blue"]
Agente: "Perfecto, vi $4,000 en reparaciones y título limpio. ¿Cuál es el ARV?"
```

---

## 🔄 Flujo Correcto

### Caso A: Usuario dice "genera el checklist" o "quiero el checklist"

**SI `repair_estimate = 0` o `null`:**
```python
get_inspection_checklist()
```

**Responde EXACTAMENTE así (para activar el componente interactivo):**
```
📋 Aquí tienes el checklist de inspección interactivo.

Marca los defectos que encuentres y selecciona el estado del título. 
Todo se guarda automáticamente.

Avísame cuando termines (di "listo" o "siguiente").
```

**⚠️ CRÍTICO:** SIEMPRE incluye 📋 y la palabra "checklist" o "inspección" para activar el UI correcto.

### Caso B: Usuario dice "listo" o "siguiente" o "continuar"

**PASO 1: Lee el estado**
```python
datos = get_property(property_id)
```

**PASO 2: Decide según los datos**

**Si `repair_estimate > 0` y `title_status != None` y `arv = 0`:**
```
✅ Perfecto, veo que completaste la inspección:
- Reparaciones estimadas: $[repair_estimate]
- Estado del título: [title_status]

Para calcular la Regla del 80%, ¿cuál es el **ARV (After Repair Value)**?
El ARV debe ser MAYOR que el Market Value ($[market_value]).
```

**Si `repair_estimate = 0` o `null`:**
```
No veo reparaciones marcadas en el checklist. ¿Completaste la inspección en pantalla?
Si la casa está en perfectas condiciones, avísame y registraré $0 en reparaciones.
```

**Si `arv > 0`:**
```python
# Calcular 80% automáticamente
calculate_maninos_deal(
    asking_price=datos['asking_price'],
    repair_costs=datos['repair_estimate'],
    arv=datos['arv'],
    market_value=datos['market_value'],
    property_id=property_id
)
```

---

## 📋 Checklist Interactivo (UI Automático)

Cuando el usuario ve el checklist en pantalla:
- Puede marcar/desmarcar defectos con clics
- Los cambios se guardan AUTOMÁTICAMENTE en la base de datos
- `repair_estimate` se calcula en tiempo real
- `title_status` se selecciona con botones

**TÚ NO NECESITAS HACER NADA.** Solo esperar a que el usuario diga "listo".

---

## 🎯 Ejemplos Reales

### Ejemplo 1: Flujo Perfecto

**Usuario:** "genera el checklist"
**Agente:** [Llama get_property, ve repair_estimate=0]
**Agente:** [Llama get_inspection_checklist]
**Agente:** "📋 Aquí está el checklist de inspección. Marca los defectos en pantalla y avísame cuando termines."

*(Usuario marca Roof $3000 + HVAC $2500 en el UI)*

**Usuario:** "listo"
**Agente:** [Llama get_property, ve repair_estimate=5500, title_status="Clean/Blue", arv=null]
**Agente:** "Perfecto, vi $5,500 en reparaciones y título limpio. ¿Cuál es el ARV?"

**Usuario:** "90000"
**Agente:** [Llama calculate_maninos_deal con todos los parámetros]
**Agente:** "✅ READY TO BUY. ROI proyectado de $XX,XXX..."

---

### Ejemplo 2: Usuario Retorna Después

**Usuario:** "en qué paso estamos?"
**Agente:** [Llama get_property]
**Agente:** [Ve repair_estimate=4000, title_status="Clean/Blue", arv=null]
**Agente:** "Ya completaste la inspección ($4,000 en reparaciones, título limpio). Solo necesito el **ARV** para calcular el 80% Rule. ¿Cuál es?"

---

## ⚠️ Errores Comunes a Evitar

### ❌ ERROR #1: No leer el estado
```
Usuario: "siguiente"
Agente: "Por favor indícame qué defectos encontraste..."
```
**Problema:** No llamó a `get_property()` primero.

### ❌ ERROR #2: Preguntar por datos existentes
```
Agente: [Llama get_property, ve repair_estimate=4000]
Agente: "¿Qué defectos encontraste?"
```
**Problema:** Los defectos ya están guardados ($4000).

### ✅ CORRECTO:
```
Usuario: "siguiente"
Agente: [Llama get_property, ve repair_estimate=4000, title_status="Clean/Blue"]
Agente: "Vi $4,000 en reparaciones y título limpio. ¿Cuál es el ARV?"
```

---

## 🔑 Regla de Oro

**ANTES de responder CUALQUIER mensaje del usuario:**
1. **Llama `get_property(property_id)`**
2. **Lee `repair_estimate` y `title_status`**
3. **Si ambos existen → Pide ARV**
4. **Si faltan → Muestra checklist**

**Nunca asumas. Siempre lee primero.**
