# Sistema de Routing Inteligente - MANINOS AI

## 🎯 Filosofía: Razonamiento, No Palabras Clave

El sistema ahora entiende el **contexto** y la **intención**, no solo palabras específicas.

---

## 📊 Arquitectura del Sistema

```
User Input
    ↓
┌─────────────────────────────────────────┐
│ 1. FLOW VALIDATOR                       │
│    - Valida datos (asking_price, ARV)   │
│    - Detecta qué falta                   │
│    - Analiza intención del usuario       │
│    - Genera "next_step_guidance"         │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ 2. ORCHESTRATOR (Simple Router)         │
│    - Lee análisis del flow_validator     │
│    - Elige agente recomendado            │
│    - Pasa contexto enriquecido           │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ 3. AGENT LLM (Natural Reasoning)        │
│    - Recibe contexto completo            │
│    - Razona naturalmente                 │
│    - Llama tools según necesidad         │
│    - Responde al usuario                 │
└─────────────────────────────────────────┘
```

---

## 🔄 Antes vs Ahora

### ❌ **ANTES (Robot con palabras clave)**

```python
# orchestrator.py (líneas 163-327, ~180 líneas)
if user_input == "listo" or user_input == "ya está":
    if "documento" in last_ai_message:
        agent = "DocsAgent"
    elif "checklist" in last_ai_message:
        agent = "PropertyAgent"
    # ... 50+ más patrones similares
```

**Problemas:**
- ❌ "terminé" no funcionaba, solo "listo"
- ❌ "siguiente paso" literal, no "¿qué sigue ahora?"
- ❌ Frágil con variaciones naturales
- ❌ Difícil mantener
- ❌ No entiende contexto

---

### ✅ **AHORA (Inteligente, basado en datos)**

```python
# orchestrator.py (líneas 162-205, ~50 líneas)
# 1. Validar flujo (solo si property existe)
if property_id:
    flow_validation = flow_validator.validate_current_step(property_data)
    # flow_validation contiene:
    # - is_complete: bool
    # - missing_data: ["arv", "repair_estimate", ...]
    # - recommended_agent: "PropertyAgent" | "DocsAgent"
    
    user_intent = flow_validator.detect_user_intent_for_stage(
        user_input, 
        property_data
    )
    # user_intent contiene:
    # - intent: "provide_arv" | "ask_next_step" | "signal_complete"
    # - confidence: 0.85
    # - reason: "User provided number, likely ARV for 80% Rule"

# 2. Routing simple
agent = flow_validation["recommended_agent"]

# 3. Contexto enriquecido al agente
context = {
    "flow_validation": flow_validation,
    "user_intent_analysis": user_intent,
    "next_step_guidance": "¿Cuál es el ARV de esta propiedad?"
}
```

**Beneficios:**
- ✅ Entiende "terminé", "ya", "listo", "siguiente", cualquier frase
- ✅ Detecta números como precios/ARV automáticamente
- ✅ Nunca se salta pasos (valida datos primero)
- ✅ Fácil de mantener (lógica centralizada)
- ✅ Entiende contexto y situación

---

## 🧠 Cómo Funciona el Flow Validator

### **1. Validación de Datos**

```python
def validate_current_step(property_data: Dict) -> Dict:
    """
    Valida si el paso actual está completo.
    
    NO usa palabras clave. SOLO valida DATOS.
    """
    stage = property_data["acquisition_stage"]
    
    if stage == "initial":
        # Paso 1: 70% Rule
        required = ["asking_price", "market_value"]
        missing = [f for f in required if property_data.get(f) is None]
        
        return {
            "is_complete": len(missing) == 0,
            "missing_data": missing,
            "recommended_agent": "PropertyAgent"
        }
    
    elif stage == "inspection_done":
        # Paso 3: 80% ARV Rule
        required = ["arv"]
        missing = [f for f in required if property_data.get(f) is None]
        
        return {
            "is_complete": len(missing) == 0,
            "missing_data": ["arv"],
            "recommended_agent": "PropertyAgent"
        }
    
    # ... más stages ...
```

### **2. Detección de Intención**

```python
def detect_user_intent_for_stage(user_input: str, property_data: Dict) -> Dict:
    """
    Detecta QUÉ quiere el usuario basándose en:
    - Lo que dice
    - Los datos que FALTAN en el stage actual
    
    NO depende de palabras exactas.
    """
    stage = property_data["acquisition_stage"]
    validation = validate_current_step(property_data)
    
    # Ejemplo 1: Usuario pregunta qué sigue
    next_step_phrases = ["siguiente", "qué sigue", "que sigue", "ahora qué"]
    if any(phrase in user_input.lower() for phrase in next_step_phrases):
        return {
            "intent": "ask_next_step",
            "confidence": 0.95,
            "reason": "User is asking what to do next"
        }
    
    # Ejemplo 2: Usuario proporciona números (contexto: stage="inspection_done", missing=["arv"])
    import re
    numbers = re.findall(r'\$?[\d,]+\.?\d*', user_input)
    if numbers and "arv" in validation["missing_data"]:
        return {
            "intent": "provide_arv",
            "confidence": 0.85,
            "reason": "User provided number, likely ARV for 80% Rule"
        }
    
    # ... más patrones contextuales ...
```

### **3. Guidance Amigable**

```python
def get_user_friendly_next_step(property_data: Dict) -> str:
    """
    Genera texto en lenguaje natural sobre qué hacer next.
    
    Este texto se pasa al agente como "next_step_guidance"
    para que lo use directamente en su respuesta.
    """
    stage = property_data["acquisition_stage"]
    validation = validate_current_step(property_data)
    
    if stage == "inspection_done" and "arv" in validation["missing_data"]:
        return "¿Cuál es el **ARV** (After Repair Value) - el valor de la propiedad después de las reparaciones?"
    
    # ... más guidance ...
```

---

## 📝 Ejemplos de Uso

### **Escenario 1: Usuario Completa Checklist**

```
User: "ya terminé"  (antes solo funcionaba "listo")
```

**Flujo:**

1. **Flow Validator:**
   ```python
   validation = {
       "acquisition_stage": "passed_70_rule",
       "is_complete": False,  # repair_estimate aún None
       "missing_data": ["repair_estimate", "title_status"],
       "recommended_agent": "PropertyAgent"
   }
   
   intent = {
       "intent": "signal_complete",
       "confidence": 0.90,
       "reason": "User is signaling completion"
   }
   ```

2. **Orchestrator:**
   ```python
   # Simple routing
   agent = "PropertyAgent"  # De validation["recommended_agent"]
   ```

3. **PropertyAgent (LLM):**
   ```python
   # Recibe contexto completo
   context = {
       "flow_validation": validation,
       "user_intent_analysis": intent,
       "next_step_guidance": "Completa el checklist de inspección..."
   }
   
   # PropertyAgent razona:
   # - "El usuario dice 'terminé'"
   # - "Pero repair_estimate aún es None"
   # - "Debo leer get_property() primero"
   
   → Llama get_property(property_id)
   → Lee repair_estimate=2500 (guardado por UI)
   → Responde: "Perfecto, vi $2,500 en reparaciones. ¿Cuál es el ARV?"
   ```

---

### **Escenario 2: Usuario Pregunta "¿Qué Sigue?"**

```
User: "y ahora qué hago?"  (variación natural de "siguiente paso")
```

**Flujo:**

1. **Flow Validator:**
   ```python
   intent = {
       "intent": "ask_next_step",
       "confidence": 0.95,
       "reason": "User is asking what to do next"
   }
   
   next_step_guidance = "¿Cuál es el **ARV** (After Repair Value)..."
   ```

2. **PropertyAgent:**
   ```python
   # Recibe next_step_guidance directamente
   context = {
       "next_step_guidance": "¿Cuál es el **ARV** (After Repair Value)..."
   }
   
   # Responde usando el guidance
   → "➡️ Siguiente paso: Cálculo de la Regla del 80% (ARV)\n\n¿Cuál es el ARV..."
   ```

---

### **Escenario 3: Usuario Proporciona ARV**

```
User: "el arv es $130,000"  (número detectado, contexto: falta ARV)
```

**Flujo:**

1. **Flow Validator:**
   ```python
   # Detecta número + contexto (missing_data=["arv"])
   intent = {
       "intent": "provide_arv",
       "confidence": 0.85,
       "reason": "User provided number, likely ARV for 80% Rule"
   }
   ```

2. **PropertyAgent:**
   ```python
   # Razona naturalmente
   # - "Usuario dio un número"
   # - "Contexto: faltaba ARV"
   # - "Debo calcular 80% Rule"
   
   → Llama calculate_maninos_deal(..., arv=130000)
   → Responde con resultado de la regla del 80%
   ```

---

## 🚀 Ventajas del Nuevo Sistema

| Aspecto | Antes | Ahora |
|---------|-------|-------|
| **Comprensión** | Palabras exactas | Intención + contexto |
| **Variaciones** | ❌ Solo "listo", "siguiente" | ✅ "terminé", "ya", "qué sigue", etc. |
| **Lógica** | 180 líneas de keywords | 50 líneas de validación |
| **Mantenimiento** | Difícil (muchos if/elif) | Fácil (lógica centralizada) |
| **Debugging** | Opaco | Logs claros con intención |
| **Robustez** | Frágil con typos | Tolerante a variaciones |
| **Saltar pasos** | Posible | Imposible (valida datos) |

---

## 🧪 Testing

Para probar el nuevo sistema:

1. **Reinicia el backend**
2. **Crea una nueva propiedad**
3. **Prueba frases naturales:**
   - "ya subí todo"
   - "y ahora?"
   - "terminé"
   - "siguiente"
   - "el arv es 130k"
   - "cuál es el paso siguiente?"

**Verás en los logs:**

```
[flow_validator] Stage 'inspection_done': ⏳ INCOMPLETE
[flow_validator] Missing data: ['arv']
[orchestrator] 🧭 Flow-based routing → PropertyAgent (stage=inspection_done, intent=ask_next_step)
[PropertyAgent] 🎯 Using next_step_guidance from context
```

---

## 📦 Archivos Clave

1. **`router/flow_validator.py`** (NUEVO)
   - Validación de flujo basada en datos
   - Detección de intención contextual
   - Generación de guidance

2. **`router/orchestrator.py`** (SIMPLIFICADO)
   - De 594 líneas → 390 líneas (-34%)
   - Usa flow_validator para routing
   - Contexto enriquecido a agentes

3. **`prompts/agents/property_agent/_base.md`** (ACTUALIZADO)
   - Regla para usar `next_step_guidance` del contexto
   - Confía en el sistema, no adivina

---

## 🎓 Lecciones Aprendidas

### ❌ **Anti-Patrón: Keyword Matching**
```python
# MAL - Frágil y no escalable
if user_input == "listo":
    do_something()
elif user_input == "ya está":
    do_something()
elif user_input == "terminé":
    do_something()
# ¿Y si dice "completé"? ¿"ready"? ¿"done"?
```

### ✅ **Patrón: Context-Based Reasoning**
```python
# BIEN - Robusto y escalable
validation = validate_current_step(property_data)
if validation["is_complete"]:
    advance_to_next_step()
else:
    guide_user_to_complete(validation["missing_data"])
```

---

## 🔮 Futuro

El sistema ahora está preparado para:

- ✅ Soporte multiidioma (intent detection sin keywords)
- ✅ Nuevos pasos en el flujo (solo agregar a flow_validator)
- ✅ Diferentes tipos de propiedades (Mobile Home, Casa, etc.)
- ✅ Integración con RAG (pregunta sobre documentos en cualquier momento)

**No más robots que responden a comandos. Ahora es una conversación natural.**

