# Routing Architecture - MANINOS AI

## 🎯 Filosofía: Intelligent, Not Robotic

El sistema de routing de MANINOS AI está diseñado para ser **inteligente y natural**, no basado en keywords rígidos.

---

## 🏗️ Arquitectura de Dos Capas

### **Capa 1: ActiveRouter (Básico)**

**Responsabilidad:** Routing inicial para operaciones **SIN contexto de propiedad**

**Maneja SOLO:**
1. ✅ `property.create` - Detectar nueva dirección para evaluar
2. ✅ `property.list` - Listar todas las propiedades
3. ✅ `property.delete` - Eliminar una propiedad
4. ✅ `property.switch` - Cambiar a otra propiedad
5. ✅ `general_conversation` - Default fallback

**NO maneja:**
- ❌ Flujo de adquisición (checklist, inspección, arv, 70%, 80%)
- ❌ Operaciones de documentos
- ❌ Señales de completitud ("listo", "done")
- ❌ Cualquier cosa relacionada con el flujo

**Método:**
- Keywords simples para detección rápida
- LLM fallback solo para casos ambiguos
- **Reducido a 256 líneas** (era 810 líneas)

---

### **Capa 2: FlowValidator (Inteligente)**

**Responsabilidad:** Todo lo relacionado con el **flujo de adquisición**

**Maneja:**
1. ✅ Análisis del `acquisition_stage` actual
2. ✅ Detección de datos faltantes
3. ✅ Comprensión de intención del usuario (naturalmente, sin keywords)
4. ✅ Guía para el siguiente paso
5. ✅ Recomendación de agent apropiado

**Método:**
- Análisis contextual inteligente
- Entiende lenguaje natural
- NO depende de keywords específicos
- Guidance explícita para el agent

**Ubicación:** `router/flow_validator.py`

---

## 📊 División de Responsabilidades

```
┌─────────────────────────────────────────────────────────────┐
│                    Usuario envía mensaje                     │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
                ┌─────────────────────┐
                │  ¿property_id?      │
                └──────┬──────────────┘
                       │
         ┌─────────────┴─────────────┐
         │                           │
    ❌ NO                        ✅ SÍ
         │                           │
         ▼                           ▼
┌──────────────────┐      ┌──────────────────────┐
│  ActiveRouter    │      │   FlowValidator      │
│  (Básico)        │      │   (Inteligente)      │
├──────────────────┤      ├──────────────────────┤
│ • property.create│      │ • Analiza stage      │
│ • property.list  │      │ • Detecta faltantes  │
│ • property.delete│      │ • Entiende intención │
│ • property.switch│      │ • Recomienda paso    │
│ • general        │      │ • Guía al agent      │
└──────────────────┘      └──────────────────────┘
         │                           │
         └─────────────┬─────────────┘
                       │
                       ▼
                ┌──────────────┐
                │ PropertyAgent│
                └──────────────┘
```

---

## 🎯 Ejemplo de Flujo

### **Escenario 1: Sin propiedad activa**

```
Usuario: "Evaluar propiedad en Calle Madroño 26"
   ↓
ActiveRouter: Detecta address → property.create → PropertyAgent
   ↓
PropertyAgent: Crea propiedad, pide documentos
```

### **Escenario 2: Con propiedad activa (acquisition_stage = 'documents_pending')**

```
Usuario: "done"
   ↓
FlowValidator:
  - Stage actual: documents_pending
  - Detecta: Usuario señala completitud (sin keywords, natural)
  - Verifica: ¿Documentos realmente subidos? (list_docs)
  - Guidance: "Verificar documentos, si completos → pedir precios"
   ↓
PropertyAgent: Sigue guidance, verifica, responde según estado real
```

### **Escenario 3: Con propiedad activa (acquisition_stage = 'passed_70_rule')**

```
Usuario: "ya terminé con eso"
   ↓
FlowValidator:
  - Stage actual: passed_70_rule
  - Detecta: Usuario señala completitud
  - Verifica: ¿repair_estimate existe?
  - Guidance: "Si repair_estimate > 0 → pedir ARV, si no → mostrar checklist"
   ↓
PropertyAgent: Sigue guidance, verifica, responde
```

---

## ✅ Ventajas de Esta Arquitectura

1. **Natural, no robótica:**
   - Usuario puede decir "done", "listo", "ya está", "siguiente", "terminé", etc.
   - FlowValidator entiende la intención, no busca keywords específicos

2. **Consistente:**
   - Prompts dicen "no keywords"
   - Código respeta eso (ActiveRouter simplificado)
   - FlowValidator es la fuente de inteligencia

3. **Mantenible:**
   - ActiveRouter: 256 líneas (simple y claro)
   - Lógica compleja → FlowValidator (separado)
   - Fácil de entender y modificar

4. **Escalable:**
   - Agregar nuevos pasos → Solo modificar FlowValidator
   - No tocar ActiveRouter para flujo de adquisición

---

## 🚫 Lo que NO Hacemos

1. ❌ **NO** buscamos keywords específicos para el flujo
2. ❌ **NO** duplicamos lógica entre ActiveRouter y FlowValidator
3. ❌ **NO** forzamos al usuario a usar frases específicas
4. ❌ **NO** tenemos routing basado en keywords para señales de completitud

---

## 📝 Reglas de Oro

1. **ActiveRouter:** Solo para operaciones básicas SIN property_id
2. **FlowValidator:** Todo lo relacionado con el flujo de adquisición
3. **Base de datos es la fuente de verdad:** Siempre verificar estado real
4. **Natural, no robótico:** Usuario puede expresarse libremente

---

## 🔧 Cómo Agregar Nueva Funcionalidad

### **¿Es una operación básica sin contexto?**
→ Agregar a `ActiveRouter.predict_keywords()`

**Ejemplo:** Nueva forma de listar propiedades
```python
# router/active_router.py
if "ver todas mis casas" in s:
    return ("property.list", 0.90, "PropertyAgent")
```

### **¿Es parte del flujo de adquisición?**
→ Agregar a `FlowValidator`

**Ejemplo:** Nuevo paso después del contrato
```python
# router/flow_validator.py
self.flow_steps = {
    # ...
    "contract_generated": {
        "name": "Paso 6: Firma y Cierre",
        "required_data": ["signature_date", "closing_date"],
        "next_stage": "deal_closed",
        "agent": "PropertyAgent"
    }
}
```

---

## 📊 Métricas

- **ActiveRouter:** 810 líneas → 256 líneas (68% reducción)
- **Keywords eliminados:** ~50 listas de keywords hardcodeados
- **Intents manejados por ActiveRouter:** 5 (básicos)
- **Intents manejados por FlowValidator:** ~15 (flujo completo)

---

## 🎯 Resultado

Sistema **inteligente, natural, y consistente** que permite al usuario expresarse libremente mientras mantiene un flujo claro y robusto.
