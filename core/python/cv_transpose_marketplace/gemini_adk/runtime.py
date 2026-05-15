from __future__ import annotations

import base64
import binascii
import time
from typing import Any, Mapping, Sequence

from cv_transpose_marketplace.assets import AssetsApiError, InvalidJwtError, TenantNotConfiguredError
from cv_transpose_marketplace.identity import derive_tenant_key_from_claims
from cv_transpose_marketplace.settings import load_runtime_settings
from cv_transpose_marketplace.validation import MarketplaceInputError, assert_marketplace_upload_allowed

from ..jwt import RuntimeJwtIssuerError
from .tool import encode_tool_result, transpose_cvs
from .types import GeminiToolFile, GeminiToolRequest, GeminiToolResult


GEMINI_ENV_PREFIX = "CVT_GEMINI"
TENANT_NOT_CONFIGURED_MESSAGE = "Votre entreprise n'a pas encore configure de template. Contactez votre admin."
ASSETS_AUTH_FAILED_MESSAGE = "L'authentification des assets template a echoue. Contactez le support."
ASSETS_UNAVAILABLE_MESSAGE = "Configuration entreprise non joignable, reessayez plus tard."


def _validate_request_payload(payload: Mapping[str, Any]) -> tuple[Mapping[str, Any], list[Mapping[str, Any]], str | None]:
    context = payload.get("context")
    if not isinstance(context, Mapping):
        raise MarketplaceInputError("Missing or invalid context for Gemini runtime")
    identity = context.get("identity")
    if not isinstance(identity, Mapping):
        raise MarketplaceInputError("Missing or invalid identity for Gemini runtime")

    raw_files = payload.get("files", [])
    if not isinstance(raw_files, Sequence) or isinstance(raw_files, (str, bytes, bytearray)):
        raise MarketplaceInputError("files must be a list for Gemini runtime")
    file_items: list[Mapping[str, Any]] = []
    for index, item in enumerate(raw_files):
        if not isinstance(item, Mapping):
            raise MarketplaceInputError(f"files[{index}] must be an object for Gemini runtime")
        file_items.append(item)

    user_prompt_raw = payload.get("userPrompt")
    if user_prompt_raw is not None and not isinstance(user_prompt_raw, str):
        raise MarketplaceInputError("userPrompt must be a string for Gemini runtime")
    user_prompt = user_prompt_raw.strip() if isinstance(user_prompt_raw, str) and user_prompt_raw.strip() else None

    return identity, file_items, user_prompt


def _parse_input_files(payload_files: Sequence[Mapping[str, Any]]) -> list[GeminiToolFile]:
    files: list[GeminiToolFile] = []
    for index, item in enumerate(payload_files):
        name_value = item.get("name")
        if not isinstance(name_value, str) or not name_value.strip():
            raise MarketplaceInputError(f"files[{index}].name is required for Gemini runtime")
        content_type_value = item.get("contentType") or item.get("mime")
        if not isinstance(content_type_value, str) or not content_type_value.strip():
            raise MarketplaceInputError(
                f"files[{index}].contentType is required for Gemini runtime"
            )
        bytes_b64_value = item.get("bytesBase64")
        if not isinstance(bytes_b64_value, str) or not bytes_b64_value.strip():
            raise MarketplaceInputError(
                f"files[{index}].bytesBase64 is required for Gemini runtime"
            )
        file_name = name_value.strip()
        content_type = content_type_value.strip()
        assert_marketplace_upload_allowed(file_name, content_type)
        try:
            decoded_bytes = base64.b64decode(bytes_b64_value, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise MarketplaceInputError(
                f"files[{index}].bytesBase64 must be valid base64 for Gemini runtime"
            ) from exc
        files.append(
            GeminiToolFile(
                name=file_name,
                mime=content_type,
                bytes_=decoded_bytes,
            )
        )
    return files


def _get_subject_from_claims(claims: Mapping[str, Any]) -> str:
    for field_name in ("email", "sub"):
        value = claims.get(field_name)
        if isinstance(value, str) and value.strip():
            return value.strip()
    raise RuntimeJwtIssuerError("Missing subject claim for Gemini runtime")


def _encode_tool_result(result: GeminiToolResult) -> dict[str, Any]:
    return encode_tool_result(result)


def _build_tenant_not_configured_response(tenant_key: str, onboarding_url: str | None) -> dict[str, Any]:
    return {
        "tenantKey": tenant_key,
        "artifact": None,
        "reportCard": {"files": 0, "succeeded": 0, "failed": 0, "warnings": 0},
        "error": "tenant_not_configured",
        "message": TENANT_NOT_CONFIGURED_MESSAGE,
        "onboardingUrl": onboarding_url,
    }


def _build_assets_auth_failed_response(tenant_key: str, reason: str | None) -> dict[str, Any]:
    return {
        "tenantKey": tenant_key,
        "artifact": None,
        "reportCard": {"files": 0, "succeeded": 0, "failed": 0, "warnings": 0},
        "error": "assets_auth_failed",
        "reason": reason,
        "message": ASSETS_AUTH_FAILED_MESSAGE,
    }


def _build_assets_unavailable_response(tenant_key: str) -> dict[str, Any]:
    return {
        "tenantKey": tenant_key,
        "artifact": None,
        "reportCard": {"files": 0, "succeeded": 0, "failed": 0, "warnings": 0},
        "error": "assets_unavailable",
        "message": ASSETS_UNAVAILABLE_MESSAGE,
    }


async def handle_gemini_request(
    payload: Mapping[str, Any],
    *,
    llm,
    env: Mapping[str, str],
    transpose_tool=transpose_cvs,
) -> dict[str, Any]:
    settings = load_runtime_settings(GEMINI_ENV_PREFIX, env)
    identity, file_items, user_prompt = _validate_request_payload(payload)

    claims = {key: str(value) for key, value in identity.items() if value is not None}
    tenant_key = derive_tenant_key_from_claims("gws", claims)
    signer = settings.build_signer()
    request = GeminiToolRequest(
        claims=claims,
        files=_parse_input_files(file_items),
        user_prompt=user_prompt,
        assets_base_url=settings.assets_base_url,
        assets_bearer_token=signer.mint_token(
            subject=_get_subject_from_claims(claims),
            tenant_key=tenant_key,
            issued_at=int(time.time()),
        ),
        assets_cache_ttl_seconds=settings.assets_cache_ttl_seconds,
    )

    try:
        result = await transpose_tool(request, llm=llm)
        return _encode_tool_result(result)
    except TenantNotConfiguredError:
        return _build_tenant_not_configured_response(tenant_key, settings.onboarding_url)
    except InvalidJwtError as exc:
        return _build_assets_auth_failed_response(tenant_key, exc.reason)
    except AssetsApiError:
        return _build_assets_unavailable_response(tenant_key)


def handle_jwks_request(*, env: Mapping[str, str]) -> dict[str, object]:
    return load_runtime_settings(GEMINI_ENV_PREFIX, env).build_signer().jwks()
