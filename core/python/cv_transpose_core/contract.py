from __future__ import annotations

import re
import unicodedata
from typing import Any

from .manifest import validate_template_manifest
from .types import BrandTokens

KNOWN_SECTION_KEYS = {
    "executiveSummary",
    "technicalSkills",
    "coreSkills",
    "sectorSkills",
    "sectorExperience",
    "experience",
    "selectedExperience",
    "additionalExperience",
    "languages",
    "education",
    "tools",
}


def _header_style_to_variant(style: str | None) -> str:
    return {
        "brand-accent": "brand-accent",
        "professional-classic": "consulting-classic",
        "modern-band": "executive-modern",
        "compact-split": "professional-compact",
    }.get(style or "ats-minimal", "ats-core")


def manifest_to_contract(manifest: dict[str, Any], brand: BrandTokens | None = None) -> dict[str, Any]:
    manifest = validate_template_manifest(manifest)
    rendering = manifest.get("rendering") or {}
    header_style = rendering.get("headerStyle") or "ats-minimal"
    section_style = rendering.get("sectionStyle") or "rule-caps"
    job_style = rendering.get("jobStyle") or "ats-plain"

    sections = []
    for section in manifest["sections"]:
        key = section["id"]
        if key not in KNOWN_SECTION_KEYS:
            raise ValueError(f'manifestToContract: section id "{key}" is not a known TemplateSectionKey')
        sections.append(
            {
                "key": key,
                "label": section["label"],
                "required": True,
                "repeatable": key in {"experience", "selectedExperience", "additionalExperience"},
            }
        )

    colors = {
        "accent": brand.primary if brand else "#1F2937",
        "sectionBannerFill": "#FFFFFF",
        "sectionBannerText": brand.primary if brand else "#111827",
        "headingText": brand.primary if brand else "#111827",
        "bodyText": "#111827",
        "mutedText": brand.secondary if brand else "#5B6470",
        **(rendering.get("colors") or {}),
    }
    fonts = {
        "heading": brand.font_family if brand else "Liberation Sans Narrow",
        "body": brand.font_family if brand else "Liberation Sans Narrow",
        **(rendering.get("fonts") or {}),
    }
    spacing = {
        "sectionBeforeTwip": 180,
        "sectionAfterTwip": 100,
        "lineTwip": 280,
        **(rendering.get("spacing") or {}),
    }

    return {
        "version": "v1",
        "layout": {"family": "single-column", "variant": _header_style_to_variant(header_style)},
        "header": {
            "fields": [
                {"key": "name", "placeholder": "Candidate Name"},
                {"key": "headline", "placeholder": "Role"},
                {"key": "subheadline", "placeholder": "Specialty"},
                {"key": "years_of_experience", "placeholder": "XX"},
            ],
            "limits": {
                "headlineMaxChars": manifest["header"]["titleLine1Slot"].get("maxChars", 40),
                "subheadlineMaxChars": manifest["header"]["titleLine2Slot"].get("maxChars", 40),
            },
        },
        "sections": sections,
        "styleTokens": {"colors": colors, "fonts": fonts, "spacing": spacing},
        "rendering": {"headerStyle": header_style, "sectionStyle": section_style, "jobStyle": job_style},
        "output": {"filenamePattern": manifest["naming"]},
    }


def _sanitize_file_token(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    stripped = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    token = re.sub(r"[^a-zA-Z0-9]+", "_", stripped)
    token = re.sub(r"_+", "_", token).strip("_")
    return token


def _first_token_like_ts_split(value: str) -> str:
    return re.split(r"\s+", value)[0]


def derive_output_name_from_contract(contract: dict[str, Any], original_name: str, cv_name: str) -> str:
    match = re.search(r"_(\d{4,})[\s.]", original_name)
    candidate_id = match.group(1) if match else ""
    first_name = _sanitize_file_token(_first_token_like_ts_split(cv_name)) or "Candidate"
    full_name = _sanitize_file_token(cv_name) or first_name
    candidate_label = f"Candidate_{candidate_id}" if candidate_id else full_name
    resolved = (
        contract["output"]["filenamePattern"]
        .replace("{candidateId}", candidate_id)
        .replace("{firstName}", first_name)
        .replace("{name}", candidate_label)
    )
    resolved = re.sub(r"_+", "_", resolved)
    resolved = re.sub(r"_+\.", ".", resolved)
    if resolved.startswith("."):
        resolved = "CV_Profile" + resolved
    return resolved if resolved.endswith(".docx") else f"{resolved}.docx"
