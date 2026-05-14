from __future__ import annotations

import base64
import time
from typing import Any, Mapping, Sequence

from cv_transpose_marketplace.assets import TenantNotConfiguredError
from cv_transpose_marketplace.identity import derive_tenant_key_from_claims
from cv_transpose_marketplace.settings import load_runtime_settings

from ..jwt import RuntimeJwtIssuerError
from .tool import transpose_cvs
from .types import GeminiToolFile, GeminiToolRequest, GeminiToolResult


GEMINI_ENV_PREFIX = "CVT_GEMINI"
TENANT_NOT_CONFIGURED_MESSAGE = "Votre entreprise n'a pas encore configure de template. Contactez votre admin."


def _parse_input_files(payload_files: Sequence[Mapping[str, Any]]) -> list[GeminiToolFile]:
    return [
        GeminiToolFile(
            name=str(item["name"]),
            mime=str(item.get("contentType") or item["mime"]),
            bytes_=base64.b64decode(str(item["bytesBase64"])),
        )
        for item in payload_files
    ]


def _get_subject_from_claims(claims: Mapping[str, Any]) -> str:
    for field_name in ("email", "sub"):
        value = claims.get(field_name)
        if isinstance(value, str) and value.strip():
            return value.strip()
    raise RuntimeJwtIssuerError("Missing subject claim for Gemini runtime")


def _encode_tool_result(result: GeminiToolResult) -> dict[str, Any]:
    return {
        "tenantKey": result.tenant_key,
        "artifact": None
        if result.artifact is None
        else {
            "name": result.artifact.name,
            "mime": result.artifact.mime,
            "bytesBase64": base64.b64encode(result.artifact.bytes_).decode("ascii"),
        },
        "reportCard": result.report_card,
    }


def _build_tenant_not_configured_response(tenant_key: str, onboarding_url: str | None) -> dict[str, Any]:
    return {
        "tenantKey": tenant_key,
        "artifact": None,
        "reportCard": {"files": 0, "succeeded": 0, "failed": 0, "warnings": 0},
        "error": "tenant_not_configured",
        "message": TENANT_NOT_CONFIGURED_MESSAGE,
        "onboardingUrl": onboarding_url,
    }


async def handle_gemini_request(
    payload: Mapping[str, Any],
    *,
    llm,
    env: Mapping[str, str],
    transpose_tool=transpose_cvs,
) -> dict[str, Any]:
    settings = load_runtime_settings(GEMINI_ENV_PREFIX, env)
    context = payload.get("context")
    identity = context.get("identity") if isinstance(context, Mapping) else None
    if not isinstance(identity, Mapping):
        raise RuntimeJwtIssuerError("Missing identity context for Gemini runtime")

    claims = {key: str(value) for key, value in identity.items() if value is not None}
    tenant_key = derive_tenant_key_from_claims("gws", claims)
    signer = settings.build_signer()
    request = GeminiToolRequest(
        claims=claims,
        files=_parse_input_files(payload.get("files", [])),
        user_prompt=str(payload["userPrompt"]).strip() if isinstance(payload.get("userPrompt"), str) and str(payload["userPrompt"]).strip() else None,
        assets_base_url=settings.assets_base_url,
        assets_bearer_token=signer.mint_token(
            subject=_get_subject_from_claims(claims),
            tenant_key=tenant_key,
            issued_at=int(time.time()),
        ),
    )

    try:
        result = await transpose_tool(request, llm=llm)
        return _encode_tool_result(result)
    except TenantNotConfiguredError:
        return _build_tenant_not_configured_response(tenant_key, settings.onboarding_url)
