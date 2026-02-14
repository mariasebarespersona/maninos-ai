"""
Document Service - Auto-generate and store sale documents.

When a client completes a purchase (payment confirmed), this service:
1. Generates a Bill of Sale PDF
2. Generates a Title Transfer (TDHCA SOL) PDF
3. Uploads both to Supabase Storage
4. Updates the title_transfers.documents_checklist with file URLs

This eliminates manual document creation for the Contado flow.
"""

import logging
from datetime import datetime
from typing import Dict, Any, Optional

from api.services.pdf_service import generate_bill_of_sale
from tools.supabase_client import sb

logger = logging.getLogger(__name__)

BUCKET_NAME = "transaction-documents"


def _upload_to_storage(
    pdf_bytes: bytes,
    folder: str,
    filename: str,
) -> Optional[str]:
    """Upload PDF to Supabase Storage and return public URL."""
    try:
        storage_path = f"{folder}/{filename}"
        
        sb.storage.from_(BUCKET_NAME).upload(
            storage_path,
            pdf_bytes,
            {"content-type": "application/pdf"},
        )
        
        public_url = sb.storage.from_(BUCKET_NAME).get_public_url(storage_path)
        # Clean trailing ? if present
        if public_url.endswith("?"):
            public_url = public_url[:-1]
        
        logger.info(f"[document_service] Uploaded {filename} -> {public_url}")
        return public_url
        
    except Exception as e:
        # If file already exists, try to get its URL
        if "Duplicate" in str(e) or "already exists" in str(e):
            try:
                public_url = sb.storage.from_(BUCKET_NAME).get_public_url(f"{folder}/{filename}")
                if public_url.endswith("?"):
                    public_url = public_url[:-1]
                return public_url
            except Exception:
                pass
        logger.error(f"[document_service] Upload failed: {e}")
        return None


def auto_generate_sale_documents(
    sale_id: str,
    sale_data: dict,
    client_data: dict,
    property_data: dict,
) -> Dict[str, Any]:
    """
    Auto-generate Bill of Sale + Title PDFs after payment confirmation.
    
    Args:
        sale_id: UUID of the sale
        sale_data: Sale record with sale_price, completed_at, etc.
        client_data: Client record with name, email, phone
        property_data: Property record with address, city, hud_number, etc.
    
    Returns:
        Dict with generated document URLs
    """
    results = {
        "ok": True,
        "bill_of_sale": None,
        "title": None,
        "errors": [],
    }
    
    # Folder for organizing docs
    folder = f"sales/{sale_id}"
    now = datetime.utcnow()
    
    # =========================================================================
    # 1. Generate Bill of Sale
    # =========================================================================
    try:
        bill_of_sale_bytes = generate_bill_of_sale(
            seller_name="Maninos Homes LLC",
            buyer_name=client_data.get("name", "N/A"),
            property_address=property_data.get("address", "N/A"),
            hud_number=property_data.get("hud_number"),
            property_year=property_data.get("year_built"),
            sale_price=float(sale_data.get("sale_price", 0)),
            sale_date=now,
        )
        
        bos_filename = f"Bill_of_Sale_{sale_id[:8]}.pdf"
        bos_url = _upload_to_storage(bill_of_sale_bytes, folder, bos_filename)
        
        if bos_url:
            results["bill_of_sale"] = bos_url
            logger.info(f"[document_service] Bill of Sale generated for sale {sale_id}")
        else:
            results["errors"].append("Failed to upload Bill of Sale")
            
    except Exception as e:
        logger.error(f"[document_service] Bill of Sale generation failed: {e}")
        results["errors"].append(f"Bill of Sale error: {str(e)}")
    
    # =========================================================================
    # 2. Generate Title Transfer Document (TDHCA SOL)
    # =========================================================================
    try:
        from tools.pdf_generator import generate_tdhca_title_pdf
        
        transfer_data = {
            "transfer_id": sale_id,
            "transfer_date": now.strftime("%Y-%m-%d"),
            "sale_price": float(sale_data.get("sale_price", 0)),
            "down_payment": 0,
            "closing_date": now.strftime("%Y-%m-%d"),
            "lien_holder": "None",
        }
        
        seller_data = {
            "name": "Maninos Homes LLC",
            "address": "Houston, TX",
            "phone": "832-745-9600",
            "email": "info@maninoscapital.com",
        }
        
        buyer_data = {
            "full_name": client_data.get("name", "N/A"),
            "current_address": client_data.get("terreno", "N/A"),
            "phone": client_data.get("phone", "N/A"),
            "email": client_data.get("email", "N/A"),
        }
        
        title_result = generate_tdhca_title_pdf(
            transfer_data=transfer_data,
            seller_data=seller_data,
            buyer_data=buyer_data,
            property_data=property_data,
        )
        
        if title_result.get("ok") and title_result.get("pdf_bytes"):
            title_filename = f"Title_{sale_id[:8]}.pdf"
            title_url = _upload_to_storage(title_result["pdf_bytes"], folder, title_filename)
            
            if title_url:
                results["title"] = title_url
                logger.info(f"[document_service] Title generated for sale {sale_id}")
            else:
                results["errors"].append("Failed to upload Title")
        else:
            results["errors"].append(f"Title generation error: {title_result.get('error')}")
            
    except Exception as e:
        logger.error(f"[document_service] Title generation failed: {e}")
        results["errors"].append(f"Title error: {str(e)}")
    
    # =========================================================================
    # 3. Update title_transfers.documents_checklist with file URLs
    # =========================================================================
    try:
        # Find the title_transfer for this sale
        transfer_result = sb.table("title_transfers") \
            .select("id, documents_checklist") \
            .eq("sale_id", sale_id) \
            .eq("transfer_type", "sale") \
            .limit(1) \
            .execute()
        
        if transfer_result.data:
            transfer_id = transfer_result.data[0]["id"]
            existing_docs = transfer_result.data[0].get("documents_checklist") or {}
            
            # Update documents_checklist with new file URLs
            if results["bill_of_sale"]:
                existing_docs["bill_of_sale"] = {
                    "checked": True,
                    "file_url": results["bill_of_sale"],
                    "uploaded_at": now.isoformat(),
                    "auto_generated": True,
                }
            
            if results["title"]:
                existing_docs["title_application"] = {
                    "checked": True,
                    "file_url": results["title"],
                    "uploaded_at": now.isoformat(),
                    "auto_generated": True,
                }
            
            sb.table("title_transfers").update({
                "documents_checklist": existing_docs,
                "status": "completed" if results["bill_of_sale"] and results["title"] else "in_progress",
            }).eq("id", transfer_id).execute()
            
            logger.info(f"[document_service] Updated title_transfer {transfer_id} with auto-generated docs")
        else:
            logger.warning(f"[document_service] No title_transfer found for sale {sale_id}")
            results["errors"].append("No title_transfer record found")
            
    except Exception as e:
        logger.error(f"[document_service] Failed to update title_transfer: {e}")
        results["errors"].append(f"DB update error: {str(e)}")
    
    results["ok"] = len(results["errors"]) == 0
    return results


