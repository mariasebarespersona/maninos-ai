# 📄 MANINOS AI - Example Documents for Testing

Este directorio contiene **documentos de ejemplo** que puedes usar para testear el sistema de subida de documentos (Paso 0: Recopilación de Documentos).

---

## 📋 Archivos Disponibles

### 1️⃣ **Title Status Document**
**Archivo:** `1_title_status_example.txt`

**Qué contiene:**
- Información del título de la mobile home
- Estado del título: **CLEAN TITLE (Blue Title)** ✓
- Serial number y detalles del propietario
- Confirmación de que **NO hay liens** (gravámenes)

**Cómo usar:**
- Súbelo como "Title Status Document" en el UI
- El agente puede usar RAG para extraer información como:
  - "¿Cuál es el estado del título?" → Respuesta: Clean Title
  - "¿Hay liens?" → Respuesta: No

---

### 2️⃣ **Property Listing (Zillow/MHVillage)**
**Archivo:** `2_property_listing_example.txt`

**Qué contiene:**
- **Asking Price:** $85,000
- **Market Value:** $120,000 (after repairs)
- Detalles completos: 3 bed, 2 bath, 1,550 sqft
- Lista de reparaciones necesarias (~$2,150)
- Amenidades del parque
- Información de contacto del agente

**Cómo usar:**
- Súbelo como "Property Listing" en el UI
- El agente puede extraer:
  - "¿Cuál es el precio de venta?" → Respuesta: $85,000
  - "¿Qué reparaciones necesita?" → Lista completa de reparaciones
  - "¿Cuál es el valor de mercado?" → Respuesta: $120,000

---

### 3️⃣ **Property Photos & Inspection Notes**
**Archivo:** `3_property_photos_description.txt`

**Qué contiene:**
- Descripción detallada de 14 "fotos" (simuladas con texto)
- Notas de inspección por área (exterior, interior, HVAC)
- Lista de defectos encontrados:
  - HVAC needs servicing ($800)
  - Minor roof leak ($500)
  - Kitchen faucet drips ($150)
  - Front steps repair ($300)
  - Exterior paint ($400)
- **Total estimado de reparaciones: $2,150**

**Cómo usar:**
- Súbelo como "Property Photos" en el UI
- El agente puede extraer:
  - "¿Qué defectos tiene la propiedad?" → Lista completa
  - "¿Cuánto costarán las reparaciones?" → $2,150

---

## 🚀 Cómo Testear el Sistema

### **Paso 1: Crear una nueva propiedad**
En el UI de MANINOS AI:
```
Usuario: "Casa Sebares 2 en Ronda de Sobradiel 16"
```

El sistema creará la propiedad y mostrará el panel de **Documentos Iniciales**.

---

### **Paso 2: Subir los 3 documentos**

**Opción A: Renombrar archivos (recomendado)**

Para que el sistema pueda procesar los archivos como PDFs/imágenes, puedes:

1. **Renombrar los archivos `.txt` a `.pdf`:**
   ```bash
   cd docs/examples
   cp 1_title_status_example.txt 1_title_status.pdf
   cp 2_property_listing_example.txt 2_property_listing.pdf
   cp 3_property_photos_description.txt 3_property_photos.pdf
   ```

2. **O convertirlos a PDF real:**
   - Abre cada archivo `.txt` en tu editor de texto
   - Usa "Guardar como PDF" o "Imprimir → Guardar como PDF"

**Opción B: Usar directamente (testing)**

Si solo quieres testear que la subida funciona, puedes renombrar los `.txt` a formatos aceptados temporalmente:
```bash
cp 1_title_status_example.txt title_status.pdf
cp 2_property_listing_example.txt property_listing.pdf  
cp 3_property_photos_description.txt property_photos.jpg
```

---

### **Paso 3: Hacer preguntas al agente usando RAG**

Una vez subidos los 3 documentos, puedes hacer preguntas como:

```
Usuario: "¿Cuál es el precio de venta según el listing?"
Agente: [Usa RAG] "En el listing veo que el precio de venta es $85,000"

Usuario: "¿Hay algún lien en el título?"
Agente: [Usa RAG] "No, el documento del título confirma que es un Clean Title sin liens"

Usuario: "¿Qué reparaciones necesita la casa?"
Agente: [Usa RAG] "Según las fotos de inspección, necesita: HVAC servicing ($800), roof leak repair ($500), kitchen faucet ($150), front steps ($300), y paint touch-up ($400). Total: $2,150"
```

---

### **Paso 4: Continuar con el flujo**

Una vez subidos los 3 documentos:

```
Usuario: "listo"
Agente: "✅ PASO 0 COMPLETADO. Ahora puedes proporcionar el precio de venta 
         y valor de mercado para el 70% Rule Check"
```

Ahora el sistema pasará automáticamente al **Paso 1: 70% Rule Check**.

---

## 🎯 Valores Esperados para el Test

Con estos documentos de ejemplo, los valores que el sistema debería usar son:

| Campo | Valor | Fuente |
|-------|-------|--------|
| **Asking Price** | $85,000 | Property Listing |
| **Market Value** | $120,000 | Property Listing |
| **Repair Estimate** | $2,150 | Property Photos/Inspection |
| **Title Status** | Clean/Blue | Title Status Document |
| **ARV (After Repair Value)** | ~$120,000-$130,000 | Calculado |

### **70% Rule Calculation:**
```
Max Allowable Offer = (ARV × 0.70) - Repairs
                    = ($120,000 × 0.70) - $2,150
                    = $84,000 - $2,150
                    = $81,850

Asking Price: $85,000
Max Offer: $81,850
Result: ⚠️ SLIGHTLY OVER (but negotiable)
```

---

## 📝 Notas Adicionales

- Estos documentos son **ficticios** y solo para testing
- En producción, los usuarios subirían PDFs reales de Zillow/MHVillage
- El sistema RAG puede extraer información de cualquier PDF con texto
- Los archivos `.txt` son más fáciles de editar para crear nuevos ejemplos

---

## ✅ Checklist de Testing

- [ ] Crear nueva propiedad → Panel de documentos aparece
- [ ] Subir Title Status → Marca como "SUBIDO" ✓
- [ ] Subir Property Listing → Marca como "SUBIDO" ✓
- [ ] Subir Property Photos → Marca como "SUBIDO" ✓
- [ ] Progress bar: 0/3 → 3/3 (100%)
- [ ] Mensaje de completado aparece
- [ ] Hacer pregunta RAG sobre el listing → Agente responde correctamente
- [ ] Decir "listo" → Sistema pasa al Paso 1
- [ ] Panel de documentos desaparece
- [ ] Chat es visible y usable

---

**¿Preguntas o problemas?** Consulta la documentación principal en `/docs/`.

