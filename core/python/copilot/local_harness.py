from __future__ import annotations

import asyncio
import base64
import json
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from cv_transpose_core import LlmCompleteResult
from cv_transpose_marketplace.jwt import RuntimeJwtIssuer

from .runtime import handle_transpose_cvs


class FakeLlm:
    def __init__(self, profile: dict) -> None:
        self.profile = profile

    async def complete(self, **kwargs):
        return LlmCompleteResult(text=json.dumps(self.profile), usage={"inputTokens": 10, "outputTokens": 20})


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _generate_private_key_pem() -> str:
    return rsa.generate_private_key(public_exponent=65537, key_size=2048).private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")


async def main() -> None:
    repo_root = _repo_root()
    payload = {
        "files": [
            {
                "name": "cv-001-junior-pm.pdf",
                "contentType": "application/pdf",
                "bytesBase64": base64.b64encode(
                    (repo_root / "core/fixtures/cv-001-junior-pm.pdf").read_bytes()
                ).decode("ascii"),
            }
        ],
        "context": {
            "identity": {
                "tid": "123e4567-e89b-12d3-a456-426614174000",
                "upn": "user@example.com",
            }
        },
    }
    expected_profile = json.loads(
        (repo_root / "core/fixtures/cv-001-junior-pm.expected-extraction.json").read_text()
    )
    signer = RuntimeJwtIssuer(
        issuer="ms-copilot.cv-transpose.com",
        kid="local-harness-key",
        private_key_pem=_generate_private_key_pem(),
    )
    response = await handle_transpose_cvs(
        payload,
        llm=FakeLlm(expected_profile),
        assets_base_url="https://cv-api.sent-tech.ca",
        signer=signer,
    )
    print(json.dumps(response, indent=2)[:1000])


if __name__ == "__main__":
    asyncio.run(main())
