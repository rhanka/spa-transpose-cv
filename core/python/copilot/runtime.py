from __future__ import annotations

import base64
import time
from typing import Any, Mapping, Sequence

from cv_transpose_core import InputFile, LlmProvider
from cv_transpose_marketplace.copilot import CopilotActionResult, run_copilot_transpose
from cv_transpose_marketplace.jwt import RuntimeJwtIssuer, RuntimeJwtIssuerError


def _parse_input_files(payload_files: Sequence[Mapping[str, Any]]) -> list[InputFile]:
    files: list[InputFile] = []
    for item in payload_files:
        files.append(
            InputFile(
                name=str(item["name"]),
                mime=str(item["contentType"]),
                bytes_=base64.b64decode(str(item["bytesBase64"])),
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
        "attachments": [
            {
                "name": attachment.name,
                "contentType": attachment.content_type,
                "bytesBase64": base64.b64encode(attachment.bytes_).decode("ascii"),
            }
            for attachment in result.attachments
        ],
    }


async def handle_transpose_cvs(
    payload: Mapping[str, Any],
    *,
    llm: LlmProvider,
    assets_base_url: str,
    signer: RuntimeJwtIssuer,
    run_transpose=run_copilot_transpose,
) -> dict[str, Any]:
    context = payload.get("context")
    identity = context.get("identity") if isinstance(context, Mapping) else None
    if not isinstance(identity, Mapping):
        raise RuntimeJwtIssuerError("Missing identity context for Copilot runtime")

    claims = dict(identity)
    files = _parse_input_files(payload.get("files", []))
    user_prompt = payload.get("userPrompt")

    def make_bearer_token(tenant_key: str, token_claims: Mapping[str, Any]) -> str:
        return signer.mint_token(
            subject=_get_subject_from_claims(token_claims),
            tenant_key=tenant_key,
            issued_at=int(time.time()),
        )

    result = await run_transpose(
        claims=claims,
        files=files,
        llm=llm,
        assets_base_url=assets_base_url,
        make_bearer_token=make_bearer_token,
        user_prompt=str(user_prompt) if isinstance(user_prompt, str) and user_prompt.strip() else None,
    )
    return _encode_action_response(result)
