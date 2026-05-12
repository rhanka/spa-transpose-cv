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
    "docId",
    "paraId",
)

PKG_NAMESPACE = "http://schemas.microsoft.com/office/2006/xmlPackage"


def _local_name(name: str) -> str:
    return name.rsplit("}", 1)[-1] if "}" in name else name


def _namespace(name: str) -> str:
    return name[1:].split("}", 1)[0] if name.startswith("{") and "}" in name else ""


def _is_normalized_xml_part(name: str) -> bool:
    return name.endswith(".xml") or name.endswith(".rels")


def _should_remove_attr(el: etree._Element, attr: str, value: str) -> bool:
    local = _local_name(attr)
    if local in NON_DETERMINISTIC_ATTR_SUFFIXES:
        return True
    if _local_name(el.tag) == "docPr" and local == "id":
        return True
    return _namespace(attr) == PKG_NAMESPACE and local.endswith("Id") and value.isdigit()


def _normalize_tree(raw: bytes) -> str:
    parser = etree.XMLParser(remove_blank_text=True, resolve_entities=False, no_network=True)
    root = etree.fromstring(raw, parser=parser)
    for el in root.iter():
        for attr in list(el.attrib):
            value = el.attrib[attr]
            if _should_remove_attr(el, attr, value):
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
            if name.endswith("/"):
                continue
            raw = zf.read(name)
            if _is_normalized_xml_part(name):
                xml[name] = _normalize_tree(raw)
            else:
                binary_hashes[name] = sha256(raw).hexdigest()
    return {"xml": xml, "binary_hashes": binary_hashes}
