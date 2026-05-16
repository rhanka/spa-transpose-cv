from __future__ import annotations

from typing import Any


def make_local_runner(
    *,
    agent: Any,
    app_name: str = "cv-transpose-gemini",
    session_service: Any | None = None,
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

    return Runner(app_name=app_name, agent=agent, session_service=session_service)
