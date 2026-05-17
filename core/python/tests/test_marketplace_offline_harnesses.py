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


