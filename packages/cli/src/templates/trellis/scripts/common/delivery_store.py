"""Contained atomic Delivery operations and objective candidate/fact verification."""
from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

from .delivery_operations import apply_operation, parse_operation
from .delivery_schema import DeliveryError, candidate, fail, parse_task_v2, relative_path
from .delivery_session import apply_release_plan, plan_release_delivery, release_delivery
from .io import read_json_checked, write_text_atomic
from .git_objects import CHUNK_SIZE, TreeEntry, hash_blob, read_blob_facts, read_tree, selected_path_commands, verify_blob_objects
from .path_boundary import require_project_path
from .runtime_contract import read_runtime_contract
from .task_artifacts import TaskArtifactContext, artifact_context, authority_locator, canonical_operation, relocate_task_directory


def _digest(value: bytes) -> str:
    return "sha256:" + hashlib.sha256(value).hexdigest()


def _serialize_entries(entries: list) -> str:
    return json.dumps(entries, ensure_ascii=False, separators=(",", ":"))


@dataclass
class _ContentObservation:
    """Private to one normal local-commit operation, never a validation pass."""
    algorithm: str
    hashes: dict[str, str] = field(default_factory=dict)
    aggregates: dict[str, str] = field(default_factory=dict)

    def file_hash(self, path: Path) -> str:
        # Observe every mutable file independently. Spool the very same bytes
        # used for raw Git identity, so reuse never trusts a path/index lookup
        # or a second filesystem read. Only the first unique blob needs SHA256.
        with path.open("rb") as source, tempfile.SpooledTemporaryFile(max_size=1024 * 1024) as snapshot:
            size = os.fstat(source.fileno()).st_size
            raw = hashlib.new(self.algorithm)
            raw.update(f"blob {size}\0".encode("ascii"))
            observed = 0
            while True:
                chunk = source.read(CHUNK_SIZE)
                if not chunk:
                    break
                observed += len(chunk)
                raw.update(chunk)
                snapshot.write(chunk)
            if observed != size:
                raw = hashlib.new(self.algorithm)
                raw.update(f"blob {observed}\0".encode("ascii"))
                snapshot.seek(0)
                while True:
                    chunk = snapshot.read(CHUNK_SIZE)
                    if not chunk:
                        break
                    raw.update(chunk)
            oid = raw.hexdigest()
            if oid not in self.hashes:
                snapshot.seek(0)
                self.hashes[oid] = hash_blob(snapshot, observed)
            return self.hashes[oid]

    def content_ref(self, entries: list) -> str:
        serialized = _serialize_entries(entries)
        if serialized not in self.aggregates:
            self.aggregates[serialized] = _digest(serialized.encode("utf-8"))
        return self.aggregates[serialized]


def _checked_path(path: Path, root: Path) -> Path:
    """Preserve known Task-store aliases; reject nested artifact symlinks."""
    require_project_path(path, root)
    try:
        parts = path.relative_to(root).parts
    except ValueError:
        fail("invalid_locator", str(path))
    current = root
    for index, part in enumerate(parts):
        current = current / part
        allowed_store_alias = (parts[:index + 1] in ((".trellis",), (".trellis", "tasks"))
                               or (index == 2 and parts[:2] == (".trellis", "tasks") and part != "archive"))
        if current.is_symlink() and not allowed_store_alias:
            fail("invalid_locator", f"nested symlink: {current}")
        if current.is_symlink() and allowed_store_alias and not current.is_dir():
            fail("invalid_locator", f"invalid Task-store alias: {current}")
    return path


def _reserved(locator: str) -> bool:
    return (locator == ".git" or locator.startswith(".git/")
            or re.search(r"(?:^|/)trellis/sessions(?:/|$)", locator) is not None
            or re.match(r"\.trellis/(?:sessions|\.runtime|\.internal|\.delivery-results)(?:/|$)", locator) is not None
            or re.fullmatch(r"\.trellis/tasks/(?:archive/[^/]+/)?[^/]+/task\.json", locator) is not None)


def _file(root: Path, locator: str) -> Path:
    relative_path(locator)
    path = _checked_path(root / locator, root)
    if not path.is_file():
        fail("missing_locator", locator)
    return path


def candidate_content_ref(root: Path, paths: list[str], kind: str | None = None) -> str:
    """Hash Git executable modes or full Git-free permissions, paths and bytes."""
    return _candidate_content_ref(root, paths, kind)


class GitCandidateContent:
    """Digest exact Git commits within one actual-repository operation.

    Reuse only immutable content facts. Each call checks its paths, commit and
    object availability independently. Callers retain their expected-digest
    comparisons. Use a new context when historical preparation changes roots;
    no_lazy_fetch=True leaves missing-history recovery to that preparation owner.
    Ordinary candidate_content_ref Path inputs remain mutable observations.
    """

    def __init__(self, root: Path, *, no_lazy_fetch: bool = False) -> None:
        self._root = root.resolve()
        self._env = {k: v for k, v in os.environ.items() if not k.upper().startswith("GIT_")}
        # Keep unsupported-option diagnostics stable for the old-Git fallback.
        self._env["LC_ALL"] = "C"
        if no_lazy_fetch:
            self._env["GIT_NO_LAZY_FETCH"] = "1"
        self._hashes: dict[str, str] = {}
        self._aggregates: dict[str, str] = {}
        self._closed = False

    def __enter__(self) -> GitCandidateContent:
        self._require_open()
        return self

    def __exit__(self, *_exception: object) -> None:
        self.close()

    def close(self) -> None:
        """Discard operation-local facts; a closed context cannot be reused."""
        self._hashes.clear()
        self._aggregates.clear()
        self._closed = True

    def _require_open(self) -> None:
        if self._closed:
            fail("invalid_git_fact", "Git candidate content context is closed")

    def content_ref(self, exact_commit: str, paths: list[str]) -> str:
        """Hash literal selected paths at a full actual commit OID, including deletions."""
        self._require_open()
        if not paths or len(set(paths)) != len(paths):
            fail("invalid_candidate", "nonempty unique paths required")
        ordered = sorted(paths)
        for locator in ordered:
            relative_path(locator)
            if _reserved(locator):
                fail("invalid_candidate", f"lifecycle/private file {locator}")
        if not re.fullmatch(r"(?:[0-9a-f]{40}|[0-9a-f]{64})", exact_commit):
            fail("invalid_git_fact", "candidate must name a full actual commit object OID")
        try:
            tree = read_tree(self._root, exact_commit, paths=ordered, env=self._env)
            pending = []
            reused = []
            for locator in ordered:
                entry = tree.get(locator)
                if entry is None:
                    continue
                if entry.mode == "160000" and entry.kind == "commit":
                    continue
                if entry.kind != "blob" or entry.mode not in ("100644", "100755"):
                    fail("invalid_git_fact", locator)
                (reused if entry.oid in self._hashes else pending).append(entry.oid)
            # Larger finite batches amortize process startup for broad historical
            # candidates; bodies still stream through regular temporary files.
            # The first batch also checks exact commit identity/type. A tag or
            # SHA-256 prefix cannot match that returned full commit header.
            if pending:
                self._hashes.update(read_blob_facts(
                    self._root, pending, hash_blob, batch_size=4096,
                    exact_commit=exact_commit, env=self._env))
                verify_blob_objects(self._root, reused, batch_size=4096, env=self._env)
            else:
                verify_blob_objects(self._root, reused, batch_size=4096,
                                    exact_commit=exact_commit, env=self._env)
        except (OSError, subprocess.SubprocessError, ValueError) as exc:
            if isinstance(exc, DeliveryError):
                raise
            fail("invalid_git_fact", str(exc))
        entries = []
        for locator in ordered:
            entry = tree.get(locator)
            entries.append(_tree_content_entry(locator, entry, self._hashes))
        serialized = _serialize_entries(entries)
        if serialized not in self._aggregates:
            self._aggregates[serialized] = _digest(serialized.encode("utf-8"))
        return self._aggregates[serialized]


def _tree_content_entry(locator: str, entry: TreeEntry | None, hashes: dict[str, str]) -> list:
    if entry is None:
        return [locator, None, None]
    if entry.mode == "160000" and entry.kind == "commit":
        return [locator, 0o160000, entry.oid]
    return [locator, 0o755 if entry.mode == "100755" else 0o644, hashes[entry.oid]]


def _candidate_gitlinks(root: Path, paths: list[str]) -> dict[str, str | None]:
    """Observe only parent index/tree metadata, never a submodule checkout.

    None marks a staged deletion of a HEAD gitlink. Regular index entries keep
    the public candidate's ordinary mutable-workspace behavior.
    """
    env = {k: v for k, v in os.environ.items() if not k.upper().startswith("GIT_")}
    env["LC_ALL"] = "C"
    try:
        probe = subprocess.run(["git", "-C", str(root), "rev-parse", "--is-inside-work-tree"],
                               capture_output=True, timeout=20, env=env)
        if probe.returncode:
            if b"not a git repository" in probe.stderr:
                return {}  # Explicit Git-mode regular files also work outside Git.
            fail("invalid_git_fact", "cannot detect parent repository")
        if probe.stdout.strip() != b"true":
            return {}
        selected = set(paths)
        indexed = set()
        links: dict[str, str | None] = {}
        args = ["git", "--literal-pathspecs", "-C", str(root), "ls-files", "--stage", "-z", "--"]
        for command in selected_path_commands(args, paths):
            output = subprocess.run(command, capture_output=True, check=True, timeout=20, env=env).stdout
            for row in output.split(b"\0"):
                if not row:
                    continue
                header, name = row.split(b"\t", 1)
                locator = name.decode("utf-8", errors="surrogateescape")
                if locator not in selected:
                    continue
                mode, oid, stage = header.decode("ascii").split(" ")
                if stage != "0":
                    fail("invalid_candidate", f"unmerged index entry: {locator}")
                indexed.add(locator)
                if mode == "160000":
                    links[locator] = oid
        missing = selected - indexed
        if missing:
            head = subprocess.run(["git", "-C", str(root), "rev-parse", "--verify", "--quiet", "HEAD"],
                                  capture_output=True, timeout=20, env=env)
            if head.returncode == 0:
                for locator, entry in read_tree(root, head.stdout.strip().decode("ascii"), paths=sorted(missing), env=env).items():
                    if locator in missing and entry.mode == "160000" and entry.kind == "commit":
                        links[locator] = None
            elif head.returncode != 1:
                fail("invalid_git_fact", "cannot read parent HEAD")
        return links
    except FileNotFoundError:
        return {}  # Explicit Git-mode regular files do not require Git installed.
    except (OSError, subprocess.SubprocessError, ValueError) as exc:
        if isinstance(exc, DeliveryError):
            raise
        fail("invalid_git_fact", str(exc))


def _candidate_content_ref(root: Path, paths: list[str], kind: str | None = None,
                           observation: _ContentObservation | None = None) -> str:
    if not paths or len(set(paths)) != len(paths):
        fail("invalid_candidate", "nonempty unique paths required")
    if kind is None:
        try:
            kind = "git" if _git(root, "rev-parse", "--is-inside-work-tree") == b"true" else "git_free"
        except DeliveryError:
            kind = "git_free"
    if kind not in ("git", "git_free"):
        fail("invalid_candidate", "kind must be git or git_free")
    for locator in paths:
        relative_path(locator)
        if _reserved(locator):
            fail("invalid_candidate", f"lifecycle/private file {locator}")
    links = _candidate_gitlinks(root, paths) if kind == "git" else {}
    entries = []
    for locator in sorted(paths):
        if locator in links:
            oid = links[locator]
            entries.append([locator, None, None] if oid is None else [locator, 0o160000, oid])
            continue
        path = _checked_path(root / locator, root)
        if not path.exists():
            entries.append([locator, None, None])
        elif path.is_file():
            mode = path.stat().st_mode
            mode = (0o755 if mode & 0o100 else 0o644) if kind == "git" else mode & 0o777
            if observation is None:
                with path.open("rb") as stream:
                    digest = hashlib.sha256()
                    for chunk in iter(lambda: stream.read(CHUNK_SIZE), b""):
                        digest.update(chunk)
                    content_hash = digest.hexdigest()
            else:
                content_hash = observation.file_hash(path)
            entries.append([locator, mode, content_hash])
        else:
            fail("invalid_candidate", f"not a file: {locator}")
    return (observation.content_ref(entries) if observation is not None
            else _digest(_serialize_entries(entries).encode("utf-8")))


def _git(root: Path, *args: str, binary: bool = False) -> bytes:
    env = {k: v for k, v in os.environ.items() if not k.upper().startswith("GIT_")}
    try:
        result = subprocess.run(["git", "-C", str(root), *args], capture_output=True, timeout=20, env=env)
    except (OSError, subprocess.TimeoutExpired) as exc:
        fail("invalid_git_fact", str(exc))
    if result.returncode:
        fail("invalid_git_fact", " ".join(args))
    return result.stdout if binary else result.stdout.strip()


def verify_candidate(root: Path, value: dict) -> None:
    _verify_candidate(root, value)


def _verify_candidate(root: Path, value: dict, observation: _ContentObservation | None = None) -> None:
    candidate(value)
    if _candidate_content_ref(root, value["paths"], value["kind"], observation) != value["content_ref"]:
        fail("candidate_mismatch", "content bytes/modes changed")
    if value["kind"] == "git":
        if value["head_ref"] is not None and _git(root, "rev-parse", "HEAD").decode() != value["head_ref"]:
            fail("candidate_mismatch", "HEAD changed")
        if value["base_ref"] is not None and _git(root, "rev-parse", "--verify", value["base_ref"] + "^{commit}").decode() != value["base_ref"]:
            fail("candidate_mismatch", "base must be an exact commit")


def _verify_commit(root: Path, result: dict, observation: _ContentObservation | None = None) -> None:
    if (_git(root, "cat-file", "-t", result["commit"]) != b"commit"
            or _git(root, "rev-parse", "--verify", result["commit"] + "^{commit}").decode() != result["commit"]):
        fail("invalid_git_fact", "local outcome must name a full actual commit object OID")
    entries = []
    env = {k: v for k, v in os.environ.items() if not k.upper().startswith("GIT_")}
    try:
        tree = read_tree(root, result["commit"], env=env)
    except (OSError, subprocess.SubprocessError, ValueError) as exc:
        fail("invalid_git_fact", str(exc))
    hashes = observation.hashes if observation is not None else {}
    pending = []
    reused = []
    for locator in sorted(result["candidate"]["paths"]):
        relative_path(locator)
        if _reserved(locator):
            fail("invalid_candidate", locator)
        entry = tree.get(locator)
        if entry is not None:
            if entry.mode == "160000" and entry.kind == "commit":
                continue
            if entry.kind != "blob" or entry.mode not in ("100644", "100755"):
                fail("invalid_git_fact", locator)
            if entry.oid not in hashes:
                pending.append(entry.oid)
            else:
                reused.append(entry.oid)
    try:
        verify_blob_objects(root, reused, env=env)
        hashes.update(read_blob_facts(root, pending, hash_blob, env=env))
    except (OSError, subprocess.SubprocessError, ValueError) as exc:
        fail("invalid_git_fact", str(exc))
    for locator in sorted(result["candidate"]["paths"]):
        entry = tree.get(locator)
        entries.append(_tree_content_entry(locator, entry, hashes))
    content_ref = (observation.content_ref(entries) if observation is not None
                   else _digest(_serialize_entries(entries).encode("utf-8")))
    if content_ref != result["candidate"]["content_ref"]:
        fail("candidate_mismatch", "commit tree differs from delivered content")


def _verify_pr(root: Path, result: dict, *, delivered: bool) -> None:
    """Read actual PR postconditions. This verifier cannot create/push/merge."""
    try:
        process = subprocess.run(
            ["gh", "pr", "view", str(result["pr_number"]), "--repo", result["repo_ref"],
             "--json", "number,headRefOid,baseRefName,state,mergeCommit,url,body"],
            cwd=root, capture_output=True, text=True, encoding="utf-8", timeout=30,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        fail("fact_verification_required", f"actual PR read unavailable: {exc}")
    if process.returncode:
        fail("fact_verification_required", f"actual PR read failed: {process.stderr.strip()}")
    try:
        actual = json.loads(process.stdout)
    except json.JSONDecodeError:
        fail("fact_verification_required", "invalid PR read response")
    if actual["number"] != result["pr_number"] or actual["headRefOid"] != result["reviewed_head"] or actual["baseRefName"] != result["target_ref"]:
        fail("candidate_mismatch", "actual PR identity/head/target differs")
    if delivered:
        if actual["state"] != "MERGED" or not actual["mergeCommit"] or actual["mergeCommit"]["oid"] != result["merge_commit"]:
            fail("invalid_git_fact", "PR has not merged at the recorded merge commit")
    else:
        publication = result["publication_ref"]
        if publication["locator"] != actual["url"] or publication["revision"] != _digest(actual["body"].encode("utf-8")):
            fail("candidate_mismatch", "publication URL/body differs")


def _verify_fact(root: Path, op: dict, context: TaskArtifactContext | None = None,
                 observation: _ContentObservation | None = None) -> None:
    if op["operation"] not in ("record_delivery", "record_publication"):
        return
    result = op["result"]
    if result["profile"] == "local_commit":
        _verify_commit(root, result, observation)
    elif result["profile"] == "manual":
        artifact = result["artifact"]
        if re.match(r"[a-z][a-z0-9+.-]*://", artifact["locator"], re.I):
            fail("fact_verification_required", "Python manual owner must retain a local immutable artifact")
        if _digest(_file(root, authority_locator(artifact, context)).read_bytes()) != artifact["revision"]:
            fail("candidate_mismatch", "manual artifact content differs")
    else:
        _verify_pr(root, result, delivered=op["operation"] == "record_delivery")


def verify_authority(root: Path, ref: dict, context: TaskArtifactContext | None = None) -> None:
    """Verify local authority bytes or an immutable Git object locator."""
    if context is not None:
        selected_path = _checked_path(root / context.task_root / "task.json", root)
        selected, reason = read_json_checked(selected_path)
        if selected is None:
            fail("invalid_artifact_context", str(reason))
        if selected["id"] != context.task_id or selected.get("artifact_origin") != context.artifact_origin:
            fail("invalid_artifact_context", "context must match the verified selected Task")
    if re.match(r"[a-z][a-z0-9+.-]*://", ref["locator"], re.I):
        return
    relative_path(ref["locator"])
    if re.fullmatch(r"sha256:[a-f0-9]{64}", ref["revision"]):
        if _digest(_file(root, authority_locator(ref, context)).read_bytes()) != ref["revision"]:
            fail("authority_mismatch", ref["locator"])
    elif re.fullmatch(r"[a-f0-9]{40}(?:[a-f0-9]{24})?", ref["revision"]):
        _git(root, "cat-file", "-e", f"{ref['revision']}:{ref['locator']}")
    else:
        fail("invalid_authority_revision", "local authority requires sha256 content or exact Git revision")


def apply_to_store(task_dir: Path, root: Path, request: object, expected_sha256: str | None = None) -> dict:
    """Validate, verify, compare the raw preimage, then atomically project one fact."""
    task_json = task_dir / "task.json"
    _checked_path(task_json, root)
    previous = task_json.read_bytes()
    if expected_sha256 is not None and _digest(previous) != expected_sha256:
        fail("stale_preimage", "Task changed before operation")
    data, reason = read_json_checked(task_json)
    if data is None:
        fail("invalid_record", str(reason))
    record = parse_task_v2(data)
    context = artifact_context(task_dir, root, record)
    op = canonical_operation(parse_operation(request), context)
    archived = task_dir.relative_to(root).parts[:3] == (".trellis", "tasks", "archive")
    restored = root / ".trellis" / "tasks" / task_dir.name
    if archived:
        if op["operation"] != "reopen_task":
            fail("archived_task", "only explicit history query or formal reopen is legal")
        _checked_path(restored, root)
        if restored.exists():
            fail("task_destination_occupied", str(restored))
        from .task_utils import require_unique_task_id
        require_unique_task_id(record["id"], root / ".trellis" / "tasks", root, exclude=task_dir)
    declaration = read_runtime_contract(root / ".trellis" / "workflow.md")
    if op["operation"] == "create_delivery":
        planning = task_dir / "deliveries" / op["key"]["delivery_id"]
        _checked_path(planning, root)
        for directory in (task_dir / "deliveries", planning):
            if directory.exists() and not directory.is_dir():
                fail("invalid_locator", f"unexpected planning directory type: {directory}")
        for child in ("research", "prd.md", "design.md", "implement.md", "implement.jsonl", "check.jsonl"):
            path = planning / child
            _checked_path(path, root)
            if path.exists() and (path.is_file() if child == "research" else not path.is_file()):
                fail("invalid_locator", f"unexpected planning artifact type: {path}")
    output = apply_operation(record, op, declaration)
    reopen_release = None
    if op["operation"] == "reopen_task":
        verify_authority(root, op["authority"], context)
        reopen_release = plan_release_delivery(root, task_id=op["key"]["task_id"], generation=op["key"]["lifecycle_generation"], new_generation=output["record"]["lifecycle_generation"])
    if output["changed"]:
        if op["operation"] == "accept_scope":
            verify_authority(root, op["authority"], context)
        elif op["operation"] == "create_delivery":
            verify_authority(root, op["scope_ref"]["authority"], context)
        elif op["operation"] == "record_gate":
            verify_authority(root, op["result"]["scope_ref"]["authority"], context)
            verify_authority(root, op["result"]["plan_ref"], context)
        elif op["operation"] == "rework" and "scope_ref" in op:
            verify_authority(root, op["scope_ref"]["authority"], context)
        elif op["operation"] == "complete_task":
            verify_authority(root, op["result"]["accepted_scope"], context)
        historical = op["operation"] in ("record_delivery", "record_publication") and op.get("historical_success") is True
        observation = (_ContentObservation("sha256" if len(op["result"]["commit"]) == 64 else "sha1")
                       if not historical and op["operation"] == "record_delivery" and op["result"]["profile"] == "local_commit" else None)
        if not historical:
            if op["operation"] in ("begin_check", "record_publication", "record_delivery"):
                delivery = next(row for row in record["deliveries"] if row["id"] == op["key"]["delivery_id"])
                verify_authority(root, delivery["scope_ref"]["authority"], context)
                if delivery["plan_ref"] is not None:
                    verify_authority(root, delivery["plan_ref"], context)
            if op["operation"] == "begin_check":
                verify_candidate(root, op["candidate"])
            elif op["operation"] == "record_gate" and op["result"]["candidate"] is not None:
                verify_candidate(root, op["result"]["candidate"])
            elif op["operation"] in ("record_delivery", "record_publication"):
                _verify_candidate(root, op["result"]["candidate"], observation)
        _verify_fact(root, op, context, observation)
        if task_json.read_bytes() != previous:
            fail("stale_preimage", "Task changed during verification")
        if archived:
            output["record"] = relocate_task_directory(task_dir, restored, root, record=output["record"])
            task_dir = restored
            task_json = restored / "task.json"
        mode = task_json.stat().st_mode & 0o777
        if not archived and not write_text_atomic(task_json, json.dumps(output["record"], ensure_ascii=False, indent=2) + "\n", mode=mode):
            fail("write_failed", str(task_json))
    # Retry also recovers an interrupted session-release after the fact write.
    if op["operation"] in ("stop", "record_delivery"):
        release_delivery(root, task_id=op["key"]["task_id"], generation=op["key"]["lifecycle_generation"], delivery_id=op["key"]["delivery_id"])
    elif reopen_release is not None:
        apply_release_plan(reopen_release)
    if op["operation"] == "create_delivery":
        d = next(row for row in output["record"]["deliveries"] if row["id"] == op["key"]["delivery_id"])
        planning = task_dir / d["planning_root"]
        _checked_path(planning / "research", root)
        (planning / "research").mkdir(parents=True, exist_ok=True)
        for name in ("prd.md", "design.md", "implement.md", "implement.jsonl", "check.jsonl"):
            file = planning / name
            _checked_path(file, root)
            if not file.exists() and not write_text_atomic(file, ""):
                fail("write_failed", str(file))
    return output
