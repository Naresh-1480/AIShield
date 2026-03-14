"""
GLiNER-based contextual entity extraction.

Detects domain-specific labels such as game_id, employee_id, project_name,
repository, source_code_reference, internal_document.
Used by the /analyze endpoint to return contextualEntities[].

GLiNER is fully optional and must never block the request. If it is disabled,
unavailable, or fails, we simply return an empty list.
"""

import os
from typing import Any

# Optional; service is disabled if GLiNER is not installed or fails to load.
# Check availability at import-time (module top) so _get_model() always sees the correct flag.
GLINER_AVAILABLE = False
try:
    from gliner import GLiNER  # noqa: F401
    GLINER_AVAILABLE = True
except ImportError:
    GLINER_AVAILABLE = False

_gliner_model = None

# Allow GLiNER to be skipped completely via env flag.
DISABLE_GLINER = os.getenv("ML_SERVICE_DISABLE_GLINER", "").lower() in {
    "1",
    "true",
    "yes",
    "on",
}


CONTEXTUAL_LABELS = [
    "employee_id",
    "project_name",
    "repository",
    "source_code_reference",
    "internal_document",
]


def _get_model() -> Any:
    """Load a lightweight GLiNER model once; return None if unavailable or disabled."""
    global _gliner_model

    if DISABLE_GLINER:
        print("GLiNER skipped or failed")
        return None

    if _gliner_model is not None:
        return _gliner_model
    if not GLINER_AVAILABLE:
        print("GLiNER skipped or failed")
        return None
    try:
        from gliner import GLiNER

        # Use a small pretrained model suitable for NER
        _gliner_model = GLiNER.from_pretrained("urchade/gliner_medium-v2.1")
        return _gliner_model
    except Exception:
        print("GLiNER skipped or failed")
        return None


def extract_contextual_entities(text: str) -> list[dict[str, Any]]:
    """
    Run GLiNER NER with contextual labels and return list of matches.

    Each match has: label, start, end, score, text.
    Returns empty list if GLiNER is unavailable, disabled, or raises.
    """
    print("Running GLiNER inference...")

    model = _get_model()
    if model is None:
        return []

    if not text or not text.strip():
        return []

    try:
        # predict_entities returns list of dicts with text, label, score; may include start/end
        entities = model.predict_entities(text, CONTEXTUAL_LABELS)
        out = []
        for e in entities:
            entity_text = e.get("text", "")
            start = e.get("start")
            end = e.get("end")
            if start is None or end is None:
                # GLiNER may not return spans; find first occurrence of entity text
                idx = text.find(entity_text) if entity_text else -1
                start = idx if idx >= 0 else 0
                end = start + len(entity_text) if entity_text else 0
            out.append({
                "label": e.get("label", ""),
                "start": start,
                "end": end,
                "score": float(e.get("score", 0.0)),
                "text": entity_text,
            })
        return out
    except Exception:
        print("GLiNER skipped or failed")
        return []

