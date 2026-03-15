"""
FastAPI ML inference service for Bytecamp 1.

Exposes POST /analyze: runs Presidio PII detection + anonymization,
GLiNER contextual entity extraction, and intent classification.
Used by the Node backend scanner. If a model fails, we return empty/fallback
values instead of crashing.
"""

import logging

from fastapi import FastAPI

from fastapi import Body
from pydantic import BaseModel

from services.schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    ContextualEntity,
    IntentResult,
    ModelMeta,
    PiiEntity,
)
from services import presidio_service
from services import gliner_service
from services import intent_service
from services import ocr_service


class OcrRequest(BaseModel):
    image: str  # base64-encoded image (with or without data-URL prefix)


class OcrResponse(BaseModel):
    text: str

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Bytecamp ML Service",
    description="PII detection, contextual NER, and intent classification for scanner input.",
    version="0.1.0",
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers for entity normalization
# ---------------------------------------------------------------------------


def _spans_overlap(a_start: int, a_end: int, b_start: int, b_end: int) -> bool:
    """Return True if two spans overlap."""
    return max(a_start, b_start) < min(a_end, b_end)


def _cleanup_pii_entities(pii: list[PiiEntity]) -> list[PiiEntity]:
    """
    Normalize PII entities:
    - Deduplicate identical spans, keeping the higher score.
    - Remove overlapping weaker entities (special-case EMAIL_ADDRESS vs URL).
    """
    if not pii:
        return []

    # Deduplicate identical spans.
    deduped: dict[tuple[int, int, str, str], PiiEntity] = {}
    for e in pii:
        key = (e.start, e.end, e.entity_type, e.text)
        current = deduped.get(key)
        if current is None or e.score > current.score:
            deduped[key] = e

    entities = list(deduped.values())

    # Remove overlapping weaker entities.
    to_remove: set[int] = set()

    def is_email(ent: PiiEntity) -> bool:
        return ent.entity_type.upper() == "EMAIL_ADDRESS"

    def is_url(ent: PiiEntity) -> bool:
        return ent.entity_type.upper() == "URL"

    n = len(entities)
    for i in range(n):
        for j in range(i + 1, n):
            if j in to_remove or i in to_remove:
                continue
            a = entities[i]
            b = entities[j]
            if not _spans_overlap(a.start, a.end, b.start, b.end):
                continue

            # EMAIL_ADDRESS vs URL: always keep the email.
            if is_email(a) and is_url(b):
                weaker_idx = j
            elif is_email(b) and is_url(a):
                weaker_idx = i
            else:
                # Otherwise keep higher score.
                weaker_idx = i if a.score < b.score else j

            to_remove.add(weaker_idx)

    return [e for idx, e in enumerate(entities) if idx not in to_remove]


def _cleanup_contextual_entities(
    contextual: list[ContextualEntity],
    pii: list[PiiEntity],
) -> list[ContextualEntity]:
    """
    Normalize contextual entities:
    - Deduplicate identical spans, keeping the higher score.
    - Drop any contextual entity that overlaps a PII span
      (prefer Presidio entities over GLiNER entities).
    """
    if not contextual:
        return []

    # Deduplicate identical spans.
    deduped: dict[tuple[int, int, str, str], ContextualEntity] = {}
    for e in contextual:
        key = (e.start, e.end, e.label, e.text)
        current = deduped.get(key)
        if current is None or e.score > current.score:
            deduped[key] = e

    entities = list(deduped.values())

    if not pii:
        return entities

    # Remove any contextual entity that overlaps strongly with PII.
    filtered: list[ContextualEntity] = []
    for e in entities:
        overlaps_pii = any(
            _spans_overlap(e.start, e.end, p.start, p.end) for p in pii
        )
        if not overlaps_pii:
            filtered.append(e)

    return filtered


# ---------------------------------------------------------------------------
# POST /analyze
# ---------------------------------------------------------------------------


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    """
    Analyze input text: detect PII (Presidio), contextual entities (GLiNER),
    and intent. Return PII list, redacted text, contextual entities, and intent.
    """
    text = request.text or ""
    metadata = request.metadata or {}

    # Track which models ran successfully (for modelMeta).
    presidio_ok = False
    gliner_ok = False
    intent_ok = False

    # --- Presidio: PII analysis + anonymization ---
    pii_list: list[PiiEntity] = []
    redacted_text = text

    try:
        analyzer_results = presidio_service.analyze_pii(text)
        presidio_ok = True
        for r in analyzer_results:
            pii_list.append(
                PiiEntity(
                    entity_type=r.get("entity_type", ""),
                    start=r.get("start", 0),
                    end=r.get("end", 0),
                    score=r.get("score", 0.0),
                    text=r.get("text", ""),
                )
            )
        redacted_text = presidio_service.anonymize_text(text, analyzer_results)
    except Exception as exc:
        logger.exception("Presidio stage failed: %s", exc)

    # Normalize PII before using for contextual cleanup.
    pii_list = _cleanup_pii_entities(pii_list)

    # --- GLiNER: contextual entities ---
    contextual_entities: list[ContextualEntity] = []

    try:
        raw_ctx = gliner_service.extract_contextual_entities(text)
        if raw_ctx:
            gliner_ok = True
        for e in raw_ctx:
            contextual_entities.append(
                ContextualEntity(
                    label=e.get("label", ""),
                    start=e.get("start", 0),
                    end=e.get("end", 0),
                    score=e.get("score", 0.0),
                    text=e.get("text", ""),
                )
            )
    except Exception as exc:
        logger.exception("GLiNER stage failed: %s", exc)

    # Clean up contextual entities taking PII spans into account.
    contextual_entities = _cleanup_contextual_entities(contextual_entities, pii_list)

    # --- Intent classification ---
    intent_result = IntentResult(label="unknown", score=0.25)

    try:
        raw_intent = intent_service.classify_intent(text)
        intent_ok = True
        label = raw_intent.get("label", "unknown")
        score = float(raw_intent.get("score", 0.25))
        # Ensure unknown scores stay in the 0.2–0.3 band.
        if label == "unknown":
            score = min(max(score, 0.2), 0.3)
        intent_result = IntentResult(label=label, score=score)
    except Exception as exc:
        logger.exception("Intent classification stage failed: %s", exc)

    return AnalyzeResponse(
        pii=pii_list,
        contextualEntities=contextual_entities,
        intent=intent_result,
        redactedText=redacted_text,
        modelMeta=ModelMeta(
            presidio=presidio_ok,
            gliner=gliner_ok,
            intentClassifier=intent_ok,
        ),
    )


# ---------------------------------------------------------------------------
# POST /ocr — Extract text from a base64-encoded image
# ---------------------------------------------------------------------------


@app.post("/ocr", response_model=OcrResponse)
def ocr(request: OcrRequest) -> OcrResponse:
    """
    Extract text from a base64-encoded image using EasyOCR.

    Returns extracted text (empty string if OCR is unavailable or image has no text).
    Never crashes: all failures return { text: "" }.
    """
    try:
        extracted = ocr_service.extract_text_from_image(request.image)
    except Exception as exc:
        logger.exception("OCR endpoint error: %s", exc)
        extracted = ""
    return OcrResponse(text=extracted)


# ---------------------------------------------------------------------------
# Health / root (optional)
# ---------------------------------------------------------------------------


@app.get("/")
def root() -> dict:
    """Root route; confirms service is up."""
    return {"service": "ml-service", "status": "ok"}


@app.get("/health")
def health() -> dict:
    """Health check for load balancers / orchestration."""
    return {"status": "healthy"}


# ---------------------------------------------------------------------------
# Run with: uvicorn app:app --reload
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
