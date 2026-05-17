from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import traceback
from pathlib import Path
from typing import Any

from cv_transpose_core import LlmCompleteResult

from ..gemini import run_gemini_transpose
from ..validation import MarketplaceInputError
from .model_config import resolve_model_config
from .tool import encode_tool_result, transpose_cvs
from .types import GeminiToolFile, GeminiToolRequest


def _parse_file_spec(raw: str) -> tuple[str, str, Path]:
    parts = dict(item.split("=", 1) for item in raw.split(",") if "=" in item)
    if "name" not in parts or "mime" not in parts or "path" not in parts:
        raise MarketplaceInputError(
            "file_spec_invalid: --file expects name=<name>,mime=<mime>,path=<path>"
        )
    return parts["name"], parts["mime"], Path(parts["path"])


def _load_claims(path: Path) -> dict[str, str]:
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError as err:
        raise MarketplaceInputError(f"claims_file_unreadable: {path}: {err}") from err
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as err:
        raise MarketplaceInputError(f"claims_file_invalid_json: {err}") from err
    if not isinstance(data, dict):
        raise MarketplaceInputError("claims_file_invalid_json: claims file must be a JSON object")
    return {str(k): str(v) for k, v in data.items()}


def _split_error(err: MarketplaceInputError) -> tuple[str, str]:
    """Parse a 'code: detail' message into (code, detail).

    Falls back to ('marketplace_input_error', original_message) when the
    convention is not followed (legacy raises in the runtime that pre-date
    this convention).
    """
    message = str(err)
    head, sep, tail = message.partition(":")
    if not sep or " " in head:
        return ("marketplace_input_error", message)
    return (head.strip(), tail.strip())


class _StubLlm:
    """Minimal LLM stub: the CLI exercises tool routing only, not Gemini.

    The CLI does not drive the Agent/Runner path — that is the integration
    target's job. If `run_gemini_transpose` ever decides to call the LLM
    (which it does only when the upstream wrapper triggers a model call,
    not in the smoke path), this stub raises so the caller is alerted.
    """

    async def complete(self, **_: Any) -> LlmCompleteResult:
        raise MarketplaceInputError(
            "llm_not_configured: the CLI does not call Gemini directly; provide a custom run_fn "
            "or use the integration target."
        )


async def _run(args: argparse.Namespace) -> dict[str, Any]:
    claims = _load_claims(Path(args.claims_file))

    files: list[GeminiToolFile] = []
    for spec in args.file:
        name, mime, path = _parse_file_spec(spec)
        try:
            data = path.read_bytes()
        except OSError as err:
            raise MarketplaceInputError(f"file_path_unreadable: {path}: {err}") from err
        files.append(GeminiToolFile(name=name, mime=mime, bytes_=data))

    model_config = resolve_model_config(claims=claims, env=os.environ)

    request = GeminiToolRequest(
        claims=claims,
        files=files,
        user_prompt=args.user_prompt,
        assets_base_url=args.assets_base_url,
        assets_bearer_token=args.assets_bearer_token,
    )

    result = await transpose_cvs(
        request,
        llm=_StubLlm(),
        run_fn=run_gemini_transpose,
    )

    return {
        **encode_tool_result(result),
        "modelConfig": {
            "model": model_config.model,
            "endpointMode": model_config.endpoint_mode,
            "region": model_config.region,
            "projectId": model_config.project_id,
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(prog="gemini-adk", description="Run the Gemini ADK transpose tool once.")
    parser.add_argument("--claims-file", required=True)
    parser.add_argument("--file", action="append", required=True, help="name=<name>,mime=<mime>,path=<path>")
    parser.add_argument("--assets-base-url", required=True)
    parser.add_argument("--assets-bearer-token", required=True)
    parser.add_argument("--user-prompt", default=None)

    args = parser.parse_args()

    try:
        payload = asyncio.run(_run(args))
    except MarketplaceInputError as err:
        code, detail = _split_error(err)
        json.dump({"error": code, "detail": detail}, sys.stdout)
        sys.stdout.write("\n")
        return 2
    except Exception:  # noqa: BLE001
        traceback.print_exc()
        return 1

    json.dump(payload, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
