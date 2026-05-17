from __future__ import annotations

import inspect
from typing import Any


def make_user_content(text: str) -> Any:
    """Build a user message compatible with `google.adk.runners.Runner`."""
    try:
        from google.genai import types  # type: ignore[import-not-found]
    except ImportError as err:
        raise ImportError(
            "google-genai is required for make_user_content(). Install the optional extra: "
            "pip install cv-transpose-marketplace[gemini-adk]"
        ) from err

    return types.Content(role="user", parts=[types.Part(text=text)])


def make_local_runner(
    *,
    agent: Any,
    app_name: str = "cv-transpose-gemini",
    session_service: Any | None = None,
    auto_create_session: bool = True,
) -> Any:
    """Build a `google.adk.runners.Runner` for local invocation.

    Defaults to an `InMemorySessionService` (fresh per call), consistent
    with the `persistence="ephemeral"` semantics of the underlying
    Gemini wrapper. Requires the `gemini-adk` optional extra
    (`pip install cv-transpose-marketplace[gemini-adk]`).
    """
    try:
        from google.adk.runners import Runner  # type: ignore[import-not-found]
        from google.adk.sessions import InMemorySessionService  # type: ignore[import-not-found]
    except ImportError as err:
        raise ImportError(
            "google.adk is required for make_local_runner(). Install the optional extra: "
            "pip install cv-transpose-marketplace[gemini-adk]"
        ) from err

    if session_service is None:
        session_service = InMemorySessionService()

    runner_kwargs = {
        "app_name": app_name,
        "agent": agent,
        "session_service": session_service,
    }
    if "auto_create_session" in inspect.signature(Runner).parameters:
        runner_kwargs["auto_create_session"] = auto_create_session

    return Runner(**runner_kwargs)
