from __future__ import annotations

from io import BytesIO
from zipfile import BadZipFile, ZipFile

from lxml import etree
from pypdf import PdfReader

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
DOCX_DOCUMENT_XML_MAX_BYTES = 5 * 1024 * 1024


class UnsupportedMimeError(ValueError):
    pass


class TextExtractionError(ValueError):
    pass


def _extract_docx_text(data: bytes) -> str:
    try:
        with ZipFile(BytesIO(data)) as zf:
            try:
                document_info = zf.getinfo("word/document.xml")
            except KeyError as exc:
                raise TextExtractionError("missing_docx_document_xml") from exc

            if document_info.file_size > DOCX_DOCUMENT_XML_MAX_BYTES:
                raise TextExtractionError("docx_document_xml_too_large")

            with zf.open(document_info) as fh:
                xml = fh.read(DOCX_DOCUMENT_XML_MAX_BYTES + 1)
    except BadZipFile as exc:
        raise TextExtractionError("malformed_docx") from exc

    if len(xml) > DOCX_DOCUMENT_XML_MAX_BYTES:
        raise TextExtractionError("docx_document_xml_too_large")

    parser = etree.XMLParser(resolve_entities=False, no_network=True, huge_tree=False)
    try:
        root = etree.fromstring(xml, parser=parser)
    except etree.XMLSyntaxError as exc:
        raise TextExtractionError("malformed_docx_xml") from exc

    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    paragraphs: list[str] = []
    for para in root.findall(".//w:p", namespaces=ns):
        runs = [node.text or "" for node in para.findall(".//w:t", namespaces=ns)]
        paragraphs.append("".join(runs))
    return "\n".join(paragraphs)


def _extract_pdf_text(data: bytes) -> str:
    reader = PdfReader(BytesIO(data))
    if reader.is_encrypted:
        raise TextExtractionError("encrypted_pdf")
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    if not text.strip():
        raise TextExtractionError("empty_pdf_text")
    return text


def extract_text_from_bytes(data: bytes, original_name: str, mime: str) -> str:
    if mime == "application/pdf" or original_name.lower().endswith(".pdf"):
        return _extract_pdf_text(data)
    if mime == DOCX_MIME or original_name.lower().endswith(".docx"):
        return _extract_docx_text(data)
    if mime == "application/msword" or original_name.lower().endswith(".doc"):
        raise UnsupportedMimeError("unsupported_mime: application/msword")
    raise UnsupportedMimeError(f"unsupported_mime: {mime}")
