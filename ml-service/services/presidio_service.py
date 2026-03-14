"""
Presidio-based PII detection and anonymization.

Uses presidio_analyzer to find PII spans (PERSON, EMAIL, PHONE, etc.)
and presidio_anonymizer to produce a redacted version of the text.
Used by the /analyze endpoint to return pii[] and redactedText.
"""

from typing import Any

# Optional imports; we catch ImportError and disable the service if not installed.
try:
    from presidio_analyzer import AnalyzerEngine
    from presidio_anonymizer import AnonymizerEngine
    from presidio_anonymizer.entities import OperatorConfig
    PRESIDIO_AVAILABLE = True
except ImportError:
    PRESIDIO_AVAILABLE = False
    AnalyzerEngine = None  # type: ignore
    AnonymizerEngine = None  # type: ignore
    OperatorConfig = None  # type: ignore


def _get_analyzer() -> "AnalyzerEngine | None":
    """Lazy-init analyzer; returns None if Presidio is not available."""
    if not PRESIDIO_AVAILABLE:
        return None
    try:
        return AnalyzerEngine()
    except Exception:
        return None


def _get_anonymizer() -> "AnonymizerEngine | None":
    """Lazy-init anonymizer; returns None if Presidio is not available."""
    if not PRESIDIO_AVAILABLE:
        return None
    try:
        return AnonymizerEngine()
    except Exception:
        return None


def analyze_pii(text: str) -> list[dict[str, Any]]:
    """
    Run Presidio analyzer on the given text and return structured PII spans.

    Each span has: entity_type, start, end, score, text.
    Returns empty list if Presidio is unavailable or raises.
    """
    print("Running Presidio analysis...")

    analyzer = _get_analyzer()
    if analyzer is None:
        return []

    try:
        results = analyzer.analyze(text=text, language="en")
        out = []
        for r in results:
            out.append({
                "entity_type": r.entity_type,
                "start": r.start,
                "end": r.end,
                "score": float(r.score),
                "text": text[r.start : r.end],
            })
        return out
    except Exception:
        return []


def anonymize_text(text: str, analyzer_results: list[Any]) -> str:
    """
    Anonymize the text using Presidio anonymizer and the given analyzer results.

    analyzer_results can be the list returned by analyze_pii (dicts) or
    Presidio RecognizerResult objects. If Presidio is unavailable or fails,
    returns the original text.
    """
    anonymizer = _get_anonymizer()
    if anonymizer is None:
        return text

    if not analyzer_results:
        return text

    try:
        # Presidio AnonymizerEngine expects a list of RecognizerResult-like objects
        # with .entity_type, .start, .end, .score. We may have dicts from analyze_pii.
        from presidio_analyzer import RecognizerResult

        recognizer_results = []
        for r in analyzer_results:
            if isinstance(r, dict):
                recognizer_results.append(
                    RecognizerResult(
                        entity_type=r["entity_type"],
                        start=r["start"],
                        end=r["end"],
                        score=r["score"],
                    )
                )
            else:
                recognizer_results.append(r)

        anonymized = anonymizer.anonymize(
            text=text,
            analyzer_results=recognizer_results,
            operators=None,
        )
        return anonymized.text
    except Exception:
        return text
