"""
Title Transfers API
Manages title transfer tracking for purchases and sales
"""

from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime
import os
import uuid

from supabase import create_client, Client

router = APIRouter()

DOCUMENT_BUCKET = "transaction-documents"

# Initialize Supabase client
sb: Client = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SERVICE_ROLE_KEY"]
)


# ============ Schemas ============

class TransferUpdate(BaseModel):
    status: Optional[str] = None  # pending, in_progress, completed, cancelled
    documents_checklist: Optional[dict] = None
    submitted_at: Optional[datetime] = None
    expected_completion: Optional[date] = None
    completed_at: Optional[datetime] = None
    tracking_number: Optional[str] = None
    notes: Optional[str] = None


class TransferCreate(BaseModel):
    property_id: str
    sale_id: Optional[str] = None
    transfer_type: str  # 'purchase' or 'sale'
    from_name: str
    from_contact: Optional[str] = None
    to_name: str
    to_contact: Optional[str] = None
    # Payment info (for purchases)
    payment_method: Optional[str] = None
    payment_reference: Optional[str] = None
    payment_date: Optional[str] = None
    payment_amount: Optional[float] = None
    # Document URLs (uploaded during purchase flow)
    bill_of_sale_url: Optional[str] = None
    title_url: Optional[str] = None                 # TDHCA title document
    title_application_url: Optional[str] = None      # Title application form


# Default documents checklist
DEFAULT_DOCUMENTS = {
    "bill_of_sale": False,
    "titulo": False,
    "title_application": False,
    "tax_receipt": False,
    "id_copies": False,
    "lien_release": False,
    "notarized_forms": False,
}

DOCUMENT_LABELS = {
    "bill_of_sale": "Bill of Sale (Factura de Compra-Venta)",
    "titulo": "Título (TDHCA)",
    "title_application": "Aplicación Cambio de Título",
    "tax_receipt": "Recibo de Impuestos (Tax Receipt)",
    "id_copies": "Copias de Identificación",
    "lien_release": "Liberación de Gravamen (Lien Release)",
    "notarized_forms": "Formularios Notarizados",
}


# ============ Endpoints ============

@router.get("/")
async def list_transfers(
    status: Optional[str] = None,
    transfer_type: Optional[str] = None,
    property_id: Optional[str] = None
):
    """List all title transfers with optional filters"""
    query = sb.table("title_transfers").select(
        "*, properties(address, city, state)"
    )
    
    if status:
        query = query.eq("status", status)
    if transfer_type:
        query = query.eq("transfer_type", transfer_type)
    if property_id:
        query = query.eq("property_id", property_id)
    
    result = query.order("created_at", desc=True).execute()
    
    # Format response
    transfers = []
    for t in result.data:
        prop = t.pop("properties", {})
        t["property_address"] = prop.get("address", "Unknown")
        t["property_location"] = f"{prop.get('city', '')}, {prop.get('state', '')}"
        transfers.append(t)
    
    return transfers


@router.post("/")
async def create_transfer(data: TransferCreate):
    """Create a new title transfer record (typically for manual purchases)"""
    from datetime import datetime
    
    try:
        # Build documents checklist with uploaded document URLs if provided
        now_str = datetime.utcnow().isoformat()
        docs_checklist = {
            "bill_of_sale": {
                "checked": bool(data.bill_of_sale_url),
                "file_url": data.bill_of_sale_url,
                "uploaded_at": now_str if data.bill_of_sale_url else None
            },
            "titulo": {
                "checked": bool(data.title_url),
                "file_url": data.title_url,
                "uploaded_at": now_str if data.title_url else None
            },
            "title_application": {
                "checked": bool(data.title_application_url),
                "file_url": data.title_application_url,
                "uploaded_at": now_str if data.title_application_url else None
            },
            "tax_receipt": {"checked": False, "file_url": None, "uploaded_at": None},
            "id_copies": {"checked": False, "file_url": None, "uploaded_at": None},
            "lien_release": {"checked": False, "file_url": None, "uploaded_at": None},
            "notarized_forms": {"checked": False, "file_url": None, "uploaded_at": None},
        }
        
        # Build the insert data
        insert_data = {
            "property_id": data.property_id,
            "transfer_type": data.transfer_type,
            "from_name": data.from_name,
            "from_contact": data.from_contact,
            "to_name": data.to_name,
            "to_contact": data.to_contact,
            "status": "pending",
            "documents_checklist": docs_checklist,
        }
        
        if data.sale_id:
            insert_data["sale_id"] = data.sale_id
        
        # Add payment info to notes if provided
        if data.payment_method or data.payment_reference:
            notes_parts = []
            if data.payment_method:
                notes_parts.append(f"Método de pago: {data.payment_method}")
            if data.payment_reference:
                notes_parts.append(f"Referencia: {data.payment_reference}")
            if data.payment_date:
                notes_parts.append(f"Fecha: {data.payment_date}")
            if data.payment_amount:
                notes_parts.append(f"Monto: ${data.payment_amount:,.2f}")
            insert_data["notes"] = " | ".join(notes_parts)
        
        result = sb.table("title_transfers").insert(insert_data).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create transfer")
        
        return result.data[0]
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pending")
async def list_pending_transfers():
    """Get all pending or in-progress transfers"""
    result = sb.table("title_transfers").select(
        "*, properties(address, city, state)"
    ).in_("status", ["pending", "in_progress"]).order("created_at").execute()
    
    transfers = []
    for t in result.data:
        prop = t.pop("properties", {})
        t["property_address"] = prop.get("address", "Unknown")
        transfers.append(t)
    
    return transfers


@router.get("/stats")
async def get_transfer_stats():
    """Get transfer statistics"""
    result = sb.table("title_transfers").select("status, transfer_type").execute()
    
    stats = {
        "total": len(result.data),
        "by_status": {"pending": 0, "in_progress": 0, "completed": 0, "cancelled": 0},
        "by_type": {"purchase": 0, "sale": 0},
        "pending_purchases": 0,
        "pending_sales": 0
    }
    
    for t in result.data:
        status = t.get("status", "pending")
        ttype = t.get("transfer_type", "purchase")
        
        stats["by_status"][status] = stats["by_status"].get(status, 0) + 1
        stats["by_type"][ttype] = stats["by_type"].get(ttype, 0) + 1
        
        if status in ["pending", "in_progress"]:
            if ttype == "purchase":
                stats["pending_purchases"] += 1
            else:
                stats["pending_sales"] += 1
    
    return stats


@router.get("/property/{property_id}")
async def get_property_transfers(property_id: str):
    """Get all transfers for a specific property"""
    result = sb.table("title_transfers").select("*").eq(
        "property_id", property_id
    ).order("created_at", desc=True).execute()  # Most recent first
    
    # Helper to check if transfer has documents uploaded
    def has_documents(t):
        docs = t.get("documents_checklist", {})
        for key, val in docs.items():
            if isinstance(val, dict) and val.get("file_url"):
                return True
        return False
    
    # Get purchase transfers, prioritizing ones with documents
    purchase_transfers = [t for t in result.data if t["transfer_type"] == "purchase"]
    purchase_with_docs = next((t for t in purchase_transfers if has_documents(t)), None)
    purchase = purchase_with_docs or (purchase_transfers[0] if purchase_transfers else None)
    
    # Get sale transfers, prioritizing ones with documents
    sale_transfers = [t for t in result.data if t["transfer_type"] == "sale"]
    sale_with_docs = next((t for t in sale_transfers if has_documents(t)), None)
    sale = sale_with_docs or (sale_transfers[0] if sale_transfers else None)
    
    return {
        "purchase": purchase,
        "sale": sale,
        "all": result.data
    }


@router.get("/{transfer_id}")
async def get_transfer(transfer_id: str):
    """Get a specific transfer by ID"""
    result = sb.table("title_transfers").select(
        "*, properties(address, city, state, hud_number)"
    ).eq("id", transfer_id).single().execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Transfer not found")
    
    transfer = result.data
    prop = transfer.pop("properties", {})
    transfer["property_address"] = prop.get("address", "Unknown")
    transfer["property_location"] = f"{prop.get('city', '')}, {prop.get('state', '')}"
    transfer["property_hud"] = prop.get("hud_number")
    transfer["document_labels"] = DOCUMENT_LABELS
    
    return transfer


@router.put("/{transfer_id}")
async def update_transfer(transfer_id: str, transfer: TransferUpdate):
    """Update a transfer's status, documents, or other fields"""
    update_data = {k: v for k, v in transfer.model_dump().items() if v is not None}
    
    # Convert dates to strings
    if "submitted_at" in update_data and update_data["submitted_at"]:
        update_data["submitted_at"] = update_data["submitted_at"].isoformat()
    if "expected_completion" in update_data and update_data["expected_completion"]:
        update_data["expected_completion"] = update_data["expected_completion"].isoformat()
    if "completed_at" in update_data and update_data["completed_at"]:
        update_data["completed_at"] = update_data["completed_at"].isoformat()
    
    # If marking as completed, set completed_at
    if update_data.get("status") == "completed" and "completed_at" not in update_data:
        update_data["completed_at"] = datetime.now().isoformat()
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    result = sb.table("title_transfers").update(update_data).eq("id", transfer_id).execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Transfer not found")
    
    return result.data[0]


@router.patch("/{transfer_id}/document/{doc_key}")
async def toggle_document(transfer_id: str, doc_key: str, checked: bool = Query(...)):
    """Toggle a document's checked status"""
    # Get current checklist
    current = sb.table("title_transfers").select("documents_checklist").eq(
        "id", transfer_id
    ).single().execute()
    
    if not current.data:
        raise HTTPException(status_code=404, detail="Transfer not found")
    
    checklist = current.data.get("documents_checklist", DEFAULT_DOCUMENTS)
    
    if doc_key not in checklist:
        raise HTTPException(status_code=400, detail=f"Invalid document key: {doc_key}")
    
    checklist[doc_key] = checked
    
    result = sb.table("title_transfers").update({
        "documents_checklist": checklist
    }).eq("id", transfer_id).execute()
    
    return result.data[0]


@router.post("/{transfer_id}/submit")
async def mark_as_submitted(transfer_id: str, tracking_number: Optional[str] = None):
    """Mark transfer as submitted to DMV/county"""
    update_data = {
        "status": "in_progress",
        "submitted_at": datetime.now().isoformat()
    }
    if tracking_number:
        update_data["tracking_number"] = tracking_number
    
    result = sb.table("title_transfers").update(update_data).eq("id", transfer_id).execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Transfer not found")
    
    return result.data[0]


@router.post("/{transfer_id}/complete")
async def mark_as_completed(transfer_id: str):
    """Mark transfer as completed"""
    result = sb.table("title_transfers").update({
        "status": "completed",
        "completed_at": datetime.now().isoformat()
    }).eq("id", transfer_id).execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Transfer not found")
    
    return result.data[0]


@router.post("/{transfer_id}/document/{doc_key}/upload")
async def upload_document(
    transfer_id: str, 
    doc_key: str, 
    file: UploadFile = File(...)
):
    """
    Upload a document file for a specific document in the checklist.
    Supports PDF, images (jpg, png), and common document formats.
    """
    # Validate document key
    valid_keys = ["bill_of_sale", "titulo", "title_application", "tax_receipt", "id_copies", "lien_release", "notarized_forms"]
    if doc_key not in valid_keys:
        raise HTTPException(status_code=400, detail=f"Invalid document key: {doc_key}")
    
    # Validate file type
    allowed_types = ["application/pdf", "image/jpeg", "image/png", "image/webp"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400, 
            detail=f"File type {file.content_type} not allowed. Use PDF or images."
        )
    
    # Get current transfer
    current = sb.table("title_transfers").select("documents_checklist, property_id").eq(
        "id", transfer_id
    ).single().execute()
    
    if not current.data:
        raise HTTPException(status_code=404, detail="Transfer not found")
    
    # Generate unique filename
    file_ext = file.filename.split(".")[-1] if "." in file.filename else "pdf"
    unique_filename = f"{transfer_id}/{doc_key}_{uuid.uuid4().hex[:8]}.{file_ext}"
    
    # Upload to Supabase Storage
    try:
        file_content = await file.read()
        
        upload_result = sb.storage.from_(DOCUMENT_BUCKET).upload(
            unique_filename,
            file_content,
            {"content-type": file.content_type}
        )
        
        # Get public URL
        file_url = sb.storage.from_(DOCUMENT_BUCKET).get_public_url(unique_filename)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")
    
    # Update checklist with file URL
    checklist = current.data.get("documents_checklist", {})
    
    # Handle both old (boolean) and new (object) format
    if isinstance(checklist.get(doc_key), bool):
        # Old format - convert to new
        checklist[doc_key] = {
            "checked": checklist[doc_key],
            "file_url": file_url,
            "uploaded_at": datetime.now().isoformat()
        }
    elif isinstance(checklist.get(doc_key), dict):
        # New format - update
        checklist[doc_key]["file_url"] = file_url
        checklist[doc_key]["uploaded_at"] = datetime.now().isoformat()
        checklist[doc_key]["checked"] = True  # Auto-check when file uploaded
    else:
        # Key doesn't exist - create new
        checklist[doc_key] = {
            "checked": True,
            "file_url": file_url,
            "uploaded_at": datetime.now().isoformat()
        }
    
    # Save to database
    result = sb.table("title_transfers").update({
        "documents_checklist": checklist
    }).eq("id", transfer_id).execute()
    
    return {
        "success": True,
        "doc_key": doc_key,
        "file_url": file_url,
        "filename": file.filename
    }


@router.delete("/{transfer_id}/document/{doc_key}/file")
async def delete_document_file(transfer_id: str, doc_key: str):
    """Delete an uploaded document file"""
    # Get current transfer
    current = sb.table("title_transfers").select("documents_checklist").eq(
        "id", transfer_id
    ).single().execute()
    
    if not current.data:
        raise HTTPException(status_code=404, detail="Transfer not found")
    
    checklist = current.data.get("documents_checklist", {})
    doc_data = checklist.get(doc_key)
    
    if not doc_data:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Get file URL to delete
    file_url = doc_data.get("file_url") if isinstance(doc_data, dict) else None
    
    if file_url:
        try:
            # Extract path from URL
            # URL format: https://xxx.supabase.co/storage/v1/object/public/bucket/path
            path = file_url.split(f"/{DOCUMENT_BUCKET}/")[-1]
            sb.storage.from_(DOCUMENT_BUCKET).remove([path])
        except Exception as e:
            print(f"Warning: Could not delete file from storage: {e}")
    
    # Update checklist - remove file but keep checked status
    if isinstance(doc_data, dict):
        checklist[doc_key] = {
            "checked": False,
            "file_url": None,
            "uploaded_at": None
        }
    else:
        checklist[doc_key] = False
    
    result = sb.table("title_transfers").update({
        "documents_checklist": checklist
    }).eq("id", transfer_id).execute()
    
    return {"success": True, "doc_key": doc_key}

