from __future__ import annotations

import sys
import types

import pytest


def test_make_local_runner_requires_gemini_adk_extra(monkeypatch) -> None:
    from cv_transpose_marketplace.gemini_adk.runner import make_local_runner

    monkeypatch.setitem(sys.modules, "google.adk.runners", None)
    monkeypatch.setitem(sys.modules, "google.adk.sessions", None)

    with pytest.raises(ImportError) as excinfo:
        make_local_runner(agent=object())

    assert "gemini-adk" in str(excinfo.value)


def test_make_local_runner_wires_agent_and_session(monkeypatch) -> None:
    captured: dict[str, object] = {}

    class FakeSessionService:
        def __init__(self) -> None:
            captured["session_service_created"] = True

    class FakeRunner:
        def __init__(self, *, app_name, agent, session_service, auto_create_session) -> None:
            captured["app_name"] = app_name
            captured["agent"] = agent
            captured["session_service"] = session_service
            captured["auto_create_session"] = auto_create_session

    runners_module = types.ModuleType("google.adk.runners")
    runners_module.Runner = FakeRunner  # type: ignore[attr-defined]
    sessions_module = types.ModuleType("google.adk.sessions")
    sessions_module.InMemorySessionService = FakeSessionService  # type: ignore[attr-defined]
    adk_module = types.ModuleType("google.adk")
    google_module = types.ModuleType("google")
    google_module.adk = adk_module  # type: ignore[attr-defined]

    monkeypatch.setitem(sys.modules, "google", google_module)
    monkeypatch.setitem(sys.modules, "google.adk", adk_module)
    monkeypatch.setitem(sys.modules, "google.adk.runners", runners_module)
    monkeypatch.setitem(sys.modules, "google.adk.sessions", sessions_module)

    from cv_transpose_marketplace.gemini_adk.runner import make_local_runner

    sentinel_agent = object()
    runner = make_local_runner(agent=sentinel_agent, app_name="custom")

    assert isinstance(runner, FakeRunner)
    assert captured["app_name"] == "custom"
    assert captured["agent"] is sentinel_agent
    assert captured["session_service_created"] is True
    assert captured["auto_create_session"] is True


def test_make_user_content_builds_google_genai_content(monkeypatch) -> None:
    captured: dict[str, object] = {}

    class FakePart:
        def __init__(self, *, text: str) -> None:
            captured["part_text"] = text
            self.text = text

    class FakeContent:
        def __init__(self, *, role: str, parts: list[FakePart]) -> None:
            captured["role"] = role
            captured["parts"] = parts

    genai_module = types.ModuleType("google.genai")
    genai_module.types = types.SimpleNamespace(  # type: ignore[attr-defined]
        Content=FakeContent,
        Part=FakePart,
    )
    google_module = types.ModuleType("google")
    google_module.genai = genai_module  # type: ignore[attr-defined]

    monkeypatch.setitem(sys.modules, "google", google_module)
    monkeypatch.setitem(sys.modules, "google.genai", genai_module)

    from cv_transpose_marketplace.gemini_adk.runner import make_user_content

    content = make_user_content("Transpose the attached CV.")

    assert isinstance(content, FakeContent)
    assert captured["role"] == "user"
    assert captured["part_text"] == "Transpose the attached CV."
    assert len(captured["parts"]) == 1
