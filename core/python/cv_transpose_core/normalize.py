from __future__ import annotations

from hashlib import sha256
from io import BytesIO
from zipfile import ZipFile

from lxml import etree

NON_DETERMINISTIC_ATTR_SUFFIXES = (
    "rsidR",
    "rsidRPr",
    "rsidRDefault",
    "rsidP",
    "rsidTr",
    "editId",
)


def _local_name(name: str) -> str:
    return name.rsplit("}", 1)[-1] if "}" in name else name


def _normalize_tree(raw: bytes) -> str:
    parser = etree.XMLParser(remove_blank_text=True, recover=True)
    root = etree.fromstring(raw, parser=parser)
    for el in root.iter():
        for attr in list(el.attrib):
            local = _local_name(attr)
            value = el.attrib[attr]
            if local in NON_DETERMINISTIC_ATTR_SUFFIXES:
                del el.attrib[attr]
            elif local.endswith("Id") and value.isdigit():
                del el.attrib[attr]
        if _local_name(el.tag) in {"created", "modified", "lastModifiedBy"}:
            el.text = ""
        if el.attrib:
            ordered = sorted(el.attrib.items(), key=lambda item: item[0])
            el.attrib.clear()
            el.attrib.update(ordered)
    return etree.tostring(root, encoding="unicode", pretty_print=True)


def normalize_docx(data: bytes) -> dict[str, dict[str, str]]:
    xml: dict[str, str] = {}
    binary_hashes: dict[str, str] = {}
    with ZipFile(BytesIO(data)) as zf:
        for name in sorted(zf.namelist()):
            raw = zf.read(name)
            if name.endswith(".xml"):
                xml[name] = _normalize_tree(raw)
            else:
                binary_hashes[name] = sha256(raw).hexdigest()
    return {"xml": xml, "binary_hashes": binary_hashes}
