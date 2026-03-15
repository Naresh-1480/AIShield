"""
EasyOCR-based image text extraction service.

Accepts a base64-encoded image string, decodes it, runs EasyOCR, and returns
the extracted text as a single string. The service is fully optional:
if EasyOCR or Pillow is unavailable, or if extraction fails, an empty string
is returned without crashing the main service.

Usage:
    from services import ocr_service
    text = ocr_service.extract_text_from_image(base64_str)
"""

import base64
import io
import logging
import os

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Availability flags
# ---------------------------------------------------------------------------

EASYOCR_AVAILABLE = False
PILLOW_AVAILABLE = False

try:
    from PIL import Image  # noqa: F401
    PILLOW_AVAILABLE = True
except ImportError:
    logger.warning("Pillow not installed — OCR service disabled.")

try:
    import easyocr  # noqa: F401
    EASYOCR_AVAILABLE = True
except ImportError:
    logger.warning("EasyOCR not installed — OCR service disabled.")

# Allow disabling OCR entirely via env flag.
DISABLE_OCR = os.getenv("ML_SERVICE_DISABLE_OCR", "").lower() in {
    "1", "true", "yes", "on",
}

# ---------------------------------------------------------------------------
# Singleton reader (lazy-loaded, same pattern as GLiNER)
# ---------------------------------------------------------------------------

_reader = None


def _get_reader():
    """Load EasyOCR reader once; return None if unavailable or disabled."""
    global _reader

    if DISABLE_OCR:
        logger.info("OCR disabled via ML_SERVICE_DISABLE_OCR env flag.")
        return None

    if not EASYOCR_AVAILABLE or not PILLOW_AVAILABLE:
        return None

    if _reader is not None:
        return _reader

    try:
        import easyocr
        # gpu=False for broad compatibility; switch to True if a GPU is available
        _reader = easyocr.Reader(["en"], gpu=False, verbose=False)
        logger.info("EasyOCR reader loaded successfully.")
        return _reader
    except Exception as exc:
        logger.exception("Failed to initialize EasyOCR reader: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def extract_text_from_image(base64_image: str) -> str:
    """
    Extract text from a base64-encoded image using EasyOCR.

    Args:
        base64_image: Base64-encoded image bytes (with or without data-URL prefix).

    Returns:
        Extracted text joined by newlines, or "" on any error / if OCR is unavailable.
    """
    if not base64_image:
        return ""

    reader = _get_reader()
    if reader is None:
        logger.warning("OCR reader unavailable; returning empty text.")
        return ""

    try:
        from PIL import Image

        # Strip any data-URL prefix (e.g. "data:image/png;base64,")
        if "," in base64_image:
            base64_image = base64_image.split(",", 1)[1]

        image_bytes = base64.b64decode(base64_image)
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

        # EasyOCR accepts a numpy array; Pillow Image can be converted easily
        import numpy as np
        image_array = np.array(image)

        results = reader.readtext(image_array, detail=0, paragraph=True)
        extracted = "\n".join(results)
        logger.info("OCR extracted %d characters from image.", len(extracted))
        return extracted

    except Exception as exc:
        logger.exception("OCR extraction failed: %s", exc)
        return ""
