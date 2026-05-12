from __future__ import annotations

from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile
import xml.etree.ElementTree as ET

WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": WORD_NS}


def extract_text_from_docx_bytes(data: bytes) -> str:
    with ZipFile(BytesIO(data)) as zf:
        xml = zf.read("word/document.xml")
    root = ET.fromstring(xml)
    return "\n".join(extract_paragraphs_from_xml_root(root))


def extract_paragraphs_from_xml_root(root: ET.Element) -> list[str]:
    paragraphs: list[str] = []
    for para in root.findall(".//w:p", NS):
        texts = [node.text or "" for node in para.findall(".//w:t", NS)]
        paragraphs.append("".join(texts))
    return paragraphs


def extract_paragraphs_from_docx_bytes(data: bytes) -> list[str]:
    with ZipFile(BytesIO(data)) as zf:
        xml = zf.read("word/document.xml")
    root = ET.fromstring(xml)
    return extract_paragraphs_from_xml_root(root)


def replace_docx_entries(base_docx: bytes, replacements: dict[str, bytes]) -> bytes:
    out = BytesIO()
    written = set()
    with ZipFile(BytesIO(base_docx)) as src, ZipFile(out, "w", ZIP_DEFLATED) as dst:
        for info in src.infolist():
            if info.filename in replacements:
                dst.writestr(info, replacements[info.filename])
                written.add(info.filename)
            else:
                dst.writestr(info, src.read(info.filename))
        for name, data in replacements.items():
            if name not in written:
                dst.writestr(name, data)
    return out.getvalue()
