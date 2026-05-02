"""Helpers for task-level PRD confirmation state."""

from __future__ import annotations

from typing import Final


PRD_STATUS_DRAFT: Final[str] = "draft"
PRD_STATUS_CONFIRMED: Final[str] = "confirmed"
PRD_STATUS_OVERRIDE: Final[str] = "override"
PRD_STATUS_VALUES: Final[tuple[str, str, str]] = (
    PRD_STATUS_DRAFT,
    PRD_STATUS_CONFIRMED,
    PRD_STATUS_OVERRIDE,
)


def ensure_task_meta(task: dict) -> dict:
    """Return ``task['meta']`` as a mutable dict, creating it when needed."""
    meta = task.get("meta")
    if isinstance(meta, dict):
        return meta
    meta = {}
    task["meta"] = meta
    return meta


def get_prd_status(task: dict) -> str:
    """Read ``meta.prd_status`` with a safe default.

    Missing / malformed values degrade to ``draft`` so implementation remains
    blocked until an explicit confirmation or override is recorded.
    """
    meta = task.get("meta")
    if not isinstance(meta, dict):
        status = task.get("status")
        if status in ("in_progress", "completed"):
            return PRD_STATUS_CONFIRMED
        return PRD_STATUS_DRAFT
    value = meta.get("prd_status")
    if value in PRD_STATUS_VALUES:
        return value
    status = task.get("status")
    if status in ("in_progress", "completed"):
        return PRD_STATUS_CONFIRMED
    return PRD_STATUS_DRAFT


def set_prd_status(task: dict, value: str) -> None:
    """Persist a validated PRD status into ``task['meta']``."""
    if value not in PRD_STATUS_VALUES:
        allowed = ", ".join(PRD_STATUS_VALUES)
        raise ValueError(f"Invalid prd_status '{value}'. Allowed values: {allowed}")
    meta = ensure_task_meta(task)
    meta["prd_status"] = value


def can_enter_implementation(task: dict) -> bool:
    """Whether a task may proceed into implementation."""
    return get_prd_status(task) in (PRD_STATUS_CONFIRMED, PRD_STATUS_OVERRIDE)
