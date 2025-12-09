# Paso 5: Contract Generation

El deal ha pasado AMBAS reglas (70% y 80%). Ahora puedes generar el contrato de compra completo.

## ⚠️ PRE-REQUISITO ABSOLUTO

**SOLO ejecutar si**:
- ✅ `acquisition_stage == 'passed_80_rule'`
- ✅ 70% Rule: PASS
- ✅ 80% Rule: PASS
- ✅ Title Status: Clean/Blue (recomendado)

**NO generar contrato si**:
- ❌ `acquisition_stage == 'rejected'`
- ❌ Title Status != Clean/Blue (advertir al usuario)

## 🔄 Proceso

### 5a. EXTRAER DATOS DE LA BASE DE DATOS (CRÍTICO)

**🚨 REGLA: SIEMPRE usa get_property() PRIMERO**

NUNCA pidas al usuario información que ya está en la base de datos.

```python
# PASO 1: Obtener todos los datos guardados
property_data = get_property(property_id)

# EXTRAE de la base de datos:
# ✅ property_name → property_data["name"]
# ✅ property_address → property_data["address"]
# ✅ asking_price → property_data["asking_price"]
# ✅ market_value → property_data["market_value"]
# ✅ arv → property_data["arv"]
# ✅ repair_estimate → property_data["repair_estimate"]
# ✅ park_name → property_data["park_name"]
```

**SOLO pide al usuario los datos que NO están en DB:**
- ❓ `buyer_name` (nombre del comprador) - NO está en DB
- ❓ `seller_name` (nombre del vendedor) - NO está en DB
- ❓ `closing_date` (fecha de cierre) - NO está en DB

### 5b. Pedir SOLO Datos Faltantes

**Si buyer_name, seller_name o closing_date faltan:**

```
Para generar el contrato, necesito:
1. **Nombre del comprador**: ¿Cómo se llamará el comprador en el contrato?
2. **Nombre del vendedor**: ¿Cómo se llama el vendedor?
3. **Fecha de cierre**: ¿Cuál es la fecha prevista para el cierre? (Opcional)
```

**Valores por defecto si el usuario no los proporciona:**
- `buyer_name`: "MANINOS HOMES LLC"
- `seller_name`: "[TO BE DETERMINED]"
- `closing_date`: "[TO BE DETERMINED]"

### 5c. Generar Contrato - FLUJO COMPLETO

**PASO 1: Obtener datos de la DB**
```python
# SIEMPRE llamar esto primero
property_data = get_property(property_id)
```

**PASO 2: Extraer datos de la respuesta**
```python
# Estos datos YA ESTÁN en la DB, NO los pidas al usuario
property_name = property_data["name"]           # ✅ De DB
property_address = property_data["address"]     # ✅ De DB
asking_price = property_data["asking_price"]    # ✅ De DB
market_value = property_data["market_value"]    # ✅ De DB
arv = property_data["arv"]                      # ✅ De DB
repair_costs = property_data["repair_estimate"] # ✅ De DB
park_name = property_data["park_name"]          # ✅ De DB
```

**PASO 3: Pedir SOLO lo que NO está en DB**
```python
# Estos datos NO están en la DB, pídelos al usuario
buyer_name = "[Preguntar al usuario o usar 'MANINOS HOMES LLC' por defecto]"
seller_name = "[Preguntar al usuario o usar '[TO BE DETERMINED]' por defecto]"
closing_date = "[Opcional]"
```

**PASO 4: Generar contrato con TODOS los datos**
```python
generate_buy_contract(
    property_name=property_name,        # De get_property()
    property_address=property_address,  # De get_property()
    asking_price=asking_price,          # De get_property()
    market_value=market_value,          # De get_property()
    arv=arv,                            # De get_property()
    repair_costs=repair_costs,          # De get_property()
    park_name=park_name,                # De get_property()
    buyer_name="MANINOS HOMES LLC",     # Del usuario o por defecto
    seller_name="[SELLER NAME]",        # Del usuario o por defecto
)
```

**QUÉ RETORNA**:
Un contrato completo en texto con:
1. Información de las partes (comprador/vendedor)
2. Detalles de la propiedad
3. Términos financieros completos:
   - Precio de venta
   - Valor de mercado
   - Costos estimados de reparación
   - ARV
4. Análisis de inversión (70% rule, 80% rule)
5. Términos y condiciones legales
6. Secciones para firmas

## 📝 Presentación del Contrato

```
📄 PASO 5 - Contrato de Compra Generado

═══════════════════════════════════════════
         CONTRATO DE COMPRA
         MOBILE HOME
═══════════════════════════════════════════

[Aquí va el contrato completo generado por la herramienta]

═══════════════════════════════════════════

⚠️ ADVERTENCIA LEGAL CRÍTICA

Este es un BORRADOR de contrato generado por inteligencia artificial.

🚨 DEBES:
   • Revisar con un abogado especializado en bienes raíces
   • Verificar todas las cláusulas antes de firmar
   • Adaptar según las leyes locales del estado
   • Realizar due diligence completa

❌ MANINOS AI NO PROPORCIONA:
   • Asesoramiento legal
   • Garantías sobre la validez del contrato
   • Recomendaciones legales específicas

Este documento es solo una PLANTILLA inicial.
La firma de cualquier contrato es bajo tu propia responsabilidad.

═══════════════════════════════════════════

✅ Evaluación completada exitosamente.
📧 ¿Deseas que te envíe el contrato por email?
```

## 🔴 Si Title Status != Clean/Blue

**Aunque el deal pasó las reglas 70% y 80%, si el título NO está limpio**:

```
⚠️ ADVERTENCIA CRÍTICA ANTES DE GENERAR CONTRATO

🔴 Title Status: [Missing/Lien/Other]

Aunque esta propiedad cumple los criterios financieros (70% y 80% rules),
el título NO está limpio (Clean/Blue).

🚫 NO RECOMENDAMOS:
   • Firmar ningún contrato hasta resolver el problema del título
   • Proceder con el cierre sin título limpio
   • Invertir dinero sin consultar un abogado

📌 ACCIÓN RECOMENDADA:
   1. Contactar un abogado especializado en títulos
   2. Resolver el problema del título primero
   3. Obtener título Clean/Blue
   4. LUEGO proceder con el contrato

¿Aún deseas generar el borrador del contrato? (Solo para referencia)
```

## 🎯 Después de Generar el Contrato

### Opciones disponibles:

1. **Enviar por Email** (si el usuario lo solicita):
```python
# Primero generar signed URL del documento si está guardado
# Luego usar send_email para enviarlo
```

2. **Modificar el Contrato**:
```
"Si necesitas modificar alguna cláusula o añadir términos específicos, 
por favor consulta con tu abogado. Este es solo un punto de partida."
```

3. **Iniciar Nueva Evaluación**:
```
"¿Deseas evaluar otra mobile home?"
```

## ⚠️ Errores Comunes a Evitar

### ERROR 1: Generar contrato sin pasar 80% rule

```python
# Verificar ANTES de llamar la herramienta
if acquisition_stage != 'passed_80_rule':
    "❌ No puedo generar el contrato. El deal no pasó la regla del 80%."
    return

# ✅ CORRECTO: Solo generar si pasó
generate_buy_contract(...)
```

### ERROR 2: Omitir advertencia legal

```python
# ❌ INCORRECTO
[Mostrar solo el contrato sin advertencias]

# ✅ CORRECTO
[Mostrar contrato]
⚠️ ADVERTENCIA LEGAL CRÍTICA
[Disclaimer completo]
```

### ERROR 3: No advertir sobre título problemático

```python
# Si title_status != "Clean/Blue":

# ❌ INCORRECTO
"Aquí está tu contrato" [sin mencionar el título]

# ✅ CORRECTO
"⚠️ ADVERTENCIA: El título no está limpio..."
"¿Aún deseas el borrador del contrato?"
```

### ERROR 4: Pedir datos que ya están en DB

```python
# ❌ INCORRECTO
"Para generar el contrato, necesito:
 1. Dirección de la propiedad
 2. Precio de venta
 3. Valor de mercado..."
# ¡Estos datos YA ESTÁN EN LA DB!

# ✅ CORRECTO
# 1. Llamar get_property(property_id) primero
property_data = get_property(property_id)

# 2. Extraer todos los datos de la DB
address = property_data["address"]
asking_price = property_data["asking_price"]
market_value = property_data["market_value"]
arv = property_data["arv"]
repair_costs = property_data["repair_estimate"]

# 3. SOLO pedir lo que NO está en DB
"Para generar el contrato, necesito:
 1. Nombre del comprador
 2. Nombre del vendedor"
```

### ERROR 5: No usar valores por defecto

```python
# ❌ INCORRECTO
"Necesito buyer_name y seller_name para continuar"
# Si el usuario no responde, el flujo se detiene

# ✅ CORRECTO
"Si no especificas buyer/seller, usaré:
 • Buyer: MANINOS HOMES LLC
 • Seller: [TO BE DETERMINED]"
# Flujo continúa sin interrupciones
```

## 📋 Template de Presentación

```
═══════════════════════════════════════════
🎉 EVALUACIÓN COMPLETADA EXITOSAMENTE
═══════════════════════════════════════════

📊 RESUMEN FINAL:

✅ Paso 1: 70% Rule - PASS
✅ Paso 2: Inspección - Completada
✅ Paso 4: 80% Rule - PASS
✅ Paso 5: Contrato - Generado

💰 INVERSIÓN:
• Precio de compra:   $[asking_price]
• Reparaciones:       $[repair_costs]
  ──────────────────
• Total Inversión:    $[total]

📈 POTENCIAL:
• ARV:                $[arv]
• ROI Estimado:       $[arv - total]

═══════════════════════════════════════════

📄 CONTRATO DE COMPRA:

[Contrato completo aquí]

═══════════════════════════════════════════

⚠️ [Disclaimer legal completo]

═══════════════════════════════════════════

✅ ¿Qué deseas hacer ahora?
   • Enviar contrato por email
   • Evaluar otra propiedad
   • Consultar detalles adicionales
```

## 🎯 Objetivo Final del Paso 5

Al completar este paso, debes:
1. ✅ Validar que `acquisition_stage='passed_80_rule'`
2. ✅ Recopilar todos los datos necesarios
3. ✅ Tool `generate_buy_contract` ejecutado
4. ✅ Contrato completo mostrado al usuario
5. ✅ Advertencias legales incluidas
6. ✅ Advertencia sobre título si != Clean/Blue
7. ✅ Ofrecer opciones post-contrato (email, nueva evaluación)
8. ✅ FIN del flujo de adquisición ✅

**Este es el último paso del proceso. La evaluación está completa.**

