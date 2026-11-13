"""Preflight original fixture paths and normally compiled pyc identities; never times acceptance."""
from __future__ import annotations

import argparse
import hashlib
import json
import py_compile
import sys
import tempfile
from pathlib import Path

from ci_support import CASES, digest, write_new


def original_input(benchmark: Path, count: int, variant: str) -> tuple[dict, dict, Path]:
    case = f"{count}-{variant}"
    baseline = json.loads((benchmark / f"before-{case}.json").read_text())
    frozen = json.loads((benchmark / f"control-before-input-{case}.json").read_text())
    command = next(row for row in baseline["resources"]["0-manual"]["python_processes"] if "--root" in row["argv"])
    root = Path(command["argv"][command["argv"].index("--root") + 1])
    assert str(root).startswith("/var/folders/")
    assert frozen["exact_head"] == baseline["git_commit"]
    return baseline, frozen, root


def pyc_preflight(benchmark: Path, before_common: Path, mtime: int) -> dict:
    """Compile original source normally; compare blob IDs, never install substitute pyc."""
    assert sys.version_info[:3] == (3, 14, 8)
    rows = []
    with tempfile.TemporaryDirectory(prefix="trellis-ci-pyc-preflight-") as directory:
        for count, variant in CASES:
            baseline, frozen, root = original_input(benchmark, count, variant)
            resolved_root = "/private" + str(root)
            checks = []
            for line in frozen["git_tree"].splitlines():
                header, locator = line.split("\t", 1)
                mode, kind, expected = header.split()
                if "/__pycache__/" not in locator:
                    continue
                name = Path(locator).name.removesuffix(".cpython-314.pyc") + ".py"
                source = before_common / name
                assert int(source.stat().st_mtime) == mtime, f"Original source mtime changed: {source}"
                target = Path(directory) / (name + "c")
                py_compile.compile(str(source), cfile=str(target), dfile=resolved_root + "/.trellis/scripts/common/" + name,
                                   doraise=True, invalidation_mode=py_compile.PycInvalidationMode.TIMESTAMP)
                body = target.read_bytes()
                actual = hashlib.sha1(b"blob " + str(len(body)).encode() + b"\0" + body).hexdigest()
                assert actual == expected, (count, variant, locator, expected, actual)
                checks.append({"path": locator, "expected_blob": expected, "actual_blob": actual,
                               "source_sha256": digest(source), "source_mtime": int(source.stat().st_mtime),
                               "pyc_bytes": len(body), "mode": mode, "kind": kind})
            assert len(checks) == 14, "Original candidate must contain all 14 pyc"
            rows.append({"case": f"{count}-{variant}", "root": str(root), "resolved_root": resolved_root,
                         "expected_head": baseline["git_commit"], "pyc": checks})
    return {"diagnostic_only": True, "acceptance_started": False, "cases": rows}


def main() -> None:
    parser = argparse.ArgumentParser(__doc__)
    parser.add_argument("--before-common", type=Path, required=True)
    parser.add_argument("--benchmark", type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument("--source-mtime", type=int, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    write_new(args.output, pyc_preflight(args.benchmark, args.before_common, args.source_mtime))


if __name__ == "__main__":
    main()
