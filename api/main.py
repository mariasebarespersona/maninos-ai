"""
Maninos AI — FastAPI Backend
"""
import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Routes
from api.routes import properties, clients, sales
from api.routes.market_listings import router as market_listings_router
from api.routes.ai_assistant import router as ai_router
from api.routes.team import router as team_router
from api.routes.transfers import router as transfers_router
from api.routes.purchase_payments import router as purchase_payments_router
from api.routes.facebook_auth import router as facebook_router
from api.routes.extract_listing import router as extract_listing_router
from api.routes.emails import router as emails_router
from api.routes.materials import router as materials_router
from api.routes.portal_links import router as portal_links_router
from api.routes.documents import router as documents_router
from api.routes.renovation import router as renovation_router
from api.routes.evaluations import router as evaluations_router
from api.routes.accounting import router as accounting_router
from api.routes.moves import router as moves_router

# Capital routes
from api.routes.capital import router as capital_router

# Public routes
from api.routes.public.clients import router as public_clients_router
from api.routes.public.properties import router as public_properties_router
from api.routes.public.purchases import router as public_purchases_router

# Services
from api.services.scheduler_service import init_scheduler, shutdown_scheduler

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup/shutdown lifecycle."""
    logger.info("🚀 Starting Maninos AI Backend...")
    try:
        init_scheduler()
        logger.info("✅ Scheduler started")
    except Exception as e:
        logger.warning(f"⚠️ Scheduler failed to start: {e}")
    yield
    try:
        shutdown_scheduler()
    except Exception:
        pass
    logger.info("👋 Maninos AI Backend stopped")


app = FastAPI(
    title="Maninos AI",
    description="Backend API for Maninos Homes & Capital",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS — allow Vercel production, preview deploys, and local dev
_app_url = os.getenv("APP_URL", "").rstrip("/")
_extra_origins = [o.strip() for o in os.getenv("CORS_EXTRA_ORIGINS", "").split(",") if o.strip()]

cors_origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "https://localhost:3443",
    "https://127.0.0.1:3443",
]
if _app_url:
    cors_origins.append(_app_url)
cors_origins.extend(_extra_origins)

# Regex: local network IPs (mobile dev) + Vercel preview deploys
import re
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?|https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "maninos-ai"}


# ── Register Routes ──────────────────────────────────────────────────────────

# Homes portal
app.include_router(properties.router, prefix="/api/properties", tags=["Properties"])
app.include_router(clients.router, prefix="/api/clients", tags=["Clients"])
app.include_router(sales.router, prefix="/api/sales", tags=["Sales"])
app.include_router(market_listings_router, prefix="/api/market-listings", tags=["Market Listings"])
app.include_router(ai_router, prefix="/api/ai", tags=["AI Assistant"])
app.include_router(team_router, prefix="/api/team", tags=["Team"])
app.include_router(transfers_router, prefix="/api/transfers", tags=["Title Transfers"])
app.include_router(purchase_payments_router, prefix="/api/purchase-payments", tags=["Purchase Payments"])
app.include_router(facebook_router, prefix="/api/facebook", tags=["Facebook"])
app.include_router(extract_listing_router, prefix="/api/extract-listing", tags=["Extract Listing"])
app.include_router(emails_router, prefix="/api/emails", tags=["Emails"])
app.include_router(materials_router, prefix="/api/materials", tags=["Materials"])
app.include_router(renovation_router, prefix="/api/renovation", tags=["Renovation"])
app.include_router(evaluations_router, prefix="/api/evaluations", tags=["Evaluations"])
app.include_router(portal_links_router, prefix="/api/portal-links", tags=["Portal Links"])
app.include_router(accounting_router, prefix="/api/accounting", tags=["Accounting"])
app.include_router(moves_router, prefix="/api/moves", tags=["Moves"])

# Documents (already has /api/documents prefix in the router itself)
app.include_router(documents_router, tags=["Documents"])

# Capital portal
app.include_router(capital_router, prefix="/api/capital", tags=["Capital"])

# Public portal
app.include_router(public_clients_router, prefix="/api", tags=["Public - Clients"])
app.include_router(public_properties_router, prefix="/api", tags=["Public - Properties"])
app.include_router(public_purchases_router, prefix="/api", tags=["Public - Purchases"])
