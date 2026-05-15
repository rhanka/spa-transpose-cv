from __future__ import annotations

import base64
import json
from io import BytesIO
from zipfile import ZipFile

import pytest

from cv_transpose_marketplace.copilot import CopilotActionResult, CopilotAttachment
from cv_transpose_marketplace.jwt import RuntimeJwtIssuer
from cv_transpose_marketplace.assets import AssetsApiError, InvalidJwtError, TenantNotConfiguredError


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
            alignment_report={"files": 1, "succeeded": 1, "failed": 0, "warnings": 0, "alignmentScore": 100, "items": []},
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
    assert captured["assets_cache_ttl_seconds"] == 300
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
        "alignmentReport": {"files": 1, "succeeded": 1, "failed": 0, "warnings": 0, "alignmentScore": 100, "items": []},
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


def test_copilot_bundle_builder_is_deterministic_and_includes_runtime_assets(repo_root, tmp_path) -> None:
    from copilot import build_copilot_bundle, iter_copilot_bundle_paths

    bundle_path = tmp_path / "copilot-bundle.zip"
    first = build_copilot_bundle(repo_root, bundle_path)
    second = build_copilot_bundle(repo_root)

    assert first == second
    assert bundle_path.read_bytes() == first

    listed = [relative for _, relative in iter_copilot_bundle_paths(repo_root)]
    archive = ZipFile(BytesIO(first))
    names = archive.namelist()

    assert names == listed
    assert "pyproject.toml" in names
    assert "copilot/manifest.json" in names
    assert "copilot/actions/transposeCvs.json" in names
    assert "copilot/runtime.py" in names
    assert "cv_transpose_core/spec/prompts/extract-cv.md" in names
    assert "cv_transpose_marketplace/assets.py" in names
    assert not any("__pycache__" in name for name in names)
    assert not any(name.endswith(".pyc") for name in names)


@pytest.mark.asyncio
async def test_copilot_runtime_scaffold_loads_env_settings_when_not_passed(private_key_pem: str) -> None:
    from copilot.runtime import handle_transpose_cvs

    captured: dict[str, object] = {}

    async def fake_run_copilot_transpose(**kwargs):
        captured.update(kwargs)
        return CopilotActionResult(
            tenant_key="ms:123e4567-e89b-12d3-a456-426614174000",
            attachments=[],
            card={"type": "AdaptiveCard", "version": "1.5", "body": []},
            alignment_report={"files": 0, "succeeded": 0, "failed": 0, "warnings": 0, "alignmentScore": 0, "items": []},
            transpose_output=None,  # type: ignore[arg-type]
        )

    response = await handle_transpose_cvs(
        {
            "files": [],
            "context": {
                "identity": {
                    "tid": "123E4567-E89B-12D3-A456-426614174000",
                    "upn": "user@example.com",
                }
            },
        },
        llm=object(),
        env={
            "CVT_COPILOT_ASSETS_BASE_URL": "https://cv-api.sent-tech.ca",
            "CVT_COPILOT_JWT_ISSUER": "ms-copilot.cv-transpose.com",
            "CVT_COPILOT_JWT_KID": "copilot-key",
            "CVT_COPILOT_JWT_PRIVATE_KEY_PEM": private_key_pem,
        },
        run_transpose=fake_run_copilot_transpose,
    )

    assert captured["assets_base_url"] == "https://cv-api.sent-tech.ca"
    assert captured["assets_cache_ttl_seconds"] == 300
    assert isinstance(captured["make_bearer_token"]("ms:123e4567-e89b-12d3-a456-426614174000", {"upn": "user@example.com"}), str)
    assert response["tenantKey"] == "ms:123e4567-e89b-12d3-a456-426614174000"


@pytest.mark.asyncio
async def test_copilot_runtime_scaffold_maps_tenant_not_configured_error(private_key_pem: str) -> None:
    from copilot.runtime import handle_transpose_cvs

    async def fake_run_copilot_transpose(**kwargs):
        raise TenantNotConfiguredError('Tenant "ms:123e4567-e89b-12d3-a456-426614174000" is not configured')

    response = await handle_transpose_cvs(
        {
            "files": [],
            "context": {
                "identity": {
                    "tid": "123E4567-E89B-12D3-A456-426614174000",
                    "upn": "user@example.com",
                }
            },
        },
        llm=object(),
        env={
            "CVT_COPILOT_ASSETS_BASE_URL": "https://cv-api.sent-tech.ca",
            "CVT_COPILOT_JWT_ISSUER": "ms-copilot.cv-transpose.com",
            "CVT_COPILOT_JWT_KID": "copilot-key",
            "CVT_COPILOT_JWT_PRIVATE_KEY_PEM": private_key_pem,
            "CVT_COPILOT_ONBOARDING_URL": "https://admin.cv-transpose.com/onboard?source=ms",
        },
        run_transpose=fake_run_copilot_transpose,
    )

    assert response == {
        "tenantKey": "ms:123e4567-e89b-12d3-a456-426614174000",
        "attachments": [],
        "error": "tenant_not_configured",
        "message": "Votre entreprise n'a pas encore configure de template. Contactez votre admin.",
        "onboardingUrl": "https://admin.cv-transpose.com/onboard?source=ms",
        "adaptiveCard": response["adaptiveCard"],
    }
    assert response["adaptiveCard"]["body"][1]["text"] == "Votre entreprise n'a pas encore configure de template. Contactez votre admin."


@pytest.mark.asyncio
async def test_copilot_runtime_scaffold_maps_invalid_jwt_error(private_key_pem: str) -> None:
    from copilot.runtime import handle_transpose_cvs

    async def fake_run_copilot_transpose(**kwargs):
        raise InvalidJwtError(resource="manifest", reason="tk_mismatch")

    response = await handle_transpose_cvs(
        {
            "files": [],
            "context": {
                "identity": {
                    "tid": "123E4567-E89B-12D3-A456-426614174000",
                    "upn": "user@example.com",
                }
            },
        },
        llm=object(),
        env={
            "CVT_COPILOT_ASSETS_BASE_URL": "https://cv-api.sent-tech.ca",
            "CVT_COPILOT_JWT_ISSUER": "ms-copilot.cv-transpose.com",
            "CVT_COPILOT_JWT_KID": "copilot-key",
            "CVT_COPILOT_JWT_PRIVATE_KEY_PEM": private_key_pem,
        },
        run_transpose=fake_run_copilot_transpose,
    )

    assert response["tenantKey"] == "ms:123e4567-e89b-12d3-a456-426614174000"
    assert response["attachments"] == []
    assert response["error"] == "assets_auth_failed"
    assert response["reason"] == "tk_mismatch"


@pytest.mark.asyncio
async def test_copilot_runtime_scaffold_maps_assets_api_error(private_key_pem: str) -> None:
    from copilot.runtime import handle_transpose_cvs

    async def fake_run_copilot_transpose(**kwargs):
        raise AssetsApiError("Assets API returned 503 for manifest")

    response = await handle_transpose_cvs(
        {
            "files": [],
            "context": {
                "identity": {
                    "tid": "123E4567-E89B-12D3-A456-426614174000",
                    "upn": "user@example.com",
                }
            },
        },
        llm=object(),
        env={
            "CVT_COPILOT_ASSETS_BASE_URL": "https://cv-api.sent-tech.ca",
            "CVT_COPILOT_JWT_ISSUER": "ms-copilot.cv-transpose.com",
            "CVT_COPILOT_JWT_KID": "copilot-key",
            "CVT_COPILOT_JWT_PRIVATE_KEY_PEM": private_key_pem,
        },
        run_transpose=fake_run_copilot_transpose,
    )

    assert response["tenantKey"] == "ms:123e4567-e89b-12d3-a456-426614174000"
    assert response["attachments"] == []
    assert response["error"] == "assets_unavailable"
    assert response["message"] == "Configuration entreprise non joignable, reessayez plus tard."
