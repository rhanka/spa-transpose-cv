from __future__ import annotations

from html import escape
from io import BytesIO
from typing import Any
from zipfile import ZipFile

from .docx import replace_docx_entries

WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
W14_NS = "http://schemas.microsoft.com/office/word/2010/wordml"
DOCUMENT_PREFIX = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">
  <w:body>
"""
DOCUMENT_SUFFIX = """
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="450" w:footer="450" w:gutter="0"/></w:sectPr>
  </w:body>
</w:document>
"""
HEADER_PREFIX = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="{WORD_NS}" xmlns:w14="{W14_NS}">
"""
HEADER_SUFFIX = """
</w:hdr>
"""


def _is_xml_10_char(ch: str) -> bool:
    codepoint = ord(ch)
    return (
        codepoint in {0x9, 0xA, 0xD}
        or 0x20 <= codepoint <= 0xD7FF
        or 0xE000 <= codepoint <= 0xFFFD
        or 0x10000 <= codepoint <= 0x10FFFF
    )


def _escape_xml_text(text: str) -> str:
    return escape("".join(ch for ch in str(text) if _is_xml_10_char(ch)))


def _p(text: str, *, bold: bool = False) -> str:
    b = "<w:b/><w:bCs/>" if bold else ""
    return (
        "    <w:p>"
        f"<w:r><w:rPr>{b}</w:rPr><w:t>{_escape_xml_text(text)}</w:t></w:r>"
        "</w:p>"
    )


def _section(label: str) -> str:
    return _p(label, bold=True)


def _render_profile(profile: dict[str, Any], contract: dict[str, Any]) -> str:
    parts: list[str] = [
        _p(profile["name"], bold=True),
        _p(profile.get("title_line1", "")),
        _p(profile.get("title_line2", "")),
        _p(str(profile.get("years", ""))),
    ]
    labels = {section["key"]: section["label"] for section in contract["sections"]}

    if "technicalSkills" in labels:
        parts.append(_section(labels["technicalSkills"]))
        for skill in profile.get("technicalSkills", []):
            parts.append(_p(f'{skill["label"]}: {skill["description"]}'))

    if "sectorSkills" in labels:
        parts.append(_section(labels["sectorSkills"]))
        for sector in profile.get("sectors", []):
            parts.append(_p(sector))
        for domain in profile.get("domains", []):
            parts.append(_p(domain))

    if "experience" in labels:
        parts.append(_section(labels["experience"]))
        for job in profile.get("experience", []):
            parts.append(_p(job["company"], bold=True))
            parts.append(_p(job["title"]))
            parts.append(_p(job["dates"]))
            parts.append(_p(job["description"]))
            for task in job.get("tasks", []):
                parts.append(_p(task))
            if job.get("techEnvironment"):
                parts.append(_p(job["techEnvironment"]))

    if "languages" in labels:
        parts.append(_section(labels["languages"]))
        for language in profile.get("languages", []):
            parts.append(_p(f'{language["label"]}: {language["level"]}'))

    if "education" in labels:
        parts.append(_section(labels["education"]))
        for education in profile.get("education", []):
            parts.append(_p(f'{education["year"]}: {education["description"]}'))

    return DOCUMENT_PREFIX + "\n".join(parts) + DOCUMENT_SUFFIX


def _header_xml(profile: dict[str, Any]) -> bytes:
    xml = HEADER_PREFIX + "\n".join(
        [
            _p(profile["name"], bold=True),
            _p(profile.get("title_line1", "")),
            _p(profile.get("title_line2", "")),
            _p(str(profile.get("years", ""))),
        ]
    ) + HEADER_SUFFIX
    return xml.encode("utf-8")


def render_docx(base_docx: bytes, profile: dict[str, Any], contract: dict[str, Any]) -> bytes:
    document = _render_profile(profile, contract).encode("utf-8")
    replacements = {"word/document.xml": document}
    with ZipFile(BytesIO(base_docx)) as zf:
        names = set(zf.namelist())
    if "word/header2.xml" in names:
        replacements["word/header2.xml"] = _header_xml(profile)
    elif "word/header1.xml" in names:
        replacements["word/header1.xml"] = _header_xml(profile)
    return replace_docx_entries(base_docx, replacements)
