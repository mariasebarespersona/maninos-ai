# Paso 2: Inspection & Data Collection

El usuario va a inspeccionar la mobile home. Tu objetivo: generar el checklist estándar, recopilar defectos y title status, y guardar los resultados.

## ⚠️ PRE-REQUISITO

**Debes validar** que el Paso 1 se completó:
- `acquisition_stage` debe ser `'passed_70_rule'` o superior
- Si no es así, `save_inspection_results` retornará un error
- Solución: Completar Paso 1 primero

## 🔄 Proceso (Flujo Interactivo)

### 2a. Generar Checklist Interactivo

Ejecuta la herramienta para mostrar el checklist:

```python
get_inspection_checklist()
```

**RESPUESTA AL USUARIO**:
Debes invitar al usuario a usar el componente interactivo:
"He generado el **Checklist de Inspección Interactivo**. Por favor, marca los defectos encontrados y selecciona el estado del título en la pantalla. Cuando termines, avísame (di 'listo' o 'ya está') para continuar."

*(Nota: El sistema mostrará un componente visual donde el usuario puede marcar casillas y se guardan automáticamente en la base de datos)*.

### 2b. Confirmar Resultados (Cuando el usuario dice "listo")

Cuando el usuario confirme que ha terminado (ej: "listo", "ya marqué todo"):

1. **Lee los resultados guardados** revisando la propiedad:
   ```python
   get_property(property_id)
   ```
   *Busca `repair_estimate` y `title_status` en la respuesta.*

2. **Confirma con el usuario**:
   "Veo que el costo estimado de reparaciones es **$[repair_estimate]** y el estado del título es **[title_status]**. ¿Es correcto?"

3. **Si falta información** (ej. `repair_estimate` es 0 o `title_status` es None/Pending):
   - Pregunta: "No veo defectos marcados o falta el estado del título. ¿Está la casa en perfectas condiciones y con título limpio?"
   - Si el usuario lo confirma por texto (ej: "Sí, el techo está mal"), usa `save_inspection_results` para guardarlo manualmente.

### 2c. Guardado Manual (Solo si el usuario NO usa el UI)

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

### ERROR 1: Asumir que el usuario siempre escribe los defectos
- **Incorrecto:** "Dime qué defectos encontraste para yo anotarlos."
- **Correcto:** "Usa el checklist en pantalla para marcar los defectos."

### ERROR 2: No validar los datos guardados por el UI
- Siempre llama a `get_property` después de que el usuario diga "listo" para asegurarte de que los datos se guardaron correctamente.

### ERROR 3: Olvidar pedir Title Status
- El UI tiene un selector para Title Status. Verifica que no sea `null` o `Pending`.

## 📝 Template de Respuesta (Confirmación)

```
[✅] He leído los resultados de tu inspección:

📋 Defectos Registrados: [Menciona los defectos o "Ninguno"]
💰 Total Reparaciones: $[repair_estimate]
[✅/⚠️] Title Status: [title_status]

[Si todo está bien]
¿Procedemos a calcular el ARV?
```
