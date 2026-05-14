from __future__ import annotations

import base64

import pytest


@pytest.mark.asyncio
async def test_copilot_local_harness_runs_offline() -> None:
    from copilot.local_harness import run_offline_harness

    response = await run_offline_harness()

    assert response["tenantKey"] == "ms:123e4567-e89b-12d3-a456-426614174000"
    assert len(response["attachments"]) == 1
    assert base64.b64decode(response["attachments"][0]["bytesBase64"])[:4] == b"PK\x03\x04"


@pytest.mark.asyncio
async def test_gemini_local_harness_runs_offline() -> None:
    from cv_transpose_marketplace.gemini_adk.__main__ import run_offline_demo

    response = await run_offline_demo()

    assert response["tenantKey"] == "gws:workspace.example"
    assert response["artifact"] is not None
    assert base64.b64decode(response["artifact"]["bytesBase64"])[:4] == b"PK\x03\x04"
