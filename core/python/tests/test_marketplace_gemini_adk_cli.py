from __future__ import annotations

import io
import json
import sys
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

import pytest


@pytest.fixture
def fake_pdf(tmp_path: Path) -> Path:
    pdf_path = tmp_path / "cv.pdf"
    pdf_path.write_bytes(b"%PDF-1.4\n%fake\n")
    return pdf_path


@pytest.fixture
def claims_file(tmp_path: Path) -> Path:
    path = tmp_path / "claims.json"
    path.write_text(json.dumps({"hd": "example.com", "email": "user@example.com", "sub": "uid-1"}))
    return path


def test_cli_returns_zero_and_prints_result_json(monkeypatch, fake_pdf, claims_file) -> None:
    async def fake_run_fn(**kwargs):
        from cv_transpose_marketplace.types import MarketplaceRunResult

        return MarketplaceRunResult(
            tenant_key="gws:example.com",
            results=[],
            artifact=None,
        )

    monkeypatch.setattr(
        "cv_transpose_marketplace.gemini_adk.__main__.run_gemini_transpose",
        fake_run_fn,
    )

    from cv_transpose_marketplace.gemini_adk import __main__ as cli

    argv = [
        "gemini-adk",
        "--claims-file",
        str(claims_file),
        "--file",
        f"name=cv.pdf,mime=application/pdf,path={fake_pdf}",
        "--assets-base-url",
        "https://assets.local",
        "--assets-bearer-token",
        "fake-token",
    ]
    monkeypatch.setattr(sys, "argv", argv)

    out_buf = io.StringIO()
    with redirect_stdout(out_buf):
        exit_code = cli.main()

    assert exit_code == 0
    payload = json.loads(out_buf.getvalue())
    assert payload["tenantKey"] == "gws:example.com"


def test_cli_returns_two_on_marketplace_input_error(monkeypatch, fake_pdf) -> None:
    bad_claims = Path("/tmp/does-not-exist.json")  # noqa: S108
    from cv_transpose_marketplace.gemini_adk import __main__ as cli

    argv = [
        "gemini-adk",
        "--claims-file",
        str(bad_claims),
        "--file",
        f"name=cv.pdf,mime=application/pdf,path={fake_pdf}",
        "--assets-base-url",
        "https://assets.local",
        "--assets-bearer-token",
        "fake-token",
    ]
    monkeypatch.setattr(sys, "argv", argv)

    out_buf = io.StringIO()
    err_buf = io.StringIO()
    with redirect_stdout(out_buf), redirect_stderr(err_buf):
        exit_code = cli.main()

    assert exit_code == 2
    payload = json.loads(out_buf.getvalue())
    assert payload["error"] == "claims_file_unreadable"
