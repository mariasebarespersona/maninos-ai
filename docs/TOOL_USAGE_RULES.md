# Tool Usage Rules - MANINOS AI Agent

Este documento resume las reglas OBLIGATORIAS para el uso de herramientas (tools) por parte del PropertyAgent.

---

## 🚨 REGLA #1: NUNCA RESPONDAS SIN TOOL CALLS

**Si existe un tool para una acción, SIEMPRE llámalo. NUNCA simules la acción con solo texto.**

### ❌ Comportamiento INCORRECTO:

```
Usuario: "Precio $10,000, market value $40,000"
Agent: "El 70% de $40,000 es $28,000, así que tu precio está bien..."
```

**Por qué está mal:**
- Los datos NO se guardan en la base de datos
- El `acquisition_stage` NO se actualiza
- El UI NO se sincroniza
- Los cálculos pueden tener errores humanos

### ✅ Comportamiento CORRECTO:

```
Usuario: "Precio $10,000, market value $40,000"
Agent: [LLAMA calculate_maninos_deal(10000, 40000, property_id)]
Agent: "✅ Regla del 70% PASADA. El precio está muy por debajo del límite..."
```

**Por qué está bien:**
- ✅ Datos guardados automáticamente en BD
- ✅ Stage actualizado a "passed_70_rule"
- ✅ UI sincronizado en tiempo real
- ✅ Cálculos precisos y consistentes

---

## 📋 TOOLS OBLIGATORIOS POR SITUACIÓN

| Situación del Usuario | Tool Obligatorio | Argumentos Requeridos |
|----------------------|------------------|---------------------|
| Menciona dirección nueva | `add_property` | name, address |
| Da asking_price + market_value | `calculate_maninos_deal` | asking_price, market_value, property_id |
| Confirma generar checklist | `get_inspection_checklist` | (ninguno) |
| Dice "listo" tras inspección | `get_property` | property_id |
| Proporciona el ARV | `calculate_maninos_deal` | asking_price, repair_costs, arv, market_value, property_id |
| Pide generar contrato | `generate_buy_contract` | property_id, buyer_name, seller_name |
| Pregunta "en qué paso estamos" | `get_property` | property_id |

---

## 🔄 FLUJO DE PENSAMIENTO CORRECTO

Cada vez que el usuario envía un mensaje, el agente debe seguir este flujo:

```
1. ¿Hay property_id activo?
   NO → ¿Usuario mencionó dirección?
       SÍ → CALL: add_property(name, address)
       NO → PEDIR: dirección de la propiedad
   
   SÍ → CALL: get_property(property_id) para leer estado actual

2. Analizar el estado actual:
   - acquisition_stage = ?
   - ¿Qué datos faltan? (asking_price, market_value, arv, repair_estimate, title_status)

3. Determinar la acción basada en la TABLA DE DECISIÓN:
   
   Si usuario dio PRECIOS → CALL: calculate_maninos_deal(...)
   Si usuario dijo "sí" al checklist → CALL: get_inspection_checklist()
   Si usuario dio ARV → CALL: get_property() + calculate_maninos_deal(...con ARV)
   Si usuario pide contrato → CALL: generate_buy_contract(...)
   Si faltan datos → PEDIR al usuario (NO calcular manualmente)

4. Presentar resultado del tool de forma natural (NO recalcular)
```

---

## ⚠️ COMPORTAMIENTOS PROHIBIDOS

### ❌ NUNCA hagas esto:

1. **Calcular manualmente la regla del 70% o 80%**
   ```
   ❌ "El 70% de $40,000 es $28,000..."
   ✅ [Llama calculate_maninos_deal] → "Regla del 70% PASADA"
   ```

2. **Generar checklists manualmente**
   ```
   ❌ "Aquí está el checklist: 1. Roof 2. HVAC..."
   ✅ [Llama get_inspection_checklist()] → Muestra resultado estructurado
   ```

3. **Asumir valores de la base de datos sin leerlos**
   ```
   ❌ "Como vimos antes, el precio era $10,000..."
   ✅ [Llama get_property()] → Lee el precio actual de la BD
   ```

4. **Generar contratos con solo texto**
   ```
   ❌ "Aquí está el contrato: [texto inventado]..."
   ✅ [Llama generate_buy_contract()] → Contrato oficial guardado en BD
   ```

5. **Responder sin verificar el estado actual**
   ```
   ❌ "Estamos en el paso 2..."
   ✅ [Llama get_property()] → Lee acquisition_stage de la BD
   ```

---

## ✅ GARANTÍAS DE LOS TOOLS

Cuando usas tools correctamente:

1. **Persistencia Automática**
   - Todos los datos se guardan en PostgreSQL (Supabase)
   - Nada se pierde si el backend se reinicia

2. **Sincronización UI**
   - El sidebar derecho se actualiza automáticamente
   - El stepper muestra el paso correcto
   - Los KPIs financieros se reflejan en tiempo real

3. **Validación Automática**
   - Los tools validan que los datos sean correctos
   - Retornan errores si falta información crítica
   - Previenen estados inconsistentes

4. **Cálculos Precisos**
   - Los costos de reparación se calculan desde `DEFECT_COSTS`
   - Las reglas del 70% y 80% son exactas
   - El ROI se calcula automáticamente

5. **Auditoría Completa**
   - Cada tool call queda registrado en logs
   - Los stages se actualizan en orden
   - Las inspecciones tienen historial completo

---

## 🎯 EJEMPLOS DE TOOL USAGE CORRECTO

### Ejemplo 1: Crear Propiedad

```python
# Usuario: "Evaluar mobile home en 123 Main St"

# ✅ CORRECTO:
CALL: add_property(name="123 Main St", address="123 Main St")
RESULT: {"ok": true, "property": {"id": "abc-123", ...}}
RESPONSE: "He creado la propiedad '123 Main St'. ¿Cuál es el precio de venta?"

# ❌ INCORRECTO:
RESPONSE: "Para evaluar necesito el precio..." [SIN crear propiedad]
```

### Ejemplo 2: Calcular 70% Rule

```python
# Usuario: "Precio $10,000, market value $40,000"

# ✅ CORRECTO:
CALL: calculate_maninos_deal(
    asking_price=10000, 
    market_value=40000, 
    property_id="abc-123"
)
RESULT: {"status": "Proceed to Inspection", "checks": {"70_percent_rule": "PASS"}}
RESPONSE: "✅ Regla del 70% PASADA..."

# ❌ INCORRECTO:
RESPONSE: "El 70% de $40,000 es $28,000..." [SIN llamar tool]
```

### Ejemplo 3: Calcular 80% Rule

```python
# Usuario: "ARV es $90,000"

# ✅ CORRECTO:
STEP 1: get_property(property_id) → Lee repair_estimate de la BD
STEP 2: calculate_maninos_deal(
    asking_price=10000,
    repair_costs=4000,  # Del get_property
    arv=90000,
    market_value=40000,
    property_id="abc-123"
)
RESULT: {"status": "Ready to Buy", "checks": {"80_percent_rule": "PASS"}}
RESPONSE: "🟢 READY TO BUY! La regla del 80% PASÓ..."

# ❌ INCORRECTO:
RESPONSE: "Perfecto, con $90,000 de ARV la inversión total sería..." [SIN llamar tool]
```

### Ejemplo 4: Generar Contrato

```python
# Usuario: "Genera el contrato"

# ✅ CORRECTO:
STEP 1: get_property(property_id) → Valida stage == "passed_80_rule"
STEP 2: generate_buy_contract(
    property_id="abc-123",
    buyer_name="MANINOS HOMES LLC",
    seller_name="John Doe"
)
RESULT: {"ok": true, "contract_text": "...", "contract_id": "xyz-789"}
RESPONSE: "📄 Contrato generado y guardado en la BD..."

# ❌ INCORRECTO:
RESPONSE: "Aquí está el contrato: [texto]..." [SIN llamar tool, SIN guardar en BD]
```

---

## 📊 MÉTRICAS DE CUMPLIMIENTO

Para evaluar si el agente está usando tools correctamente:

### ✅ Indicadores Positivos:
- Cada respuesta con análisis está precedida por un tool call
- El `acquisition_stage` avanza correctamente en la BD
- Los datos persisten tras reiniciar el backend
- El UI se sincroniza automáticamente

### ❌ Indicadores Negativos:
- El agente responde con cálculos sin llamar tools
- Los datos no aparecen en el sidebar
- El stage no avanza aunque el usuario completó pasos
- Los precios/valores no se guardan en la BD

---

## 🎓 RESUMEN EJECUTIVO

**Tu trabajo como agente NO es calcular, es ORQUESTAR TOOLS.**

Los tools son especializados y garantizan:
- ✅ Persistencia en base de datos
- ✅ Sincronización con UI
- ✅ Cálculos precisos
- ✅ Validación de datos
- ✅ Actualización de stages

**Regla de oro:**
> "Si hay un tool para eso, ÚSALO. Si dudas si debes llamar un tool, LLÁMALO. Es mejor llamar un tool de más que olvidar llamarlo y romper la aplicación."

**NUNCA:**
- ❌ Simules cálculos con solo texto
- ❌ Generes contenido sin llamar el tool correspondiente
- ❌ Asumas valores sin leer la base de datos
- ❌ Respondas "he calculado..." sin haber llamado al tool

**SIEMPRE:**
- ✅ Llama al tool correspondiente primero
- ✅ Espera el resultado del tool
- ✅ Presenta el resultado de forma natural
- ✅ Confía en los tools para mantener consistencia

