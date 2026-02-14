# Migraciones Maninos AI

## Cómo ejecutar

### 1. Ejecutar el schema inicial en Supabase

1. Ve a tu proyecto en [Supabase Dashboard](https://supabase.com/dashboard)
2. Navega a **SQL Editor**
3. Copia y pega el contenido de `001_initial_schema.sql`
4. Ejecuta el SQL

### 2. Configurar Storage Buckets

En el Dashboard de Supabase:

1. Ve a **Storage** > **New Bucket**
2. Crea el bucket `property-photos`:
   - Name: `property-photos`
   - Public bucket: ✅ **Activado** (para que las fotos sean accesibles públicamente)
   - Click "Create bucket"

3. (Opcional) Crea el bucket `documents`:
   - Name: `documents`
   - Public bucket: ❌ **Desactivado** (documentos privados)
   - Click "Create bucket"

4. **Políticas del bucket `property-photos`** (ya son públicas por defecto):
   - Las fotos se suben con URLs públicas
   - Se organizan por property_id: `{property_id}/{timestamp}-{random}.{ext}`

> ⚠️ **Importante**: Para el MVP los buckets son públicos. En producción considera:
> - RLS policies para restringir uploads a usuarios autenticados
> - Políticas de delete solo para propietarios

### 3. Configurar Auth

En el Dashboard de Supabase:

1. Ve a **Authentication > Providers**
2. Asegúrate de que **Email** esté habilitado
3. (Opcional) Configura **Google** o **GitHub** para login social

### 4. Variables de Entorno

Asegúrate de tener estas variables en tu `.env`:

```bash
# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Next.js (frontend)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Orden de Migraciones

| Archivo | Descripción |
|---------|-------------|
| `001_initial_schema.sql` | Schema inicial con todas las tablas core |

## Tablas Creadas

- `users` - Empleados/usuarios del sistema
- `properties` - Propiedades (casas móviles)
- `clients` - Clientes/compradores
- `sales` - Ventas (contado y futuro RTO)
- `renovations` - Registro de renovaciones
- `documents` - Documentos asociados a entidades
- `audit_logs` - Log de auditoría para seguimiento

