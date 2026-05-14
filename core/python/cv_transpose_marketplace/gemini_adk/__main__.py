from __future__ import annotations

import asyncio
import base64
import json
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from cv_transpose_core import LlmCompleteResult
from cv_transpose_marketplace.gemini_adk.tool import transpose_cvs
from cv_transpose_marketplace.gemini_adk.types import GeminiToolFile, GeminiToolRequest
from cv_transpose_marketplace.jwt import RuntimeJwtIssuer


class FakeLlm:
    def __init__(self, profile: dict) -> None:
        self.profile = profile

    async def complete(self, **kwargs):
        return LlmCompleteResult(text=json.dumps(self.profile), usage={"inputTokens": 10, "outputTokens": 20})


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def _generate_private_key_pem() -> str:
    return rsa.generate_private_key(public_exponent=65537, key_size=2048).private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")


async def main() -> None:
    repo_root = _repo_root()
    expected_profile = json.loads(
        (repo_root / "core/fixtures/cv-001-junior-pm.expected-extraction.json").read_text()
    )
    signer = RuntimeJwtIssuer(
        issuer="gemini-ent.cv-transpose.com",
        kid="local-gemini-key",
        private_key_pem=_generate_private_key_pem(),
    )
    request = GeminiToolRequest(
        claims={"email": "user@workspace.example"},
        files=[
            GeminiToolFile(
                name="cv-001-junior-pm.pdf",
                mime="application/pdf",
                bytes_=(repo_root / "core/fixtures/cv-001-junior-pm.pdf").read_bytes(),
            )
        ],
        user_prompt=None,
        assets_base_url="https://cv-api.sent-tech.ca",
        assets_bearer_token=signer.mint_token(
            subject="user@workspace.example",
            tenant_key="gws:workspace.example",
            issued_at=1_715_708_800,
        ),
    )
    result = await transpose_cvs(request, llm=FakeLlm(expected_profile))
    payload = {
        "tenantKey": result.tenant_key,
        "artifact": None
        if result.artifact is None
        else {
            "name": result.artifact.name,
            "mime": result.artifact.mime,
            "bytesBase64": base64.b64encode(result.artifact.bytes_).decode("ascii"),
        },
        "reportCard": result.report_card,
    }
    print(json.dumps(payload, indent=2)[:1000])


if __name__ == "__main__":
    asyncio.run(main())
