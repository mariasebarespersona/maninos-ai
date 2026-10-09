"""Every Bill of Sale carries the official Maninos Homes logo."""
from pathlib import Path

from api.services.pdf_service import BILL_OF_SALE_LOGO_PATH, generate_bill_of_sale

REPO = Path(__file__).resolve().parent.parent


def test_backend_and_frontend_logo_are_identical():
    # The backend image doesn't ship web/, so it keeps its own copy.
    frontend = REPO / "web" / "public" / "images" / "bill-of-sale-logo.png"
    assert BILL_OF_SALE_LOGO_PATH.read_bytes() == frontend.read_bytes()


def test_generated_bill_of_sale_embeds_logo():
    pdf = generate_bill_of_sale("Seller", "Buyer", "123 Main St", "HUD1", 2005, 25000)
    assert b"/Subtype /Image" in pdf
