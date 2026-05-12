from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Literal, Protocol

CvMime = Literal[
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
]
Persistence = Literal["session", "ephemeral"]
TransposePhase = Literal[
    "extract-text",
    "extract-cv-llm",
    "render-docx",
    "validate-page1",
    "validate-structural",
    "retry",
    "done",
]


@dataclass(frozen=True)
class InputFile:
    name: str
    bytes_: bytes
    mime: CvMime
    user_prompt_override: str | None = None


@dataclass(frozen=True)
class BrandTokens:
    primary: str
    secondary: str
    accent: str
    font_family: str


@dataclass(frozen=True)
class TemplateAssets:
    manifest: dict[str, Any]
    base_docx: bytes
    brand: BrandTokens


@dataclass(frozen=True)
class LlmCompleteArgs:
    system_prompt: str
    user_prompt: str
    max_tokens: int | None = None
    temperature: float | None = None
    enable_reasoning: bool | None = None
    reasoning_budget: int | None = None
    on_delta: Callable[[dict[str, str]], None] | None = None


@dataclass(frozen=True)
class LlmCompleteResult:
    text: str
    usage: dict[str, int] | None = None


class LlmProvider(Protocol):
    async def complete(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int | None = None,
        temperature: float | None = None,
        enable_reasoning: bool | None = None,
        reasoning_budget: int | None = None,
        on_delta: Callable[[dict[str, str]], None] | None = None,
    ) -> LlmCompleteResult | dict[str, Any]:
        ...


@dataclass(frozen=True)
class ExtractionOptions:
    reasoning_budget: int | None = None
    enable_reasoning: bool | None = None
    max_validation_retries: int | None = None


@dataclass(frozen=True)
class StreamCallbacks:
    on_phase_change: Callable[[str, TransposePhase], None] | None = None
    on_thinking_delta: Callable[[str, str], None] | None = None
    on_content_delta: Callable[[str, str], None] | None = None
    on_parsed_keys: Callable[[str, list[str]], None] | None = None


@dataclass(frozen=True)
class TransposeInput:
    files: list[InputFile]
    template: TemplateAssets
    persistence: Persistence
    llm: LlmProvider
    extraction: ExtractionOptions | None = None
    stream_callbacks: StreamCallbacks | None = None


@dataclass(frozen=True)
class DetectedFields:
    experience_count: int
    education_count: int
    skill_buckets: int
    languages_count: int
    name: str | None = None
    title_line1: str | None = None
    title_line2: str | None = None
    years_of_experience: int | None = None


@dataclass
class AlignmentReport:
    validation_passed: bool
    warnings: list[str]
    detected_fields: DetectedFields
    page1_sections_found: list[str]
    missing_required_sections: list[str]
    retries_used: int


@dataclass(frozen=True)
class Usage:
    input_tokens: int
    output_tokens: int
    total_tokens: int


@dataclass(frozen=True)
class TransposedCv:
    source_file_name: str
    output_docx_name: str
    output_docx: bytes
    profile: dict[str, Any]
    source_text: str
    usage: Usage
    alignment_report: AlignmentReport
    errors: list[str]


@dataclass(frozen=True)
class TransposeOutput:
    results: list[TransposedCv]
