"""
Clients API Routes
Handles client/buyer management for Portal Homes.
Used during Cierre de Venta and for Client Dashboard tracking.
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Request

from api.models.schemas import (
    ClientCreate,
    ClientUpdate,
    ClientResponse,
    ClientFullResponse,
    ClientStatus,
    ClientWithSale,
    SaleStatus,
)
from tools.supabase_client import sb

router = APIRouter()


# ============================================================================
# CLIENTS CRUD
# ============================================================================

@router.get("", response_model=list[ClientWithSale])
async def list_clients(
    status: Optional[ClientStatus] = Query(None, description="Filter by status"),
    sale_type: Optional[str] = Query(None, description="Filter by sale type: contado or rto"),
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
):
    """
    List all clients with their sale information.
    Use sale_type=contado for Homes, sale_type=rto for Capital.
    """
    # If filtering by sale_type, first find client_ids that have sales of that type
    filtered_client_ids = None
    if sale_type:
        type_sales = sb.table("sales").select("client_id").eq("sale_type", sale_type).execute()
        filtered_client_ids = list({s["client_id"] for s in (type_sales.data or [])})
        if not filtered_client_ids:
            return []

    # Get clients
    query = sb.table("clients").select("*")

    if status:
        query = query.eq("status", status.value)

    if filtered_client_ids is not None:
        query = query.in_("id", filtered_client_ids)

    query = query.order("created_at", desc=True).range(offset, offset + limit - 1)

    clients_result = query.execute()

    if not clients_result.data:
        return []

    # Get sales for these clients
    client_ids = [c["id"] for c in clients_result.data]
    sales_query = sb.table("sales").select(
        "client_id, status, created_at, property_id, sale_type"
    ).in_("client_id", client_ids)
    if sale_type:
        sales_query = sales_query.eq("sale_type", sale_type)
    sales_result = sales_query.execute()

    # Get properties for address info
    if sales_result.data:
        property_ids = [s["property_id"] for s in sales_result.data]
        props_result = sb.table("properties").select("id, address").in_("id", property_ids).execute()
        props_map = {p["id"]: p["address"] for p in (props_result.data or [])}
    else:
        props_map = {}

    # Build sales map
    sales_map = {}
    for sale in (sales_result.data or []):
        sales_map[sale["client_id"]] = {
            "status": sale["status"],
            "date": sale["created_at"],
            "property_address": props_map.get(sale["property_id"]),
        }

    # Format response
    return [
        _format_client_with_sale(c, sales_map.get(c["id"]))
        for c in clients_result.data
    ]


# NOTE: These routes MUST come BEFORE /{client_id} to avoid being captured by the UUID pattern
@router.get("/summary")
@router.get("/stats/summary")
async def get_clients_summary(
    sale_type: Optional[str] = Query(None, description="Filter by sale type: contado or rto"),
):
    """
    Get summary statistics for Client Dashboard.
    Use sale_type=contado for Homes, sale_type=rto for Capital.
    """
    # If filtering by sale_type, get only client_ids with that sale type
    filtered_client_ids = None
    if sale_type:
        type_sales = sb.table("sales").select("client_id").eq("sale_type", sale_type).execute()
        filtered_client_ids = {s["client_id"] for s in (type_sales.data or [])}

    # Count by status
    all_clients = sb.table("clients").select("id, status").execute()

    status_counts = {
        "lead": 0,
        "active": 0,
        "completed": 0,
        "rto_applicant": 0,
        "rto_active": 0,
        "inactive": 0,
        "total": 0,
    }

    for client in (all_clients.data or []):
        if filtered_client_ids is not None and client["id"] not in filtered_client_ids:
            continue
        status_counts[client["status"]] = status_counts.get(client["status"], 0) + 1
        status_counts["total"] += 1

    return status_counts


@router.patch("/{client_id}/assign-employee")
async def assign_employee(client_id: str, request: Request):
    """Assign an employee to a client for follow-up tracking."""
    body = await request.json()
    employee_id = body.get("employee_id")

    # Allow clearing assignment
    update_data = {"assigned_employee_id": employee_id if employee_id else None}

    try:
        result = sb.table("clients").update(update_data).eq("id", client_id).execute()
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to assign employee")

    if not result.data:
        raise HTTPException(status_code=404, detail="Client not found")

    return {"ok": True, "client": _format_client_full(result.data[0])}


@router.get("/{client_id}/notes")
async def get_client_notes(client_id: str):
    """Get all notes for a client, ordered newest first."""
    notes_result = (
        sb.table("client_notes")
        .select("*")
        .eq("client_id", client_id)
        .order("created_at", desc=True)
        .execute()
    )

    notes = []
    for note in (notes_result.data or []):
        # Resolve author name
        author_name = "Desconocido"
        if note.get("author_id"):
            try:
                user = sb.table("users").select("name").eq("id", note["author_id"]).single().execute()
                if user.data:
                    author_name = user.data["name"]
            except Exception:
                pass

        notes.append({
            "id": note["id"],
            "client_id": note["client_id"],
            "author_id": note["author_id"],
            "author_name": author_name,
            "note_type": note["note_type"],
            "content": note["content"],
            "created_at": note["created_at"],
        })

    return notes


@router.post("/{client_id}/notes")
async def add_client_note(client_id: str, request: Request):
    """Add a note to a client."""
    body = await request.json()
    author_id = body.get("author_id")
    note_type = body.get("note_type", "observation")
    content = body.get("content")

    if not author_id or not content:
        raise HTTPException(status_code=400, detail="author_id and content are required")

    insert_data = {
        "client_id": client_id,
        "author_id": author_id,
        "note_type": note_type,
        "content": content,
    }

    try:
        result = sb.table("client_notes").insert(insert_data).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add note: {str(e)}")

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to add note")

    note = result.data[0]

    # Resolve author name
    author_name = "Desconocido"
    try:
        user = sb.table("users").select("name").eq("id", author_id).single().execute()
        if user.data:
            author_name = user.data["name"]
    except Exception:
        pass

    return {
        "id": note["id"],
        "client_id": note["client_id"],
        "author_id": note["author_id"],
        "author_name": author_name,
        "note_type": note["note_type"],
        "content": note["content"],
        "created_at": note["created_at"],
    }


@router.get("/{client_id}/full")
async def get_client_full(client_id: str):
    """Get a client with ALL fields (Solicitud de Crédito, KYC, etc.)."""
    import re
    if not re.match(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', client_id, re.I):
        raise HTTPException(status_code=404, detail="Client not found")
    
    try:
        result = sb.table("clients").select("*").eq("id", client_id).single().execute()
    except Exception:
        raise HTTPException(status_code=404, detail="Client not found")
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Client not found")
    
    return _format_client_full(result.data)


@router.get("/{client_id}")
async def get_client(client_id: str):
    """Get a single client with ALL fields (including credit, KYC) + sale info."""
    import re
    # Validate UUID format to avoid Supabase errors
    if not re.match(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', client_id, re.I):
        raise HTTPException(status_code=404, detail="Client not found")
    
    try:
        result = sb.table("clients").select("*").eq("id", client_id).single().execute()
    except Exception:
        raise HTTPException(status_code=404, detail="Client not found")
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Get sale info (use .execute() without .single() to handle 0 or multiple results)
    sale_result = sb.table("sales").select(
        "status, created_at, property_id"
    ).eq("client_id", client_id).order("created_at", desc=True).limit(1).execute()
    
    sale_info = None
    if sale_result.data:
        sale_data = sale_result.data[0]
        # Get property address
        prop_result = sb.table("properties").select("address").eq(
            "id", sale_data["property_id"]
        ).limit(1).execute()
        
        sale_info = {
            "status": sale_data["status"],
            "date": sale_data["created_at"],
            "property_address": prop_result.data[0]["address"] if prop_result.data else None,
        }
    
    # Return full client data (credit info, KYC, etc.) with ok flag
    client_full = _format_client_full(result.data)
    return {"ok": True, "client": client_full, "sale": sale_info}


@router.post("", response_model=ClientResponse)
async def create_client(data: ClientCreate):
    """Create a new client."""
    insert_data = {
        **data.model_dump(exclude_none=True),
        "status": ClientStatus.LEAD.value,
    }
    
    result = sb.table("clients").insert(insert_data).execute()
    
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create client")
    
    return _format_client(result.data[0])


@router.patch("/{client_id}")
@router.put("/{client_id}")
async def update_client(client_id: str, data: ClientUpdate):
    """Update client details (PATCH or PUT). Returns full client data."""
    current = sb.table("clients").select("*").eq("id", client_id).single().execute()
    if not current.data:
        raise HTTPException(status_code=404, detail="Client not found")
    
    update_data = data.model_dump(exclude_none=True)
    
    # Convert Decimal to float for JSON serialization
    for key, val in update_data.items():
        if hasattr(val, 'as_tuple'):  # Decimal
            update_data[key] = float(val)
    
    if not update_data:
        return {"ok": True, "client": _format_client_full(current.data)}
    
    result = sb.table("clients").update(update_data).eq("id", client_id).execute()
    
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to update client")
    
    return {"ok": True, "client": _format_client_full(result.data[0])}


@router.delete("/{client_id}")
async def delete_client(client_id: str):
    """Delete a client (only if no active sales)."""
    # Check for sales
    sales = sb.table("sales").select("id").eq("client_id", client_id).execute()
    
    if sales.data:
        raise HTTPException(
            status_code=400, 
            detail="Cannot delete client with existing sales"
        )
    
    sb.table("clients").delete().eq("id", client_id).execute()
    
    return {"message": "Client deleted successfully"}


# ============================================================================
# CLIENT DASHBOARD SPECIFIC
# ============================================================================

@router.get("/{client_id}/history")
async def get_client_history(client_id: str):
    """
    Get complete history for a client.
    Includes ALL client data, sales, documents (from title_transfers), and KYC docs.
    """
    # Verify client exists - get ALL fields
    client = sb.table("clients").select("*").eq("id", client_id).single().execute()
    if not client.data:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Get all sales with payment info
    sales = sb.table("sales").select("*").eq("client_id", client_id).order("created_at", desc=True).execute()
    
    # Get property info for sales
    property_info = {}
    if sales.data:
        property_ids = [s["property_id"] for s in sales.data]
        props = sb.table("properties").select(
            "id, address, city, state, sale_price, purchase_price, photos, bedrooms, bathrooms, square_feet, year, hud_number"
        ).in_("id", property_ids).execute()
        property_info = {p["id"]: p for p in (props.data or [])}
    
    # Get title transfer documents for each sale
    all_documents = []
    sale_documents = {}  # sale_id -> list of docs
    
    if sales.data:
        for sale in sales.data:
            property_id = sale["property_id"]
            sale_id = sale["id"]
            
            # Get all title_transfers for this property
            transfers = sb.table("title_transfers").select("*").eq(
                "property_id", property_id
            ).execute()
            
            docs = []
            for transfer in (transfers.data or []):
                checklist = transfer.get("documents_checklist", {})
                for doc_key, doc_info in checklist.items():
                    if isinstance(doc_info, dict) and doc_info.get("file_url"):
                        doc = {
                            "id": f"{transfer['id']}_{doc_key}",
                            "doc_type": doc_key,
                            "doc_label": _doc_label(doc_key),
                            "file_url": doc_info["file_url"],
                            "uploaded_at": doc_info.get("uploaded_at"),
                            "transfer_type": transfer.get("transfer_type", "purchase"),
                            "transfer_status": transfer.get("status", "pending"),
                        }
                        docs.append(doc)
                        all_documents.append(doc)
            
            sale_documents[sale_id] = docs
    
    # Get KYC documents
    kyc_docs = client.data.get("kyc_documents") or {}
    kyc_list = []
    kyc_labels = {
        "id_front": "ID (Frente)",
        "id_back": "ID (Reverso)",
        "proof_income": "Comprobante de Ingresos",
    }
    for key, url in kyc_docs.items():
        if url:
            kyc_list.append({
                "id": f"kyc_{key}",
                "doc_type": key,
                "doc_label": kyc_labels.get(key, key),
                "file_url": url,
                "source": "kyc",
            })
    
    # Resolve created_by name
    created_by_name = None
    if client.data.get("created_by_user_id"):
        try:
            user_result = sb.table("users").select("name").eq("id", client.data["created_by_user_id"]).single().execute()
            created_by_name = user_result.data["name"] if user_result.data else None
        except Exception:
            pass

    # Resolve assigned employee name
    assigned_employee_name = None
    if client.data.get("assigned_employee_id"):
        try:
            emp_result = sb.table("users").select("name").eq("id", client.data["assigned_employee_id"]).single().execute()
            assigned_employee_name = emp_result.data["name"] if emp_result.data else None
        except Exception:
            pass

    return {
        "client": _format_client_full(client.data),
        "created_by_name": created_by_name,
        "assigned_employee_id": client.data.get("assigned_employee_id"),
        "assigned_employee_name": assigned_employee_name,
        "sales": [
            {
                **s,
                "property": property_info.get(s["property_id"]),
                "documents": sale_documents.get(s["id"], []),
            }
            for s in (sales.data or [])
        ],
        "documents": all_documents,
        "kyc_documents": kyc_list,
    }


# ============================================================================
# HELPERS
# ============================================================================

DOC_LABELS = {
    "bill_of_sale": "Bill of Sale (Factura de Compra-Venta)",
    "titulo": "Título (TDHCA)",
    "title_application": "Aplicación Cambio de Título",
    "tax_receipt": "Recibo de Impuestos",
    "id_copies": "Copias de Identificación",
    "lien_release": "Liberación de Gravamen",
    "notarized_forms": "Formularios Notarizados",
}


def _doc_label(key: str) -> str:
    return DOC_LABELS.get(key, key)


def _format_client(data: dict) -> ClientResponse:
    """Format database row to ClientResponse."""
    return ClientResponse(
        id=data["id"],
        name=data["name"],
        email=data.get("email"),
        phone=data.get("phone"),
        terreno=data.get("terreno"),
        status=ClientStatus(data["status"]),
        created_at=data["created_at"],
        updated_at=data["updated_at"],
    )


def _format_client_full(data: dict) -> dict:
    """Format database row to full client dict with ALL fields."""
    return {
        "id": data["id"],
        "name": data["name"],
        "email": data.get("email"),
        "phone": data.get("phone"),
        "terreno": data.get("terreno"),
        "status": data.get("status", "lead"),
        "created_by_user_id": data.get("created_by_user_id"),
        "assigned_employee_id": data.get("assigned_employee_id"),
        "created_at": data["created_at"],
        "updated_at": data["updated_at"],
        # Personal info
        "date_of_birth": data.get("date_of_birth"),
        "ssn_itin": data.get("ssn_itin"),
        "marital_status": data.get("marital_status"),
        "address": data.get("address"),
        "city": data.get("city"),
        "state": data.get("state"),
        "zip_code": data.get("zip_code"),
        "residence_type": data.get("residence_type"),
        # Employment
        "employer_name": data.get("employer_name"),
        "occupation": data.get("occupation"),
        "employer_address": data.get("employer_address"),
        "employer_phone": data.get("employer_phone"),
        "monthly_income": float(data["monthly_income"]) if data.get("monthly_income") else None,
        "employment_status": data.get("employment_status"),
        "time_at_job_years": data.get("time_at_job_years"),
        "time_at_job_months": data.get("time_at_job_months"),
        "other_income_source": data.get("other_income_source"),
        "other_income_amount": float(data["other_income_amount"]) if data.get("other_income_amount") else None,
        # References
        "personal_references": data.get("personal_references", []),
        # KYC
        "kyc_verified": data.get("kyc_verified", False),
        "kyc_verified_at": data.get("kyc_verified_at"),
        "kyc_documents": data.get("kyc_documents", {}),
        "kyc_status": data.get("kyc_status", "unverified"),
    }


def _safe_client_status(value: str) -> ClientStatus:
    """Safely convert a string to ClientStatus."""
    try:
        return ClientStatus(value)
    except ValueError:
        return ClientStatus.LEAD


def _safe_sale_status(value: str) -> SaleStatus:
    """Safely convert a string to SaleStatus."""
    try:
        return SaleStatus(value)
    except ValueError:
        return SaleStatus.PENDING


def _format_client_with_sale(data: dict, sale_info: Optional[dict]) -> ClientWithSale:
    """Format database row to ClientWithSale."""
    return ClientWithSale(
        id=data["id"],
        name=data["name"],
        email=data.get("email"),
        phone=data.get("phone"),
        terreno=data.get("terreno"),
        status=_safe_client_status(data["status"]),
        created_at=data["created_at"],
        updated_at=data["updated_at"],
        property_address=sale_info["property_address"] if sale_info else None,
        sale_status=_safe_sale_status(sale_info["status"]) if sale_info else None,
        sale_date=sale_info["date"] if sale_info else None,
    )

