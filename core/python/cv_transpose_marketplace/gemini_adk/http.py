from __future__ import annotations

from typing import Any, Mapping

from cv_transpose_marketplace.http import (
    HttpResponse,
    decode_json_body,
    invalid_request_response,
    json_response,
)
from cv_transpose_marketplace.identity import MarketplaceIdentityError
from cv_transpose_marketplace.validation import MarketplaceInputError

from ..jwt import RuntimeJwtIssuerError
from .runtime import handle_gemini_request, handle_jwks_request


async def handle_http_request(
    method: str,
    path: str,
    body: bytes,
    *,
    llm: Any,
    env: Mapping[str, str],
    transpose_tool=None,
) -> HttpResponse:
    normalized_path = path.split("?", 1)[0]
    normalized_method = method.upper()

    if normalized_method == "GET" and normalized_path == "/.well-known/jwks.json":
        return json_response(200, handle_jwks_request(env=env))

    if normalized_method == "POST" and normalized_path == "/tools/transposeCvs":
        try:
            payload = decode_json_body(body)
        except ValueError:
            return json_response(400, {"error": "invalid_json"})

        kwargs = {"llm": llm, "env": env}
        if transpose_tool is not None:
            kwargs["transpose_tool"] = transpose_tool
        try:
            return json_response(200, await handle_gemini_request(payload, **kwargs))
        except (KeyError, MarketplaceIdentityError, MarketplaceInputError, RuntimeJwtIssuerError) as exc:
            return invalid_request_response(str(exc))

    return json_response(404, {"error": "not_found"})
