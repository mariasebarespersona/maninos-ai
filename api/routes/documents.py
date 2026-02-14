"""
Document generation endpoints
Generates PDFs for Bill of Sale, Deposit Agreement, Checklist
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from datetime import datetime
from io import BytesIO
import os

from supabase import create_client, Client

from ..services.pdf_service import (
    generate_bill_of_sale,
    generate_deposit_agreement,
    generate_checklist_pdf,
)

router = APIRouter(prefix="/api/documents", tags=["documents"])

# Initialize Supabase client
sb: Client = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SERVICE_ROLE_KEY"]
)


class BillOfSaleRequest(BaseModel):
    sale_id: str


class DepositAgreementRequest(BaseModel):
    property_id: str
    client_id: str
    deposit_amount: float


class ChecklistRequest(BaseModel):
    property_id: str
    inspector_name: str | None = None


@router.post("/bill-of-sale")
async def generate_bill_of_sale_pdf(request: BillOfSaleRequest):
    """
    Generate a Bill of Sale PDF for a completed sale.
    """
    # Fetch sale with property and client data
    sale_result = sb.table("sales").select(
        "*, properties(*), clients(*)"
    ).eq("id", request.sale_id).single().execute()
    
    if not sale_result.data:
        raise HTTPException(status_code=404, detail="Sale not found")
    
    sale = sale_result.data
    property_data = sale.get("properties", {})
    client_data = sale.get("clients", {})
    
    if not property_data or not client_data:
        raise HTTPException(status_code=400, detail="Sale missing property or client data")
    
    # Generate PDF
    pdf_bytes = generate_bill_of_sale(
        seller_name="Maninos Capital LLC",
        buyer_name=client_data.get("name", "Unknown"),
        property_address=property_data.get("address", "Unknown"),
        hud_number=property_data.get("hud_number"),
        property_year=property_data.get("year"),
        sale_price=sale.get("final_price") or sale.get("sale_price", 0),
        sale_date=datetime.fromisoformat(sale.get("created_at").replace("Z", "+00:00")) if sale.get("created_at") else None,
    )
    
    # Return as downloadable PDF
    filename = f"bill_of_sale_{sale['id'][:8]}.pdf"
    
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Content-Length": str(len(pdf_bytes)),
        }
    )


@router.post("/deposit-agreement")
async def generate_deposit_agreement_pdf(request: DepositAgreementRequest):
    """
    Generate a Deposit Agreement PDF.
    """
    # Fetch property
    property_result = sb.table("properties").select("*").eq("id", request.property_id).single().execute()
    if not property_result.data:
        raise HTTPException(status_code=404, detail="Property not found")
    
    # Fetch client
    client_result = sb.table("clients").select("*").eq("id", request.client_id).single().execute()
    if not client_result.data:
        raise HTTPException(status_code=404, detail="Client not found")
    
    property_data = property_result.data
    client_data = client_result.data
    
    total_price = property_data.get("sale_price") or property_data.get("purchase_price", 0)
    
    # Generate PDF
    pdf_bytes = generate_deposit_agreement(
        depositor_name=client_data.get("name", "Unknown"),
        property_address=property_data.get("address", "Unknown"),
        deposit_amount=request.deposit_amount,
        total_price=total_price,
    )
    
    # Return as downloadable PDF
    filename = f"deposit_agreement_{property_data['id'][:8]}.pdf"
    
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Content-Length": str(len(pdf_bytes)),
        }
    )


@router.get("/checklist/{property_id}")
async def generate_checklist_pdf_endpoint(property_id: str, inspector_name: str | None = None):
    """
    Generate a Checklist PDF for a property.
    """
    # Fetch property with checklist data
    property_result = sb.table("properties").select("*").eq("id", property_id).single().execute()
    if not property_result.data:
        raise HTTPException(status_code=404, detail="Property not found")
    
    property_data = property_result.data
    checklist_data = property_data.get("checklist_data") or {}
    
    # Generate PDF
    pdf_bytes = generate_checklist_pdf(
        property_address=property_data.get("address", "Unknown"),
        checklist_data=checklist_data,
        inspector_name=inspector_name,
    )
    
    # Return as downloadable PDF
    filename = f"checklist_{property_data['id'][:8]}.pdf"
    
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Content-Length": str(len(pdf_bytes)),
        }
    )


@router.get("/sale/{sale_id}/bill-of-sale")
async def get_bill_of_sale(sale_id: str):
    """
    Alternative GET endpoint for Bill of Sale (easier for direct links).
    """
    return await generate_bill_of_sale_pdf(BillOfSaleRequest(sale_id=sale_id))

