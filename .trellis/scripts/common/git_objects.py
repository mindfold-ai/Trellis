"""Operation-local immutable tree snapshots and bounded, spooled blob reads."""
from __future__ import annotations

import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO, Callable, Protocol, TypeVar


@dataclass(frozen=True)
class TreeEntry:
    mode: str
    kind: str
    oid: str


Fact = TypeVar("Fact")
BATCH_SIZE = 128
CHUNK_SIZE = 64 * 1024


class ByteReader(Protocol):
    def read(self, size: int = -1, /) -> bytes: ...


def selected_path_commands(args: list[str], paths: list[str]) -> list[list[str]]:
    """Batch literal selected-path queries within the existing 64 KiB argv bound."""
    fixed_size = sum(len(arg.encode("utf-8")) + 1 for arg in args)
    commands = []
    batch: list[str] = []
    size = fixed_size
    for path in paths:
        path_size = len(path.encode("utf-8")) + 1
        if fixed_size + path_size > 64 * 1024:
            raise ValueError("Git path exceeds argument batch limit")
        if size + path_size > 64 * 1024:
            commands.append(args + batch)
            batch = []
            size = fixed_size
        batch.append(path)
        size += path_size
    if batch:
        commands.append(args + batch)
    return commands


def read_tree(root: Path, revision: str, scope: str | None = None,
              *, paths: list[str] | None = None,
              env: dict[str, str] | None = None) -> dict[str, TreeEntry]:
    """Keep literal paths and tree entries (directories must not become deletions).

    Existing scope/default calls retain their command. Selected paths use literal
    pathspecs in finite 64 KiB argument batches, including fixed arguments.
    """
    args = ["git", "-C", str(root), "ls-tree", "-r", "-t", "-z", revision]
    selected_paths = set(paths) if paths is not None else None
    if paths is None:
        if scope is not None:
            args.extend(["--", scope])
        commands = [args]
    else:
        if scope is not None:
            raise ValueError("Git tree scope and selected paths are mutually exclusive")
        # -t preserves a selected directory even when its descendant is also
        # selected. Filter ancestor rows below; do not recurse into descendants.
        args = ["git", "--literal-pathspecs", "-C", str(root), "ls-tree", "-t", "-z", revision, "--"]
        commands = selected_path_commands(args, paths)
    entries = {}
    for command in commands:
        output = subprocess.run(command, capture_output=True, check=True, timeout=20, env=env).stdout
        for row in output.split(b"\0"):
            if not row:
                continue
            header, name = row.split(b"\t", 1)
            mode, kind, oid = header.decode("ascii").split(" ")
            locator = name.decode("utf-8", errors="surrogateescape")
            if selected_paths is None or locator in selected_paths:
                entries[locator] = TreeEntry(mode, kind, oid)
    return entries


def read_blob_facts(root: Path, oids: list[str], observe: Callable[[BinaryIO, int], Fact],
                    *, batch_size: int = BATCH_SIZE, exact_commit: str | None = None,
                    env: dict[str, str] | None = None) -> dict[str, Fact]:
    """Read each unique blob once; observers retain reduced facts, not bodies.

    Regular temporary request/output files avoid duplex-pipe deadlocks. Each
    observer consumes exactly one body using bounded reads; batches and files
    close even when Git or an observer fails. Optional exact_commit validates
    the first returned full OID/type using metadata only; this control request
    counts toward batch_size and produces no content fact or body transport.
    """
    unique = list(dict.fromkeys(oids))
    if exact_commit is not None:
        unique.insert(0, exact_commit)
    facts = {}
    for offset in range(0, len(unique), batch_size):
        batch = unique[offset:offset + batch_size]
        with tempfile.TemporaryFile() as requests, tempfile.TemporaryFile() as output:
            commit_control_batch = exact_commit is not None and offset == 0
            lines = (["info " + batch[0]] + ["contents " + oid for oid in batch[1:]]
                     if commit_control_batch else batch)
            requests.write(("\n".join(lines) + "\n").encode("ascii"))
            requests.seek(0)
            try:
                subprocess.run(["git", "-C", str(root), "cat-file",
                                "--batch-command" if commit_control_batch else "--batch"],
                               stdin=requests, stdout=output, stderr=subprocess.PIPE,
                               check=True, timeout=20, env=env)
            except subprocess.CalledProcessError as exc:
                # Git before 2.36 lacks batch-command. Only that explicit option
                # rejection permits compatibility fallback, never object errors.
                if (not commit_control_batch or not isinstance(exc.stderr, bytes)
                        or b"unknown option" not in exc.stderr or b"batch-command" not in exc.stderr):
                    raise
                verify_blob_objects(root, [], exact_commit=exact_commit, env=env)
                return read_blob_facts(root, oids, observe, batch_size=batch_size, env=env)
            output.seek(0)
            for index, oid in enumerate(batch):
                commit_control = exact_commit is not None and offset == 0 and index == 0
                kind = b"commit" if commit_control else b"blob"
                header = output.readline(256).split()
                if len(header) != 3 or header[0].decode("ascii") != oid or header[1] != kind:
                    raise ValueError(f"unreadable Git blob: {oid}")
                size = int(header[2])
                if size < 0:
                    raise ValueError(f"invalid Git blob size: {oid}")
                start = output.tell()
                if commit_control:
                    # An info response has no body or trailing body separator.
                    continue
                facts[oid] = observe(output, size)
                if output.tell() != start + size or output.read(1) != b"\n":
                    raise ValueError(f"invalid Git blob body: {oid}")
    return facts


def verify_blob_objects(root: Path, oids: list[str], *, batch_size: int = BATCH_SIZE,
                        exact_commit: str | None = None, env: dict[str, str] | None = None) -> None:
    """Retain actual object availability checks when content SHA256 is reused.

    A tree entry alone does not prove its promised blob is locally available.
    Let Git resolve/fetch the object as before, without rereading its body.
    Optional exact_commit adds one exact commit OID/type metadata assertion,
    including when no blobs are requested, within the first bounded batch.
    """
    unique = list(dict.fromkeys(oids))
    if exact_commit is not None:
        unique.insert(0, exact_commit)
    for offset in range(0, len(unique), batch_size):
        batch = unique[offset:offset + batch_size]
        with tempfile.TemporaryFile() as requests, tempfile.TemporaryFile() as output:
            requests.write(("\n".join(batch) + "\n").encode("ascii"))
            requests.seek(0)
            subprocess.run(["git", "-C", str(root), "cat-file", "--batch-check"],
                           stdin=requests, stdout=output, stderr=subprocess.PIPE,
                           check=True, timeout=20, env=env)
            output.seek(0)
            for index, oid in enumerate(batch):
                kind = b"commit" if exact_commit is not None and offset == 0 and index == 0 else b"blob"
                header = output.readline(256).split()
                if (len(header) != 3 or header[0].decode("ascii") != oid
                        or header[1] != kind or not header[2].isdigit()):
                    raise ValueError(f"unreadable Git blob: {oid}")


def hash_blob(stream: ByteReader, size: int) -> str:
    """SHA256 raw content using bounded reads, including empty blobs."""
    import hashlib

    digest = hashlib.sha256()
    while size:
        chunk = stream.read(min(size, CHUNK_SIZE))
        if not chunk:
            raise ValueError("truncated Git blob")
        digest.update(chunk)
        size -= len(chunk)
    return digest.hexdigest()
