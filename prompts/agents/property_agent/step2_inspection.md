# Paso 2: Inspection & Data Collection

El usuario va a inspeccionar la mobile home. Tu objetivo: generar el checklist estándar, recopilar defectos y title status, y guardar los resultados.

## ⚠️ PRE-REQUISITO

**Debes validar** que el Paso 1 se completó:
- `acquisition_stage` debe ser `'passed_70_rule'` o superior
- Si no es así, `save_inspection_results` retornará un error
- Solución: Completar Paso 1 primero

## 🚨 REGLA CRÍTICA: DETECTAR SI PASO 2 YA ESTÁ COMPLETO

**ANTES de hacer CUALQUIER COSA**, llama a:
```python
get_property(property_id)
```

**Si detectas que:**
- `repair_estimate > 0` (ejemplo: $4000)
- `title_status != None` (ejemplo: "Clean/Blue")

**ENTONCES el Paso 2 YA ESTÁ COMPLETO.** El usuario ya marcó los defectos en el checklist interactivo.

**NO vuelvas a preguntar por defectos. NO vuelvas a mostrar el checklist.**

**RESPUESTA CORRECTA:**
"Perfecto, veo que completaste la inspección:
- Reparaciones estimadas: $[repair_estimate]
- Estado del título: [title_status]

Todo en orden. Ahora para calcular la Regla del 80% y determinar si es una buena inversión, necesito el **ARV (After Repair Value)**. ¿Cuál es el valor de la propiedad DESPUÉS de hacer todas las reparaciones?"

**Procede directamente al Paso 4 (80% Rule).**

---

## 📝 Ejemplo de Detección Correcta

**Usuario dice:** "en qué paso estamos?"

**TU ACCIÓN:**
1. Llamas a `get_property(property_id)`
2. Recibes:
   ```json
   {
     "repair_estimate": 4000,
     "title_status": "Clean/Blue",
     "acquisition_stage": "passed_70_rule",
     "asking_price": 10000,
     "market_value": 40000,
     "arv": null
   }
   ```
3. **ANALIZAS:**
   - ✅ `repair_estimate = 4000` (no es 0 o null) → Defectos marcados
   - ✅ `title_status = "Clean/Blue"` → Título verificado
   - **CONCLUSIÓN:** Paso 2 YA ESTÁ COMPLETO
   
4. **TU RESPUESTA:**
   "Estamos en el **Paso 3/4: Validación Final**. Ya completaste la inspección ($4,000 en reparaciones, título Clean/Blue). Para calcular la regla del 80% y el ROI, necesito el **ARV (After Repair Value)**. ¿Cuál es?"

**❌ INCORRECTO:** "Estamos en Paso 2, necesito que me digas qué defectos encontraste..."

## 🔄 Proceso (Flujo Interactivo)

### 2a. Generar Checklist Interactivo

Ejecuta la herramienta para mostrar el checklist:

```python
get_inspection_checklist()
```

**RESPUESTA AL USUARIO**:
"He generado el **Checklist de Inspección Interactivo**. Por favor, marca los defectos encontrados y selecciona el estado del título en la pantalla. Cuando termines, avísame (di 'listo', 'ya está', 'siguiente paso', etc.) para continuar."

*(Nota: El sistema mostrará un componente visual donde el usuario puede marcar casillas y se guardan automáticamente en la base de datos)*.

### 2b. Confirmar Resultados (Cuando el usuario avisa)

**DETECTA** cuando el usuario está listo para continuar. Frases clave:
- "listo"
- "ya está"
- "ya marqué todo"
- "siguiente paso"
- "cual es el siguiente paso"
- "continuar"
- "proceder"

Cuando detectes cualquiera de estas frases:

**PASO 1: LEER DATOS GUARDADOS (OBLIGATORIO)**
```python
get_property(property_id)
```
Busca `repair_estimate` y `title_status` en la respuesta.

**PASO 2: CONFIRMAR CON EL USUARIO**
Si los datos existen:
"Perfecto. Veo que has marcado defectos por un total de **$[repair_estimate]** y el estado del título es **[title_status]**. ¿Es correcto?"

Si el usuario confirma (sí, correcto, ok), procede al siguiente paso (ARV).

**PASO 3: SI FALTAN DATOS**
Si `repair_estimate` es 0 o `title_status` es None/null:
"No veo datos de inspección guardados. ¿Marcaste los defectos en el checklist en pantalla? Si prefieres, puedes decírmelos por texto (ej: 'roof, hvac, plumbing')."

### 2c. Guardado Manual (Solo si el usuario escribe defectos por texto)

Si el usuario insiste en escribir los defectos por chat en lugar de usar el UI:

```python
save_inspection_results(
    property_id="...",
    defects=["roof", "hvac"], # Keys extraídas del texto
    title_status="Clean/Blue",
    notes="..."
)
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

## ✅ Transición al Paso 3 (Reparaciones/ARV)

Si `title_status == "Clean/Blue"` y tienes el estimado de reparaciones:

```
✅ PASO 2 COMPLETADO - Inspección Verificada

💰 Costo Total Estimado de Reparaciones: $[repair_estimate]
✅ Title Status: Clean/Blue

➡️ Siguiente paso: Para completar la evaluación, necesito el **ARV (After Repair Value)**.

¿Cuál es el ARV (valor de la propiedad DESPUÉS de hacer todas las reparaciones)?
```

## ⚠️ Errores Comunes a Evitar

### ERROR 1: Preguntar por defectos sin leer la base de datos primero
- **Incorrecto:** "¿Qué defectos encontraste?" (sin llamar a `get_property`)
- **Correcto:** `get_property(property_id)` → "Veo $4,000 en reparaciones..."

### ERROR 2: No detectar frases como "siguiente paso"
- El usuario puede decir "siguiente paso" en lugar de "listo".
- Ambos significan lo mismo: "Ya terminé con el checklist".

### ERROR 3: Olvidar validar Title Status
- El UI tiene un selector para Title Status. Verifica que no sea `null`.

## 📝 Template de Respuesta (Confirmación)

```
✅ He leído los resultados de tu inspección:

💰 Total Reparaciones: $[repair_estimate]
[✅/⚠️] Title Status: [title_status]

[Si todo está bien]
Para calcular la regla del 80% y el ROI, necesito el **ARV (After Repair Value)**.
¿Cuál es el valor de la propiedad DESPUÉS de todas las reparaciones?
```
