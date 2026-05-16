from __future__ import annotations

import os
from pathlib import Path

import pytest

pytestmark = pytest.mark.integration


def _gemini_available() -> bool:
    return bool(os.environ.get("GOOGLE_API_KEY")) or bool(
        os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    )


@pytest.mark.asyncio
@pytest.mark.skipif(not _gemini_available(), reason="GOOGLE_API_KEY / ADC not set")
async def test_agent_invokes_transpose_cvs_once_with_real_gemini(monkeypatch, tmp_path: Path) -> None:
    pytest.importorskip("google.adk")

    from cv_transpose_core import LlmCompleteResult
    from cv_transpose_marketplace.types import MarketplaceRunResult
    from cv_transpose_marketplace.gemini_adk import (
        ModelConfig,
        build_root_agent,
        resolve_model_config,
    )
    from cv_transpose_marketplace.gemini_adk.runner import make_local_runner

    fake_pdf = tmp_path / "cv.pdf"
    fake_pdf.write_bytes(b"%PDF-1.4\n%minimal\n")

    invocations: list[dict] = []

    async def fake_run_fn(**kwargs):
        invocations.append(kwargs)
        return MarketplaceRunResult(
            tenant_key="gws:test.example",
            results=[],
            artifact=None,
        )

    class FakeLlm:
        async def complete(self, **_):  # pragma: no cover
            return LlmCompleteResult(text="{}", usage={"inputTokens": 0, "outputTokens": 0})

    config = resolve_model_config(claims={"hd": "test.example"}, env=os.environ)

    agent = build_root_agent(
        claims={"hd": "test.example", "sub": "smoke@test.example"},
        llm=FakeLlm(),
        assets_base_url="https://assets.invalid",
        assets_bearer_token="t",
        model_config=config,
        run_fn=fake_run_fn,
    )

    runner = make_local_runner(agent=agent)

    user_message = "Transpose the attached CV."
    invoke = getattr(runner, "run_async", None) or getattr(runner, "run")
    async for _event in invoke(  # type: ignore[func-returns-value]
        user_id="smoke",
        session_id="smoke-session",
        new_message=user_message,
    ):
        pass

    assert len(invocations) == 1
