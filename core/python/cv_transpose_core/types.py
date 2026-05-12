from dataclasses import dataclass
from typing import Any, Literal, Protocol

CvMime = Literal[
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
]
Persistence = Literal["session", "ephemeral"]


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


class LlmProvider(Protocol):
    async def complete(self, **kwargs: Any) -> dict[str, Any]:
        ...


@dataclass(frozen=True)
class TransposeInput:
    files: list[InputFile]
    template: TemplateAssets
    persistence: Persistence
    llm: LlmProvider
    extraction: dict[str, Any] | None = None
    stream_callbacks: dict[str, Any] | None = None
