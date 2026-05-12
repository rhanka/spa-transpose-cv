from __future__ import annotations

import re
from typing import Any


class ManifestError(ValueError):
    pass


SECTION_KINDS = {"experiences", "education", "skills", "languages", "certifications", "narrative"}
TENANT_RE = re.compile(r"^(direct|ms|gws):[A-Za-z0-9._-]+$")


def _require_obj(raw: Any, path: str) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise ManifestError(f"{path}: expected object")
    return raw


def validate_template_manifest(raw: Any) -> dict[str, Any]:
    manifest = dict(_require_obj(raw, "manifest"))
    if manifest.get("version") != "1.0":
        raise ManifestError("version: expected 1.0")
    if not isinstance(manifest.get("tenantKey"), str) or not TENANT_RE.match(manifest["tenantKey"]):
        raise ManifestError("tenantKey: invalid")
    if not isinstance(manifest.get("naming"), str) or manifest["naming"].strip() == "":
        raise ManifestError("naming: expected non-empty string")
    header = _require_obj(manifest.get("header"), "header")
    for key in ["nameSlot", "titleLine1Slot", "titleLine2Slot"]:
        slot = _require_obj(header.get(key), f"header.{key}")
        for slot_key in ["paragraphIndex", "runIndex"]:
            if not isinstance(slot.get(slot_key), int) or slot[slot_key] < 0:
                raise ManifestError(f"header.{key}.{slot_key}: expected non-negative integer")
    sections = manifest.get("sections")
    if not isinstance(sections, list) or len(sections) == 0:
        raise ManifestError("sections: expected non-empty list")
    for idx, section in enumerate(sections):
        item = _require_obj(section, f"sections.{idx}")
        for key in ["id", "label"]:
            if not isinstance(item.get(key), str) or item[key].strip() == "":
                raise ManifestError(f"sections.{idx}.{key}: expected non-empty string")
        if item.get("kind") not in SECTION_KINDS:
            raise ManifestError(f"sections.{idx}.kind: invalid")
    return manifest
