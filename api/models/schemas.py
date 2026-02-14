"""
Pydantic schemas for Maninos AI API
"""

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


# ============================================================================
# ENUMS
# ============================================================================

class PropertyStatus(str, Enum):
    PURCHASED = "purchased"
    PUBLISHED = "published"
    RESERVED = "reserved"      # Reservada: venta en proceso (contado o RTO)
    RENOVATING = "renovating"
    SOLD = "sold"


class ClientStatus(str, Enum):
    LEAD = "lead"
    ACTIVE = "active"
    RTO_APPLICANT = "rto_applicant"
    RTO_ACTIVE = "rto_active"
    COMPLETED = "completed"
    INACTIVE = "inactive"


class SaleStatus(str, Enum):
    PENDING = "pending"
    PAID = "paid"
    RTO_APPROVED = "rto_approved"
    RTO_ACTIVE = "rto_active"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class SaleType(str, Enum):
    CONTADO = "contado"
    RTO = "rto"


class RenovationStatus(str, Enum):
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


# ============================================================================
# PROPERTY SCHEMAS
# ============================================================================

class PropertyBase(BaseModel):
    address: str
    city: Optional[str] = None
    state: str = "Texas"
    zip_code: Optional[str] = None
    hud_number: Optional[str] = None
    year: Optional[int] = None
    purchase_price: Optional[Decimal] = None
    sale_price: Optional[Decimal] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[Decimal] = None
    square_feet: Optional[int] = None


class PropertyCreate(PropertyBase):
    """Schema for creating a new property (Paso 1: Compra Casa)"""
    status: Optional[str] = None
    is_renovated: Optional[bool] = None
    photos: Optional[list[str]] = None
    checklist_completed: Optional[bool] = None
    checklist_data: Optional[dict] = None
    notes: Optional[str] = None


class PropertyUpdate(BaseModel):
    """Schema for updating property details"""
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    hud_number: Optional[str] = None
    year: Optional[int] = None
    purchase_price: Optional[Decimal] = None
    sale_price: Optional[Decimal] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[Decimal] = None
    square_feet: Optional[int] = None
    photos: Optional[list[str]] = None
    checklist_completed: Optional[bool] = None
    checklist_data: Optional[dict] = None


class PropertyResponse(PropertyBase):
    """Schema for property response"""
    id: str
    status: PropertyStatus
    is_renovated: bool
    photos: list[str] = []
    checklist_completed: bool
    checklist_data: dict = {}
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


# ============================================================================
# CLIENT SCHEMAS
# ============================================================================

class ClientBase(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    terreno: Optional[str] = None
    monthly_income: Optional[Decimal] = None
    employment_status: Optional[str] = None
    employer_name: Optional[str] = None


class ClientCreate(ClientBase):
    """Schema for creating a new client"""
    created_by_user_id: Optional[str] = None  # Employee who found/created this client


class ClientUpdate(BaseModel):
    """Schema for updating client details"""
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    terreno: Optional[str] = None
    status: Optional[ClientStatus] = None
    monthly_income: Optional[Decimal] = None
    employment_status: Optional[str] = None
    employer_name: Optional[str] = None


class ClientResponse(ClientBase):
    """Schema for client response"""
    id: str
    status: ClientStatus
    created_by_user_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class ClientFullResponse(BaseModel):
    """Full client response with ALL fields from DB (Solicitud de Crédito, KYC, etc.)"""
    id: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    terreno: Optional[str] = None
    status: ClientStatus
    created_by_user_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    # Personal info (Solicitud de Crédito)
    date_of_birth: Optional[str] = None
    ssn_itin: Optional[str] = None
    marital_status: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    residence_type: Optional[str] = None
    
    # Employment info
    employer_name: Optional[str] = None
    occupation: Optional[str] = None
    employer_address: Optional[str] = None
    employer_phone: Optional[str] = None
    monthly_income: Optional[Decimal] = None
    employment_status: Optional[str] = None
    time_at_job_years: Optional[int] = None
    time_at_job_months: Optional[int] = None
    other_income_source: Optional[bool] = None
    other_income_amount: Optional[Decimal] = None
    
    # Personal references
    personal_references: Optional[list] = None
    
    # KYC
    kyc_verified: Optional[bool] = None
    kyc_verified_at: Optional[datetime] = None
    kyc_documents: Optional[dict] = None
    kyc_status: Optional[str] = None
    
    class Config:
        from_attributes = True


class ClientWithSale(ClientResponse):
    """Client with associated sale info"""
    property_address: Optional[str] = None
    sale_status: Optional[SaleStatus] = None
    sale_date: Optional[datetime] = None


# ============================================================================
# SALE SCHEMAS
# ============================================================================

class SaleCreate(BaseModel):
    """Schema for creating a new sale (Cierre de Venta)"""
    property_id: str
    client_id: str
    sale_price: Decimal
    sale_type: SaleType = SaleType.CONTADO
    found_by_employee_id: Optional[str] = None  # Employee who found the client
    sold_by_employee_id: Optional[str] = None   # Employee who closed the sale


class SaleComplete(BaseModel):
    """Schema for completing a sale"""
    payment_method: str
    payment_reference: Optional[str] = None


class SaleResponse(BaseModel):
    """Schema for sale response"""
    id: str
    property_id: str
    client_id: str
    sale_type: SaleType
    sale_price: Decimal
    status: SaleStatus
    sold_before_renovation: bool
    payment_method: Optional[str] = None
    payment_reference: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    updated_at: datetime
    
    # Commission fields
    found_by_employee_id: Optional[str] = None
    sold_by_employee_id: Optional[str] = None
    commission_amount: Optional[Decimal] = None
    commission_found_by: Optional[Decimal] = None
    commission_sold_by: Optional[Decimal] = None
    
    # Populated from joins
    property_address: Optional[str] = None
    client_name: Optional[str] = None
    found_by_name: Optional[str] = None
    sold_by_name: Optional[str] = None
    
    class Config:
        from_attributes = True


# ============================================================================
# RENOVATION SCHEMAS
# ============================================================================

class MaterialItem(BaseModel):
    """Single material item in renovation"""
    item: str
    quantity: int = 1
    unit_cost: Decimal
    total: Optional[Decimal] = None
    
    def model_post_init(self, __context):
        if self.total is None:
            self.total = self.quantity * self.unit_cost


class RenovationCreate(BaseModel):
    """Schema for starting a renovation"""
    property_id: str
    was_moved: bool = False
    notes: Optional[str] = None


class RenovationUpdate(BaseModel):
    """Schema for updating renovation"""
    materials: Optional[list[MaterialItem]] = None
    notes: Optional[str] = None
    was_moved: Optional[bool] = None


class RenovationResponse(BaseModel):
    """Schema for renovation response"""
    id: str
    property_id: str
    materials: list[dict] = []
    total_cost: Decimal
    notes: Optional[str] = None
    status: RenovationStatus
    was_moved: bool
    created_at: datetime
    completed_at: Optional[datetime] = None
    updated_at: datetime
    
    class Config:
        from_attributes = True

