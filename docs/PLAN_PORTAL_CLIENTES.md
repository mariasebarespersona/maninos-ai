# 🏠 Plan Portal Clientes - Maninos AI

**Versión:** 1.0  
**Fecha:** Febrero 2026  
**Autor:** Senior App Developer  

---

## 📋 Resumen Ejecutivo

El **Portal Clientes** es una aplicación web pública donde los clientes pueden:
1. Ver las casas disponibles publicadas por Maninos Homes
2. Comprar una casa al contado (Opción 1 del diagrama)
3. Hacer el pago via Stripe
4. Ver su título una vez completada la compra

Este plan sigue estrictamente el **Diagrama V2** y el **Developer Bible**.

---

## 🎯 Objetivos del Portal

| Objetivo | Descripción |
|----------|-------------|
| **Ver casas** | Catálogo público de casas con fotos, precio, ubicación |
| **Comprar** | Flujo de compra completo siguiendo Opción 1: Contado |
| **Pagar** | Integración con Stripe para pagos seguros |
| **Seguimiento** | Cliente puede ver estado de su compra y documentos |

---

## 🔄 Flujo Completo (Según Diagrama)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PORTAL CLIENTES - FLUJO CONTADO                       │
└─────────────────────────────────────────────────────────────────────────────┘

   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
   │  1. VER  │───▶│ 2. DATOS │───▶│ 3. PAGO  │───▶│ 4. DOCS  │───▶│ 5. TÍTULO│
   │  CASAS   │    │ CLIENTE  │    │  STRIPE  │    │   GEN    │    │  CLIENTE │
   └──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
        │               │               │               │               │
        ▼               ▼               ▼               ▼               ▼
   Casas con       Nombre, Tel     PaymentIntent   Bill of Sale    Cliente ve
   status=         Correo,         Stripe          auto-generado   su título
   'published'     Terreno                                         en portal
                                        │
                                        ▼
                                 📧 Recordatorios
                                 (si pago pendiente)
```

---

## 📁 Estructura de Archivos

```
web/src/app/
├── clientes/                          # Portal Clientes (NUEVO)
│   ├── layout.tsx                     # Layout público (sin auth requerido)
│   ├── page.tsx                       # Landing page
│   ├── casas/
│   │   ├── page.tsx                   # Catálogo de casas
│   │   └── [id]/
│   │       └── page.tsx               # Detalle de casa
│   ├── comprar/
│   │   └── [propertyId]/
│   │       ├── page.tsx               # Paso 1: Datos cliente
│   │       ├── pago/
│   │       │   └── page.tsx           # Paso 2: Pago Stripe
│   │       └── confirmacion/
│   │           └── page.tsx           # Paso 3: Confirmación
│   ├── mi-cuenta/
│   │   ├── page.tsx                   # Dashboard cliente (auth)
│   │   └── documentos/
│   │       └── page.tsx               # Ver título y docs
│   └── login/
│       └── page.tsx                   # Login cliente
│
api/routes/
├── public/                            # APIs públicas (NUEVO)
│   ├── __init__.py
│   ├── properties.py                  # GET casas publicadas
│   └── purchases.py                   # POST compra + pago
│
web/src/app/api/
├── public/                            # Proxies Next.js (NUEVO)
│   ├── properties/
│   │   └── route.ts
│   ├── purchases/
│   │   └── route.ts
│   └── payments/
│       └── route.ts
```

---

## 🗄️ Base de Datos

### Tablas Existentes (Sin cambios)
- ✅ `properties` - Casas (filtrar por `status = 'published'`)
- ✅ `clients` - Compradores
- ✅ `sales` - Ventas
- ✅ `documents` - Documentos
- ✅ `title_transfers` - Transferencias de título

### Nueva Política RLS para Acceso Público

```sql
-- Permitir lectura pública de propiedades publicadas
CREATE POLICY "Public read published properties" ON properties
    FOR SELECT
    USING (status = 'published');

-- Permitir que clientes lean sus propios datos
CREATE POLICY "Clients read own data" ON clients
    FOR SELECT
    USING (id = auth.uid()::uuid OR auth.role() = 'authenticated');

-- Permitir que clientes vean sus ventas
CREATE POLICY "Clients read own sales" ON sales
    FOR SELECT
    USING (client_id IN (SELECT id FROM clients WHERE id = auth.uid()::uuid));
```

### Nueva Tabla: `client_auth` (Opcional - para login de clientes)

```sql
CREATE TABLE IF NOT EXISTS client_auth (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES clients(id),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,  -- NULL si usa magic link
    verified BOOLEAN DEFAULT false,
    verification_token TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 🛠️ Backend APIs (FastAPI)

### 1. GET `/api/public/properties` - Listar casas publicadas

```python
@router.get("/properties")
async def list_published_properties(
    city: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    bedrooms: Optional[int] = None,
):
    """
    Retorna casas con status='published' para el portal público.
    No requiere autenticación.
    """
    query = sb.table("properties").select("*").eq("status", "published")
    
    if city:
        query = query.ilike("city", f"%{city}%")
    if min_price:
        query = query.gte("sale_price", min_price)
    if max_price:
        query = query.lte("sale_price", max_price)
    if bedrooms:
        query = query.eq("bedrooms", bedrooms)
    
    result = query.execute()
    return result.data
```

### 2. GET `/api/public/properties/{id}` - Detalle de casa

```python
@router.get("/properties/{property_id}")
async def get_property_detail(property_id: str):
    """
    Retorna detalle de una casa publicada.
    Incluye fotos, precio, ubicación, características.
    """
    result = sb.table("properties") \
        .select("*") \
        .eq("id", property_id) \
        .eq("status", "published") \
        .single() \
        .execute()
    
    if not result.data:
        raise HTTPException(404, "Propiedad no encontrada o no disponible")
    
    return result.data
```

### 3. POST `/api/public/purchases` - Iniciar compra

```python
class PurchaseRequest(BaseModel):
    property_id: str
    client_name: str
    client_email: EmailStr
    client_phone: str
    client_terreno: str  # Ubicación del terreno

@router.post("/purchases")
async def initiate_purchase(request: PurchaseRequest):
    """
    Paso 1: Registrar cliente y crear venta pendiente.
    Retorna client_id y sale_id para siguiente paso.
    """
    # 1. Verificar propiedad disponible
    prop = sb.table("properties") \
        .select("*") \
        .eq("id", request.property_id) \
        .eq("status", "published") \
        .single() \
        .execute()
    
    if not prop.data:
        raise HTTPException(400, "Propiedad no disponible")
    
    # 2. Crear o actualizar cliente
    client = sb.table("clients").upsert({
        "name": request.client_name,
        "email": request.client_email,
        "phone": request.client_phone,
        "terreno": request.client_terreno,
        "status": "lead"
    }, on_conflict="email").execute()
    
    client_id = client.data[0]["id"]
    
    # 3. Crear venta pendiente
    sale = sb.table("sales").insert({
        "property_id": request.property_id,
        "client_id": client_id,
        "sale_type": "contado",
        "sale_price": prop.data["sale_price"],
        "status": "pending"
    }).execute()
    
    # 4. Crear cliente en Stripe
    stripe_result = create_stripe_customer(
        client_id=client_id,
        email=request.client_email,
        name=request.client_name,
        phone=request.client_phone
    )
    
    return {
        "ok": True,
        "client_id": client_id,
        "sale_id": sale.data[0]["id"],
        "stripe_customer_id": stripe_result.get("stripe_customer_id"),
        "amount": float(prop.data["sale_price"]),
        "property": prop.data,
        "next_step": "payment"
    }
```

### 4. POST `/api/public/payments` - Crear PaymentIntent

```python
class PaymentRequest(BaseModel):
    sale_id: str
    stripe_customer_id: str

@router.post("/payments")
async def create_payment(request: PaymentRequest):
    """
    Paso 2: Crear PaymentIntent de Stripe.
    El frontend usa el client_secret con Stripe Elements.
    """
    # Obtener venta
    sale = sb.table("sales") \
        .select("*, properties(address, sale_price)") \
        .eq("id", request.sale_id) \
        .single() \
        .execute()
    
    if not sale.data:
        raise HTTPException(404, "Venta no encontrada")
    
    amount_cents = int(float(sale.data["sale_price"]) * 100)
    
    # Crear PaymentIntent
    result = create_payment_intent(
        stripe_customer_id=request.stripe_customer_id,
        amount_cents=amount_cents,
        description=f"Compra casa: {sale.data['properties']['address']}",
        contract_id=request.sale_id
    )
    
    return result
```

### 5. POST `/api/public/payments/confirm` - Confirmar pago

```python
@router.post("/payments/confirm")
async def confirm_payment(sale_id: str, payment_intent_id: str):
    """
    Paso 3: Confirmar que el pago fue exitoso.
    Actualiza venta, propiedad y genera documentos.
    """
    # Verificar pago en Stripe
    stripe = _get_stripe_client()
    payment = stripe.PaymentIntent.retrieve(payment_intent_id)
    
    if payment.status != "succeeded":
        raise HTTPException(400, f"Pago no completado: {payment.status}")
    
    # Actualizar venta
    sb.table("sales").update({
        "status": "paid",
        "payment_method": "stripe",
        "payment_reference": payment_intent_id,
        "completed_at": datetime.utcnow().isoformat()
    }).eq("id", sale_id).execute()
    
    # Obtener datos completos
    sale = sb.table("sales") \
        .select("*, clients(*), properties(*)") \
        .eq("id", sale_id) \
        .single() \
        .execute()
    
    # Actualizar propiedad a vendida
    sb.table("properties").update({
        "status": "sold"
    }).eq("id", sale.data["property_id"]).execute()
    
    # Actualizar cliente a activo
    sb.table("clients").update({
        "status": "active"
    }).eq("id", sale.data["client_id"]).execute()
    
    # Crear transferencia de título
    sb.table("title_transfers").insert({
        "property_id": sale.data["property_id"],
        "transfer_type": "sale",
        "from_entity": "Maninos Homes",
        "to_entity": sale.data["clients"]["name"],
        "transfer_date": datetime.utcnow().isoformat(),
        "status": "pending",
        "notes": f"Venta contado - Sale ID: {sale_id}"
    }).execute()
    
    # Enviar email de confirmación
    send_confirmation_email(sale.data)
    
    return {
        "ok": True,
        "message": "¡Compra completada exitosamente!",
        "sale_id": sale_id,
        "next_step": "Ver documentos en Mi Cuenta"
    }
```

### 6. GET `/api/clients/{id}/documents` - Documentos del cliente

```python
@router.get("/clients/{client_id}/documents")
async def get_client_documents(client_id: str):
    """
    Retorna documentos del cliente incluyendo título.
    Requiere autenticación del cliente.
    """
    # Obtener ventas del cliente
    sales = sb.table("sales") \
        .select("*, properties(*), title_transfers(*)") \
        .eq("client_id", client_id) \
        .execute()
    
    # Obtener documentos
    docs = sb.table("documents") \
        .select("*") \
        .eq("entity_type", "sale") \
        .in_("entity_id", [s["id"] for s in sales.data]) \
        .execute()
    
    return {
        "sales": sales.data,
        "documents": docs.data
    }
```

---

## 🎨 Frontend (Next.js)

### 1. Landing Page (`/clientes/page.tsx`)

```tsx
export default function ClientPortalHome() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-navy-900 to-navy-800">
      {/* Hero Section */}
      <section className="py-20 text-center">
        <h1 className="text-5xl font-bold text-white mb-4">
          Tu Casa Móvil en Texas
        </h1>
        <p className="text-xl text-gray-300 mb-8">
          Casas renovadas, listas para vivir. Compra al contado de forma segura.
        </p>
        <Link href="/clientes/casas" className="btn-gold text-lg px-8 py-4">
          Ver Casas Disponibles →
        </Link>
      </section>
      
      {/* Features */}
      <section className="py-16 bg-white">
        <div className="container mx-auto grid md:grid-cols-3 gap-8">
          <FeatureCard 
            icon="🏠" 
            title="Casas Renovadas"
            description="Todas nuestras casas están completamente renovadas y listas para habitar."
          />
          <FeatureCard 
            icon="💳" 
            title="Pago Seguro"
            description="Paga de forma segura con tarjeta a través de Stripe."
          />
          <FeatureCard 
            icon="📄" 
            title="Título Directo"
            description="Recibe el título de propiedad directamente a tu nombre."
          />
        </div>
      </section>
    </div>
  )
}
```

### 2. Catálogo de Casas (`/clientes/casas/page.tsx`)

```tsx
'use client'

export default function HouseCatalog() {
  const [properties, setProperties] = useState([])
  const [filters, setFilters] = useState({
    city: '',
    minPrice: '',
    maxPrice: ''
  })

  useEffect(() => {
    fetchProperties()
  }, [filters])

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Casas Disponibles</h1>
      
      {/* Filtros */}
      <div className="bg-gray-100 p-4 rounded-lg mb-8 flex gap-4">
        <input 
          placeholder="Ciudad" 
          value={filters.city}
          onChange={e => setFilters({...filters, city: e.target.value})}
        />
        <input 
          placeholder="Precio mínimo" 
          type="number"
          value={filters.minPrice}
          onChange={e => setFilters({...filters, minPrice: e.target.value})}
        />
        <input 
          placeholder="Precio máximo" 
          type="number"
          value={filters.maxPrice}
          onChange={e => setFilters({...filters, maxPrice: e.target.value})}
        />
      </div>
      
      {/* Grid de casas */}
      <div className="grid md:grid-cols-3 gap-6">
        {properties.map(property => (
          <PropertyCard key={property.id} property={property} />
        ))}
      </div>
    </div>
  )
}
```

### 3. Detalle de Casa (`/clientes/casas/[id]/page.tsx`)

```tsx
export default async function PropertyDetail({ params }) {
  const property = await fetch(`/api/public/properties/${params.id}`).then(r => r.json())
  
  return (
    <div className="container mx-auto py-8">
      {/* Galería de fotos */}
      <PhotoGallery photos={property.photos} />
      
      {/* Info */}
      <div className="grid md:grid-cols-2 gap-8 mt-8">
        <div>
          <h1 className="text-3xl font-bold">{property.address}</h1>
          <p className="text-gray-600">{property.city}, {property.state}</p>
          
          <div className="mt-4 flex gap-4">
            <span>🛏️ {property.bedrooms} hab</span>
            <span>🚿 {property.bathrooms} baños</span>
            <span>📐 {property.square_feet} sqft</span>
          </div>
          
          <p className="text-4xl font-bold text-gold-600 mt-6">
            ${property.sale_price?.toLocaleString()}
          </p>
        </div>
        
        {/* CTA */}
        <div className="bg-gray-50 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">¿Te interesa esta casa?</h2>
          <Link 
            href={`/clientes/comprar/${property.id}`}
            className="btn-gold w-full text-center"
          >
            Comprar Ahora →
          </Link>
          <p className="text-sm text-gray-500 mt-2">
            Pago seguro con Stripe
          </p>
        </div>
      </div>
    </div>
  )
}
```

### 4. Formulario de Compra (`/clientes/comprar/[propertyId]/page.tsx`)

```tsx
'use client'

export default function PurchaseForm({ params }) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    terreno: ''
  })
  const [loading, setLoading] = useState(false)
  
  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      const res = await fetch('/api/public/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: params.propertyId,
          client_name: formData.name,
          client_email: formData.email,
          client_phone: formData.phone,
          client_terreno: formData.terreno
        })
      })
      
      const data = await res.json()
      
      if (data.ok) {
        // Guardar en sessionStorage para el siguiente paso
        sessionStorage.setItem('purchase_data', JSON.stringify(data))
        router.push(`/clientes/comprar/${params.propertyId}/pago`)
      }
    } catch (error) {
      toast.error('Error al procesar')
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <div className="container mx-auto py-8 max-w-md">
      <h1 className="text-2xl font-bold mb-6">Tus Datos</h1>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormInput
          label="Nombre completo"
          value={formData.name}
          onChange={e => setFormData({...formData, name: e.target.value})}
          required
        />
        <FormInput
          label="Correo electrónico"
          type="email"
          value={formData.email}
          onChange={e => setFormData({...formData, email: e.target.value})}
          required
        />
        <FormInput
          label="Teléfono"
          type="tel"
          value={formData.phone}
          onChange={e => setFormData({...formData, phone: e.target.value})}
          required
        />
        <FormInput
          label="Ubicación del terreno"
          value={formData.terreno}
          onChange={e => setFormData({...formData, terreno: e.target.value})}
          placeholder="Dirección donde se colocará la casa"
          required
        />
        
        <button 
          type="submit" 
          disabled={loading}
          className="btn-gold w-full"
        >
          {loading ? 'Procesando...' : 'Continuar al Pago →'}
        </button>
      </form>
    </div>
  )
}
```

### 5. Página de Pago Stripe (`/clientes/comprar/[propertyId]/pago/page.tsx`)

```tsx
'use client'

import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

function PaymentForm({ clientSecret, saleId }) {
  const stripe = useStripe()
  const elements = useElements()
  const [loading, setLoading] = useState(false)
  
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!stripe || !elements) return
    
    setLoading(true)
    
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/clientes/comprar/${saleId}/confirmacion`
      }
    })
    
    if (error) {
      toast.error(error.message)
      setLoading(false)
    }
  }
  
  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      <button 
        type="submit" 
        disabled={!stripe || loading}
        className="btn-gold w-full mt-4"
      >
        {loading ? 'Procesando...' : 'Pagar Ahora'}
      </button>
    </form>
  )
}

export default function PaymentPage({ params }) {
  const [clientSecret, setClientSecret] = useState('')
  const [purchaseData, setPurchaseData] = useState(null)
  
  useEffect(() => {
    const data = JSON.parse(sessionStorage.getItem('purchase_data') || '{}')
    setPurchaseData(data)
    
    // Crear PaymentIntent
    fetch('/api/public/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sale_id: data.sale_id,
        stripe_customer_id: data.stripe_customer_id
      })
    })
    .then(r => r.json())
    .then(d => setClientSecret(d.client_secret))
  }, [])
  
  if (!clientSecret) return <div>Cargando...</div>
  
  return (
    <div className="container mx-auto py-8 max-w-md">
      <h1 className="text-2xl font-bold mb-2">Pago</h1>
      <p className="text-gray-600 mb-6">
        Total a pagar: <strong>${purchaseData?.amount?.toLocaleString()}</strong>
      </p>
      
      <Elements stripe={stripePromise} options={{ clientSecret }}>
        <PaymentForm clientSecret={clientSecret} saleId={purchaseData?.sale_id} />
      </Elements>
      
      <p className="text-xs text-gray-500 mt-4 text-center">
        🔒 Pago seguro procesado por Stripe
      </p>
    </div>
  )
}
```

### 6. Mi Cuenta - Ver Título (`/clientes/mi-cuenta/page.tsx`)

```tsx
'use client'

export default function ClientDashboard() {
  const [sales, setSales] = useState([])
  const [documents, setDocuments] = useState([])
  
  useEffect(() => {
    // Obtener compras y documentos del cliente
    fetchClientData()
  }, [])
  
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Mi Cuenta</h1>
      
      {/* Mis Compras */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Mis Compras</h2>
        {sales.map(sale => (
          <div key={sale.id} className="bg-white p-6 rounded-lg shadow mb-4">
            <h3 className="font-semibold">{sale.properties.address}</h3>
            <p className="text-gray-600">
              Comprado el {new Date(sale.completed_at).toLocaleDateString()}
            </p>
            <p className="text-lg font-bold text-gold-600">
              ${sale.sale_price.toLocaleString()}
            </p>
            
            {/* Estado del título */}
            <div className="mt-4 p-3 bg-gray-50 rounded">
              <p className="text-sm font-medium">
                Estado del Título: 
                <span className={`ml-2 ${
                  sale.title_transfers?.[0]?.status === 'completed' 
                    ? 'text-green-600' 
                    : 'text-yellow-600'
                }`}>
                  {sale.title_transfers?.[0]?.status === 'completed' 
                    ? '✅ Completado' 
                    : '⏳ En proceso'}
                </span>
              </p>
            </div>
          </div>
        ))}
      </section>
      
      {/* Mis Documentos */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Mis Documentos</h2>
        {documents.map(doc => (
          <a 
            key={doc.id}
            href={doc.file_url}
            target="_blank"
            className="flex items-center gap-3 p-4 bg-white rounded-lg shadow mb-2 hover:bg-gray-50"
          >
            <span>📄</span>
            <span>{doc.doc_type}</span>
            <span className="ml-auto text-gold-600">Descargar →</span>
          </a>
        ))}
      </section>
    </div>
  )
}
```

---

## 📧 Emails Automáticos

### 1. Confirmación de Compra

```python
def send_confirmation_email(sale_data):
    html = f"""
    <h1>¡Felicidades por tu nueva casa! 🏠</h1>
    <p>Hola {sale_data['clients']['name']},</p>
    <p>Tu compra ha sido procesada exitosamente.</p>
    
    <h2>Detalles:</h2>
    <ul>
        <li><strong>Propiedad:</strong> {sale_data['properties']['address']}</li>
        <li><strong>Precio:</strong> ${sale_data['sale_price']:,.2f}</li>
        <li><strong>Fecha:</strong> {datetime.now().strftime('%d/%m/%Y')}</li>
    </ul>
    
    <p>Próximos pasos:</p>
    <ol>
        <li>Procesaremos la transferencia del título a tu nombre</li>
        <li>Te notificaremos cuando esté listo para recoger</li>
    </ol>
    
    <p>Puedes ver el estado de tu compra en: <a href="{APP_URL}/clientes/mi-cuenta">Mi Cuenta</a></p>
    """
    
    send_email(
        to=[sale_data['clients']['email']],
        subject="✅ Compra Confirmada - Maninos Homes",
        html=html
    )
```

### 2. Recordatorio de Pago (si no completa)

```python
def send_payment_reminder(sale_id):
    # Programar con Celery o similar
    sale = get_sale(sale_id)
    
    if sale['status'] == 'pending':
        html = f"""
        <h1>Tu casa te está esperando 🏠</h1>
        <p>Hola {sale['clients']['name']},</p>
        <p>Notamos que tu compra está pendiente de pago.</p>
        <p>La propiedad en <strong>{sale['properties']['address']}</strong> 
        sigue disponible a ${sale['sale_price']:,.2f}.</p>
        <p><a href="{APP_URL}/clientes/comprar/{sale['property_id']}/pago">
            Completar Pago →
        </a></p>
        """
        
        send_email(
            to=[sale['clients']['email']],
            subject="⏰ Tu casa te espera - Completa tu compra",
            html=html
        )
```

---

## 📋 Plan de Implementación

### Fase 1: Backend (2-3 días)
- [ ] Crear carpeta `api/routes/public/`
- [ ] Implementar endpoints públicos
- [ ] Configurar RLS para acceso público
- [ ] Crear migración para `client_auth` (opcional)
- [ ] Tests de APIs

### Fase 2: Frontend Básico (3-4 días)
- [ ] Layout del portal clientes
- [ ] Landing page
- [ ] Catálogo de casas
- [ ] Detalle de casa
- [ ] Formulario de datos cliente

### Fase 3: Integración Stripe (2 días)
- [ ] Configurar Stripe en frontend
- [ ] Página de pago con Stripe Elements
- [ ] Manejo de confirmación
- [ ] Webhook para eventos de pago

### Fase 4: Dashboard Cliente (2 días)
- [ ] Autenticación de clientes (magic link o password)
- [ ] Página "Mi Cuenta"
- [ ] Ver compras y estado
- [ ] Descargar documentos / ver título

### Fase 5: Emails y Polish (1-2 días)
- [ ] Email de confirmación
- [ ] Email de recordatorio
- [ ] Diseño responsive
- [ ] Testing E2E

---

## 🔐 Seguridad

1. **APIs Públicas**: Solo lectura de propiedades publicadas
2. **Stripe**: Nunca manejamos datos de tarjeta directamente
3. **RLS**: Clientes solo ven sus propios datos
4. **Validación**: Pydantic en todos los endpoints
5. **HTTPS**: Todo el tráfico encriptado

---

## 📊 Métricas a Trackear

- Visitas al catálogo
- Propiedades vistas
- Inicios de compra
- Tasa de conversión (compra iniciada → pagada)
- Tiempo promedio de cierre

---

**¿Listo para empezar?** 🚀

Confirma y comenzamos con la Fase 1: Backend APIs públicas.


