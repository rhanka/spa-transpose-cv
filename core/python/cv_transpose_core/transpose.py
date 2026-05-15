from __future__ import annotations

from copy import deepcopy
import json
from typing import Any

from .contract import derive_output_name_from_contract, manifest_to_contract
from .docx import validate_base_docx
from .extract import extract_text_from_bytes
from .profile import EMPTY_PROFILE_FALLBACK, validate_cv_data
from .prompts import build_system_prompt, build_user_prompt
from .render import render_docx
from .types import (
    AlignmentReport,
    DetectedFields,
    LlmCompleteResult,
    TransposeInput,
    TransposedCv,
    TransposeOutput,
    Usage,
)
from .validate import validate_docx_structure, validate_page1

DEFAULT_EXTRACTION_MAX_TOKENS = 16_000
LARGE_CV_EXTRACTION_MAX_TOKENS = 32_000
LARGE_CV_TEXT_CHAR_THRESHOLD = 30_000
DEFAULT_PARSE_RETRIES = 1


def _fallback_profile() -> dict[str, Any]:
    return deepcopy(EMPTY_PROFILE_FALLBACK)


def _emit_phase(input_: TransposeInput, file_name: str, phase: str) -> None:
    if input_.stream_callbacks and input_.stream_callbacks.on_phase_change:
        input_.stream_callbacks.on_phase_change(file_name, phase)


def _on_delta(input_: TransposeInput, file_name: str):
    if input_.stream_callbacks is None:
        return None

    def route_delta(delta: dict[str, str]) -> None:
        kind = delta.get("kind")
        text = delta.get("text", "")
        if kind == "thinking" and input_.stream_callbacks and input_.stream_callbacks.on_thinking_delta:
            input_.stream_callbacks.on_thinking_delta(file_name, text)
        if kind == "content" and input_.stream_callbacks and input_.stream_callbacks.on_content_delta:
            input_.stream_callbacks.on_content_delta(file_name, text)

    return route_delta


def _empty_report() -> AlignmentReport:
    return AlignmentReport(
        validation_passed=False,
        warnings=[],
        detected_fields=DetectedFields(experience_count=0, education_count=0, skill_buckets=0, languages_count=0),
        page1_sections_found=[],
        missing_required_sections=[],
        retries_used=0,
    )


def _detected_fields(profile: dict[str, Any]) -> DetectedFields:
    years = None
    try:
        years = int(str(profile.get("years") or ""))
    except ValueError:
        years = None
    return DetectedFields(
        name=profile.get("name"),
        title_line1=profile.get("title_line1"),
        title_line2=profile.get("title_line2"),
        years_of_experience=years,
        experience_count=len(profile.get("experience", [])),
        education_count=len(profile.get("education", [])),
        skill_buckets=len(profile.get("technicalSkills", [])),
        languages_count=len(profile.get("languages", [])),
    )


def _primary_experience_section_label(contract: dict[str, Any]) -> str | None:
    for section in contract["sections"]:
        if section["key"] in {"experience", "selectedExperience", "additionalExperience"}:
            return section["label"]
    return None


def _primary_sector_section_label(contract: dict[str, Any]) -> str | None:
    for section in contract["sections"]:
        if section["key"] in {"sectorSkills", "sectorExperience"}:
            return section["label"]
    return None


def _coerce_llm_result(raw: LlmCompleteResult | dict[str, Any]) -> LlmCompleteResult:
    if isinstance(raw, LlmCompleteResult):
        return raw
    return LlmCompleteResult(text=raw["text"], usage=raw.get("usage"))


def _parse_llm_json(text: str) -> Any:
    trimmed = text.strip()
    without_fence = trimmed.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    return json.loads(without_fence)


def _parse_cv_data_from_llm(text: str) -> dict[str, Any]:
    try:
        parsed = _parse_llm_json(text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"LLM did not return valid JSON: {exc.msg}: line {exc.lineno} column {exc.colno} (char {exc.pos})") from exc

    return validate_cv_data(parsed)


def _resolve_extraction_max_tokens(source_text: str, configured: int | None) -> int:
    if isinstance(configured, int) and configured > 0:
        return configured
    if len(source_text) > LARGE_CV_TEXT_CHAR_THRESHOLD:
        return LARGE_CV_EXTRACTION_MAX_TOKENS
    return DEFAULT_EXTRACTION_MAX_TOKENS


def _build_parse_retry_prompt(base_prompt: str | None, error: str) -> str:
    return "\n\n".join(
        part
        for part in [
            base_prompt or "",
            f"PREVIOUS LLM OUTPUT WAS NOT VALID JSON: {error}.",
            "Return ONLY one complete valid JSON object matching the requested schema. Do not include markdown, comments, analysis, or trailing text.",
        ]
        if part
    )


async def _process_one(file, input_: TransposeInput, contract: dict[str, Any]) -> TransposedCv:
    errors: list[str] = []
    source_text = ""
    profile: dict[str, Any] | None = None
    output_docx = b""
    report = _empty_report()
    usage_in = 0
    usage_out = 0
    retries_used = 0
    max_retries = input_.extraction.max_validation_retries if input_.extraction else None
    if max_retries is None:
        max_retries = 1
    max_parse_retries = input_.extraction.max_parse_retries if input_.extraction else None
    if max_parse_retries is None:
        max_parse_retries = DEFAULT_PARSE_RETRIES
    user_prompt_override = file.user_prompt_override

    try:
        validate_base_docx(input_.template.base_docx)
        _emit_phase(input_, file.name, "extract-text")
        source_text = extract_text_from_bytes(file.bytes_, file.name, file.mime)
        extraction_max_tokens = _resolve_extraction_max_tokens(
            source_text,
            input_.extraction.max_tokens if input_.extraction else None,
        )
        for attempt in range(max_retries + 1):
            if attempt > 0:
                _emit_phase(input_, file.name, "retry")
            parse_prompt_override = user_prompt_override
            profile = None
            for parse_attempt in range(max_parse_retries + 1):
                if parse_attempt > 0:
                    _emit_phase(input_, file.name, "retry")
                _emit_phase(input_, file.name, "extract-cv-llm")
                llm_result = _coerce_llm_result(
                    await input_.llm.complete(
                        system_prompt=build_system_prompt(),
                        user_prompt=build_user_prompt(
                            cv_text=source_text,
                            source_file_name=file.name,
                            user_prompt_override=parse_prompt_override,
                        ),
                        max_tokens=extraction_max_tokens,
                        temperature=0.1,
                        enable_reasoning=True if input_.extraction is None or input_.extraction.enable_reasoning is None else input_.extraction.enable_reasoning,
                        reasoning_budget=input_.extraction.reasoning_budget if input_.extraction else None,
                        response_format="json",
                        on_delta=_on_delta(input_, file.name),
                    )
                )
                if llm_result.usage:
                    usage_in += int(llm_result.usage.get("inputTokens", llm_result.usage.get("input_tokens", 0)))
                    usage_out += int(llm_result.usage.get("outputTokens", llm_result.usage.get("output_tokens", 0)))
                try:
                    profile = _parse_cv_data_from_llm(llm_result.text)
                    break
                except ValueError as exc:
                    if parse_attempt >= max_parse_retries:
                        raise
                    parse_prompt_override = _build_parse_retry_prompt(user_prompt_override, str(exc))
            if profile is None:
                raise ValueError("LLM extraction failed without a parsed profile")
            if input_.stream_callbacks and input_.stream_callbacks.on_parsed_keys:
                input_.stream_callbacks.on_parsed_keys(file.name, list(profile.keys()))
            _emit_phase(input_, file.name, "render-docx")
            output_docx = render_docx(
                input_.template.base_docx,
                profile,
                contract,
                renderer=input_.template.renderer or "generic",
            )
            required = [section["label"] for section in contract["sections"] if section["required"]]
            _emit_phase(input_, file.name, "validate-page1")
            page1 = validate_page1(
                output_docx,
                experience_section_label=_primary_experience_section_label(contract),
                sector_section_label=_primary_sector_section_label(contract),
            )
            structure = validate_docx_structure(output_docx, required)
            report = AlignmentReport(
                validation_passed=len(page1["warnings"]) == 0 and len(structure["missing"]) == 0,
                warnings=page1["warnings"],
                detected_fields=_detected_fields(profile),
                page1_sections_found=structure["found"],
                missing_required_sections=structure["missing"],
                retries_used=retries_used,
            )
            if report.validation_passed or attempt >= max_retries:
                break
            retries_used += 1
            feedback = "; ".join(
                [
                    *report.warnings,
                    *[f'Missing required section "{s}"' for s in report.missing_required_sections],
                ]
            )
            user_prompt_override = "\n\n".join(
                part
                for part in [
                    file.user_prompt_override or "",
                    f"VALIDATION ERRORS: {feedback}.",
                    "Shorten all skill descriptions to max 100 characters. Reduce sectors to max 4. Reduce domains to max 4.",
                ]
                if part
            )
        report.retries_used = retries_used
        _emit_phase(input_, file.name, "done")
    except Exception as exc:
        errors.append(str(exc))
        report.retries_used = retries_used

    safe_profile = profile or _fallback_profile()
    output_name = derive_output_name_from_contract(contract, file.name, safe_profile["name"]) if not errors else ""
    return TransposedCv(
        source_file_name=file.name,
        output_docx_name=output_name,
        output_docx=output_docx,
        profile=safe_profile,
        source_text=source_text,
        usage=Usage(input_tokens=usage_in, output_tokens=usage_out, total_tokens=usage_in + usage_out),
        alignment_report=report,
        errors=errors,
    )


async def transpose(input_: TransposeInput) -> TransposeOutput:
    contract = manifest_to_contract(input_.template.manifest, input_.template.brand)
    results = []
    for file in input_.files:
        results.append(await _process_one(file, input_, contract))
    return TransposeOutput(results=results)
