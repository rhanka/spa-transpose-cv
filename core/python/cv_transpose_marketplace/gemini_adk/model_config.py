from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Literal, Mapping

from ..identity import MarketplaceIdentityError, derive_tenant_key_from_claims
from ..validation import MarketplaceInputError

DEFAULT_MODEL = "gemini-2.5-flash"

EndpointMode = Literal["ai_studio", "vertex"]


@dataclass(frozen=True)
class ModelConfig:
    model: str
    region: str | None
    project_id: str | None
    endpoint_mode: EndpointMode
    api_key_env: str = "GOOGLE_API_KEY"


def _coerce_endpoint_mode(region: str | None, project_id: str | None) -> EndpointMode:
    if region is None and project_id is None:
        return "ai_studio"
    if region is not None and project_id is None:
        raise MarketplaceInputError(
            "model_config_invalid: project_id is required when region is set"
        )
    return "vertex"


def _from_env(env: Mapping[str, str]) -> tuple[str | None, str | None, str | None]:
    return (
        env.get("GEMINI_AGENT_MODEL"),
        env.get("GEMINI_AGENT_REGION"),
        env.get("GEMINI_AGENT_PROJECT_ID"),
    )


def _from_tenant(
    claims: Mapping[str, str],
    tenant_lookup: Callable[[str], Mapping[str, str] | None] | None,
) -> tuple[str | None, str | None, str | None]:
    if tenant_lookup is None:
        return (None, None, None)
    try:
        tenant_key = derive_tenant_key_from_claims("gws", claims)
    except MarketplaceIdentityError:
        return (None, None, None)
    record = tenant_lookup(tenant_key)
    if not record:
        return (None, None, None)
    return (
        record.get("gemini.model"),
        record.get("gemini.region"),
        record.get("gemini.project_id"),
    )


def resolve_model_config(
    claims: Mapping[str, str],
    *,
    env: Mapping[str, str],
    override: ModelConfig | None = None,
    tenant_lookup: Callable[[str], Mapping[str, str] | None] | None = None,
) -> ModelConfig:
    if override is not None:
        return override

    tenant_model, tenant_region, tenant_project = _from_tenant(claims, tenant_lookup)
    env_model, env_region, env_project = _from_env(env)

    model = tenant_model or env_model or DEFAULT_MODEL
    region = tenant_region or env_region
    project_id = tenant_project or env_project

    endpoint_mode = _coerce_endpoint_mode(region, project_id)

    return ModelConfig(
        model=model,
        region=region,
        project_id=project_id,
        endpoint_mode=endpoint_mode,
    )
