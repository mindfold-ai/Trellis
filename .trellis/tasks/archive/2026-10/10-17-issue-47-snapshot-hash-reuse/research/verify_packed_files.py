#!/usr/bin/env python3
"""Compare both packed packages with an existing isolated npm-prefix install.

Does not build, pack, install or publish. Run after installing both local tgz
files together. The report retains release-record compatible package summaries.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import stat
import subprocess
import tarfile
from pathlib import Path, PurePosixPath


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(64 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_archive(archive: Path, prefix: Path, expected_name: str) -> tuple[dict, dict]:
    installed = prefix / "node_modules" / expected_name
    package = {"package": expected_name, "filename": archive.name, "archive": str(archive),
               "sha256": sha256(archive), "bytes": archive.stat().st_size,
               "installed_file_count": 0, "verified_file_count": 0,
               "byte_and_mode_mismatches": [], "files": []}
    with tarfile.open(archive, "r:gz") as packed:
        manifest_stream = packed.extractfile("package/package.json")
        assert manifest_stream is not None
        with manifest_stream:
            manifest = json.load(manifest_stream)
        assert manifest["name"] == expected_name, "Unexpected packed package name"
        package["version"] = manifest["version"]
        seen = set()
        for member in packed:
            path = PurePosixPath(member.name)
            assert path.parts and path.parts[0] == "package" and ".." not in path.parts
            if member.isdir():
                continue
            assert member.isfile(), f"Unsupported archive entry type: {member.name}"
            relative = PurePosixPath(*path.parts[1:])
            assert relative.parts and relative.as_posix() not in seen, "Duplicate/empty packed path"
            seen.add(relative.as_posix())
            target = installed.joinpath(*relative.parts)
            package["installed_file_count"] += 1
            expected_mode = member.mode & 0o777
            expected_hash = hashlib.sha256()
            actual_hash = hashlib.sha256()
            exists = target.is_file() and not target.is_symlink()
            contained = target.resolve().is_relative_to(installed.resolve())
            equal = exists and contained
            actual_mode = stat.S_IMODE(target.stat().st_mode) if exists and contained else None
            source = packed.extractfile(member)
            assert source is not None
            with source:
                if exists and contained:
                    with target.open("rb") as actual:
                        while True:
                            left, right = source.read(64 * 1024), actual.read(64 * 1024)
                            if not left and not right:
                                break
                            expected_hash.update(left)
                            actual_hash.update(right)
                            equal = equal and left == right
                else:
                    for chunk in iter(lambda: source.read(64 * 1024), b""):
                        expected_hash.update(chunk)
            mode_equal = actual_mode == expected_mode
            row = {"path": relative.as_posix(), "bytes": member.size,
                   "sha256": expected_hash.hexdigest(), "mode": f"{expected_mode:04o}",
                   "bytes_equal": equal, "mode_equal": mode_equal}
            package["files"].append(row)
            if not (equal and mode_equal):
                package["byte_and_mode_mismatches"].append({**row,
                    "installed_sha256": actual_hash.hexdigest() if exists and contained else None,
                    "installed_mode": f"{actual_mode:04o}" if actual_mode is not None else None})
            else:
                package["verified_file_count"] += 1
        owned_files = {path.relative_to(installed).as_posix() for path in installed.rglob("*")
                       if path.is_file() and "node_modules" not in path.relative_to(installed).parts}
        package["extra_installed_files"] = sorted(owned_files - seen)
        assert not package["extra_installed_files"], "Unexpected files in installed package"
    assert json.loads((installed / "package.json").read_text()) == manifest
    return package, manifest


def main() -> None:
    parser = argparse.ArgumentParser(__doc__)
    parser.add_argument("--core-tgz", type=Path, required=True)
    parser.add_argument("--cli-tgz", type=Path, required=True)
    parser.add_argument("--prefix", type=Path, required=True)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--source-head", required=True)
    parser.add_argument("--expected-file-count", type=int, default=1013)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    head = subprocess.check_output(["git", "-C", str(args.repo), "rev-parse", "HEAD"], text=True).strip()
    report = {"source_head": head, "requested_source_head": args.source_head,
              "route": "pnpm pack -> paired local-tarball npm install, isolated prefix; no npm publish",
              "prefix": str(args.prefix.resolve()), "checks": [], "passed": False}
    try:
        assert head == args.source_head, "Checkout HEAD differs from intended package source"
        core, core_manifest = verify_archive(args.core_tgz.resolve(), args.prefix.resolve(), "@mindfoldhq/trellis-core")
        report["checks"].append(core)
        cli, cli_manifest = verify_archive(args.cli_tgz.resolve(), args.prefix.resolve(), "@mindfoldhq/trellis")
        report["checks"].append(cli)
        version = core_manifest["version"]
        dependency = cli_manifest["dependencies"]["@mindfoldhq/trellis-core"]
        assert cli_manifest["version"] == dependency == version, "CLI must pin the exact paired Core version"
        source_core = json.loads((args.repo / "packages/core/package.json").read_text())
        source_cli = json.loads((args.repo / "packages/cli/package.json").read_text())
        assert source_core["version"] == source_cli["version"] == version
        cli_package = args.prefix.resolve() / "node_modules/@mindfoldhq/trellis/package.json"
        resolved = subprocess.check_output(["node", "--input-type=module", "-e",
            "import {createRequire} from 'node:module';const r=createRequire(process.argv[1]);console.log(r.resolve('@mindfoldhq/trellis-core'));",
            str(cli_package)], text=True).strip()
        expected_core = args.prefix.resolve() / "node_modules/@mindfoldhq/trellis-core"
        assert Path(resolved).resolve().is_relative_to(expected_core.resolve()), "CLI resolves a different Core installation"
        total = sum(package["installed_file_count"] for package in report["checks"])
        verified = sum(package["verified_file_count"] for package in report["checks"])
        report.update(version=version, cli_core_dependency=dependency,
                      total_installed_file_count=total, total_verified_file_count=verified,
                      expected_file_count=args.expected_file_count, resolved_core_entry=resolved)
        assert total == verified == args.expected_file_count, "Packed/installed file count or bytes/modes mismatch"
        report["passed"] = True
    except BaseException as exc:
        report["error"] = {"kind": type(exc).__name__, "message": str(exc)}
        raise
    finally:
        with args.output.open("x", encoding="utf-8") as output:
            json.dump(report, output, ensure_ascii=False, indent=2)
            output.write("\n")
    print(json.dumps({"passed": True, "source_head": head, "version": report["version"],
                      "files_verified_bytes_and_modes": report["total_verified_file_count"]}))


if __name__ == "__main__":
    main()
