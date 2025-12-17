# 🚀 Deployment Guide - Development Environment

**MANINOS AI v2.0 - Development Deployment**

Esta guía te llevará paso a paso para hacer un deployment de **development** usando Railway (backend) + Vercel (frontend), igual que en RAMA.

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
- Mismos servicios (Railway + Vercel)
- Variables de entorno diferentes
- Fácil de hacer después de verificar dev

---

## 📋 Pre-requisitos

Antes de empezar, necesitas:

- [x] Cuenta GitHub (ya tienes, con el repo)
- [ ] Cuenta Railway (https://railway.app - usa tu GitHub)
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

## 🔧 PARTE 1: Backend Deployment (Railway)

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

### **Paso 1.2: Crear Proyecto en Railway**

1. **Ve a Railway Dashboard:** https://railway.app/dashboard
2. **Click "New Project"**
3. **Selecciona "Deploy from GitHub repo"**
4. **Connect GitHub Repository:**
   - Autoriza Railway a acceder a GitHub (si no lo has hecho)
   - Selecciona: `mariasebarespersona/maninos-ai`
5. **Railway auto-detectará Python** ✅

**Railway detecta automáticamente:**
- ✅ `requirements.txt` → Instala dependencies
- ✅ Puerto automático con `$PORT`
- ✅ Build y deploy en ~1-2 minutos

### **Paso 1.3: Configurar Start Command**

**✅ IMPORTANTE:** El repo ya incluye un `Procfile` que Railway detecta automáticamente:

```
web: uvicorn app:app --host 0.0.0.0 --port $PORT
```

**NO necesitas configurar Start Command manualmente** - Railway lo detecta del Procfile.

Si quieres verificar:
1. **Click en tu servicio** (aparece después de conectar repo)
2. **Settings → Deploy**
3. **Start Command:** Debería mostrar el comando del Procfile automáticamente
4. **Root Directory:** (dejar vacío)
5. **Watch Paths:** `/**` (dejar por defecto)

### **Paso 1.4: Variables de Entorno (Railway)**

1. **En tu servicio, click en "Variables" tab**
2. **Agregar una por una** (o usar "Raw Editor" para pegar todas):

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

**Tip:** Railway auto-genera `PORT` y otras variables internas.

### **Paso 1.5: Generar Domain Público**

1. **Settings → Networking**
2. **Click "Generate Domain"**
3. Railway te dará algo como:
   ```
   maninos-ai-dev-production.up.railway.app
   ```
4. **Opcional:** Puedes editar el nombre:
   ```
   maninos-ai-dev.up.railway.app
   ```

**Guarda esta URL** - la necesitas para Vercel.

### **Paso 1.6: Deploy Backend**

1. **Railway hace auto-deploy** al conectar el repo
2. **Ver logs en tiempo real:** Click "View Logs"
   ```
   ==> Building...
   ==> Installing dependencies from requirements.txt
   ==> Starting service...
   INFO: Uvicorn running on http://0.0.0.0:PORT
   INFO: Application startup complete.
   ```

3. **Cuando veas "Application startup complete":**
   - ✅ Backend está live!

**Ventaja Railway:** ✅ Trial incluye $5 gratis, NO duerme (a diferencia de Render)

### **Paso 1.7: Verificar Backend**

Abre en navegador tu Railway domain:
```
https://maninos-ai-dev.up.railway.app/
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
curl https://maninos-ai-dev.up.railway.app/

# Test properties endpoint (requiere auth, debería dar error o lista vacía)
curl https://maninos-ai-dev.up.railway.app/api/properties
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
# Backend API URL (tu URL de Railway)
NEXT_PUBLIC_API_URL=https://maninos-ai-dev.up.railway.app
```

**⚠️ IMPORTANTE:** Usa la URL de Railway sin trailing slash.

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

**✅ Railway NO duerme** (con trial de $5, a diferencia de Render free tier)

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
3. **Railway redeploy automático** (~1-2 min)

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

### **Error: '$PORT' is not a valid integer**

**Síntoma:** Railway logs muestran:
```
Error: Invalid value for '--port': '$PORT' is not a valid integer.
```

**Causa:** Railway no está interpretando la variable de entorno `$PORT` correctamente.

**Solución:**
1. **Verifica que tienes el `Procfile` en la raíz** (ya incluido en el repo)
2. **Borra el Start Command manual** en Railway Settings si lo configuraste
3. **Railway auto-detectará el Procfile** y usará el comando correcto
4. **Redeploy:** Settings → Click "Redeploy" o push nuevo commit

✅ El repo ya incluye `Procfile`, Railway debería detectarlo automáticamente.

### **Error: Backend no responde (504)**

**Síntoma:** Frontend muestra "Error connecting to backend"

**Causa:** Railway puede estar reiniciando o error de conexión

**Solución:**
1. Check Railway logs: Dashboard → Tu servicio → "View Logs"
2. Verifica que el deployment fue exitoso
3. Asegura que domain está generado correctamente

**Nota:** Railway con trial NO duerme (ventaja sobre Render free)

### **Error: CORS policy blocked**

**Síntoma:** Console del navegador muestra error CORS

**Solución:**
1. Verifica `app.py` tiene tu URL Vercel en `allow_origins`
2. Push cambios a GitHub
3. Railway redeploy automático (~1-2 min)

### **Error: OpenAI API rate limit**

**Síntoma:** Agente no responde, logs muestran "rate_limit_exceeded"

**Solución:**
1. Verifica que OPENAI_API_KEY es correcto en Railway Variables
2. Revisa tu billing en OpenAI (https://platform.openai.com/account/billing)
3. Agrega créditos si necesario

### **Error: Supabase connection failed**

**Síntoma:** Properties no se guardan

**Solución:**
1. Verifica SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en Railway Variables
2. Verifica que Railway IP está permitido en Supabase (Network Restrictions)
3. En Supabase → Settings → Database → Connection pooling → permitir todas las IPs

### **Frontend build fails en Vercel**

**Síntoma:** Vercel muestra "Build failed"

**Solución:**
1. Revisa logs de Vercel (muestra error exacto)
2. Común: TypeScript errors → arreglar localmente primero
3. `npm run build` localmente para verificar

---

## 📊 Monitoreo Development

### **Railway Logs (Backend)**
```
https://railway.app/dashboard → Tu Proyecto → View Logs
```

Ver en tiempo real:
- Requests entrantes
- Errores de Python
- Database queries
- OpenAI API calls
- Deploy history

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
| **Railway** | Trial | $0 (primeros $5 gratis) | NO duerme, ~500 horas |
| **Vercel** | Hobby | $0/mes | 100GB bandwidth/mes |
| **Supabase** | Free | $0/mes | 500MB database, 2GB bandwidth/mes |
| **OpenAI** | Pay-as-you-go | ~$5-10/mes | Depende de uso (voice + GPT-4o) |
| **Resend** | Free | $0/mes | 100 emails/mes |

**Total estimado:** $5-10/mes (solo OpenAI)

**Ventaja Railway:** Los primeros $5 son gratis en trial, suficiente para 1-2 meses de testing.

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

2. **Crear nuevo deployment en Railway:**
   - Name: `maninos-ai-prod`
   - Same settings, diferentes variables
   - Plan: Developer ($5/mes) o Team ($20/mes)

3. **Crear nuevo deployment en Vercel:**
   - Name: `maninos-ai-prod`
   - Production branch: `main`
   - Custom domain: `app.maninos.com` (si tienes)

### **Opción B: Nueva Base de Datos (Más Seguro)**

1. **Crear nuevo Supabase Project:**
   - Name: "maninos-ai-production"
   - Ejecutar todas las migrations

2. **Railway production:**
   - Nuevas variables con nuevo SUPABASE_URL
   - Plan pagado (Developer $5/mes)

3. **Vercel production:**
   - Nueva URL de backend Railway

**Ventaja:** Dev y prod completamente separados
**Desventaja:** Mantener 2 bases de datos

---

## ✅ Checklist Final

Antes de considerar deployment exitoso:

### **Backend (Railway)**
- [ ] Service está "Active" (deployed exitosamente)
- [ ] Logs muestran "Application startup complete"
- [ ] Domain público generado
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

1. **Check Railway logs:** Errores backend (Dashboard → View Logs)
2. **Check Vercel logs:** Errores frontend
3. **Check Browser Console (F12):** Errores JavaScript/Network
4. **Check Supabase logs:** Errores database

**Errores comunes ya documentados arriba en Troubleshooting.**

---

## 🎯 Resumen Rápido

```bash
# 1. BACKEND (Railway)
1. New Project → Deploy from GitHub repo
2. Connect: mariasebarespersona/maninos-ai
3. Settings → Start Command: uvicorn app:app --host 0.0.0.0 --port $PORT
4. Add environment variables (Supabase, OpenAI, Resend)
5. Settings → Generate Domain
6. Deploy → Wait 1-2 min
7. Test: https://maninos-ai-dev.up.railway.app

# 2. FRONTEND (Vercel)
1. New Project → Import from GitHub
2. Root Directory: web
3. Environment: NEXT_PUBLIC_API_URL=<railway-url>
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
# Railway redeploy automático (1-2 min)

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
