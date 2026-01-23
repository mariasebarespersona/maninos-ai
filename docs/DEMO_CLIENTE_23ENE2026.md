# 🎯 Demo Maninos AI - Enero 2026

## Estado Actual: Checklist S1-S2 del Plan

Basado en el plan de producto, esto es lo que debería funcionar:

---

## 🎬 DEMO 1: Crear Cliente (INCORPORAR)

### Paso 1 - Crear perfil de cliente
```
Crea un nuevo cliente llamado Juan Pérez, teléfono 832-555-1234, email juan@email.com, ingreso mensual $4,500
```
*Esperado: Crea cliente en BD con código de referido automático*

### Paso 2 - Verificar el cliente creado
Abre el **drawer de Clientes** (icono 👤) para ver a Juan Pérez

### Paso 3 - Calcular DTI
```
Calcula el DTI de Juan Pérez
```
*Esperado: Muestra ratio deuda-ingreso y perfil de riesgo*

---

## 🎬 DEMO 2: Registrar Propiedad (ADQUIRIR)

### Paso 4 - Registrar propiedad en inventario
```
Registra en el inventario una propiedad que ya compramos: 456 Oak Street en el parque Sunny Meadows, la compramos por $35,000, fecha de compra hoy, 3 recámaras, 2 baños, año 2018
```
*Esperado: Registra la propiedad como ya adquirida*

### Paso 5 - Verificar propiedad
Abre el **drawer de Propiedades** (icono 🏠) para ver la propiedad

---

## 🎬 DEMO 3: Evaluar Propiedad con Checklist (ADQUIRIR)

### Paso 6 - Evaluar con checklist de 26 puntos
```
Evalúa la propiedad 456 Oak Street con el checklist de compra
```
*Esperado: Evaluación con los 26 puntos del checklist*

---

## 🎬 DEMO 4: Generar Contrato RTO (INCORPORAR)

### Paso 7 - Generar contrato
```
Genera un contrato RTO para Juan Pérez con la propiedad 456 Oak Street, plazo 36 meses, renta mensual $695
```
*Esperado: Contrato PDF con las 33 cláusulas del Anexo 3*

---

## 🎬 DEMO 5: Gestionar Cartera (GESTIONAR)

### Paso 8 - Configurar pago automático
```
Configura el pago automático para el contrato de Juan Pérez
```
*Esperado: Crea cliente en Stripe y configura cobro recurrente*

### Paso 9 - Ver estado de la cartera
```
Muéstrame el estado de la cartera de contratos
```
*Esperado: Resumen de contratos activos y su estado de pago*

---

## 🎬 DEMO 6: Inversionistas (FONDEAR)

### Paso 10 - Crear inversionista
```
Registra un nuevo inversionista: Robert Smith, email robert@investor.com, teléfono 713-555-9999
```
*Esperado: Crea perfil de inversionista*

### Paso 11 - Generar nota de deuda
```
Genera una nota de deuda para Robert Smith por $50,000 al 12% anual, plazo 12 meses
```
*Esperado: Documento con cronograma de pagos*

---

## 🎬 DEMO 7: Entrega y Referidos (ENTREGAR)

### Paso 12 - Ver código de referido
```
¿Cuál es el código de referido de Juan Pérez?
```
*Esperado: Muestra código único (ej: JUANP2026)*

### Paso 13 - Verificar elegibilidad de compra
```
Verifica si Juan Pérez es elegible para comprar su propiedad
```
*Esperado: Análisis de pagos completados y requisitos*

---

## 📋 Resumen de Comandos por Agente

| Agente | Comando de prueba |
|--------|-------------------|
| **INCORPORAR** | "Crea un cliente llamado..." |
| **INCORPORAR** | "Calcula el DTI de..." |
| **INCORPORAR** | "Genera contrato RTO para..." |
| **ADQUIRIR** | "Registra en inventario una propiedad..." |
| **ADQUIRIR** | "Evalúa la propiedad X con el checklist" |
| **GESTIONAR** | "Configura pago automático para..." |
| **GESTIONAR** | "Muéstrame el estado de la cartera" |
| **FONDEAR** | "Registra un inversionista..." |
| **FONDEAR** | "Genera nota de deuda para..." |
| **ENTREGAR** | "Verifica si X es elegible para comprar" |
| **ENTREGAR** | "¿Cuál es el código de referido de...?" |

---

## 💡 Tips Importantes

1. **"Registra en inventario"** = Propiedad YA COMPRADA → usa `register_property_inventory`
2. **"Evalúa con checklist"** = ANTES de comprar → usa `evaluate_property_criteria` (regla 70%)
3. **El agente mantiene contexto** - puedes decir "para ese cliente" sin repetir nombres
4. **Abre los drawers** para mostrar visualmente los datos creados

---

## ⚠️ Comportamientos Conocidos a Mejorar

1. El agente a veces pide más información de la necesaria (campos opcionales)
2. Si dices solo "registra propiedad" puede confundirlo con "evalúa propiedad"
3. Ser específico ayuda: "registra EN INVENTARIO" vs "evalúa CON CHECKLIST"
