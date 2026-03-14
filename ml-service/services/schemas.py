"""
Pydantic request/response models for the ML inference service.
Used by the /analyze endpoint and by internal services.
"""

from pydantic import BaseModel, Field
from typing import Any


class AnalyzeRequest(BaseModel):
    """Request body for POST /analyze."""

    text: str = Field(..., description="Input text to analyze for PII, entities, and intent.")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Optional metadata (e.g. source, user).")


class PiiEntity(BaseModel):
    """A single PII entity span detected by Presidio."""

    entity_type: str = Field(..., description="PII type, e.g. PERSON, EMAIL_ADDRESS.")
    start: int = Field(..., description="Start character index in the original text.")
    end: int = Field(..., description="End character index (exclusive).")
    score: float = Field(..., description="Confidence score 0–1.")
    text: str = Field(..., description="The matched text span.")


class ContextualEntity(BaseModel):
    """A contextual entity span detected by GLiNER (e.g. game_id, project_name)."""

    label: str = Field(..., description="Entity label, e.g. game_id, repository.")
    start: int = Field(..., description="Start character index.")
    end: int = Field(..., description="End character index (exclusive).")
    score: float = Field(..., description="Confidence score 0–1.")
    text: str = Field(..., description="The matched text span.")


class IntentResult(BaseModel):
    """Intent classification result (label + score)."""

    label: str = Field(..., description="Intent label, e.g. harmless_request, pii_sharing.")
    score: float = Field(..., description="Confidence score 0–1.")


class ModelMeta(BaseModel):
    """Which models were used for this response (for debugging/auditing)."""

    presidio: bool = Field(..., description="Whether Presidio PII analysis ran successfully.")
    gliner: bool = Field(..., description="Whether GLiNER contextual extraction ran successfully.")
    intentClassifier: bool = Field(..., description="Whether intent classification ran successfully.")


class AnalyzeResponse(BaseModel):
    """Response body for POST /analyze."""

    pii: list[PiiEntity] = Field(default_factory=list, description="PII entities from Presidio.")
    contextualEntities: list[ContextualEntity] = Field(
        default_factory=list, description="Contextual entities from GLiNER."
    )
    intent: IntentResult = Field(
        default_factory=lambda: IntentResult(label="unknown", score=0.0),
        description="Intent classification result.",
    )
    redactedText: str = Field(default="", description="Text with PII anonymized.")
    modelMeta: ModelMeta = Field(
        ...,
        description="Which models contributed to this response.",
    )
