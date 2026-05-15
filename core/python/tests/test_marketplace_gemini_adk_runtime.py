from __future__ import annotations

import base64

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from cv_transpose_marketplace.assets import InvalidJwtError, TenantNotConfiguredError
from cv_transpose_marketplace.gemini_adk.types import GeminiToolResult
from cv_transpose_marketplace.types import OutputArtifact


@pytest.fixture
def private_key_pem() -> str:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")


@pytest.mark.asyncio
async def test_handle_gemini_request_loads_env_settings_and_mints_token(private_key_pem: str) -> None:
    from cv_transpose_marketplace.gemini_adk.runtime import handle_gemini_request

    captured: dict[str, object] = {}

    async def fake_transpose_tool(request, *, llm):
        captured["request"] = request
        return GeminiToolResult(
            tenant_key="gws:workspace.example",
            artifact=OutputArtifact(
                name="Candidate.docx",
                mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                bytes_=b"PK\x03\x04docx",
            ),
            report_card={"files": 1, "succeeded": 1, "failed": 0, "warnings": 0},
            results=[],
        )

    response = await handle_gemini_request(
        {
            "files": [
                {
                    "name": "candidate.pdf",
                    "contentType": "application/pdf",
                    "bytesBase64": base64.b64encode(b"pdf-bytes").decode("ascii"),
                }
            ],
            "context": {
                "identity": {
                    "hd": "workspace.example",
                    "email": "user@workspace.example",
                }
            },
            "userPrompt": "TARGET: Fabrikam",
        },
        llm=object(),
        env={
            "CVT_GEMINI_ASSETS_BASE_URL": "https://cv-api.sent-tech.ca",
            "CVT_GEMINI_JWT_ISSUER": "gemini-ent.runtime.sent-tech.ca",
            "CVT_GEMINI_JWT_KID": "gemini-key",
            "CVT_GEMINI_JWT_PRIVATE_KEY_PEM": private_key_pem,
        },
        transpose_tool=fake_transpose_tool,
    )

    request = captured["request"]
    assert request.claims == {"hd": "workspace.example", "email": "user@workspace.example"}
    assert request.assets_base_url == "https://cv-api.sent-tech.ca"
    assert isinstance(request.assets_bearer_token, str)
    assert request.user_prompt == "TARGET: Fabrikam"
    assert len(request.files) == 1
    assert request.files[0].bytes_ == b"pdf-bytes"
    assert response["tenantKey"] == "gws:workspace.example"
    assert response["artifact"]["name"] == "Candidate.docx"


@pytest.mark.asyncio
async def test_handle_gemini_request_maps_tenant_not_configured_error(private_key_pem: str) -> None:
    from cv_transpose_marketplace.gemini_adk.runtime import handle_gemini_request

    async def fake_transpose_tool(request, *, llm):
        raise TenantNotConfiguredError('Tenant "gws:workspace.example" is not configured')

    response = await handle_gemini_request(
        {
            "files": [],
            "context": {
                "identity": {
                    "hd": "workspace.example",
                    "email": "user@workspace.example",
                }
            },
        },
        llm=object(),
        env={
            "CVT_GEMINI_ASSETS_BASE_URL": "https://cv-api.sent-tech.ca",
            "CVT_GEMINI_JWT_ISSUER": "gemini-ent.runtime.sent-tech.ca",
            "CVT_GEMINI_JWT_KID": "gemini-key",
            "CVT_GEMINI_JWT_PRIVATE_KEY_PEM": private_key_pem,
            "CVT_GEMINI_ONBOARDING_URL": "https://admin.sent-tech.ca/onboard?source=gws",
        },
        transpose_tool=fake_transpose_tool,
    )

    assert response == {
        "tenantKey": "gws:workspace.example",
        "artifact": None,
        "reportCard": {"files": 0, "succeeded": 0, "failed": 0, "warnings": 0},
        "error": "tenant_not_configured",
        "message": "Votre entreprise n'a pas encore configure de template. Contactez votre admin.",
        "onboardingUrl": "https://admin.sent-tech.ca/onboard?source=gws",
    }


@pytest.mark.asyncio
async def test_handle_gemini_request_rejects_missing_primary_domain(private_key_pem: str) -> None:
    from cv_transpose_marketplace.gemini_adk.runtime import handle_gemini_request
    from cv_transpose_marketplace.identity import MarketplaceIdentityError

    with pytest.raises(MarketplaceIdentityError, match="primary domain"):
        await handle_gemini_request(
            {
                "files": [],
                "context": {
                    "identity": {
                        "email": "user@workspace.example",
                    }
                },
            },
            llm=object(),
            env={
                "CVT_GEMINI_ASSETS_BASE_URL": "https://cv-api.sent-tech.ca",
                "CVT_GEMINI_JWT_ISSUER": "gemini-ent.runtime.sent-tech.ca",
                "CVT_GEMINI_JWT_KID": "gemini-key",
                "CVT_GEMINI_JWT_PRIVATE_KEY_PEM": private_key_pem,
            },
        )


@pytest.mark.asyncio
async def test_handle_gemini_request_maps_invalid_jwt_error(private_key_pem: str) -> None:
    from cv_transpose_marketplace.gemini_adk.runtime import handle_gemini_request

    async def fake_transpose_tool(request, *, llm):
        raise InvalidJwtError(resource="brand", reason="iss")

    response = await handle_gemini_request(
        {
            "files": [],
            "context": {
                "identity": {
                    "hd": "workspace.example",
                    "email": "user@workspace.example",
                }
            },
        },
        llm=object(),
        env={
            "CVT_GEMINI_ASSETS_BASE_URL": "https://cv-api.sent-tech.ca",
            "CVT_GEMINI_JWT_ISSUER": "gemini-ent.runtime.sent-tech.ca",
            "CVT_GEMINI_JWT_KID": "gemini-key",
            "CVT_GEMINI_JWT_PRIVATE_KEY_PEM": private_key_pem,
        },
        transpose_tool=fake_transpose_tool,
    )

    assert response["tenantKey"] == "gws:workspace.example"
    assert response["artifact"] is None
    assert response["error"] == "assets_auth_failed"
    assert response["reason"] == "iss"
