# MANINOS AI — Mobile Home Business Platform

<div align="center">

🏠 **Full-stack platform for buying, renovating, and selling mobile homes in Texas**

[![Tech Stack](https://img.shields.io/badge/Stack-FastAPI_+_Next.js_14_+_Supabase-green?style=for-the-badge)](/)
[![Deploy API](https://img.shields.io/badge/API-Railway-purple?style=for-the-badge)](/)
[![Deploy Web](https://img.shields.io/badge/Web-Vercel-black?style=for-the-badge)](/)

</div>

---

## What is Maninos AI?

Maninos AI is the operational platform for **Maninos Homes LLC** and **Maninos Capital LLC** — companies that buy, renovate, and sell mobile homes in Texas through cash sales and Rent-to-Own (RTO) financing.

The app replaces Excel spreadsheets and manual CRM workflows with an integrated 3-portal system:

| Portal | Path | Users | Key Features |
|--------|------|-------|-------------|
| **Maninos Homes** | `/homes` | Employees | Market scraping, property inventory, 26-point evaluation checklist, documents (Bill of Sale, TDHCA title), renovation tracking, sales, accounting |
| **Maninos Capital** | `/capital` | Finance team | RTO contracts, monthly payments, KYC verification, investor management, promissory notes, capital flows, financial reports, accounting |
| **Portal Clientes** | `/clientes` | Public / Clients | Property catalog, purchase flow, Stripe payments, client dashboard, RTO status, document access |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Python 3.12 + FastAPI |
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind CSS |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Storage | Supabase Storage |
| Payments | Stripe (PaymentIntents + Identity for KYC) |
| Email | Resend |
| AI/LLM | OpenAI GPT-4o / GPT-4o-mini / Whisper |
| Scraping | Playwright + BeautifulSoup |
| Deploy (API) | Railway (Docker) |
| Deploy (Web) | Vercel |

---

## Quick Start

### Prerequisites

- Python 3.12+
- Node.js 18+
- Supabase account
- OpenAI API key

### 1. Clone & Setup Backend

```bash
git clone https://github.com/mariasebarespersona/maninos-ai.git
cd maninos-ai

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Configure environment
cp .env.example .env  # Edit with your keys
```

### 2. Setup Frontend

```bash
cd web
npm install
```

### 3. Run Development

```bash
# From project root
bash start_dev.sh

# Or manually:
# Terminal 1: uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
# Terminal 2: cd web && npm run dev
```

- API: http://localhost:8000
- Frontend: http://localhost:3000
- Homes Portal: http://localhost:3000/homes
- Capital Portal: http://localhost:3000/capital
- Client Portal: http://localhost:3000/clientes

---

## Project Structure

```
maninos-ai/
├── api/                    # FastAPI backend
│   ├── main.py             # App entrypoint (all routes registered here)
│   ├── routes/             # API route handlers
│   │   ├── capital/        # Capital portal routes
│   │   └── public/         # Public client-facing routes
│   ├── agents/             # AI agents (buscador, costos, fotos, precio, etc.)
│   ├── services/           # Business logic services
│   ├── utils/              # Utilities (TDHCA parser, qualifications, etc.)
│   └── models/             # Pydantic models
├── web/                    # Next.js 14 frontend
│   ├── src/app/            # Pages (homes/, capital/, clientes/)
│   ├── src/components/     # React components
│   ├── src/types/          # TypeScript types
│   └── __tests__/          # Jest tests
├── tools/                  # Shared tools (Supabase client, Stripe, email)
├── core/                   # Config + logging
├── migrations/             # SQL migrations (run in Supabase SQL Editor)
├── docs/                   # Developer documentation
├── prompts/                # AI agent system prompts
└── tests/                  # Backend tests
```

---

## Database

- **47 sequential migrations** in `migrations/`
- Managed in **Supabase** (PostgreSQL)
- Migrations run manually in Supabase SQL Editor
- Core tables: `properties`, `clients`, `sales`, `rto_contracts`, `payments`, `investors`, `accounting_*`

---

## Deployment

Pushes to `main` auto-deploy:

```bash
git add -A && git commit -m "description" && git push origin main
```

- **Railway** — Builds Docker image, deploys API
- **Vercel** — Builds Next.js, deploys frontend

---

## Documentation

| Document | Description |
|----------|-------------|
| `CLAUDE.md` | Complete project context for AI assistants |
| `docs/DEVELOPER_BIBLE_V2.md` | Core development principles |
| `docs/AGENT_BIBLE_V1.md` | AI agent development guidelines |
| `docs/ARQUITECTURA_PORTALES_V1.md` | Portal architecture overview |
| `docs/BUSCADOR_AGENT_V2.md` | Property search agent docs |
| `docs/PLAN_PORTAL_CLIENTES.md` | Client portal implementation plan |
| `migrations/README.md` | Migration instructions |

---

## Key Business Context

- **Company**: Maninos Homes / Maninos Capital (mobile homes, Texas)
- **Buy rule**: Max 60% of market value
- **Sell rule**: Max 80% of market value (20% below for clients)
- **Zones**: 200-mile radius from Houston + Dallas
- **Price range**: $5,000 - $80,000
- **Renovation budget**: $5,000 - $15,000
- **Sale types**: Contado (cash) and RTO (Rent-to-Own financed by Capital)
- **Commissions**: $1,000 RTO / $1,500 cash, 50/50 split found_by / sold_by

---

## License

Proprietary — All Rights Reserved

---

<div align="center">

**Maninos AI** — March 2026

</div>
