"""
Image Storage Utility — Download external images and persist in Supabase Storage.

Problem: Facebook CDN URLs expire after hours/days, leaving broken images.
Solution: Download images at scrape time and store them permanently in Supabase Storage.

Bucket: "listing-photos"
Path format: listings/{listing_hash}/{filename}

Usage:
    from api.utils.image_storage import persist_listing_image

    permanent_url = await persist_listing_image(
        original_url="https://scontent-*.fbcdn.net/...",
        listing_id="abc-123",
    )
"""

import asyncio
import hashlib
import logging
import uuid
from typing import Optional, List, Tuple
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)

BUCKET_NAME = "listing-photos"

# Timeout for downloading external images
DOWNLOAD_TIMEOUT = 15  # seconds

# Max image size to download (5MB)
MAX_IMAGE_SIZE = 5 * 1024 * 1024

# Common image content types
VALID_IMAGE_TYPES = {
    "image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif",
}

# Headers to mimic a browser request (some CDNs block bare requests)
BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


def _get_supabase():
    """Lazy import to avoid circular imports."""
    from tools.supabase_client import sb
    return sb


def _ensure_bucket_exists():
    """Create the listing-photos bucket if it doesn't exist."""
    sb = _get_supabase()
    try:
        sb.storage.get_bucket(BUCKET_NAME)
    except Exception:
        try:
            sb.storage.create_bucket(BUCKET_NAME, options={"public": True})
            logger.info(f"[ImageStorage] Created bucket '{BUCKET_NAME}'")
        except Exception as e:
            # Bucket might already exist (race condition) or we lack permissions
            if "already exists" not in str(e).lower() and "duplicate" not in str(e).lower():
                logger.warning(f"[ImageStorage] Could not create bucket: {e}")


def _guess_extension(content_type: str, url: str) -> str:
    """Guess file extension from content type or URL."""
    ct_map = {
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
    }
    if content_type and content_type.lower() in ct_map:
        return ct_map[content_type.lower()]
    
    # Try from URL path
    path = urlparse(url).path.lower()
    for ext in ["jpg", "jpeg", "png", "webp", "gif"]:
        if path.endswith(f".{ext}"):
            return ext if ext != "jpeg" else "jpg"
    
    return "jpg"  # Default


async def download_image(url: str) -> Optional[Tuple[bytes, str]]:
    """
    Download an image from a URL.
    
    Returns:
        Tuple of (image_bytes, content_type) or None if download fails.
    """
    if not url or not url.startswith("http"):
        return None
    
    try:
        async with httpx.AsyncClient(
            timeout=DOWNLOAD_TIMEOUT,
            follow_redirects=True,
            headers=BROWSER_HEADERS,
        ) as client:
            response = await client.get(url)
            
            if response.status_code != 200:
                logger.debug(f"[ImageStorage] Download failed ({response.status_code}): {url[:100]}")
                return None
            
            content_type = response.headers.get("content-type", "").split(";")[0].strip().lower()
            
            # Verify it's actually an image
            if content_type and content_type not in VALID_IMAGE_TYPES and not content_type.startswith("image/"):
                logger.debug(f"[ImageStorage] Not an image ({content_type}): {url[:100]}")
                return None
            
            image_bytes = response.content
            
            if len(image_bytes) > MAX_IMAGE_SIZE:
                logger.debug(f"[ImageStorage] Image too large ({len(image_bytes)} bytes): {url[:100]}")
                return None
            
            if len(image_bytes) < 100:
                logger.debug(f"[ImageStorage] Image too small ({len(image_bytes)} bytes), likely broken: {url[:100]}")
                return None
            
            return (image_bytes, content_type or "image/jpeg")
    
    except httpx.TimeoutException:
        logger.debug(f"[ImageStorage] Download timeout: {url[:100]}")
        return None
    except Exception as e:
        logger.debug(f"[ImageStorage] Download error: {e} — {url[:100]}")
        return None


def upload_to_storage(
    image_bytes: bytes,
    content_type: str,
    storage_path: str,
) -> Optional[str]:
    """
    Upload image bytes to Supabase Storage and return public URL.
    
    Returns:
        Public URL string or None if upload fails.
    """
    sb = _get_supabase()
    
    try:
        sb.storage.from_(BUCKET_NAME).upload(
            storage_path,
            image_bytes,
            {"content-type": content_type},
        )
        
        public_url = sb.storage.from_(BUCKET_NAME).get_public_url(storage_path)
        # Clean trailing ? if present
        if public_url and public_url.endswith("?"):
            public_url = public_url[:-1]
        
        return public_url
    
    except Exception as e:
        # Handle duplicates gracefully
        if "duplicate" in str(e).lower() or "already exists" in str(e).lower():
            try:
                public_url = sb.storage.from_(BUCKET_NAME).get_public_url(storage_path)
                if public_url and public_url.endswith("?"):
                    public_url = public_url[:-1]
                return public_url
            except Exception:
                pass
        logger.warning(f"[ImageStorage] Upload failed: {e}")
        return None


async def persist_listing_image(
    original_url: str,
    listing_id: str,
    index: int = 0,
) -> Optional[str]:
    """
    Download an external image and upload it to Supabase Storage.
    
    Args:
        original_url: The external image URL (e.g. Facebook CDN)
        listing_id: The market listing ID (for organizing in storage)
        index: Photo index (0 = thumbnail, 1+ = additional photos)
    
    Returns:
        Permanent Supabase Storage URL, or None if the process fails.
    """
    if not original_url or not original_url.startswith("http"):
        return None
    
    # Download
    result = await download_image(original_url)
    if not result:
        return None
    
    image_bytes, content_type = result
    ext = _guess_extension(content_type, original_url)
    
    # Generate a unique but deterministic path
    url_hash = hashlib.md5(original_url.encode()).hexdigest()[:8]
    filename = f"photo_{index}_{url_hash}.{ext}"
    storage_path = f"listings/{listing_id}/{filename}"
    
    # Upload
    return upload_to_storage(image_bytes, content_type, storage_path)


async def persist_listing_images(
    thumbnail_url: Optional[str],
    photos: Optional[List[str]],
    listing_id: str,
) -> Tuple[Optional[str], List[str]]:
    """
    Download and persist all images for a listing.
    
    Args:
        thumbnail_url: Original thumbnail URL
        photos: List of original photo URLs
        listing_id: Market listing ID
    
    Returns:
        Tuple of (new_thumbnail_url, new_photos_list)
    """
    _ensure_bucket_exists()
    
    new_thumbnail = None
    new_photos = []
    
    # Collect all unique URLs to download
    urls_to_process = []
    
    if thumbnail_url:
        urls_to_process.append((thumbnail_url, 0))
    
    if photos:
        for i, photo_url in enumerate(photos):
            if photo_url and photo_url != thumbnail_url:
                urls_to_process.append((photo_url, i + 1))
    
    if not urls_to_process:
        return (None, [])
    
    # Download and upload all images concurrently
    tasks = [
        persist_listing_image(url, listing_id, idx)
        for url, idx in urls_to_process
    ]
    
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            logger.warning(f"[ImageStorage] Error processing image {i}: {result}")
            continue
        
        if result:  # Got a permanent URL
            if i == 0 and thumbnail_url:
                new_thumbnail = result
                new_photos.append(result)
            else:
                new_photos.append(result)
        else:
            # Failed to download/upload — keep original URL as fallback
            original_url = urls_to_process[i][0]
            if i == 0 and thumbnail_url:
                new_thumbnail = original_url  # Keep original as fallback
                new_photos.append(original_url)
            else:
                new_photos.append(original_url)
    
    # If thumbnail wasn't explicitly provided but we have photos
    if not new_thumbnail and new_photos:
        new_thumbnail = new_photos[0]
    
    return (new_thumbnail, new_photos)

