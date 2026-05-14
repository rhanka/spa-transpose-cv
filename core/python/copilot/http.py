from __future__ import annotations

from typing import Any, Mapping

from cv_transpose_marketplace.http import HttpResponse, decode_json_body, json_response

from .runtime import handle_jwks_request, handle_transpose_cvs


async def handle_http_request(
    method: str,
    path: str,
    body: bytes,
    *,
    llm: Any,
    env: Mapping[str, str],
    run_transpose=None,
) -> HttpResponse:
    normalized_path = path.split("?", 1)[0]
    normalized_method = method.upper()

    if normalized_method == "GET" and normalized_path == "/.well-known/jwks.json":
        return json_response(200, handle_jwks_request(env=env))

    if normalized_method == "POST" and normalized_path == "/actions/transposeCvs":
        try:
            payload = decode_json_body(body)
        except ValueError:
            return json_response(400, {"error": "invalid_json"})

        kwargs = {"llm": llm, "env": env}
        if run_transpose is not None:
            kwargs["run_transpose"] = run_transpose
        return json_response(200, await handle_transpose_cvs(payload, **kwargs))

    return json_response(404, {"error": "not_found"})
