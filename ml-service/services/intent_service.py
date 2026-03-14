"""
Intent classification for user messages.

Lightweight heuristic classifier only (no Hugging Face models) so that
the /analyze endpoint stays fast and local-friendly.

Labels: credential_sharing, pii_sharing, code_help, creative_request,
internal_data_exposure, unknown.
Used by the /analyze endpoint to return intent { label, score }.
"""

import re
from typing import Any


def _match_any(text: str, phrases: list[str]) -> bool:
    """Return True if any phrase appears in text (case-insensitive)."""
    t = text.lower()
    return any(p in t for p in phrases)


def classify_intent(text: str) -> dict[str, Any]:
    """
    Classify intent using a lightweight heuristic-only approach.

    Rules:
    - credential_sharing if prompt contains: password, api key, secret, token,
      private key, ssh key
    - pii_sharing if prompt contains: my name is, my email is, my phone number,
      ssn, passport
    - code_help if prompt contains: function, class, code, javascript, python, debug
    - creative_request if prompt contains: suggest, generate, create username,
      idea, write
    - internal_data_exposure if prompt contains: internal database,
      production database, confidential file, company server
    - otherwise: unknown

    Confidence scores are between 0.2 and 0.9 depending on rule strength.
    """
    print("Running heuristic intent classifier...")

    t = (text or "").strip().lower()
    if not t:
        # Unknown with low confidence for empty/whitespace-only input.
        return {"label": "unknown", "score": 0.25}

    # (label, score, phrases)
    rules: list[tuple[str, float, list[str]]] = [
        (
            "credential_sharing",
            0.9,
            ["password", "api key", "apikey", "secret", "token", "private key", "ssh key"],
        ),
        (
            "pii_sharing",
            0.85,
            ["my name is", "my email is", "my phone number", "ssn", "passport"],
        ),
        (
            "internal_data_exposure",
            0.8,
            ["internal database", "production database", "confidential file", "company server"],
        ),
        (
            "code_help",
            0.75,
            ["function", "class", "code", "javascript", "python", "debug"],
        ),
        (
            "creative_request",
            0.7,
            ["suggest", "generate", "create username", "idea", "write"],
        ),
    ]

    best_label = "unknown"
    best_score = 0.25  # keep unknown in the 0.2–0.3 range

    for label, score, phrases in rules:
        if _match_any(t, phrases) and score > best_score:
            best_label = label
            best_score = score

    return {"label": best_label, "score": best_score}

