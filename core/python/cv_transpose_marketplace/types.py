from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from cv_transpose_core.types import TransposedCv


@dataclass(frozen=True)
class OutputArtifact:
    name: str
    mime: Literal[
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/zip",
    ]
    bytes_: bytes


@dataclass(frozen=True)
class MarketplaceRunResult:
    tenant_key: str
    results: list[TransposedCv]
    artifact: OutputArtifact | None
