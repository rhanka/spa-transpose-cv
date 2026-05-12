from __future__ import annotations

from .docx import extract_text_from_docx_bytes


def validate_docx_structure(docx_bytes: bytes, required_section_labels: list[str]) -> dict[str, list[str]]:
    text = extract_text_from_docx_bytes(docx_bytes).upper()
    found: list[str] = []
    missing: list[str] = []
    for label in required_section_labels:
        if not label:
            continue
        if label.upper() in text:
            found.append(label)
        else:
            missing.append(label)
    return {"missing": missing, "found": found}
