from __future__ import annotations

from typing import Any, Callable, Mapping, Sequence

from cv_transpose_core import ExtractionOptions, InputFile, LlmProvider, TemplateAssets, transpose

from .assets import fetch_template_assets
from .identity import derive_tenant_key_from_claims
from .runtime import run_marketplace_transpose
from .types import MarketplaceRunResult
from .validation import validate_marketplace_files


async def run_gemini_transpose(
    *,
    claims: Mapping[str, str],
    files: Sequence[InputFile],
    llm: LlmProvider,
    assets_base_url: str,
    assets_bearer_token: str,
    user_prompt: str | None = None,
    assets_cache_ttl_seconds: int = 0,
    extraction: ExtractionOptions | None = None,
    fetch_assets: Callable[..., TemplateAssets] = fetch_template_assets,
    run_fn: Callable[..., Any] = run_marketplace_transpose,
    transpose_fn: Callable[..., Any] = transpose,
) -> MarketplaceRunResult:
    validate_marketplace_files(files)
    tenant_key = derive_tenant_key_from_claims("gws", claims)
    template_assets = fetch_assets(
        base_url=assets_base_url,
        tenant_key=tenant_key,
        bearer_token=assets_bearer_token,
        cache_ttl_seconds=assets_cache_ttl_seconds,
    )
    return await run_fn(
        tenant_key=tenant_key,
        files=files,
        llm=llm,
        template_assets=template_assets,
        user_prompt=user_prompt,
        extraction=extraction,
        transpose_fn=transpose_fn,
    )
