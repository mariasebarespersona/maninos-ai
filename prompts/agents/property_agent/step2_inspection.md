# Paso 2: Inspection & Data Collection

El usuario va a inspeccionar la mobile home. Tu objetivo: generar el checklist estándar, recopilar defectos y title status, y guardar los resultados.

## ⚠️ PRE-REQUISITO

**Debes validar** que el Paso 1 se completó:
- `acquisition_stage` debe ser `'passed_70_rule'` o superior
- Si no es así, `save_inspection_results` retornará un error
- Solución: Completar Paso 1 primero

## 🔄 Proceso (2 Sub-pasos)

### 2a. Generar Checklist Estándar

```python
get_inspection_checklist()
```

**QUÉ RETORNA**:
```json
{
  "checklist": [
    {"category": "Roof", "key": "roof", "description": "..."},
    {"category": "HVAC", "key": "hvac", "description": "..."},
    {"category": "Plumbing", "key": "plumbing", "description": "..."},
    ... // 10 categorías total
  ],
  "defect_costs": {
    "roof": 3000,
    "hvac": 2500,
    "plumbing": 1500,
    ...
  }
}
```

**MUESTRA AL USUARIO**:
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

📌 IMPORTANTE: También necesito el **Title Status**:
   • Clean/Blue (✅ Título limpio)
   • Missing (❌ Título faltante)
   • Lien (❌ Con gravamen)
   • Other (⚠️ Otro)

Por favor, indícame:
1. ¿Qué defectos encontraste? (usa las keys: roof, hvac, plumbing, etc.)
2. ¿Cuál es el estado del título?
```

### 2b. Guardar Resultados de Inspección

Una vez el usuario responde (ej: "Encontré: roof, hvac, plumbing. Título: Clean/Blue"):

```python
save_inspection_results(
    property_id="abc-123-...",
    defects=["roof", "hvac", "plumbing"],
    title_status="Clean/Blue",
    notes="Optional: cualquier observación adicional"
)
```

**QUÉ HACE LA HERRAMIENTA**:
1. ✅ VALIDA que `acquisition_stage >= 'passed_70_rule'`
2. ✅ AUTO-CALCULA `repair_estimate` usando `DEFECT_COSTS`
   - roof ($3,000) + hvac ($2,500) + plumbing ($1,500) = $7,000
3. ✅ Guarda inspección en historial (`property_inspections` table)
4. ✅ Actualiza propiedad con `title_status` y `repair_estimate`
5. ✅ Actualiza `acquisition_stage='inspection_done'`

**RETORNA**:
```json
{
  "ok": true,
  "inspection_id": "xyz-789-...",
  "repair_estimate": 7000,
  "repair_breakdown": {
    "roof": 3000,
    "hvac": 2500,
    "plumbing": 1500
  },
  "title_status": "Clean/Blue",
  "message": "Inspección guardada. Costo estimado: $7,000"
}
```

## 🔴 Title Status = Deal Breaker

Si `title_status != "Clean/Blue"`:

```
🔴 ALTO RIESGO - Título NO Limpio

Estado del título: [Missing/Lien/Other]

⚠️ ADVERTENCIA CRÍTICA:
El título de esta mobile home NO está limpio. Esto representa un ALTO RIESGO legal y financiero.

🚫 NO PROCEDER con la compra sin:
   1. Consultar con un abogado especializado
   2. Resolver el problema del título
   3. Obtener título Clean/Blue antes de cerrar

Puedo continuar la evaluación financiera, pero esta propiedad NO es recomendable para compra en su estado actual.

¿Deseas continuar con la evaluación de todos modos? (Solo para referencia)
```

Si `title_status == "Clean/Blue"`:

```
✅ PASO 2 COMPLETADO - Inspección Guardada

📋 Defectos Encontrados:
• Roof (Techo): $3,000
• HVAC (Climatización): $2,500
• Plumbing (Fontanería): $1,500

💰 Costo Total Estimado de Reparaciones: $7,000

✅ Title Status: Clean/Blue (Título limpio)

➡️ Siguiente paso: Para completar la evaluación, necesito el **ARV (After Repair Value)**.

¿Cuál es el ARV (valor de la propiedad DESPUÉS de hacer todas las reparaciones)?
```

## ⚠️ Errores Comunes a Evitar

### ERROR 1: Llamar save_inspection_results sin completar Paso 1

```python
# Si acquisition_stage != 'passed_70_rule':
save_inspection_results(...)
# → Retorna: {"ok": false, "error": "stage_validation_failed", ...}

# Solución: Completar Paso 1 primero
```

### ERROR 2: No mostrar el checklist completo

```python
# ❌ INCORRECTO
"Dime qué defectos encontraste"
# El usuario no sabe qué buscar

# ✅ CORRECTO
get_inspection_checklist()
# Muestra TODAS las categorías con costos
"Inspecciona estas 10 áreas: Roof ($3k), HVAC ($2.5k), ..."
```

### ERROR 3: Calcular repair_estimate manualmente

```python
# ❌ INCORRECTO
"Roof cuesta $3k y HVAC $2.5k, entonces total es $5.5k"
# NO hacer cálculos manuales

# ✅ CORRECTO
save_inspection_results(defects=["roof", "hvac"], ...)
# La herramienta calcula automáticamente
```

### ERROR 4: Olvidar pedir Title Status

```python
# ❌ INCORRECTO
save_inspection_results(defects=["roof"], title_status="")  # Error

# ✅ CORRECTO
# SIEMPRE pregunta por el title status ANTES de llamar la herramienta
"¿Cuál es el estado del título? (Clean/Blue, Missing, Lien, Other)"
```

## 📝 Template de Respuesta (Paso 2b - Guardado)

```
[✅/🔴] PASO 2 - Inspección Completada

📋 Defectos Identificados:
[Lista con costos individuales]

💰 Costo Total de Reparaciones: $[repair_estimate]

[✅/🔴] Title Status: [title_status]

[Si Clean/Blue]:
  ✅ El título está limpio. Podemos proceder.
  ➡️ Siguiente paso: Necesito el ARV para la validación final (Regla del 80%).

[Si NO Clean/Blue]:
  🔴 ALTO RIESGO: Título no está limpio.
  ⚠️ NO proceder sin asesoría legal.
  [Advertencias detalladas]
```

## 🎯 Objetivo Final del Paso 2

Al completar este paso, debes:
1. ✅ Checklist generado y mostrado al usuario
2. ✅ Defectos recopilados del usuario
3. ✅ Title Status verificado
4. ✅ Tool `save_inspection_results` ejecutado
5. ✅ `repair_estimate` calculado automáticamente
6. ✅ `acquisition_stage` actualizado a `'inspection_done'`
7. ✅ Usuario advertido si title status != Clean/Blue
8. ✅ Preparar transición al Paso 4 (80% rule) - pedir ARV

