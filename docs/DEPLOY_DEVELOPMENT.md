# 🚀 Deployment Guide - Development Environment

**MANINOS AI v2.0 - Development Deployment**

Esta guía te llevará paso a paso para hacer un deployment de **development** usando Render (backend) + Vercel (frontend), igual que en RAMA.

---

## 🎯 Objetivos

**Development Deployment:**
- ✅ Testing en ambiente real (no localhost)
- ✅ Verificar que todo funciona en producción
- ✅ Compartir con testers para feedback
- ✅ Usar MISMA base de datos Supabase (es gratis y suficiente)
- ✅ Sin Redis (opcional para dev, agregarlo después si necesitas)

**Después de dev (Production):**
- Nueva base de datos (o schema separado)
- Mismos servicios (Render + Vercel)
- Variables de entorno diferentes
- Fácil de hacer después de verificar dev

---

## 📋 Pre-requisitos

Antes de empezar, necesitas:

- [x] Cuenta GitHub (ya tienes, con el repo)
- [ ] Cuenta Render (https://render.com - usa tu GitHub)
- [ ] Cuenta Vercel (https://vercel.com - usa tu GitHub)
- [ ] Supabase Project (ya tienes)
- [ ] OpenAI API Key (ya tienes)
- [ ] Resend API Key (ya tienes para emails)

---

## 🗄️ Base de Datos: Usar la Misma Supabase

**✅ RECOMENDACIÓN:** Usa tu Supabase existente para development.

**¿Por qué?**
- Supabase free tier es generoso (500MB storage, 2GB bandwidth/mes)
- No necesitas duplicar migrations
- Fácil de limpiar datos de testing después

**Estrategia para mantener dev y prod separados (futuro):**

### Opción 1: Prefijo en nombres (Más Simple)
```
Development properties: "DEV - Casa en Calle X"
Production properties: "Casa en Calle X"
```

### Opción 2: Schema separado (Más Limpio, cuando hagas production)
```sql
-- En Supabase SQL Editor cuando hagas production
CREATE SCHEMA production;
CREATE SCHEMA development;

-- Tablas en schemas diferentes
-- production.properties
-- development.properties
```

**Para ahora (dev deployment):** Usa tu base de datos actual como está. Cuando hagas production, puedes:
1. Limpiar datos de testing
2. O crear schema separado
3. O crear nuevo proyecto Supabase

---

## 🔧 PARTE 1: Backend Deployment (Render)

### **Paso 1.1: Preparar el Proyecto**

Primero verifica que tu proyecto esté listo:

```bash
cd /Users/mariasebares/Documents/RAMA_AI/maninos-ai

# 1. Asegúrate de que requirements.txt está completo
cat requirements.txt

# 2. Verifica que app.py funciona localmente
uvicorn app:app --host 0.0.0.0 --port 8080

# 3. Confirma último commit
git status
```

### **Paso 1.2: Crear Web Service en Render**

1. **Ve a Render Dashboard:** https://dashboard.render.com
2. **Click "New +"** → **"Web Service"**
3. **Connect GitHub Repository:**
   - Autoriza Render a acceder a GitHub
   - Selecciona: `mariasebarespersona/maninos-ai`
4. **Configuración Básica:**
   ```
   Name: maninos-ai-dev
   Region: Oregon (US West) - o el más cercano
   Branch: main
   Root Directory: (dejar vacío)
   Runtime: Python 3
   Build Command: pip install -r requirements.txt
   Start Command: uvicorn app:app --host 0.0.0.0 --port $PORT
   ```

5. **Plan:** Free (para development)
   - ⚠️ Free tier duerme después de 15 min de inactividad
   - ⚠️ Primera request toma ~30s en despertar
   - ✅ Suficiente para testing

### **Paso 1.3: Variables de Entorno (Render)**

En Render, ve a **"Environment"** tab y agrega:

```bash
# Supabase
SUPABASE_URL=https://tdmoslqfavtybathdnnv.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key_aqui

# OpenAI
OPENAI_API_KEY=tu_openai_key_aqui

# Resend (para emails)
RESEND_API_KEY=tu_resend_key_aqui

# Logfire (opcional, para monitoreo)
LOGFIRE_TOKEN=tu_logfire_token_aqui

# Python
PYTHONUNBUFFERED=1

# Redis (opcional - OMITIR para dev)
# REDIS_HOST=
# REDIS_PORT=
# REDIS_PASSWORD=
```

**⚠️ IMPORTANTE:** NO incluyas Redis para dev deployment. La app funciona perfectamente sin cache.

### **Paso 1.4: Deploy Backend**

1. Click **"Create Web Service"**
2. Render empezará a build (~2-3 minutos)
3. **Logs aparecerán en tiempo real:**
   ```
   ==> Building...
   ==> Installing dependencies from requirements.txt
   ==> Starting service with command: uvicorn app:app...
   INFO: Uvicorn running on http://0.0.0.0:10000
   ```

4. **Cuando veas:** `INFO: Application startup complete.`
   - ✅ Backend está live!

5. **URL del backend:** `https://maninos-ai-dev.onrender.com`
   - Guarda esta URL, la necesitas para frontend

### **Paso 1.5: Verificar Backend**

Abre en navegador:
```
https://maninos-ai-dev.onrender.com/
```

Deberías ver:
```json
{
  "message": "MANINOS AI API",
  "version": "2.0",
  "status": "running"
}
```

**Test endpoints:**
```bash
# Test API health
curl https://maninos-ai-dev.onrender.com/

# Test properties endpoint (requiere auth, debería dar error o lista vacía)
curl https://maninos-ai-dev.onrender.com/api/properties
```

---

## 🌐 PARTE 2: Frontend Deployment (Vercel)

### **Paso 2.1: Preparar Frontend**

```bash
cd /Users/mariasebares/Documents/RAMA_AI/maninos-ai/web

# 1. Verifica que build funciona localmente
npm run build

# Si hay errores, arreglarlos antes de deploy

# 2. Verifica package.json
cat package.json
```

### **Paso 2.2: Crear Proyecto en Vercel**

1. **Ve a Vercel:** https://vercel.com/new
2. **Import Git Repository:**
   - Click "Add New..." → "Project"
   - Selecciona: `mariasebarespersona/maninos-ai`
3. **Configuración del Proyecto:**
   ```
   Project Name: maninos-ai-dev
   Framework Preset: Next.js (auto-detectado)
   Root Directory: web
   Build Command: npm run build (auto)
   Output Directory: .next (auto)
   Install Command: npm install (auto)
   ```

### **Paso 2.3: Variables de Entorno (Vercel)**

En Vercel, **antes de hacer deploy**, ve a "Environment Variables":

```bash
# Backend API URL (tu URL de Render)
NEXT_PUBLIC_API_URL=https://maninos-ai-dev.onrender.com
```

**⚠️ IMPORTANTE:** Usa la URL de Render sin trailing slash.

### **Paso 2.4: Deploy Frontend**

1. Click **"Deploy"**
2. Vercel hará build (~1-2 minutos)
3. **Logs mostrarán:**
   ```
   Building...
   Creating an optimized production build...
   Compiled successfully
   Deployment ready
   ```

4. **URL del frontend:** `https://maninos-ai-dev.vercel.app`
   - Vercel te da esta URL automáticamente

### **Paso 2.5: Verificar Frontend**

Abre en navegador:
```
https://maninos-ai-dev.vercel.app
```

Deberías ver:
- ✅ UI de MANINOS AI
- ✅ Chat interface
- ✅ Properties drawer
- ✅ Visual stepper

**⚠️ Primera vez puede tardar 30s** (Render free tier despierta)

---

## 🔗 PARTE 3: Conectar Frontend ↔ Backend

### **Paso 3.1: Configurar CORS en Backend**

Tu `app.py` ya tiene CORS configurado, pero verifica que incluya tu dominio Vercel:

```python
# app.py - ya existe, solo verificar
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "https://maninos-ai-dev.vercel.app",  # ← Verifica esto
        "https://*.vercel.app"  # Permite todos los deploys Vercel
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Si necesitas agregar tu dominio:

1. **Edita `app.py`** (agrega tu URL de Vercel)
2. **Commit y push:**
   ```bash
   git add app.py
   git commit -m "feat: Add Vercel dev URL to CORS"
   git push origin main
   ```
3. **Render redeploy automático** (~2 min)

### **Paso 3.2: Test Integración Completa**

Abre tu app en Vercel:
```
https://maninos-ai-dev.vercel.app
```

**Tests básicos:**

1. **Chat funciona:**
   ```
   Usuario: "Hola"
   Esperado: Respuesta del agente
   ```

2. **Crear propiedad:**
   ```
   Usuario: "Evaluar propiedad en Calle Test 123"
   Esperado: Propiedad creada, stepper actualizado
   ```

3. **Voice input:**
   - Click en micrófono
   - Hablar: "Hola"
   - Verificar transcripción y respuesta

4. **Upload documento:**
   - Subir cualquier archivo .txt
   - Verificar que se guarda

**Si todo funciona → ✅ Deployment exitoso!**

---

## 🐛 Troubleshooting

### **Error: Backend no responde (504)**

**Síntoma:** Frontend muestra "Error connecting to backend"

**Causa:** Render free tier está dormido (primer request)

**Solución:**
1. Espera 30 segundos
2. Refresh página
3. Debería funcionar

**Para evitar:** Upgrade Render a plan Starter ($7/mes) - nunca duerme

### **Error: CORS policy blocked**

**Síntoma:** Console del navegador muestra error CORS

**Solución:**
1. Verifica `app.py` tiene tu URL Vercel en `allow_origins`
2. Push cambios a GitHub
3. Render redeploy automático

### **Error: OpenAI API rate limit**

**Síntoma:** Agente no responde, logs muestran "rate_limit_exceeded"

**Solución:**
1. Verifica que OPENAI_API_KEY es correcto en Render
2. Revisa tu billing en OpenAI (https://platform.openai.com/account/billing)
3. Agrega créditos si necesario

### **Error: Supabase connection failed**

**Síntoma:** Properties no se guardan

**Solución:**
1. Verifica SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en Render
2. Verifica que Render IP está permitido en Supabase (Network Restrictions)
3. En Supabase → Settings → Database → Connection pooling → permitir todas las IPs

### **Frontend build fails en Vercel**

**Síntoma:** Vercel muestra "Build failed"

**Solución:**
1. Revisa logs de Vercel (muestra error exacto)
2. Común: TypeScript errors → arreglar localmente primero
3. `npm run build` localmente para verificar

---

## 📊 Monitoreo Development

### **Render Logs (Backend)**
```
https://dashboard.render.com/web/YOUR_SERVICE/logs
```

Ver en tiempo real:
- Requests entrantes
- Errores de Python
- Database queries
- OpenAI API calls

### **Vercel Logs (Frontend)**
```
https://vercel.com/YOUR_PROJECT/deployments
```

Ver:
- Build logs
- Runtime errors
- Performance metrics

### **Supabase Dashboard**
```
https://supabase.com/dashboard/project/YOUR_PROJECT
```

Ver:
- Database queries
- Storage usage
- API requests

---

## 💰 Costos Development

| Servicio | Plan | Costo | Límites |
|----------|------|-------|---------|
| **Render** | Free | $0/mes | 750 horas/mes, duerme después 15 min |
| **Vercel** | Hobby | $0/mes | 100GB bandwidth/mes |
| **Supabase** | Free | $0/mes | 500MB database, 2GB bandwidth/mes |
| **OpenAI** | Pay-as-you-go | ~$5-10/mes | Depende de uso (voice + GPT-4o) |
| **Resend** | Free | $0/mes | 100 emails/mes |

**Total estimado:** $5-10/mes (solo OpenAI)

---

## 🚀 PARTE 4: Transición a Production (Futuro)

Cuando estés listo para production:

### **Opción A: Duplicar con Datos Limpios (Recomendado)**

1. **Limpiar datos de testing en Supabase:**
   ```sql
   -- En Supabase SQL Editor
   DELETE FROM properties WHERE name LIKE 'DEV -%';
   DELETE FROM properties WHERE name LIKE 'Test%';
   -- etc.
   ```

2. **Crear nuevo deployment en Render:**
   - Name: `maninos-ai-prod`
   - Same settings, diferentes variables

3. **Crear nuevo deployment en Vercel:**
   - Name: `maninos-ai-prod`
   - Production branch: `main`
   - Custom domain: `app.maninos.com` (si tienes)

### **Opción B: Nueva Base de Datos (Más Seguro)**

1. **Crear nuevo Supabase Project:**
   - Name: "maninos-ai-production"
   - Ejecutar todas las migrations

2. **Render production:**
   - Nuevas variables con nuevo SUPABASE_URL

3. **Vercel production:**
   - Nueva URL de backend

**Ventaja:** Dev y prod completamente separados
**Desventaja:** Mantener 2 bases de datos

---

## ✅ Checklist Final

Antes de considerar deployment exitoso:

### **Backend (Render)**
- [ ] Service está "Live" (verde)
- [ ] Logs muestran "Application startup complete"
- [ ] `GET /` devuelve JSON con version 2.0
- [ ] `GET /api/properties` funciona (aunque esté vacío)
- [ ] Variables de entorno configuradas

### **Frontend (Vercel)**
- [ ] Build completado exitosamente
- [ ] URL abre la app correctamente
- [ ] Chat interface visible
- [ ] Properties drawer funciona
- [ ] NEXT_PUBLIC_API_URL configurado

### **Integración**
- [ ] Chat responde correctamente
- [ ] Crear propiedad funciona
- [ ] Upload documentos funciona
- [ ] Voice input funciona (micrófono)
- [ ] No errores CORS en console

### **Base de Datos**
- [ ] Propiedades se guardan en Supabase
- [ ] Documentos se suben a Storage
- [ ] Sessions se crean correctamente

---

## 📞 Soporte

**Si algo no funciona:**

1. **Check Render logs:** Errores backend
2. **Check Vercel logs:** Errores frontend
3. **Check Browser Console (F12):** Errores JavaScript/Network
4. **Check Supabase logs:** Errores database

**Errores comunes ya documentados arriba en Troubleshooting.**

---

## 🎯 Resumen Rápido

```bash
# 1. BACKEND (Render)
1. New Web Service → Connect GitHub repo
2. Configure: Python, uvicorn start command
3. Add environment variables (Supabase, OpenAI)
4. Deploy → Wait 2-3 min
5. Test: https://maninos-ai-dev.onrender.com

# 2. FRONTEND (Vercel)
1. New Project → Import from GitHub
2. Root Directory: web
3. Environment: NEXT_PUBLIC_API_URL=<render-url>
4. Deploy → Wait 1-2 min
5. Test: https://maninos-ai-dev.vercel.app

# 3. VERIFY
1. Open Vercel URL
2. Chat: "Hola"
3. Create property: "Evaluar casa en Test St"
4. Upload document
5. Test voice input

✅ Si todo funciona → DONE!
```

---

## 🔄 Updates y Re-deploys

**Después del deployment inicial:**

### **Para actualizar código:**

```bash
# Backend
git add .
git commit -m "feat: new feature"
git push origin main
# Render redeploy automático (2-3 min)

# Frontend
git push origin main
# Vercel redeploy automático (1-2 min)
```

**Ambos servicios redeployean automáticamente cuando pushes a `main`** ✅

---

**Version:** Development Deployment Guide v1.0  
**Last Updated:** December 17, 2024  
**Status:** Ready to Deploy

🚀 **¡Listo para hacer deployment!** 🚀
