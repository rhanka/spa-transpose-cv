from __future__ import annotations

import json

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa


@pytest.fixture
def private_key_pem() -> str:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")


def test_copilot_runtime_exports_jwks_from_env(private_key_pem: str) -> None:
    from copilot.runtime import handle_jwks_request

    jwks = handle_jwks_request(
        env={
            "CVT_COPILOT_ASSETS_BASE_URL": "https://local.invalid",
            "CVT_COPILOT_JWT_ISSUER": "local-ms-copilot.invalid",
            "CVT_COPILOT_JWT_KID": "copilot-key",
            "CVT_COPILOT_JWT_PRIVATE_KEY_PEM": private_key_pem,
        }
    )

    assert jwks["keys"][0]["kid"] == "copilot-key"
    assert jwks["keys"][0]["alg"] == "RS256"
    assert jwks["keys"][0]["kty"] == "RSA"


def test_gemini_runtime_exports_jwks_from_env(private_key_pem: str) -> None:
    from cv_transpose_marketplace.gemini_adk.runtime import handle_jwks_request

    jwks = handle_jwks_request(
        env={
            "CVT_GEMINI_ASSETS_BASE_URL": "https://local.invalid",
            "CVT_GEMINI_JWT_ISSUER": "local-gemini.invalid",
            "CVT_GEMINI_JWT_KID": "gemini-key",
            "CVT_GEMINI_JWT_PRIVATE_KEY_PEM": private_key_pem,
        }
    )

    assert jwks["keys"][0]["kid"] == "gemini-key"
    assert jwks["keys"][0]["alg"] == "RS256"
    assert jwks["keys"][0]["kty"] == "RSA"


def test_runtime_contract_schema_files_are_wired(repo_root) -> None:
    copilot_request = json.loads(
        (repo_root / "core/python/copilot/schemas/transposeCvs.request.schema.json").read_text()
    )
    copilot_response = json.loads(
        (repo_root / "core/python/copilot/schemas/transposeCvs.response.schema.json").read_text()
    )
    gemini_request = json.loads(
        (repo_root / "core/python/cv_transpose_marketplace/gemini_adk/request.schema.json").read_text()
    )
    gemini_response = json.loads(
        (repo_root / "core/python/cv_transpose_marketplace/gemini_adk/response.schema.json").read_text()
    )

    assert copilot_request["required"] == ["files", "context"]
    assert "bytesBase64" in copilot_request["properties"]["files"]["items"]["required"]
    assert copilot_response["required"] == ["tenantKey", "adaptiveCard", "attachments"]
    assert gemini_request["required"] == ["files", "context"]
    assert "bytesBase64" in gemini_request["properties"]["files"]["items"]["required"]
    assert gemini_response["required"] == ["tenantKey", "artifact", "reportCard"]
