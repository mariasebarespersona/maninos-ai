# Arquitectura de Routing - MANINOS AI

**Última actualización**: 2025-01-04

---

## 🏗️ Los 3 Componentes del Sistema de Routing

### 📊 Tabla Comparativa

| Archivo | Rol | Estado | Usado Por | Líneas |
|---------|-----|--------|-----------|--------|
| **`router/scaffold.py`** | Router legacy simple | ❌ ELIMINADO | Nadie (código muerto) | 39 |
| **`router/active_router.py`** | Clasificador de intents | ✅ ACTIVO | orchestrator.py | ~800 |
| **`router/orchestrator.py`** | Orquestador principal | ✅ ACTIVO | app.py | ~470 |

---

## 🎯 1. active_router.py (CLASIFICADOR)

**Responsabilidad**: **"¿QUÉ quiere hacer el usuario?"**

### Funcionalidad

Clasifica el input del usuario en un **intent** específico:

```python
Input:  "Evaluar mobile home precio 30k, mercado 50k"
Output: {
  "intent": "property.acquisition",
  "confidence": 0.95,
  "target_agent": "PropertyAgent",
  "method": "keywords"
}
```

### Métodos

#### **Fast Path** (~0ms):
```python
predict_keywords(text, context)
```
- Busca keywords en el texto
- Ejemplos: "evaluar" → property.acquisition
- "checklist" → property.acquisition
- "arv" → property.acquisition

#### **Slow Path** (~200ms):
```python
predict_llm(text, context)
```
- Usa GPT-4o-mini para clasificar casos ambiguos
- Se activa si confidence < 0.70
- Más preciso pero más lento

#### **Hybrid** (recomendado):
```python
predict(text, context)
```
- Intenta keywords primero
- Si confidence < 0.70 → fallback a LLM
- Balance entre velocidad y precisión

---

## 🎭 2. orchestrator.py (ORQUESTADOR)

**Responsabilidad**: **"¿CÓMO ejecuto la tarea?"**

### Funcionalidad

Coordina todo el flujo de ejecución:

```python
async def route_and_execute(user_input, session_id, property_id):
    # 1. Cargar contexto
    context = load_context(session_id, property_id)
    
    # 2. Detectar continuación de conversación
    if is_continuation(context):
        agent = same_as_last_turn
    else:
        # 3. Clasificar intent
        routing = await active_router.decide(user_input, context)
        agent = routing["target_agent"]
    
    # 4. Ejecutar agente especializado
    result = agent.run(user_input, property_id, context)
    
    # 5. Manejar redirects (si el agente necesita otro agente)
    while result.action == "redirect":
        agent = get_agent(result.target_agent)
        result = agent.run(...)
    
    # 6. Retornar respuesta
    return result
```

### Características Clave

#### **Continuación de Conversación** 🔄
```python
Agent: "¿Cuál es el ARV?"
User: "65000"  ← NO re-clasificar, continuar con PropertyAgent
```

Detecta patrones:
- Confirmaciones: "sí", "no", "confirmo"
- Respuestas a preguntas: Detecta que el agente hizo una pregunta
- Templates/estrategias: Detecta respuestas a opciones

#### **Redirects entre Agentes** 🔁
```python
PropertyAgent → "necesito DocAgent para extraer datos de PDF"
  ↓
Orchestrator redirige a DocsAgent
  ↓
DocsAgent extrae datos y retorna a PropertyAgent
```

#### **Loop Prevention** 🛡️
```python
max_redirects = 3  # Previene loops infinitos
```

---

## 🗑️ 3. scaffold.py (ELIMINADO)

**Estado**: ❌ **Código muerto** - Ya no existe

**Era**: Router simple con keywords básicos  
**Reemplazado por**: `active_router.py` (mucho más robusto)

---

## 🔄 Flujo Completo con Ejemplo Real

### Escenario: Usuario evalúa mobile home

```
1️⃣ USER INPUT
   "Evaluar mobile home precio 30k, mercado 50k"
        ↓
2️⃣ app.py (/ui_chat endpoint)
   • Recibe request POST
   • Extrae: text, session_id, property_id
        ↓
3️⃣ orchestrator.py
   • Carga historial de conversación desde LangGraph
   • NO detecta continuación (es nuevo input)
   • Llama: active_router.decide(text, context)
        ↓
4️⃣ active_router.py
   • predict_keywords(): Busca "evaluar", "precio", "mercado"
   • Encuentra match: property.acquisition
   • Confidence: 0.95 (alta)
   • Returns: {
       "intent": "property.acquisition",
       "target_agent": "PropertyAgent",
       "confidence": 0.95
     }
        ↓
5️⃣ orchestrator.py (continúa)
   • Enruta a PropertyAgent
   • Pasa intent="property.acquisition" en context
        ↓
6️⃣ agents/property_agent.py
   • get_system_prompt(intent="property.acquisition")
   • prompt_loader carga:
     - prompts/agents/property_agent/_base.md
     - prompts/agents/property_agent/examples.md (porque intent tiene "acquisition")
   • Ejecuta con LangGraph
   • LLM decide: Llamar calculate_maninos_deal(30k, 50k, property_id)
        ↓
7️⃣ agentic.py (LangGraph Coordinator)
   • assistant_node: Procesa tool call
   • tools_with_validation: Valida con validate_tool_call()
   • Ejecuta tool
   • Retorna resultado
        ↓
8️⃣ PropertyAgent interpreta resultado
   • Ve: {"70_percent_rule": "PASS"}
   • Genera respuesta: "✅ PASO 1 COMPLETADO..."
   • Returns: {"action": "complete", "response": "..."}
        ↓
9️⃣ orchestrator.py
   • Detecta action="complete"
   • Retorna respuesta final a app.py
        ↓
🔟 app.py
   • Retorna JSON response al frontend
        ↓
1️⃣1️⃣ FRONTEND
   • Muestra mensaje del agent en la UI
```

---

## 📋 RESUMEN EJECUTIVO

### ¿Cuál es la diferencia?

| Componente | Pregunta que responde | Output |
|------------|----------------------|--------|
| **`active_router.py`** | "¿QUÉ quiere hacer el usuario?" | Intent + Agente |
| **`orchestrator.py`** | "¿CÓMO ejecuto la tarea?" | Respuesta final |
| ~~`scaffold.py`~~ | ~~Router legacy~~ | ❌ Eliminado |

### Analogía

Imagina un restaurante:

- **`active_router.py`** = **Recepcionista**
  - Escucha al cliente: "Quiero pasta carbonara"
  - Clasifica: `intent="order.pasta"` → Chef de pastas

- **`orchestrator.py`** = **Gerente**
  - Coordina: Envía orden al chef correcto
  - Maneja: Si el chef necesita ingredientes del almacén
  - Retorna: Plato terminado al cliente

- ~~`scaffold.py`~~ = ~~Menú viejo~~ ❌ Ya no se usa

---

## ✅ CAMBIOS APLICADOS

1. ✅ Eliminado import de `scaffold.py` en `app.py`
2. ✅ Eliminado instanciación `router = Router()` en `app.py`
3. ✅ `scaffold.py` ya no existe en el proyecto
4. ✅ Documentación creada: `docs/ROUTING_ARCHITECTURE.md`

---

## 🧪 Verificación

El sistema ahora usa **SOLO**:
- ✅ `active_router.py` (clasificación de intents)
- ✅ `orchestrator.py` (ejecución y coordinación)

**Código muerto eliminado**: ❌ `scaffold.py`

---

**¿Deseas que pruebe el backend ahora para verificar que todo funciona correctamente?** 🚀
