from __future__ import annotations

import base64

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from cv_transpose_marketplace.settings import RuntimeSettingsError, load_runtime_settings


@pytest.fixture
def private_key_pem() -> str:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")


def test_load_runtime_settings_supports_base64_private_key(private_key_pem: str) -> None:
    settings = load_runtime_settings(
        "CVT_COPILOT",
        {
            "CVT_COPILOT_ASSETS_BASE_URL": "https://cv-api.sent-tech.ca",
            "CVT_COPILOT_JWT_ISSUER": "ms-copilot.cv-transpose.com",
            "CVT_COPILOT_JWT_KID": "copilot-key",
            "CVT_COPILOT_JWT_PRIVATE_KEY_PEM_B64": base64.b64encode(private_key_pem.encode("utf-8")).decode("ascii"),
        },
    )

    assert settings.assets_base_url == "https://cv-api.sent-tech.ca"
    assert settings.jwt_issuer == "ms-copilot.cv-transpose.com"
    assert settings.jwt_kid == "copilot-key"
    assert settings.onboarding_url is None
    token = settings.build_signer().mint_token(
        subject="user@example.com",
        tenant_key="ms:123e4567-e89b-12d3-a456-426614174000",
        issued_at=1_715_708_800,
    )
    assert token.count(".") == 2


def test_load_runtime_settings_rejects_missing_required_env() -> None:
    with pytest.raises(RuntimeSettingsError, match="CVT_COPILOT_ASSETS_BASE_URL"):
        load_runtime_settings("CVT_COPILOT", {})
