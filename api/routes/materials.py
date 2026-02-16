"""
Materials and Renovation Items API
Manages the catalog of materials and renovation costs per property
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from datetime import date
import os

from supabase import create_client, Client

router = APIRouter()

# Initialize Supabase client
sb: Client = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SERVICE_ROLE_KEY"]
)


# ============ Schemas ============

class MaterialBase(BaseModel):
    name: str
    description: Optional[str] = None
    unit: str
    unit_price: float
    category: str


class MaterialCreate(MaterialBase):
    pass


class MaterialUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    unit: Optional[str] = None
    unit_price: Optional[float] = None
    category: Optional[str] = None
    is_active: Optional[bool] = None


class RenovationItemCreate(BaseModel):
    property_id: str
    renovation_id: Optional[str] = None
    material_id: Optional[str] = None
    # Accept both naming conventions from frontend
    material_name: Optional[str] = None  # Frontend sends this
    custom_name: Optional[str] = None    # DB field
    custom_unit: Optional[str] = None
    quantity: float = 1
    unit_price: float
    total_price: Optional[float] = None  # Calculated total
    notes: Optional[str] = None
    supplier: Optional[str] = None


class RenovationItemUpdate(BaseModel):
    quantity: Optional[float] = None
    unit_price: Optional[float] = None
    notes: Optional[str] = None
    purchased: Optional[bool] = None
    purchase_date: Optional[date] = None
    supplier: Optional[str] = None


# ============ Materials Endpoints ============

@router.get("")
async def list_materials(
    category: Optional[str] = None,
    active_only: bool = True
):
    """List all materials, optionally filtered by category"""
    query = sb.table("materials").select("*")
    
    if category:
        query = query.eq("category", category)
    
    if active_only:
        query = query.eq("is_active", True)
    
    result = query.order("category").order("name").execute()
    return result.data


@router.get("/categories")
async def list_categories():
    """Get all unique material categories"""
    result = sb.table("materials").select("category").execute()
    categories = list(set(item["category"] for item in result.data))
    return sorted(categories)


@router.get("/{material_id}")
async def get_material(material_id: str):
    """Get a specific material by ID"""
    result = sb.table("materials").select("*").eq("id", material_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Material not found")
    return result.data


@router.post("")
async def create_material(material: MaterialCreate):
    """Create a new material in the catalog"""
    result = sb.table("materials").insert(material.model_dump()).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create material")
    return result.data[0]


@router.put("/{material_id}")
async def update_material(material_id: str, material: MaterialUpdate):
    """Update a material"""
    update_data = {k: v for k, v in material.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    result = sb.table("materials").update(update_data).eq("id", material_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Material not found")
    return result.data[0]


# ============ Renovation Items Endpoints ============

@router.get("/renovation-items/{property_id}")
async def list_renovation_items(property_id: str):
    """List all renovation items for a property"""
    result = sb.table("renovation_items").select(
        "*, materials(name, unit, category)"
    ).eq("property_id", property_id).order("created_at").execute()
    
    # Format response - ensure material_name is always set
    items = []
    for item in result.data:
        material = item.pop("materials", None)
        # Get material_name from: 1) linked material, 2) custom_name field
        item["material_name"] = (
            material["name"] if material 
            else item.get("custom_name") 
            or "Material sin nombre"
        )
        item["material_unit"] = (
            material["unit"] if material 
            else item.get("custom_unit") 
            or "unidad"
        )
        item["material_category"] = material["category"] if material else "otros"
        items.append(item)
    
    return items


@router.get("/renovation-items/{property_id}/summary")
async def get_renovation_summary(property_id: str):
    """Get summary of renovation costs for a property"""
    result = sb.table("renovation_items").select(
        "*, materials(name, unit, category)"
    ).eq("property_id", property_id).execute()
    
    if not result.data:
        return {
            "total_items": 0,
            "total_cost": 0,
            "purchased_cost": 0,
            "pending_cost": 0,
            "by_category": {}
        }
    
    total_cost = 0
    purchased_cost = 0
    by_category = {}
    
    for item in result.data:
        material = item.get("materials", {})
        category = material.get("category", "otros") if material else "otros"
        item_total = item["quantity"] * item["unit_price"]
        
        total_cost += item_total
        if item.get("purchased"):
            purchased_cost += item_total
        
        if category not in by_category:
            by_category[category] = {"items": 0, "cost": 0}
        by_category[category]["items"] += 1
        by_category[category]["cost"] += item_total
    
    return {
        "total_items": len(result.data),
        "total_cost": round(total_cost, 2),
        "purchased_cost": round(purchased_cost, 2),
        "pending_cost": round(total_cost - purchased_cost, 2),
        "by_category": by_category
    }


@router.post("/renovation-items")
async def add_renovation_item(item: RenovationItemCreate):
    """Add a renovation item to a property"""
    # Verify property exists
    prop = sb.table("properties").select("id").eq("id", item.property_id).single().execute()
    if not prop.data:
        raise HTTPException(status_code=404, detail="Property not found")
    
    # Prepare data - exclude fields that shouldn't go to DB
    # Note: total_price is a GENERATED column, DB calculates it automatically
    data = item.model_dump(exclude={'material_name', 'total_price'})
    
    # Use material_name as custom_name if custom_name not set
    if item.material_name and not item.custom_name:
        data['custom_name'] = item.material_name
    
    result = sb.table("renovation_items").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to add renovation item")
    return result.data[0]


@router.put("/renovation-items/{item_id}")
async def update_renovation_item(item_id: str, item: RenovationItemUpdate):
    """Update a renovation item"""
    update_data = {k: v for k, v in item.model_dump().items() if v is not None}
    
    # Convert date to string for JSON
    if "purchase_date" in update_data and update_data["purchase_date"]:
        update_data["purchase_date"] = update_data["purchase_date"].isoformat()
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    result = sb.table("renovation_items").update(update_data).eq("id", item_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Item not found")
    return result.data[0]


@router.delete("/renovation-items/{item_id}")
async def delete_renovation_item(item_id: str):
    """Delete a renovation item"""
    result = sb.table("renovation_items").delete().eq("id", item_id).execute()
    return {"success": True, "deleted_id": item_id}


@router.post("/renovation-items/bulk/{property_id}")
async def add_bulk_renovation_items(property_id: str, items: list[RenovationItemCreate]):
    """Add multiple renovation items at once"""
    # Verify property exists
    prop = sb.table("properties").select("id").eq("id", property_id).single().execute()
    if not prop.data:
        raise HTTPException(status_code=404, detail="Property not found")
    
    # Set property_id for all items
    items_data = [
        {**item.model_dump(), "property_id": property_id}
        for item in items
    ]
    
    result = sb.table("renovation_items").insert(items_data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to add renovation items")
    return {"success": True, "count": len(result.data), "items": result.data}

