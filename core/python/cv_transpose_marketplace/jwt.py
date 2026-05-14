from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from typing import Any

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa


def _base64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _encode_int(value: int) -> str:
    byte_length = max(1, (value.bit_length() + 7) // 8)
    return _base64url_encode(value.to_bytes(byte_length, "big"))


class RuntimeJwtIssuerError(ValueError):
    pass


@dataclass(frozen=True)
class RuntimeJwtIssuer:
    issuer: str
    kid: str
    private_key_pem: str | bytes
    token_ttl_seconds: int = 300

    def __post_init__(self) -> None:
        normalized_issuer = self.issuer.strip().lower()
        normalized_kid = self.kid.strip()
        if not normalized_issuer:
            raise RuntimeJwtIssuerError("issuer is required")
        if not normalized_kid:
            raise RuntimeJwtIssuerError("kid is required")
        if self.token_ttl_seconds <= 0 or self.token_ttl_seconds > 300:
            raise RuntimeJwtIssuerError("token_ttl_seconds must be between 1 and 300")

        pem_bytes = (
            self.private_key_pem.encode("utf-8")
            if isinstance(self.private_key_pem, str)
            else self.private_key_pem
        )
        private_key = serialization.load_pem_private_key(pem_bytes, password=None)
        if not isinstance(private_key, rsa.RSAPrivateKey):
            raise RuntimeJwtIssuerError("private key must be RSA")

        object.__setattr__(self, "issuer", normalized_issuer)
        object.__setattr__(self, "kid", normalized_kid)
        object.__setattr__(self, "_private_key", private_key)
        object.__setattr__(self, "_public_jwk", self._build_public_jwk(private_key.public_key()))

    @staticmethod
    def _build_public_jwk(public_key: rsa.RSAPublicKey) -> dict[str, str]:
        public_numbers = public_key.public_numbers()
        return {
            "kty": "RSA",
            "use": "sig",
            "alg": "RS256",
            "kid": "",
            "n": _encode_int(public_numbers.n),
            "e": _encode_int(public_numbers.e),
        }

    def mint_token(
        self,
        *,
        subject: str,
        tenant_key: str,
        issued_at: int,
        additional_claims: dict[str, Any] | None = None,
    ) -> str:
        normalized_subject = subject.strip()
        normalized_tenant_key = tenant_key.strip().lower()
        if not normalized_subject:
            raise RuntimeJwtIssuerError("subject is required")
        if not normalized_tenant_key:
            raise RuntimeJwtIssuerError("tenant_key is required")

        header = {
            "alg": "RS256",
            "kid": self.kid,
            "typ": "JWT",
        }
        claims: dict[str, Any] = {
            "iss": self.issuer,
            "sub": normalized_subject,
            "tk": normalized_tenant_key,
            "iat": issued_at,
            "exp": issued_at + self.token_ttl_seconds,
        }
        if additional_claims:
            claims.update(additional_claims)

        encoded_header = _base64url_encode(
            json.dumps(header, separators=(",", ":"), sort_keys=True).encode("utf-8")
        )
        encoded_claims = _base64url_encode(
            json.dumps(claims, separators=(",", ":"), sort_keys=True).encode("utf-8")
        )
        signing_input = f"{encoded_header}.{encoded_claims}".encode("ascii")
        signature = self._private_key.sign(signing_input, padding.PKCS1v15(), hashes.SHA256())
        return f"{encoded_header}.{encoded_claims}.{_base64url_encode(signature)}"

    def jwks(self) -> dict[str, list[dict[str, str]]]:
        public_jwk = {**self._public_jwk, "kid": self.kid}
        return {"keys": [public_jwk]}
