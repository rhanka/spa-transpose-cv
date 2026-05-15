from __future__ import annotations

from .docx import extract_paragraphs_from_docx_bytes


def validate_page1(
    _docx_bytes: bytes,
    *,
    experience_section_label: str | None,
    sector_section_label: str | None,
) -> dict[str, list[str]]:
    _ = (experience_section_label, sector_section_label)
    # The Python marketplace port stays pure Python. It exposes the same
    # warnings/retry plumbing as TS, but the concrete page-1 detector remains
    # a no-op here until a sandbox-safe heuristic is introduced.
    return {"warnings": []}


def validate_docx_structure(docx_bytes: bytes, required_section_labels: list[str]) -> dict[str, list[str]]:
    paragraphs = {
        paragraph.strip().casefold()
        for paragraph in extract_paragraphs_from_docx_bytes(docx_bytes)
        if paragraph.strip()
    }
    found: list[str] = []
    missing: list[str] = []
    for label in required_section_labels:
        normalized_label = label.strip().casefold()
        if not normalized_label:
            continue
        if normalized_label in paragraphs:
            found.append(label)
        else:
            missing.append(label)
    return {"missing": missing, "found": found}
