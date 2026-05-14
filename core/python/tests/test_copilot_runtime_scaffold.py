from __future__ import annotations

import base64
import json

import pytest

from cv_transpose_marketplace.copilot import CopilotActionResult, CopilotAttachment
from cv_transpose_marketplace.jwt import RuntimeJwtIssuer


@pytest.fixture
def private_key_pem() -> str:
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")


@pytest.mark.asyncio
async def test_copilot_runtime_scaffold_maps_payload_and_encodes_response(private_key_pem: str) -> None:
    from copilot.runtime import handle_transpose_cvs

    captured: dict[str, object] = {}

    async def fake_run_copilot_transpose(**kwargs):
        captured.update(kwargs)
        token = kwargs["make_bearer_token"]("ms:123e4567-e89b-12d3-a456-426614174000", kwargs["claims"])
        captured["token"] = token
        return CopilotActionResult(
            tenant_key="ms:123e4567-e89b-12d3-a456-426614174000",
            attachments=[
                CopilotAttachment(
                    name="result.docx",
                    content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    bytes_=b"PK\x03\x04docx",
                )
            ],
            card={"type": "AdaptiveCard", "version": "1.5", "body": []},
            transpose_output=None,  # type: ignore[arg-type]
        )

    response = await handle_transpose_cvs(
        {
            "files": [
                {
                    "name": "candidate.pdf",
                    "contentType": "application/pdf",
                    "bytesBase64": base64.b64encode(b"pdf-bytes").decode("ascii"),
                }
            ],
            "userPrompt": "TARGET: Contoso",
            "context": {
                "identity": {
                    "tid": "123E4567-E89B-12D3-A456-426614174000",
                    "upn": "user@example.com",
                }
            },
        },
        llm=object(),
        assets_base_url="https://cv-api.sent-tech.ca",
        signer=RuntimeJwtIssuer(
            issuer="ms-copilot.cv-transpose.com",
            kid="copilot-key",
            private_key_pem=private_key_pem,
        ),
        run_transpose=fake_run_copilot_transpose,
    )

    assert captured["assets_base_url"] == "https://cv-api.sent-tech.ca"
    assert captured["user_prompt"] == "TARGET: Contoso"
    files = captured["files"]
    assert len(files) == 1
    assert files[0].name == "candidate.pdf"
    assert files[0].mime == "application/pdf"
    assert files[0].bytes_ == b"pdf-bytes"
    assert isinstance(captured["token"], str)
    assert response == {
        "tenantKey": "ms:123e4567-e89b-12d3-a456-426614174000",
        "adaptiveCard": {"type": "AdaptiveCard", "version": "1.5", "body": []},
        "attachments": [
            {
                "name": "result.docx",
                "contentType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "bytesBase64": base64.b64encode(b"PK\x03\x04docx").decode("ascii"),
            }
        ],
    }


def test_copilot_scaffold_artifacts_are_wired(repo_root) -> None:
    manifest = json.loads((repo_root / "core/python/copilot/manifest.json").read_text())
    action = json.loads((repo_root / "core/python/copilot/actions/transposeCvs.json").read_text())
    instructions = (repo_root / "core/python/copilot/instructions.md").read_text()

    assert manifest["name"] == "CV Transpose"
    assert manifest["actions"] == ["transposeCvs"]
    assert action["name"] == "transposeCvs"
    assert action["entrypoint"] == "runtime.handle_transpose_cvs"
    assert "tenant not configured" in instructions.lower()
