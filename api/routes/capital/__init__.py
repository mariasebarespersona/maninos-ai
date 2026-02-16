"""
Maninos Capital API Routes
Portal for RTO (Rent-to-Own) management.
"""

from fastapi import APIRouter
from .dashboard import router as dashboard_router
from .applications import router as applications_router
from .contracts import router as contracts_router
from .payments import router as payments_router
from .investors import router as investors_router
from .kyc import router as kyc_router
from .reports import router as reports_router
from .capital_flows import router as flows_router
from .analysis import router as analysis_router
from .promissory_notes import router as promissory_notes_router
from .accounting import router as accounting_router

router = APIRouter()

router.include_router(dashboard_router)
router.include_router(applications_router)
router.include_router(contracts_router)
router.include_router(payments_router)
router.include_router(investors_router)
router.include_router(kyc_router)
router.include_router(reports_router)
router.include_router(flows_router)
router.include_router(analysis_router)
router.include_router(promissory_notes_router)
router.include_router(accounting_router)

