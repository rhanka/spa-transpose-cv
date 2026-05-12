from __future__ import annotations

import re
from numbers import Real
from typing import Any


class ManifestError(ValueError):
    pass


SECTION_KINDS = {"experiences", "education", "skills", "languages", "certifications", "narrative"}
TENANT_RE = re.compile(r"^(direct|ms|gws):[A-Za-z0-9._-]+$")
COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")
HEADER_STYLES = {
    "ats-minimal",
    "simple-clean",
    "compact-split",
    "modern-band",
    "professional-classic",
    "brand-accent",
}
SECTION_STYLES = {
    "rule-caps",
    "subtle-label",
    "compact-rule",
    "filled-bar",
    "classic-band",
    "centered-rule",
    "left-accent",
}
JOB_STYLES = {
    "ats-plain",
    "simple-balanced",
    "modern-emphasis",
    "classic-consulting",
    "compact-dense",
}


def _require_obj(raw: Any, path: str) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise ManifestError(f"{path}: expected object")
    return raw


def _validate_enum(raw: dict[str, Any], key: str, valid_values: set[str], path: str) -> None:
    if key not in raw:
        return
    if raw[key] not in valid_values:
        raise ManifestError(f"{path}.{key}: invalid")


def _validate_rendering_token_value(value: Any, path: str) -> None:
    if isinstance(value, str):
        if value.strip() == "":
            raise ManifestError(f"{path}: expected non-empty string or number")
        return
    if isinstance(value, bool) or not isinstance(value, Real):
        raise ManifestError(f"{path}: expected non-empty string or number")


def _validate_rendering(raw: Any) -> None:
    if raw is None:
        return
    rendering = _require_obj(raw, "rendering")
    _validate_enum(rendering, "headerStyle", HEADER_STYLES, "rendering")
    _validate_enum(rendering, "sectionStyle", SECTION_STYLES, "rendering")
    _validate_enum(rendering, "jobStyle", JOB_STYLES, "rendering")

    colors = rendering.get("colors")
    if colors is not None:
        colors = _require_obj(colors, "rendering.colors")
        for key, value in colors.items():
            if not isinstance(value, str) or not COLOR_RE.match(value):
                raise ManifestError(f"rendering.colors.{key}: expected #RRGGBB string")

    for group in ["fonts", "spacing"]:
        tokens = rendering.get(group)
        if tokens is None:
            continue
        tokens = _require_obj(tokens, f"rendering.{group}")
        for key, value in tokens.items():
            _validate_rendering_token_value(value, f"rendering.{group}.{key}")


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
        if "maxChars" in slot:
            max_chars = slot["maxChars"]
            if isinstance(max_chars, bool) or not isinstance(max_chars, int) or max_chars < 1:
                raise ManifestError(f"header.{key}.maxChars: expected positive integer")
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
    _validate_rendering(manifest.get("rendering"))
    return manifest
