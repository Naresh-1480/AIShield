"""
Intent classification for user messages.

Lightweight heuristic classifier that detects:
- credential_sharing: explicit sharing of passwords, keys, tokens
- pii_sharing: explicit sharing of personal data (SSN, email, phone)
- internal_data_exposure: sharing internal/confidential business info
- code_sharing: pasting proprietary source code
- general_query: harmless coding questions, creative prompts, general chat

Uses MULTI-WORD PHRASES to avoid false positives on innocent prompts.
Single words like "function", "class", "write" are NOT matched.

Labels: credential_sharing, pii_sharing, code_sharing,
        internal_data_exposure, general_query, unknown.
"""

from typing import Any


def _count_phrase_matches(text: str, phrases: list[str]) -> int:
    """Count how many phrases appear in text (case-insensitive)."""
    t = text.lower()
    return sum(1 for p in phrases if p in t)


def classify_intent(text: str) -> dict[str, Any]:
    """
    Classify intent using contextual multi-word phrase matching.

    Returns: { "label": str, "score": float }
    """
    print("Running heuristic intent classifier...")

    t = (text or "").strip().lower()
    if not t:
        return {"label": "unknown", "score": 0.25}

    # Each rule: (label, base_score, phrases)
    # Phrases are multi-word to avoid false positives.
    # Score is boosted when multiple phrases match.
    rules: list[tuple[str, float, list[str]]] = [
        (
            "credential_sharing",
            0.85,
            [
                "my password is",
                "my api key is",
                "here is my password",
                "here is my api key",
                "here is the api key",
                "here is the secret",
                "here is the token",
                "my secret key is",
                "my access token is",
                "here is my ssh key",
                "here are my credentials",
                "password:",
                "api_key:",
                "api_key=",
                "apikey=",
                "auth_token=",
                "secret_key=",
                "private_key=",
            ],
        ),
        (
            "pii_sharing",
            0.85,
            [
                "my name is",
                "my email is",
                "my phone number is",
                "my address is",
                "my ssn is",
                "my social security",
                "my passport number",
                "my credit card",
                "my date of birth",
                "my aadhaar",
                "here is my email",
                "here is my phone",
                "born on",
            ],
        ),
        (
            "internal_data_exposure",
            0.80,
            [
                "internal database",
                "production database",
                "confidential file",
                "company server",
                "internal api",
                "staging server",
                "production server",
                "internal endpoint",
                "vpn credentials",
                "company revenue",
                "client list",
                "internal document",
                "proprietary algorithm",
                "trade secret",
                "confidential",
                "do not share",
                "internal use only",
            ],
        ),
        (
            "code_sharing",
            0.70,
            [
                "here is my code",
                "here is the code",
                "here is our code",
                "review this code",
                "check this code",
                "here is the source",
                "our codebase",
                "proprietary code",
                "our algorithm",
                "company's code",
            ],
        ),
    ]

    best_label = "unknown"
    best_score = 0.25

    for label, base_score, phrases in rules:
        match_count = _count_phrase_matches(t, phrases)
        if match_count > 0:
            # Boost score for multiple matches (max +0.1)
            boosted_score = min(base_score + (match_count - 1) * 0.05, 0.95)
            if boosted_score > best_score:
                best_label = label
                best_score = boosted_score

    # If nothing matched, check for safe general queries
    if best_label == "unknown":
        general_phrases = [
            "how to", "how do i", "what is", "explain",
            "help me", "can you", "write a", "create a",
            "build a", "make a", "convert", "translate",
            "fix this", "debug this", "optimize",
            "what are", "tell me", "show me",
        ]
        if _count_phrase_matches(t, general_phrases) > 0:
            best_label = "general_query"
            best_score = 0.3  # Low score = safe

    return {"label": best_label, "score": best_score}
