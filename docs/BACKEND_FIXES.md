# 🔧 BACKEND FIXES - Post Cleanup

**Date**: 2025-12-09  
**Context**: Errores encontrados después de la limpieza RAMA → MANINOS

---

## 🐛 ERRORES ENCONTRADOS Y SOLUCIONADOS

### **Error 1: `base_agent.py` - UnboundLocalError con HumanMessage**

**Error**:
```python
UnboundLocalError: cannot access local variable 'HumanMessage' 
where it is not associated with a value

File "agents/base_agent.py", line 449
    messages.append(HumanMessage(content=user_input))
                    ^^^^^^^^^^^^
```

**Causa**: 
- En línea 10 se importa `HumanMessage`
- En línea 454 se reimporta como `AIMessage as LCAIMessage`
- Python piensa que `HumanMessage` es local (shadowing)

**Fix**:
```python
# ANTES (línea 449):
messages.append(HumanMessage(content=user_input))

# DESPUÉS (líneas 449-451):
from langchain_core.messages import HumanMessage as LCHumanMessage
messages.append(LCHumanMessage(content=user_input))
```

**Archivo**: `agents/base_agent.py` ✅

---

### **Error 2: `agentic.py` - KeyError 'messages'**

**Error**:
```python
KeyError: 'messages'

File "agentic.py", line 73, in assistant_node
    msgs = state["messages"]
           ~~~~~^^^^^^^^^^^^
```

**Causa**:
- `app.py` pasa state con formato: `{"input": "text", ...}`
- `agentic.py` espera formato: `{"messages": [...], ...}`
- El nodo `prepare_input` que hacía la conversión NO existía

**Fix 1: Agregar `input` al AgentState**:
```python
class AgentState(TypedDict):
    input: str | None  # NEW - Initial user input
    messages: List[Any]
    property_id: str | None
    # ...
```

**Fix 2: Crear nodo `prepare_input`**:
```python
def prepare_input(state: AgentState) -> AgentState:
    """Convert input string to HumanMessage if needed."""
    if state.get("input") and not state.get("messages"):
        from langchain_core.messages import HumanMessage
        return {
            **state,
            "messages": [HumanMessage(content=state["input"])],
            "input": None
        }
    return state
```

**Fix 3: Actualizar graph flow**:
```python
# ANTES:
graph.set_entry_point("assistant")

# DESPUÉS:
graph.set_entry_point("prepare_input")
graph.add_edge("prepare_input", "assistant")
```

**Fix 4: Hacer msgs.get() safe**:
```python
# ANTES:
msgs = state["messages"]  # KeyError si no existe

# DESPUÉS:
msgs = state.get("messages", [])  # Safe default
```

**Archivo**: `agentic.py` ✅

---

### **Error 3: `property_tools.py` - Función faltante**

**Error**:
```python
ImportError: cannot import name 'update_property_fields' 
from 'tools.property_tools'
```

**Causa**:
- `test_maninos_flow.py` importaba `update_property_fields`
- La función NO existía en `property_tools.py`

**Fix**: Agregada función `update_property_fields`:
```python
def update_property_fields(property_id: str, fields: Dict) -> Dict:
    """Update multiple fields of a property at once."""
    fields_copy = fields.copy()
    fields_copy["updated_at"] = "NOW()"
    
    r = sb.table("properties").update(fields_copy).eq("id", property_id).execute()
    
    if r.data and len(r.data) > 0:
        return {"ok": True, "property": r.data[0]}
    else:
        return {"ok": False, "error": "Property not found"}
```

**Archivo**: `tools/property_tools.py` ✅

---

### **Error 4: `inspection_tools.py` - Stage validation**

**Error**:
```python
# get_acquisition_stage() devuelve Dict
current_stage = get_acquisition_stage(property_id)
# → {"acquisition_stage": "passed_70_rule"}

# Pero el código esperaba string
if current_stage not in ['passed_70_rule', ...]:  # ❌ Falla
```

**Causa**:
- `get_acquisition_stage` fue cambiado para devolver Dict
- `save_inspection_results` esperaba string directamente

**Fix**:
```python
# ANTES:
current_stage = get_acquisition_stage(property_id)
if current_stage not in ['passed_70_rule', ...]:

# DESPUÉS:
current_stage_dict = get_acquisition_stage(property_id)
current_stage = current_stage_dict.get('acquisition_stage') if current_stage_dict else None
if current_stage not in ['passed_70_rule', ...]:
```

**Archivo**: `tools/inspection_tools.py` ✅

---

### **Error 5: `property_tools.py` - add_property con RAMA schema**

**Error**:
```
ERROR: Could not find the function public.ensure_documents_schema_v2
ERROR: Could not find the function public.seed_documents_v3
```

**Causa**:
- `add_property` intentaba inicializar esquema de documentos RAMA
- Funciones SQL `ensure_documents_schema_v2` y `seed_documents_v3` NO existen en MANINOS

**Fix**: Simplificado `add_property` para MANINOS:
```python
# ANTES (RAMA):
def add_property(name, address):
    # Create property
    # Call sb.rpc("ensure_documents_schema_v2")
    # Call sb.rpc("seed_documents_v3")
    # Initialize Numbers templates
    return {"id": ..., "name": ..., "address": ...}

# DESPUÉS (MANINOS):
def add_property(name, address):
    # Create property with acquisition_stage='initial'
    r = sb.table("properties").insert({
        "name": name,
        "address": address,
        "acquisition_stage": "initial"
    }).execute()
    
    # NOTE: No complex frameworks needed for MANINOS
    # Documents are managed generically (upload/list/delete)
    
    return {"ok": True, "property": r.data[0]}
```

**Archivo**: `tools/property_tools.py` ✅

---

## ✅ VERIFICACIÓN POST-FIX

### **Test ejecutado**:
```bash
python3 tests/test_maninos_flow.py
```

### **Resultado**:
```
✅ TEST 1 PASSED: Architecture is clean
✅ TEST 2 PASSED: Property tools available
✅ TEST 3 PASSED: Maninos acquisition tools available
✅ TEST 4 PASSED: Step 1 complete (70% Rule)
✅ TEST 5 PASSED: Inspection checklist generated
✅ TEST 6 PASSED: Inspection saved and repair costs calculated
✅ TEST 7 PASSED: 80% Rule evaluated
✅ TEST 8 PASSED: Contract generated
✅ TEST 9 PASSED: Inspection history works
✅ TEST 10 PASSED: DocsAgent tools clean

🎉 ALL TESTS PASSED!
```

---

## 📊 ARCHIVOS MODIFICADOS

| Archivo | Cambio | Razón |
|---------|--------|-------|
| `agents/base_agent.py` | Import alias `LCHumanMessage` | Fix UnboundLocalError |
| `agentic.py` | Agregar `prepare_input` node | Fix KeyError 'messages' |
| `agentic.py` | Actualizar `AgentState` | Agregar campo `input` |
| `agentic.py` | Cambiar entry point | `prepare_input` → `assistant` |
| `agentic.py` | Safe get `msgs` | `state.get("messages", [])` |
| `tools/property_tools.py` | Agregar `update_property_fields` | Función faltante |
| `tools/property_tools.py` | Simplificar `add_property` | Remover RAMA schema init |
| `tools/inspection_tools.py` | Fix stage extraction | Dict → string |

---

## 🏗️ NUEVO FLUJO DE STATE EN LANGGRAPH

```
app.py
  ↓
  Calls agent.invoke({"input": "text", ...})
  ↓
┌─────────────────────────────────────┐
│  LangGraph StateGraph               │
│                                     │
│  1. prepare_input node              │
│     • Convierte "input" → messages  │
│     • {"input": "text"}             │
│       → {"messages": [HumanMsg]}    │
│                                     │
│  2. assistant_node                  │
│     • Procesa messages              │
│     • Decide tool calls             │
│                                     │
│  3. tools_with_validation           │
│     • Ejecuta tools                 │
│     • Valida con validate_tool_call │
│                                     │
│  4. post_tool_node                  │
│     • Maneja errores                │
│     • Actualiza state               │
└─────────────────────────────────────┘
  ↓
  Returns {"messages": [...], "property_id": ...}
```

---

## ✅ STATUS

**Todos los errores solucionados** ✅

- ✅ Backend compila sin errores
- ✅ Tests pasan (10/10)
- ✅ State flow corregido
- ✅ Imports corregidos

**Listo para pruebas de integración con frontend** 🚀

---

## 🧪 PRÓXIMO PASO

Probar con el frontend:

```bash
# Terminal 1: Backend
cd /Users/mariasebares/Documents/RAMA_AI/maninos-ai
uvicorn app:app --host 0.0.0.0 --port 8080

# Terminal 2: Frontend
cd /Users/mariasebares/Documents/RAMA_AI/maninos-ai/web
npm run dev

# Browser
http://localhost:3000

# Test en chat:
"Quiero evaluar una mobile home llamada Test 1 en 123 Main St"
```

