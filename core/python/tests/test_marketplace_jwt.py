from __future__ import annotations

import base64
import json

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from cv_transpose_marketplace.jwt import RuntimeJwtIssuer, RuntimeJwtIssuerError


def decode_base64url_json(value: str) -> dict:
    padding = "=" * (-len(value) % 4)
    return json.loads(base64.urlsafe_b64decode(f"{value}{padding}").decode("utf-8"))


@pytest.fixture
def private_key_pem() -> str:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")


def test_runtime_jwt_issuer_mints_rs256_token_with_required_claims(private_key_pem: str) -> None:
    issuer = RuntimeJwtIssuer(
        issuer="ms-copilot.cv-transpose.com",
        kid="copilot-test-key",
        private_key_pem=private_key_pem,
    )

    token = issuer.mint_token(
        subject="user@example.com",
        tenant_key="ms:123e4567-e89b-12d3-a456-426614174000",
        issued_at=1_715_708_800,
    )

    encoded_header, encoded_claims, encoded_signature = token.split(".")
    header = decode_base64url_json(encoded_header)
    claims = decode_base64url_json(encoded_claims)

    assert header == {
        "alg": "RS256",
        "kid": "copilot-test-key",
        "typ": "JWT",
    }
    assert claims == {
        "iss": "ms-copilot.cv-transpose.com",
        "sub": "user@example.com",
        "tk": "ms:123e4567-e89b-12d3-a456-426614174000",
        "iat": 1_715_708_800,
        "exp": 1_715_709_100,
    }
    assert encoded_signature


def test_runtime_jwt_issuer_exports_jwks_document(private_key_pem: str) -> None:
    issuer = RuntimeJwtIssuer(
        issuer="gemini-ent.cv-transpose.com",
        kid="gemini-test-key",
        private_key_pem=private_key_pem,
    )

    jwks = issuer.jwks()

    assert jwks["keys"] == [
        {
            "kty": "RSA",
            "use": "sig",
            "alg": "RS256",
            "kid": "gemini-test-key",
            "n": jwks["keys"][0]["n"],
            "e": "AQAB",
        }
    ]
    assert len(jwks["keys"][0]["n"]) > 100


def test_runtime_jwt_issuer_rejects_lifetime_over_contract(private_key_pem: str) -> None:
    with pytest.raises(RuntimeJwtIssuerError, match="300"):
        RuntimeJwtIssuer(
            issuer="web-direct.cv-transpose.com",
            kid="web-direct-key",
            private_key_pem=private_key_pem,
            token_ttl_seconds=301,
        )
