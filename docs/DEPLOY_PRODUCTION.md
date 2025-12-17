# 🏭 Production Deployment Guide

**MANINOS AI v2.0 - Production Environment**

Esta guía es para **DESPUÉS** de haber testeado dev deployment exitosamente.

---

## 📋 Pre-requisitos

Antes de hacer production deployment:

- [x] Dev deployment funcionando 100%
- [x] Testing completo en dev (al menos 1 semana)
- [x] Usuarios beta han probado la app
- [x] No critical bugs en dev
- [ ] Custom domain (opcional): `app.maninos.com`
- [ ] Plan de backup para base de datos
- [ ] Monitoring configurado (Logfire)

---

## 🎯 Diferencias: Development vs Production

| Aspecto | Development | Production |
|---------|------------|------------|
| **Base de Datos** | Supabase compartido | Supabase dedicado (o nuevo proyecto) |
| **Render Plan** | Free (duerme) | Starter ($7/mes, siempre activo) |
| **Vercel Plan** | Hobby (gratis) | Pro ($20/mes, más recursos) |
| **Redis** | No requerido | ✅ Recomendado (Render Redis $10/mes) |
| **Domain** | .onrender.com / .vercel.app | Custom domain |
| **Monitoring** | Básico | Completo (Logfire, Sentry) |
| **Backups** | Manual | Automático diario |
| **Error Tracking** | Logs | Sentry |

---

## 🗄️ Opción 1: Nueva Base de Datos (RECOMENDADO)

### **Por qué nueva BD:**
- ✅ Dev y prod completamente separados
- ✅ No riesgo de borrar datos de producción por accidente
- ✅ Puedes hacer cambios experimentales en dev sin afectar prod
- ✅ Datos limpios desde día 1

### **Pasos:**

1. **Crear nuevo Supabase Project:**
   ```
   Name: maninos-ai-production
   Region: Same as dev (US West)
   Database Password: <nuevo-password-seguro>
   ```

2. **Ejecutar todas las migrations:**
   - Ve a SQL Editor en Supabase
   - Ejecuta TODOS los archivos de `/migrations` en orden
   - Verifica que todas las tablas existan:
     ```sql
     SELECT table_name 
     FROM information_schema.tables 
     WHERE table_schema = 'public';
     ```

3. **Configurar Storage Buckets:**
   ```
   Bucket name: property-docs
   Public: No
   File size limit: 50MB
   Allowed MIME types: text/*, application/pdf, image/*
   ```

4. **Nuevas credenciales:**
   - Guarda nuevo `SUPABASE_URL`
   - Guarda nuevo `SUPABASE_SERVICE_ROLE_KEY`

---

## 🗄️ Opción 2: Schema Separado (Alternativa)

Si prefieres mantener 1 proyecto Supabase:

```sql
-- En Supabase SQL Editor
CREATE SCHEMA production;

-- Duplicar todas las tablas en nuevo schema
CREATE TABLE production.properties (LIKE public.properties INCLUDING ALL);
CREATE TABLE production.maninos_documents (LIKE public.maninos_documents INCLUDING ALL);
-- etc. para todas las tablas
```

**Ventaja:** Un solo proyecto Supabase  
**Desventaja:** Más complejo de mantener

---

## 🚀 Backend Production (Render)

### **Paso 1: Nuevo Web Service**

1. **Dashboard Render** → "New +" → "Web Service"
2. **Config:**
   ```
   Name: maninos-ai-prod
   Branch: main
   Region: Same as dev
   Instance Type: Starter ($7/mes)
   ```

**⚠️ IMPORTANTE:** Usa **Starter plan**, NO Free. Free duerme y da mala experiencia a usuarios.

### **Paso 2: Environment Variables**

```bash
# Supabase PRODUCTION
SUPABASE_URL=https://YOUR-NEW-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_new_production_key

# OpenAI (puede ser la misma key o nueva)
OPENAI_API_KEY=your_openai_key

# Resend
RESEND_API_KEY=your_resend_key

# Logfire (monitoring)
LOGFIRE_TOKEN=your_logfire_token

# Redis (RECOMENDADO para prod)
REDIS_HOST=your-redis-host.render.com
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# Python
PYTHONUNBUFFERED=1
ENVIRONMENT=production
```

### **Paso 3: Configurar Redis (Recomendado)**

1. **En Render:** "New +" → "Redis"
2. **Config:**
   ```
   Name: maninos-ai-redis-prod
   Plan: Starter ($10/mes, 256MB)
   ```
3. **Copy connection details** → Agregar a environment variables

**Beneficio:** Cache mejora performance 3-5x para queries frecuentes

### **Paso 4: Deploy**

1. Click "Create Web Service"
2. Wait for deployment (~3 min)
3. **URL:** `https://maninos-ai-prod.onrender.com`

---

## 🌐 Frontend Production (Vercel)

### **Opción A: Nuevo Proyecto (Recomendado)**

1. **New Project en Vercel**
2. **Config:**
   ```
   Name: maninos-ai-prod
   Production Branch: main
   Root Directory: web
   ```

3. **Environment Variables:**
   ```bash
   NEXT_PUBLIC_API_URL=https://maninos-ai-prod.onrender.com
   ```

4. **Deploy**
5. **URL:** `https://maninos-ai-prod.vercel.app`

### **Opción B: Custom Domain**

Si tienes dominio (ej: `maninos.com`):

1. **En Vercel:** Settings → Domains
2. **Add Domain:** `app.maninos.com`
3. **Configure DNS:**
   ```
   Type: CNAME
   Name: app
   Value: cname.vercel-dns.com
   ```
4. **Wait for verification** (5-30 min)
5. **SSL certificate automático** (Vercel)

---

## 🔐 Security Hardening

### **1. Supabase Row Level Security (RLS)**

Ya lo tienes configurado, pero verifica:

```sql
-- Verificar RLS está activo
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND rowsecurity = false;

-- Si alguna tabla muestra false:
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
```

### **2. API Rate Limiting**

En `app.py`, agrega rate limiting (si no está):

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@app.post("/ui_chat")
@limiter.limit("20/minute")  # 20 requests per minute
async def ui_chat(request: Request):
    # ...
```

### **3. Environment Variables Rotation**

Rotar keys cada 3 meses:
- OpenAI API Key
- Supabase Service Role Key
- Resend API Key

---

## 📊 Monitoring & Observability

### **1. Logfire (Already configured)**

Ver en dashboard:
- Response times
- Error rates
- LLM costs
- User activity

### **2. Sentry (Error Tracking)**

```bash
# Agregar a requirements.txt
sentry-sdk[fastapi]
```

```python
# app.py
import sentry_sdk

sentry_sdk.init(
    dsn="your-sentry-dsn",
    environment="production",
    traces_sample_rate=0.1
)
```

### **3. Uptime Monitoring**

Usa **UptimeRobot** (gratis):
- Monitor: `https://maninos-ai-prod.onrender.com/`
- Check interval: 5 minutes
- Alert email si down

---

## 💾 Backup Strategy

### **1. Database Backups**

**Automático:** Supabase hace backups diarios (retenidos 7 días)

**Manual:** Antes de cambios grandes:
```sql
-- En Supabase SQL Editor
-- Export all data
COPY (SELECT * FROM properties) TO '/tmp/properties_backup.csv' CSV HEADER;
```

O usa Supabase Dashboard → Database → Backups

### **2. Storage Backups**

**Documents:** Ya están en Supabase Storage (replicado)

**Adicional:** Script para backup semanal a S3/Google Cloud

---

## 📈 Scaling Considerations

Cuando tengas muchos usuarios:

### **Backend Scaling (Render)**
- **Starter ($7/mes):** 512MB RAM, suficiente para 100-500 users
- **Standard ($25/mes):** 2GB RAM, hasta 2000-5000 users
- **Pro ($85/mes):** 4GB RAM, 10k+ users

### **Database Scaling (Supabase)**
- **Free:** Hasta 500MB, suficiente para 100-200 properties
- **Pro ($25/mes):** 8GB, hasta 5000-10000 properties
- **Team ($599/mes):** 100GB+, ilimitado

### **Frontend Scaling (Vercel)**
- **Hobby (gratis):** 100GB bandwidth/mes, suficiente para MVP
- **Pro ($20/mes):** 1TB bandwidth/mes, analytics avanzado

---

## 🧪 Testing Production (Antes de usuarios)

### **Smoke Tests:**

1. **Health check:**
   ```bash
   curl https://maninos-ai-prod.onrender.com/
   ```

2. **Create property:**
   - Login a app
   - "Evaluar propiedad TEST PRODUCTION"
   - Verificar en Supabase que se guardó

3. **Upload document:**
   - Subir archivo de prueba
   - Verificar en Storage

4. **Voice input:**
   - Grabar mensaje
   - Verificar transcripción

5. **RAG query:**
   - "¿Qué dice el documento?"
   - Verificar respuesta con citations

6. **Contract generation:**
   - Completar workflow
   - Generar contrato
   - Verificar indexing

### **Load Testing (Opcional):**

```bash
# Usar Apache Bench
ab -n 100 -c 10 https://maninos-ai-prod.onrender.com/api/properties
```

Target: <200ms response time (95th percentile)

---

## 🚦 Go-Live Checklist

Antes de anunciar a usuarios:

### **Technical**
- [ ] Production deployment exitoso
- [ ] Todos los smoke tests pasando
- [ ] Monitoring configurado (Logfire/Sentry)
- [ ] Backups configurados
- [ ] Redis funcionando (cache hit rate >50%)
- [ ] Custom domain configurado (si aplica)
- [ ] SSL certificate activo (Vercel)

### **Business**
- [ ] Al menos 5 usuarios beta testearon
- [ ] Documentation completa (README, user guide)
- [ ] Support email configurado
- [ ] Billing plan definido
- [ ] Legal: Terms of Service, Privacy Policy (si aplicable)

### **Operations**
- [ ] On-call plan (quién responde si hay issues)
- [ ] Rollback plan (cómo volver a versión anterior)
- [ ] Incident response playbook
- [ ] User onboarding emails (Resend templates)

---

## 🔄 Rollback Plan

Si algo sale mal en production:

### **Rollback Backend:**
1. **Render Dashboard** → Service → Manual Deploy
2. Select previous successful deployment
3. Click "Redeploy"
4. ~2 minutes to rollback

### **Rollback Frontend:**
1. **Vercel Dashboard** → Deployments
2. Find last working deployment
3. Click "..." → "Promote to Production"
4. Instant rollback

### **Database Rollback:**
1. Supabase → Backups
2. Restore to previous point-in-time
3. Update Render environment variables si cambió URL

---

## 💰 Production Costs (Estimated)

| Servicio | Plan | Costo/mes | Capacidad |
|----------|------|-----------|-----------|
| **Render (Backend)** | Starter | $7 | 100-500 users |
| **Render (Redis)** | Starter | $10 | 256MB cache |
| **Vercel** | Pro | $20 | 1TB bandwidth |
| **Supabase** | Pro | $25 | 8GB database, 100GB storage |
| **OpenAI API** | Usage | $50-200 | Depends on volume |
| **Logfire** | Free/Paid | $0-20 | Monitoring |
| **Domain** | Namecheap/etc | $12/año | app.maninos.com |

**Total:** ~$120-280/mes (depends on OpenAI usage)

**Por usuario:** $1-3/mes si tienes 100 usuarios

---

## 📞 Post-Production Support

### **Daily Tasks:**
- [ ] Check Logfire dashboard (errores, latency)
- [ ] Monitor OpenAI costs
- [ ] Check Render logs para critical errors
- [ ] Verify uptime (UptimeRobot)

### **Weekly Tasks:**
- [ ] Review user feedback
- [ ] Analyze most common queries (improve prompts)
- [ ] Check database size (scaling necesario?)
- [ ] Review Sentry errors (fix top issues)

### **Monthly Tasks:**
- [ ] Database backup verification
- [ ] Security audit (Supabase RLS, API keys)
- [ ] Performance review (optimize slow queries)
- [ ] Cost analysis (optimize OpenAI usage)
- [ ] Deploy updates from dev

---

## 🎯 Success Metrics

Track estas métricas post-launch:

### **Usage Metrics:**
- Daily Active Users (DAU)
- Properties evaluated per day
- Contracts generated per day
- Average session length

### **Performance Metrics:**
- API response time (P50, P95, P99)
- Cache hit rate
- Error rate (<1% target)
- Uptime (>99.9% target)

### **Business Metrics:**
- User retention (Day 7, Day 30)
- Properties per user
- Time to complete full workflow
- User satisfaction (NPS score)

---

## 🚀 Launch Strategy

### **Phase 1: Soft Launch (Week 1)**
- 5-10 beta users
- Daily monitoring
- Quick fixes for critical bugs
- Collect feedback

### **Phase 2: Controlled Launch (Week 2-4)**
- 20-50 users
- Weekly updates
- Feature improvements
- Performance optimization

### **Phase 3: Public Launch (Month 2+)**
- Open to all
- Marketing campaign
- Full support
- Regular feature releases

---

## 🎉 You're Ready for Production!

Cuando hayas:
1. ✅ Testeado dev deployment por 1-2 semanas
2. ✅ Tenido 5+ usuarios beta testeando
3. ✅ Resuelto todos los critical bugs
4. ✅ Configurado monitoring
5. ✅ Planificado backups

**Entonces puedes seguir esta guía para production deployment.**

---

**Version:** Production Deployment Guide v1.0  
**Last Updated:** December 17, 2024  
**Status:** Ready for Production (after dev testing)

🏭 **¡Listo para escalar!** 🏭
