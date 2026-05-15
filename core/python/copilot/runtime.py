from __future__ import annotations

import base64
import time
from urllib.request import Request, urlopen
from typing import Any, Mapping, Sequence

from cv_transpose_core import InputFile, LlmProvider
from cv_transpose_marketplace.assets import InvalidJwtError, TenantNotConfiguredError
from cv_transpose_marketplace.copilot import CopilotActionResult, run_copilot_transpose
from cv_transpose_marketplace.identity import derive_tenant_key_from_claims
from cv_transpose_marketplace.jwt import RuntimeJwtIssuer, RuntimeJwtIssuerError
from cv_transpose_marketplace.settings import load_runtime_settings


COPILOT_ENV_PREFIX = "CVT_COPILOT"
TENANT_NOT_CONFIGURED_MESSAGE = "Votre entreprise n'a pas encore configure de template. Contactez votre admin."
ASSETS_AUTH_FAILED_MESSAGE = "L'authentification des assets template a echoue. Contactez le support."


def _download_file_bytes(download_url: str, item: Mapping[str, Any]) -> bytes:
    request = Request(download_url, headers={"Accept": str(item.get("contentType") or "application/octet-stream")})
    with urlopen(request) as response:
        return response.read()


def _parse_input_files(
    payload_files: Sequence[Mapping[str, Any]],
    *,
    download_file=_download_file_bytes,
) -> list[InputFile]:
    files: list[InputFile] = []
    for item in payload_files:
        bytes_base64 = item.get("bytesBase64")
        download_url = item.get("downloadUrl")
        if isinstance(bytes_base64, str) and bytes_base64:
            file_bytes = base64.b64decode(bytes_base64)
        elif isinstance(download_url, str) and download_url.strip():
            file_bytes = download_file(download_url.strip(), item)
        else:
            raise RuntimeJwtIssuerError("Each Copilot file must provide bytesBase64 or downloadUrl")
        files.append(
            InputFile(
                name=str(item["name"]),
                mime=str(item["contentType"]),
                bytes_=file_bytes,
            )
        )
    return files


def _get_subject_from_claims(claims: Mapping[str, Any]) -> str:
    for field_name in ("upn", "email", "oid", "sub"):
        value = claims.get(field_name)
        if isinstance(value, str) and value.strip():
            return value.strip()
    raise RuntimeJwtIssuerError("Missing subject claim for Copilot runtime")


def _encode_action_response(result: CopilotActionResult) -> dict[str, Any]:
    return {
        "tenantKey": result.tenant_key,
        "adaptiveCard": result.card,
        "alignmentReport": result.alignment_report,
        "attachments": [
            {
                "name": attachment.name,
                "contentType": attachment.content_type,
                "bytesBase64": base64.b64encode(attachment.bytes_).decode("ascii"),
            }
            for attachment in result.attachments
        ],
    }


def _build_tenant_not_configured_response(tenant_key: str, onboarding_url: str | None) -> dict[str, Any]:
    card: dict[str, Any] = {
        "type": "AdaptiveCard",
        "version": "1.5",
        "body": [
            {
                "type": "TextBlock",
                "text": "Tenant not configured",
                "weight": "Bolder",
                "wrap": True,
            },
            {
                "type": "TextBlock",
                "text": TENANT_NOT_CONFIGURED_MESSAGE,
                "wrap": True,
            },
        ],
    }
    if onboarding_url:
        card["actions"] = [
            {
                "type": "Action.OpenUrl",
                "title": "Open onboarding",
                "url": onboarding_url,
            }
        ]

    return {
        "tenantKey": tenant_key,
        "attachments": [],
        "error": "tenant_not_configured",
        "message": TENANT_NOT_CONFIGURED_MESSAGE,
        "onboardingUrl": onboarding_url,
        "adaptiveCard": card,
    }


def _build_assets_auth_failed_response(tenant_key: str, reason: str | None) -> dict[str, Any]:
    return {
        "tenantKey": tenant_key,
        "attachments": [],
        "alignmentReport": {
            "files": 0,
            "succeeded": 0,
            "failed": 0,
            "warnings": 0,
            "alignmentScore": 0,
            "items": [],
        },
        "error": "assets_auth_failed",
        "reason": reason,
        "message": ASSETS_AUTH_FAILED_MESSAGE,
        "adaptiveCard": {
            "type": "AdaptiveCard",
            "version": "1.5",
            "body": [
                {
                    "type": "TextBlock",
                    "text": "Configuration error",
                    "weight": "Bolder",
                    "wrap": True,
                },
                {
                    "type": "TextBlock",
                    "text": ASSETS_AUTH_FAILED_MESSAGE,
                    "wrap": True,
                },
            ],
        },
    }


async def handle_transpose_cvs(
    payload: Mapping[str, Any],
    *,
    llm: LlmProvider,
    assets_base_url: str | None = None,
    signer: RuntimeJwtIssuer | None = None,
    env: Mapping[str, str] | None = None,
    download_file=_download_file_bytes,
    run_transpose=run_copilot_transpose,
) -> dict[str, Any]:
    context = payload.get("context")
    identity = context.get("identity") if isinstance(context, Mapping) else None
    if not isinstance(identity, Mapping):
        raise RuntimeJwtIssuerError("Missing identity context for Copilot runtime")

    claims = dict(identity)
    files = _parse_input_files(payload.get("files", []), download_file=download_file)
    user_prompt = payload.get("userPrompt")
    if assets_base_url is None or signer is None:
        settings = load_runtime_settings(COPILOT_ENV_PREFIX, env or {})
        if assets_base_url is None:
            assets_base_url = settings.assets_base_url
        if signer is None:
            signer = settings.build_signer()
        onboarding_url = settings.onboarding_url
    else:
        onboarding_url = (env or {}).get(f"{COPILOT_ENV_PREFIX}_ONBOARDING_URL", "").strip() or None

    def make_bearer_token(tenant_key: str, token_claims: Mapping[str, Any]) -> str:
        return signer.mint_token(
            subject=_get_subject_from_claims(token_claims),
            tenant_key=tenant_key,
            issued_at=int(time.time()),
        )

    try:
        result = await run_transpose(
            claims=claims,
            files=files,
            llm=llm,
            assets_base_url=assets_base_url,
            make_bearer_token=make_bearer_token,
            user_prompt=str(user_prompt) if isinstance(user_prompt, str) and user_prompt.strip() else None,
        )
        return _encode_action_response(result)
    except TenantNotConfiguredError:
        tenant_key = derive_tenant_key_from_claims(
            "ms",
            {key: str(value) for key, value in claims.items() if value is not None},
        )
        return _build_tenant_not_configured_response(tenant_key, onboarding_url)
    except InvalidJwtError as exc:
        tenant_key = derive_tenant_key_from_claims(
            "ms",
            {key: str(value) for key, value in claims.items() if value is not None},
        )
        return _build_assets_auth_failed_response(tenant_key, exc.reason)


def handle_jwks_request(*, env: Mapping[str, str]) -> dict[str, object]:
    return load_runtime_settings(COPILOT_ENV_PREFIX, env).build_signer().jwks()
