"""
Extract Listing Data from Screenshots or URLs.

Two methods for employees to add houses from Facebook Marketplace (or any source):
1. Screenshot → GPT-4 Vision extracts property data
2. URL → Playwright scrapes the specific page

Both return standardized data matching MarketListingCreate schema.
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from typing import Optional
from pydantic import BaseModel, Field
from datetime import datetime
import logging
import os
import json
import base64
import re

logger = logging.getLogger(__name__)

router = APIRouter()


# ============================================
# SCHEMAS
# ============================================

class ExtractedListing(BaseModel):
    """Data extracted from screenshot or URL."""
    source: str = "facebook"
    source_url: str = ""
    address: str = ""
    city: str = ""
    state: str = "TX"
    zip_code: Optional[str] = None
    listing_price: float = 0
    year_built: Optional[int] = None
    sqft: Optional[int] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[float] = None
    description: Optional[str] = None
    photos: list[str] = []
    thumbnail_url: Optional[str] = None
    confidence: float = 0.0
    extraction_method: str = ""
    raw_text: Optional[str] = None


class ExtractFromURLRequest(BaseModel):
    """Request to extract data from a URL."""
    url: str = Field(description="Facebook Marketplace or other listing URL")


# ============================================
# GPT-4 VISION SYSTEM PROMPT
# ============================================

VISION_SYSTEM_PROMPT = """You are a data extraction assistant for Maninos Homes, a mobile home company in Texas.

You will receive a screenshot of a property listing from Facebook Marketplace or another source.

Extract ALL available property information from the image. Focus on:

1. **listing_price**: The asking price in USD (number only, no $ or commas)
2. **address**: Full street address if visible
3. **city**: City name
4. **state**: State (default "TX" if in Texas)
5. **zip_code**: ZIP code if visible
6. **year_built**: Year the home was built/manufactured
7. **sqft**: Square footage
8. **bedrooms**: Number of bedrooms
9. **bathrooms**: Number of bathrooms
10. **description**: Brief description of the property from the listing

IMPORTANT RULES:
- Only extract data that is CLEARLY visible in the image
- If a field is not visible, set it to null
- For price, extract the numeric value only (e.g., 35000 not "$35,000")
- If the listing is for a mobile home / manufactured home, note that in description
- Always try to identify the city from the listing
- Set confidence between 0.0 and 1.0 based on how much data you could extract

Respond ONLY with valid JSON in this exact format:
{
  "listing_price": 35000,
  "address": "123 Main St",
  "city": "Houston",
  "state": "TX",
  "zip_code": "77001",
  "year_built": 2005,
  "sqft": 1200,
  "bedrooms": 3,
  "bathrooms": 2,
  "description": "3/2 mobile home in good condition",
  "confidence": 0.85
}

If you cannot extract ANY useful data, respond with:
{"error": "No se pudo extraer información de la imagen", "confidence": 0.0}
"""


# ============================================
# ENDPOINT 1: Extract from Screenshot (GPT-4 Vision)
# ============================================

@router.post("/from-image", response_model=ExtractedListing)
async def extract_from_image(
    image: UploadFile = File(..., description="Screenshot of the listing"),
    source: str = Form(default="facebook", description="Source: facebook, whatsapp, instagram, other"),
):
    """
    Extract property data from a screenshot using GPT-4 Vision.
    
    The employee takes a screenshot of a Facebook Marketplace listing
    and uploads it. GPT-4 Vision extracts all visible property data.
    
    Works with screenshots from:
    - Facebook Marketplace
    - WhatsApp messages
    - Instagram posts
    - Any source with property info visible
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured")
    
    # Validate file type
    allowed_types = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]
    if image.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type: {image.content_type}. Allowed: {', '.join(allowed_types)}"
        )
    
    # Read and encode image
    try:
        image_bytes = await image.read()
        if len(image_bytes) > 20 * 1024 * 1024:  # 20MB limit
            raise HTTPException(status_code=400, detail="Image too large. Maximum 20MB.")
        
        base64_image = base64.b64encode(image_bytes).decode("utf-8")
        mime_type = image.content_type or "image/jpeg"
        
    except Exception as e:
        logger.error(f"Error reading image: {e}")
        raise HTTPException(status_code=400, detail=f"Error reading image: {str(e)}")
    
    # Call GPT-4 Vision
    try:
        from openai import OpenAI
        
        client = OpenAI(api_key=api_key)
        
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": VISION_SYSTEM_PROMPT,
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": "Extract all property information from this listing screenshot.",
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{mime_type};base64,{base64_image}",
                                "detail": "high",
                            },
                        },
                    ],
                },
            ],
            max_tokens=1000,
            temperature=0.1,
        )
        
        # Parse response
        content = response.choices[0].message.content
        logger.info(f"[ExtractImage] GPT-4V raw response: {content}")
        
        # Clean up response (remove markdown code blocks if present)
        content = content.strip()
        if content.startswith("```"):
            content = re.sub(r'^```(?:json)?\s*', '', content)
            content = re.sub(r'\s*```$', '', content)
        
        extracted = json.loads(content)
        
        if "error" in extracted:
            raise HTTPException(status_code=422, detail=extracted["error"])
        
        return ExtractedListing(
            source=source,
            source_url="",
            address=extracted.get("address", "") or "",
            city=extracted.get("city", "") or "",
            state=extracted.get("state", "TX") or "TX",
            zip_code=extracted.get("zip_code"),
            listing_price=float(extracted.get("listing_price", 0) or 0),
            year_built=extracted.get("year_built"),
            sqft=extracted.get("sqft"),
            bedrooms=extracted.get("bedrooms"),
            bathrooms=extracted.get("bathrooms"),
            description=extracted.get("description"),
            confidence=float(extracted.get("confidence", 0.5)),
            extraction_method="gpt4_vision",
            photos=[],
            thumbnail_url=None,
        )
        
    except json.JSONDecodeError as e:
        logger.error(f"[ExtractImage] JSON parse error: {e}, content: {content}")
        raise HTTPException(status_code=422, detail="AI could not extract structured data from the image")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ExtractImage] Error: {e}")
        raise HTTPException(status_code=500, detail=f"Error processing image: {str(e)}")


# ============================================
# ENDPOINT 2: Extract from URL (Playwright)
# ============================================

@router.post("/from-url", response_model=ExtractedListing)
async def extract_from_url(request: ExtractFromURLRequest):
    """
    Extract property data from a Facebook Marketplace URL using Playwright.
    
    The employee copies a URL from Facebook Marketplace and pastes it.
    Playwright navigates to the page, extracts visible data.
    
    Falls back to GPT-4 Vision (screenshot of the rendered page) if
    direct HTML parsing fails.
    """
    url = request.url.strip()
    
    if not url.startswith("http"):
        raise HTTPException(status_code=400, detail="Invalid URL. Must start with http:// or https://")
    
    # Determine source from URL
    source = "other"
    if "facebook.com" in url or "fb.com" in url:
        source = "facebook"
    elif "marketplace" in url:
        source = "facebook"
    
    try:
        from playwright.async_api import async_playwright
        import asyncio
        from bs4 import BeautifulSoup
        
        extracted_data = {}
        page_screenshot = None
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=[
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                ]
            )
            
            context = await browser.new_context(
                viewport={'width': 1920, 'height': 1080},
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            )
            
            page = await context.new_page()
            
            try:
                logger.info(f"[ExtractURL] Navigating to: {url}")
                await page.goto(url, wait_until='domcontentloaded', timeout=30000)
                await asyncio.sleep(3)  # Wait for JS to render
                
                # Take a screenshot for GPT-4 Vision fallback
                page_screenshot = await page.screenshot(full_page=False)
                
                # Try to extract data from the page directly
                content = await page.content()
                page_text = await page.evaluate("() => document.body.innerText")
                
                # Try parsing HTML
                soup = BeautifulSoup(content, 'lxml')
                
                # Extract price (common patterns)
                price = _extract_price_from_text(page_text)
                if price:
                    extracted_data["listing_price"] = price
                
                # Extract location
                location = _extract_location_from_text(page_text)
                if location:
                    extracted_data.update(location)
                
                # Extract specs
                specs = _extract_specs_from_text(page_text)
                if specs:
                    extracted_data.update(specs)
                
                # Extract title/description
                title_elem = soup.find('title')
                if title_elem:
                    extracted_data["description"] = title_elem.get_text(strip=True)[:200]
                
                # Store raw text for reference
                extracted_data["raw_text"] = page_text[:2000]
                
            except Exception as e:
                logger.warning(f"[ExtractURL] Direct parsing failed: {e}")
            finally:
                await browser.close()
        
        # If direct parsing got useful data
        if extracted_data.get("listing_price") and extracted_data.get("listing_price") > 0:
            logger.info(f"[ExtractURL] Direct extraction successful: price=${extracted_data['listing_price']}")
            return ExtractedListing(
                source=source,
                source_url=url,
                address=extracted_data.get("address", ""),
                city=extracted_data.get("city", ""),
                state=extracted_data.get("state", "TX"),
                zip_code=extracted_data.get("zip_code"),
                listing_price=extracted_data.get("listing_price", 0),
                year_built=extracted_data.get("year_built"),
                sqft=extracted_data.get("sqft"),
                bedrooms=extracted_data.get("bedrooms"),
                bathrooms=extracted_data.get("bathrooms"),
                description=extracted_data.get("description"),
                confidence=0.7,
                extraction_method="playwright_direct",
                raw_text=extracted_data.get("raw_text"),
            )
        
        # Check if Facebook showed a login/block page
        raw_text = extracted_data.get("raw_text", "")
        is_facebook = "facebook.com" in url or "fb.com" in url
        is_blocked = any(phrase in raw_text.lower() for phrase in [
            "log in", "log into", "create new account", "sign up",
            "iniciar sesión", "crear cuenta", "regístrate",
            "you must log in", "content isn't available",
            "this content isn't available", "marketplace",
        ]) and not extracted_data.get("listing_price")
        
        if is_facebook and is_blocked:
            logger.warning("[ExtractURL] Facebook blocked access - login page detected")
            raise HTTPException(
                status_code=422,
                detail="Facebook bloqueó el acceso automático. Usa la opción de Screenshot: toma una captura de pantalla del listing y súbela."
            )
        
        # Fallback: Use GPT-4 Vision on the screenshot
        if page_screenshot:
            logger.info("[ExtractURL] Falling back to GPT-4 Vision on screenshot")
            try:
                return await _extract_with_vision(
                    image_bytes=page_screenshot,
                    source=source,
                    source_url=url,
                    raw_text=raw_text,
                )
            except HTTPException as vision_err:
                # If Vision also fails and it's Facebook, give specific message
                if is_facebook:
                    raise HTTPException(
                        status_code=422,
                        detail="Facebook bloqueó el acceso automático. Usa la opción de Screenshot: toma una captura de pantalla del listing y súbela."
                    )
                raise vision_err
        
        raise HTTPException(
            status_code=422,
            detail="No se pudieron extraer datos de la URL. Intenta subir una captura de pantalla."
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ExtractURL] Error: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error processing URL: {str(e)}. Try uploading a screenshot instead."
        )


# ============================================
# HELPER FUNCTIONS
# ============================================

def _extract_price_from_text(text: str) -> Optional[float]:
    """Extract price from page text."""
    # Common patterns: "$35,000", "35000", "$35K"
    patterns = [
        r'\$\s*([\d,]+(?:\.\d{2})?)',  # $35,000 or $35,000.00
        r'(?:price|precio|asking)\s*:?\s*\$?\s*([\d,]+)',  # Price: 35000
        r'([\d,]+)\s*(?:USD|dollars)',  # 35000 USD
    ]
    
    for pattern in patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        for match in matches:
            try:
                price = float(match.replace(',', ''))
                # Reasonable mobile home price range
                if 5000 <= price <= 500000:
                    return price
            except ValueError:
                continue
    
    return None


def _extract_location_from_text(text: str) -> Optional[dict]:
    """Extract city, state, zip from page text."""
    result = {}
    
    # Pattern: "City, TX 77001" or "City, Texas"
    loc_match = re.search(
        r'([A-Z][a-zA-Z\s]+),\s*(TX|Texas)\s*(\d{5})?',
        text,
        re.IGNORECASE
    )
    if loc_match:
        result["city"] = loc_match.group(1).strip()
        result["state"] = "TX"
        if loc_match.group(3):
            result["zip_code"] = loc_match.group(3)
    
    # Try to find address
    addr_match = re.search(
        r'(\d+\s+[A-Za-z\s]+(?:St|Ave|Rd|Dr|Blvd|Ln|Ct|Way|Circle|Loop|Hwy|Highway)[^,]*)',
        text,
        re.IGNORECASE
    )
    if addr_match:
        result["address"] = addr_match.group(1).strip()
    
    return result if result else None


def _extract_specs_from_text(text: str) -> Optional[dict]:
    """Extract bedrooms, bathrooms, sqft, year from page text."""
    result = {}
    
    # Bedrooms
    bed_match = re.search(r'(\d+)\s*(?:bed|bedroom|bd|br|hab|cuarto|recamara)', text, re.IGNORECASE)
    if bed_match:
        result["bedrooms"] = int(bed_match.group(1))
    
    # Bathrooms
    bath_match = re.search(r'(\d+\.?\d*)\s*(?:bath|bathroom|ba|baño)', text, re.IGNORECASE)
    if bath_match:
        result["bathrooms"] = float(bath_match.group(1))
    
    # Sqft
    sqft_match = re.search(r'([\d,]+)\s*(?:sq\.?\s*ft|sqft|square feet|pies)', text, re.IGNORECASE)
    if sqft_match:
        result["sqft"] = int(sqft_match.group(1).replace(',', ''))
    
    # Year built
    year_match = re.search(r'(?:year|built|año|manufactured)\s*:?\s*((?:19|20)\d{2})', text, re.IGNORECASE)
    if not year_match:
        # Try standalone 4-digit year in reasonable range
        year_match = re.search(r'\b(199\d|200\d|201\d|202\d)\b', text)
    if year_match:
        result["year_built"] = int(year_match.group(1))
    
    # Beds/Baths combined: "3/2" or "3bd/2ba"
    if "bedrooms" not in result:
        combo_match = re.search(r'(\d+)\s*/\s*(\d+)', text)
        if combo_match:
            result["bedrooms"] = int(combo_match.group(1))
            result["bathrooms"] = float(combo_match.group(2))
    
    return result if result else None


async def _extract_with_vision(
    image_bytes: bytes,
    source: str,
    source_url: str,
    raw_text: Optional[str] = None,
) -> ExtractedListing:
    """Use GPT-4 Vision on a screenshot to extract property data."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured")
    
    from openai import OpenAI
    
    client = OpenAI(api_key=api_key)
    base64_image = base64.b64encode(image_bytes).decode("utf-8")
    
    # If we have raw text, include it for better context
    user_content = [
        {
            "type": "text",
            "text": "Extract all property information from this listing screenshot."
            + (f"\n\nAdditional text from the page:\n{raw_text[:1000]}" if raw_text else ""),
        },
        {
            "type": "image_url",
            "image_url": {
                "url": f"data:image/png;base64,{base64_image}",
                "detail": "high",
            },
        },
    ]
    
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": VISION_SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
        max_tokens=1000,
        temperature=0.1,
    )
    
    content = response.choices[0].message.content.strip()
    if content.startswith("```"):
        content = re.sub(r'^```(?:json)?\s*', '', content)
        content = re.sub(r'\s*```$', '', content)
    
    extracted = json.loads(content)
    
    if "error" in extracted:
        raise HTTPException(status_code=422, detail=extracted["error"])
    
    return ExtractedListing(
        source=source,
        source_url=source_url,
        address=extracted.get("address", "") or "",
        city=extracted.get("city", "") or "",
        state=extracted.get("state", "TX") or "TX",
        zip_code=extracted.get("zip_code"),
        listing_price=float(extracted.get("listing_price", 0) or 0),
        year_built=extracted.get("year_built"),
        sqft=extracted.get("sqft"),
        bedrooms=extracted.get("bedrooms"),
        bathrooms=extracted.get("bathrooms"),
        description=extracted.get("description"),
        confidence=float(extracted.get("confidence", 0.6)),
        extraction_method="gpt4_vision_fallback",
        raw_text=raw_text,
    )

