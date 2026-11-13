"""
Core type definitions for Trellis task data.

Provides:
    TaskData     — TypedDict for task.json shape (read-path type hints only)
    TaskInfo     — Frozen dataclass for loaded task (the public API type)
    AgentRecord  — TypedDict for registry.json agent entries
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import TypedDict


# =============================================================================
# task.json shape (TypedDict — used only for read-path type hints)
# =============================================================================

class TaskData(TypedDict, total=False):
    """Legacy task.json shape during the explicit D1 compatibility window.

    Used only for type annotations when reading task.json.
    Writes use the validated original dict to preserve current task metadata.
    """

    id: str
    name: str
    title: str
    description: str
    status: str
    dev_type: str
    scope: str | None
    package: str | None
    priority: str
    createdAt: str
    completedAt: str | None
    branch: str | None
    base_branch: str | None
    worktree_path: str | None
    commit: str | None
    pr_url: str | None
    children: list[str]
    parent: str | None
    relatedFiles: list[str]
    notes: str
    meta: dict


# =============================================================================
# Loaded task object (frozen dataclass — the public API type)
# =============================================================================

@dataclass(frozen=True)
class DeliveryInventory:
    """One recorded slice; inventory never selects it for execution."""

    id: str
    lifecycle_generation: int
    profile: str
    phase: str
    delivery_result_id: str | None
    stop_result_id: str | None


@dataclass(frozen=True)
class TaskLifecycleInventory:
    """Task acceptance and independent slices, without a development status."""

    lifecycle_generation: int
    accepted_scope: dict | None
    completion_result_id: str | None
    deliveries: tuple[DeliveryInventory, ...]

    @property
    def current_deliveries(self) -> tuple[DeliveryInventory, ...]:
        return tuple(d for d in self.deliveries if d.lifecycle_generation == self.lifecycle_generation)

    def summary(self) -> dict:
        return {
            "schema_version": "2.0",
            "lifecycle_generation": self.lifecycle_generation,
            "accepted_scope": self.accepted_scope,
            "completion_result_id": self.completion_result_id,
            "delivery_count": len(self.deliveries),
            "deliveries": [
                {"id": d.id, "lifecycle_generation": d.lifecycle_generation,
                 "profile": d.profile, "phase": d.phase,
                 "delivery_result_id": d.delivery_result_id, "stop_result_id": d.stop_result_id}
                for d in self.deliveries
            ],
        }

    def label(self) -> str:
        scope = "accepted" if self.accepted_scope is not None else "unaccepted"
        completion = self.completion_result_id or "none"
        slices = ", ".join(f"{d.id}:{d.phase}" for d in self.current_deliveries) or "none"
        return f"scope={scope}; completion={completion}; deliveries={slices}"


@dataclass(frozen=True)
class TaskInfo:
    """Immutable view of a loaded task.

    Created by load_task() / iter_active_tasks().
    Contains the commonly accessed fields; the original dict
    is preserved in `raw` for write-back and uncommon field access.
    """

    dir_name: str
    directory: Path
    title: str
    status: str | None  # Legacy only; schema-2 has no Task development status.
    priority: str
    children: tuple[str, ...]
    parent: str | None
    package: str | None
    raw: dict  # original dict — use for writes and uncommon fields
    inventory: TaskLifecycleInventory | None = None
    history_only: bool = False  # Legacy records under a schema-2 workflow.

    @property
    def name(self) -> str:
        """Task name (id or name field)."""
        return self.raw.get("name") or self.raw.get("id") or self.dir_name

    @property
    def description(self) -> str:
        return self.raw.get("description", "")

    @property
    def branch(self) -> str | None:
        return self.raw.get("branch")

    @property
    def meta(self) -> dict:
        return self.raw.get("meta", {})


# =============================================================================
# registry.json agent entry
# =============================================================================

class AgentRecord(TypedDict, total=False):
    """Shape of an agent entry in registry.json."""

    id: str
    pid: int
    task_dir: str
    worktree_path: str
    branch: str
    platform: str
    started_at: str
    status: str
