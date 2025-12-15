# Arquitectura Consolidada - MANINOS AI

## 🎯 Filosofía: Un Agente, Un Flujo

MANINOS tiene un **flujo lineal de 6 pasos**. No necesita múltiples agentes especializados.

---

## 📊 Arquitectura Actual (Consolidada)

```
User Input
    ↓
┌─────────────────────────────────────────┐
│ Flow Validator                           │
│  - Valida datos del flujo                │
│  - Detecta qué información falta         │
│  - Recomienda PropertyAgent              │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ Orchestrator (Simple Router)            │
│  - PropertyAgent (acquisition)           │
│  - MainAgent (fallback genérico)         │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ PropertyAgent (TODO el flujo)            │
│                                          │
│ 📄 Paso 0: Documentos                   │
│    Tools: list_docs, rag_qa, upload     │
│                                          │
│ 💰 Paso 1: 70% Rule                     │
│    Tools: calculate_maninos_deal         │
│                                          │
│ 🔍 Paso 2: Inspección                   │
│    Tools: get_checklist, save_results    │
│                                          │
│ 💰 Paso 3: 80% ARV Rule                 │
│    Tools: calculate_maninos_deal         │
│                                          │
│ 📊 Paso 4: Revisión Final               │
│    Tools: get_property                   │
│                                          │
│ 📝 Paso 5: Contrato                     │
│    Tools: generate_buy_contract          │
└─────────────────────────────────────────┘
```

---

## 🔄 Antes vs Ahora

### ❌ **ANTES (2 agentes especializados)**

```
MainAgent (coordinador)
├─ PropertyAgent
│  ├─ Paso 1: 70% Rule
│  ├─ Paso 2: Inspección
│  ├─ Paso 3: 80% Rule
│  └─ Paso 4: Contrato
└─ DocsAgent
   └─ Paso 0: Documentos
```

**Problemas:**
- ❌ Contexto fragmentado entre agentes
- ❌ DocsAgent no tenía acceso a flow_validator
- ❌ Routing complejo entre PropertyAgent y DocsAgent
- ❌ Pérdida de contexto al cambiar de agente
- ❌ Duplicación de lógica

---

### ✅ **AHORA (1 agente unificado)**

```
MainAgent (coordinador)
└─ PropertyAgent (TODO el flujo de 6 pasos)
   ├─ 📄 Document tools
   ├─ 💰 Financial tools
   ├─ 🔍 Inspection tools
   └─ 📝 Contract tools
```

**Beneficios:**
- ✅ Contexto único y coherente
- ✅ PropertyAgent controla todo el flujo
- ✅ Acceso completo a flow_validator
- ✅ Sin pérdida de contexto
- ✅ Routing simplificado
- ✅ Más fácil de mantener

---

## 🛠️ Cambios Realizados

### **1. PropertyAgent ahora incluye Document Tools**

**Antes:**
```python
# agents/property_agent.py
def get_tools(self):
    return [
        add_property_tool,
        calculate_maninos_deal_tool,
        generate_buy_contract_tool,
        get_inspection_checklist_tool,
        # ... solo property tools
    ]
```

**Ahora:**
```python
# agents/property_agent.py
def get_tools(self):
    return [
        # Property management
        add_property_tool,
        get_property_tool,
        update_property_fields_tool,
        
        # Financial
        calculate_maninos_deal_tool,
        
        # Inspection
        get_inspection_checklist_tool,
        save_inspection_results_tool,
        
        # Contract
        generate_buy_contract_tool,
        
        # Documents (NEW - from DocsAgent)
        upload_and_link_tool,
        list_docs_tool,
        rag_qa_with_citations_tool,
        qa_document_tool,
        summarize_document_tool,
        send_email_tool,
        # ... todos los tools necesarios
    ]
```

---

### **2. Prompts Consolidados**

**Movido:**
```bash
prompts/agents/docs_agent/step0_documents.md
    ↓
prompts/agents/property_agent/step0_documents.md
```

**Actualizado `property_agent/_base.md`:**
```markdown
# PropertyAgent - Acquisition Agent (MANINOS AI)

Guías a los usuarios a través de un **flujo de 6 pasos** completo:

- **Paso 0**: Recopilación de Documentos (Title, Listing, Photos)
- **Paso 1**: 70% Rule Check
- **Paso 2**: Inspección Interactiva
- **Paso 3**: 80% ARV Rule Check
- **Paso 4**: Revisión Final
- **Paso 5**: Generación de Contrato

**Tienes acceso a TODOS los tools necesarios:**
- 📄 Document tools (list_docs, rag_qa, upload)
- 💰 Financial tools (calculate_maninos_deal)
- 🔍 Inspection tools (get_checklist, save_results)
- 📝 Contract tools (generate_buy_contract)
```

---

### **3. Orchestrator Simplificado**

**Antes:**
```python
# router/orchestrator.py
self.agents = {
    "PropertyAgent": self.property_agent,
    "DocsAgent": self.docs_agent
}
```

**Ahora:**
```python
# router/orchestrator.py
self.agents = {
    "PropertyAgent": self.property_agent
}
```

**Routing:**
- Si hay `property_id` → **PropertyAgent** (via flow_validator)
- Si NO hay `property_id` → **MainAgent** (fallback genérico)

---

### **4. Flow Validator Actualizado**

```python
# router/flow_validator.py
self.flow_steps = {
    "documents_pending": {
        "name": "Paso 0: Recopilación de Documentos",
        "agent": "PropertyAgent"  # ← Antes era "DocsAgent"
    },
    "initial": {
        "name": "Paso 1: 70% Rule Check",
        "agent": "PropertyAgent"
    },
    # ... todos los pasos con PropertyAgent
}
```

---

### **5. PropertyAgent Auto-Updates Stage**

Heredado de DocsAgent, ahora PropertyAgent también valida completion de documentos:

```python
# agents/property_agent.py
def run(self, user_input, property_id, context):
    result = super().run(user_input, property_id, context)
    
    # POST-PROCESSING: Auto-update stage if documents complete
    if property_id and stage == "documents_pending":
        docs = list_docs(property_id)
        doc_types = {d["document_type"] for d in docs}
        required = {"title_status", "property_listing", "property_photos"}
        
        if required.issubset(doc_types):
            update_property_fields(property_id, {"acquisition_stage": "initial"})
            logger.info("✅ Stage updated to 'initial'")
    
    return result
```

---

## 📈 Métricas de Simplificación

| Métrica | Antes | Ahora | Cambio |
|---------|-------|-------|--------|
| **Agentes especializados** | 2 (PropertyAgent, DocsAgent) | 1 (PropertyAgent) | -50% |
| **Contextos separados** | 2 | 1 | -50% |
| **Routing complexity** | Alta (2 agents) | Baja (1 agent) | -50% |
| **Pérdida de contexto** | Posible (al cambiar agent) | Imposible | ✅ |
| **Tools en PropertyAgent** | 11 | 19 | +73% |
| **Mantenibilidad** | Media | Alta | ⬆️ |

---

## 🧪 Testing

### **Flujo Completo:**

1. **Crear propiedad:**
   ```
   User: "Evaluar Casa Test en 123 Main St"
   PropertyAgent: ✅ Propiedad creada
   ```

2. **Paso 0: Documentos (NEW - ahora PropertyAgent)**
   ```
   PropertyAgent: "Sube los 3 documentos obligatorios..."
   User: [Sube documentos via UI]
   PropertyAgent: ✅ Detecta los 3 documentos → Auto-update stage to 'initial'
   ```

3. **Paso 1: 70% Rule**
   ```
   User: "Precio $85k, market value $120k"
   PropertyAgent: [Calcula 70%] ✅ Pasa la regla
   ```

4. **Paso 2: Inspección**
   ```
   PropertyAgent: "Usa el checklist interactivo..."
   User: [Marca defectos en UI]
   PropertyAgent: ✅ Lee repair_estimate de BD
   ```

5. **Paso 3: 80% ARV Rule**
   ```
   User: "ARV es $130k"
   PropertyAgent: [Calcula 80%] ✅ Pasa la regla
   ```

6. **Paso 4: Contrato**
   ```
   User: "Genera el contrato"
   PropertyAgent: [generate_buy_contract] ✅ Contrato generado
   ```

**TODO manejado por PropertyAgent. Sin cambios de agente. Sin pérdida de contexto.**

---

## 🚀 Escalabilidad Futura

### **Si necesitas más complejidad:**

**Opción 1: Subagents (solo si crece mucho)**
```
PropertyAgent (orchestrator)
├─ DocumentsSubAgent
├─ FinancialSubAgent
├─ InspectionSubAgent
└─ ContractSubAgent
```

**Opción 2: Especialización por tipo de propiedad**
```
MainAgent
├─ MobileHomeAgent (PropertyAgent actual)
├─ ResidentialAgent (casas)
└─ CommercialAgent (comercial)
```

**Pero para MANINOS ahora:** 1 agente es perfecto. ✅

---

## 🎯 Conclusión

### **Por qué esta arquitectura:**

1. **MANINOS = Flujo Lineal (6 pasos)**
   - No hay ramificaciones complejas
   - No hay múltiples flujos paralelos
   - Un agente puede manejar todo perfectamente

2. **Contexto Coherente**
   - El agente "recuerda" toda la conversación
   - No se pierde información al cambiar de agente
   - Flow_validator siempre tiene datos actualizados

3. **Simplicidad = Mantenibilidad**
   - Menos código = menos bugs
   - Routing simple = fácil debugging
   - Un agente = una fuente de verdad

4. **Preparado para Escalar**
   - Si crece, refactorizar a subagents es fácil
   - Por ahora: KISS (Keep It Simple, Stupid)

---

## 📝 Archivos Modificados

```
✅ agents/property_agent.py
   - +8 document tools
   - +auto-update stage logic

✅ prompts/agents/property_agent/_base.md
   - Actualizado a 6 pasos
   - Incluye Paso 0 (documentos)

✅ prompts/agents/property_agent/step0_documents.md
   - Movido de docs_agent/

✅ router/orchestrator.py
   - Eliminado DocsAgent
   - Solo PropertyAgent + MainAgent

✅ router/flow_validator.py
   - documents_pending → PropertyAgent

✅ router/active_router.py
   - Todas referencias DocsAgent → PropertyAgent
```

---

**RESULTADO: Sistema más simple, más robusto, más mantenible. 🎉**

