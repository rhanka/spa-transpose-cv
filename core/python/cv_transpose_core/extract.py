from __future__ import annotations

from io import BytesIO
from zipfile import ZipFile
import xml.etree.ElementTree as ET

from pypdf import PdfReader

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


class UnsupportedMimeError(ValueError):
    pass


def _extract_docx_text(data: bytes) -> str:
    with ZipFile(BytesIO(data)) as zf:
        with zf.open("word/document.xml") as fh:
            xml = fh.read()
    root = ET.fromstring(xml)
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    paragraphs: list[str] = []
    for para in root.findall(".//w:p", ns):
        runs = [node.text or "" for node in para.findall(".//w:t", ns)]
        paragraphs.append("".join(runs))
    return "\n".join(paragraphs)


def _extract_pdf_text(data: bytes) -> str:
    reader = PdfReader(BytesIO(data))
    if reader.is_encrypted:
        raise ValueError("encrypted_pdf")
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def extract_text_from_bytes(data: bytes, original_name: str, mime: str) -> str:
    if mime == "application/pdf" or original_name.lower().endswith(".pdf"):
        return _extract_pdf_text(data)
    if mime == DOCX_MIME or original_name.lower().endswith(".docx"):
        return _extract_docx_text(data)
    if mime == "application/msword" or original_name.lower().endswith(".doc"):
        raise UnsupportedMimeError("unsupported_mime: application/msword")
    raise UnsupportedMimeError(f"unsupported_mime: {mime}")
