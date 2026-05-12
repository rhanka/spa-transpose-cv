from __future__ import annotations

from .docx import extract_paragraphs_from_docx_bytes


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
