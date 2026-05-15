from __future__ import annotations

from dataclasses import dataclass

from cv_transpose_core.types import TransposedCv

from ..types import OutputArtifact


@dataclass(frozen=True)
class GeminiToolFile:
    name: str
    mime: str
    bytes_: bytes


@dataclass(frozen=True)
class GeminiToolRequest:
    claims: dict[str, str]
    files: list[GeminiToolFile]
    assets_base_url: str
    assets_bearer_token: str
    user_prompt: str | None = None
    assets_cache_ttl_seconds: int = 0


@dataclass(frozen=True)
class GeminiToolResult:
    tenant_key: str
    artifact: OutputArtifact | None
    report_card: dict[str, object]
    results: list[TransposedCv]
