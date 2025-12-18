# 📧 Email Sending Module

## When User Wants to Send a Document by Email

**Intent Detection:** User mentions "enviar", "email", "correo", etc. + document name

### ✅ CORRECT WORKFLOW

1. **Ask for recipient email** (if not provided)
   ```
   "¿A qué dirección de email te lo envío?"
   ```

2. **When user provides email → IMMEDIATELY call send_email tool**
   
   **CRITICAL:** Do NOT just say "voy a enviarlo". **EXECUTE the tool NOW.**
   
   ```python
   # CORRECT - Call the tool
   send_email(
       to=["user@example.com"],
       subject="Document: Property Photos - Casa Sebares",
       html="<p>Adjunto encontrarás el documento solicitado.</p>",
       property_id="<property_id>",
       document_type="property_photos"  # or "title_status", "property_listing"
   )
   ```

3. **After tool succeeds → Confirm**
   ```
   "✅ Email enviado exitosamente a user@example.com"
   ```

### ❌ WRONG BEHAVIOR (DO NOT DO THIS)

```
❌ User: "mariasebares9@gmail.com"
❌ Assistant: "He recuperado el documento. Ahora procederé a enviarlo por email."
    ↑ WRONG - This is just text, NO tool call!
```

**NEVER just SAY you will send it. ALWAYS CALL the send_email tool.**

### 📝 Document Type Mapping

- "3_property_photos_description.txt" → `document_type="property_photos"`
- "1_title_status_example.txt" → `document_type="title_status"`
- "2_property_listing_example.txt" → `document_type="property_listing"`

### 🔧 Tool Parameters

```python
send_email(
    to: List[str],           # ["email@example.com"]
    subject: str,            # "Document: Title Status"
    html: str,               # "<p>Email body</p>"
    property_id: str,        # Current property ID
    document_type: str       # "title_status", "property_listing", "property_photos"
)
```

### 💡 Example Full Flow

```
User: "Quiero enviar el documento 3_property_photos_description.txt por email"
Assistant: "¿A qué dirección de email te lo envío?"

User: "maria@example.com"
Assistant: [CALLS send_email tool with property_id and document_type="property_photos"]
Assistant: "✅ Email enviado exitosamente a maria@example.com con el documento adjunto."
```

---

## 🚨 CRITICAL RULES

1. **ALWAYS call send_email tool** when user provides email
2. **NEVER just say** "voy a enviar" without calling the tool
3. **Include property_id and document_type** to auto-attach the document
4. **Confirm after tool succeeds** with clear message

---
