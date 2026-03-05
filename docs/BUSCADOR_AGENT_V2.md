# BuscadorAgent v2 - Documentación

> **Nota:** Para el contexto completo del proyecto, ver `CLAUDE.md` en la raíz del repo.

## 🎯 Propósito

El BuscadorAgent es un agente AI que busca mobile homes en internet, los analiza con las reglas financieras de Maninos, y mantiene un dashboard con propiedades calificadas.

---

## 🌐 Fuentes de Datos

| # | Fuente | URL | Uso Principal |
|---|--------|-----|---------------|
| 1 | **MHVillage** | https://www.mhvillage.com | Fuente primaria - Marketplace #1 de mobile homes en USA |
| 2 | **MobileHome.net** | https://www.mobilehome.net | Fuente secundaria - Cross-referencia de precios |
| 3 | **Craigslist** | https://www.craigslist.org | Listados locales |
| 4 | **21st Mortgage** | https://www.21stmortgage.com | Casas con financiamiento |
| 5 | **VMF Homes (Vanderbilt)** | https://www.vmfhomes.com/homesearch | Casas nuevas y usadas |
| 6 | **Facebook Marketplace** | via scraping (cookies) | Fuente #1 del cliente — owner-to-owner |

### Estructura de URLs para Texas

```
MHVillage:    https://www.mhvillage.com/homes-for-sale/tx/{city}
MobileHome:   https://www.mobilehome.net/mobile-homes-for-sale/tx/{city}
Zillow:       https://www.zillow.com/{city}-tx/mobile-homes/
```

---

## 📏 Reglas de Calificación

### Regla 1: 60% Rule (Regla Principal)

```
Precio Compra ≤ Valor de Mercado × 0.60

Donde:
- Valor de Mercado = Promedio de datos históricos de Maninos + promedio web scraping
- 0.60 = Máximo a pagar (60% del valor de mercado)
- Costo de renovación NO se incluye en este cálculo (presupuesto separado: $5K-$15K)
```

**Ejemplo:**
- Valor de mercado estimado: $50,000
- Máximo a pagar: $50,000 × 0.60 = **$30,000**
- Renovación: $8,000 (presupuesto separado)

> **NOTA:** La regla anterior era 70%. Fue cambiada a 60% por confirmación del cliente (Feb 2026).

### Regla 2: Ubicación y Zona

```
Estado = Texas (TX)
Radio = 200 millas desde Houston + 200 millas desde Dallas
```

- Maninos opera solo en Texas
- Dos zonas de operación centradas en los 2 yards principales
- El radio es desde las ciudades (Houston/Dallas), NO desde ubicación del empleado

### Regla 3: Precio

```
Rango: $5,000 - $80,000
```

> **NOTA:** Ya NO hay filtro de antigüedad (year_built). Se eliminó por request del cliente (Feb 2026).

---

## 🏆 Sistema de Puntuación

| Regla | Puntos | Descripción |
|-------|--------|-------------|
| 60% Rule | 50 | Precio ≤ 60% valor mercado |
| Ubicación/Zona | 30 | Texas, dentro de 200mi de Houston o Dallas |
| Rango de Precio | 20 | Entre $5K-$80K |
| **TOTAL** | **100** | Máximo |

**Calificación:**
- **100 puntos**: ✅ Calificada (pasa todas las reglas)
- **70+ puntos**: ⚠️ Parcialmente calificada
- **<70 puntos**: ❌ No califica

---

## 🔧 Tools del Agente

### 1. `scrape_mhvillage`

```python
@tool
def scrape_mhvillage(city: str, max_price: float = 60000, min_price: float = 15000):
    """Scrape mobile home listings from MHVillage.com"""
```

- **Cuándo usar:** Primera búsqueda en una ciudad
- **Cuándo NO usar:** Para buscar ARV (usar Zillow)

### 2. `scrape_mobilehome_net`

```python
@tool
def scrape_mobilehome_net(city: str, max_price: float = 60000):
    """Scrape from MobileHome.net"""
```

- **Cuándo usar:** Cross-referencia o si MHVillage no tiene suficientes
- **Cuándo NO usar:** Como fuente única

### 3. `get_zillow_arv`

```python
@tool
def get_zillow_arv(address: str, city: str):
    """Get ARV estimate from Zillow comparables"""
```

- **Cuándo usar:** Para calcular la regla del 70%
- **Cuándo NO usar:** Para buscar propiedades a comprar

### 4. `qualify_property`

```python
@tool
def qualify_property(listing_price, estimated_arv, estimated_renovation, year_built, state):
    """Check if property passes the 3 rules"""
```

- **Cuándo usar:** Después de obtener todos los datos de una propiedad
- **Retorna:** Diccionario con pass/fail para cada regla

### 5. `save_to_dashboard`

```python
@tool
def save_to_dashboard(listings: List[Dict]):
    """Save qualified listings to database"""
```

- **Cuándo usar:** Solo con propiedades que pasen las 3 reglas
- **Cuándo NO usar:** Con propiedades no calificadas

---

## 🔄 Workflow del Agente

```
┌─────────────────────────────────────────────────────────────┐
│  1. Recibir solicitud de búsqueda                           │
│     "Busca casas en Houston bajo $40,000"                   │
├─────────────────────────────────────────────────────────────┤
│  2. Scrape MHVillage (fuente primaria)                      │
│     → scrape_mhvillage("Houston", max_price=40000)          │
├─────────────────────────────────────────────────────────────┤
│  3. Para cada listing, obtener ARV                          │
│     → get_zillow_arv(address, city)                         │
├─────────────────────────────────────────────────────────────┤
│  4. Aplicar reglas de calificación                          │
│     → qualify_property(...)                                  │
├─────────────────────────────────────────────────────────────┤
│  5. Guardar calificadas en dashboard                        │
│     → save_to_dashboard(qualified_listings)                 │
├─────────────────────────────────────────────────────────────┤
│  6. Reportar resultados al empleado                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Dashboard Frontend

**Ruta:** `/homes/market`

**Características:**
- Grid de 10 propiedades calificadas
- Filtros por ciudad y precio
- Botón "Buscar con AI" para activar el agente
- Badge de puntuación (0-100)
- Estado de cada regla (✓/✗)
- Botón "Comprar" para iniciar el proceso

---

## 🗄️ Base de Datos

**Tabla:** `market_listings`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID | Primary key |
| source | TEXT | mhvillage, mobilehome, zillow |
| source_url | TEXT | URL del listing |
| listing_price | DECIMAL | Precio de lista |
| estimated_arv | DECIMAL | Valor post-renovación |
| estimated_renovation | DECIMAL | Costo renovación |
| max_offer_70_rule | DECIMAL | Calculado automáticamente |
| passes_70_rule | BOOLEAN | ¿Pasa regla 70%? |
| passes_age_rule | BOOLEAN | ¿Pasa regla antigüedad? |
| passes_location_rule | BOOLEAN | ¿Está en Texas? |
| is_qualified | BOOLEAN | ¿Pasa las 3 reglas? |
| qualification_score | INTEGER | 0-100 |
| status | TEXT | available, reviewing, purchased |

---

## 🚀 Trigger Automático

Cuando una propiedad cambia a status `purchased`:

1. Se verifica el conteo de propiedades calificadas
2. Si `count < 10`, se activa `replenish_dashboard()`
3. El agente busca más propiedades hasta tener 10

---

## 🛠️ Implementación de Scraping Real

### Opción A: Browser Automation (Recomendada)

Usando el skill `browser-use`:

```bash
npx skills add anthropics/skills --skill browser-use
```

### Opción B: APIs Oficiales

- MHVillage tiene API para profesionales
- Zillow tiene Zillow API para comparables

### Opción C: Proxy + Headless Browser

Para sitios sin API:
- Playwright para rendering JavaScript
- Rotación de proxies para evitar bloqueos

---

## ⚠️ Consideraciones

1. **Rate Limiting:** No hacer más de 100 requests por hora
2. **Respeto a robots.txt:** Seguir las reglas de cada sitio
3. **Datos frescos:** Actualizar listings cada 24 horas
4. **Privacidad:** No almacenar datos personales de vendedores

---

## 📈 Métricas

- Total de listings scrapeados
- % de calificación (pass rate)
- Tiempo promedio de scraping
- Propiedades compradas del dashboard

