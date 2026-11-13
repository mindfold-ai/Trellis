"""One registered Linux phase; frozen harness is adapted in memory, never edited."""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import shlex
import shutil
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

from ci_fixture import original_input
from ci_support import digest, protocol_guard, require_linux_runtime, source_hashes, write_new


def replace_once(source: str, old: str, new: str) -> str:
    assert source.count(old) == 1, f"Frozen adapter anchor changed: {old[:70]}"
    return source.replace(old, new)


def install_observer(skills: Path, benchmark: Path) -> None:
    observer = (benchmark / "sitecustomize_metrics.py").read_text()
    observer = replace_once(observer, "resource.getrusage(resource.RUSAGE_SELF).ru_maxrss",
                            "resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024")
    observer += "\n" + (benchmark / "sitecustomize_batch_command_metrics.py").read_text()
    (skills / "sitecustomize.py").write_text(observer)


def install_git(shim: Path, real_git: str) -> None:
    script = """#!/bin/bash
if [[ -n "$BENCH_METRICS_DIR" ]]; then
 mkdir -p "$BENCH_METRICS_DIR"
 printf '%s\\n' "$*" > "$BENCH_METRICS_DIR/git-$$.args"
 /usr/bin/time -f '%M maximum resident set size' -o "$BENCH_METRICS_DIR/git-$$.rss" REAL_GIT "$@"
 status=$?
 printf '%s\\n' "$status" > "$BENCH_METRICS_DIR/git-$$.exit"
 exit "$status"
else
 exec REAL_GIT "$@"
fi
""".replace("REAL_GIT", shlex.quote(real_git))
    (shim / "git").write_text(script)


def run(args: argparse.Namespace) -> None:
    benchmark = args.protocol.resolve().parent
    protocol = protocol_guard(args.protocol, args.protocol_sha256, args.after_common,
                              require_committed=not args.setup_only)
    require_linux_runtime(protocol)
    baseline, frozen, fixed_root = original_input(benchmark, args.count, args.variant)
    assert not fixed_root.exists(), "Exact original fixture root already occupied"
    guru = args.guru
    assert not (guru.parent / f"metrics-{args.count}-{args.variant}").exists(), "Raw metrics directory already used"
    before_common = args.before_common
    assert source_hashes(before_common) == protocol["before_runtime_source_checksums"]
    runtime = guru / "trellis/skills/guru-team/packages/guru-merge-task-delivery/runtime"
    expected_consumer = protocol["consumer_source_checksums"][args.phase]
    assert {name: digest(runtime / name) for name in expected_consumer} == expected_consumer
    os.environ.update(PINNED_GURU=str(guru), PINNED_FORK=str(before_common.parents[2]),
                      BENCH_COUNT=str(args.count), BENCH_VARIANT=args.variant)
    os.environ.pop("BENCH_METRICS_DIR", None)
    subprocess.run([sys.executable, str(guru / "trellis/skills/guru-team/runtime/bootstrap.py"),
                    "--repo", str(guru), "--runtime-assets", str(guru / "trellis/skills/guru-team/runtime"),
                    "--python", sys.executable, "--json"], check=True, stdout=subprocess.PIPE)
    old_directory = tempfile.TemporaryDirectory
    first_directory = True

    class ExactDirectory:
        def __init__(self) -> None:
            self.name = str(fixed_root)
            fixed_root.mkdir()
        def cleanup(self) -> None:
            shutil.rmtree(fixed_root)
        def __enter__(self) -> str:
            return self.name
        def __exit__(self, *_exception: object) -> None:
            self.cleanup()

    def exact_directory(*values: object, **options: object) -> object:
        nonlocal first_directory
        if first_directory:
            first_directory = False
            return ExactDirectory()
        return old_directory(*values, **options)

    tempfile.TemporaryDirectory = exact_directory

    def ready(fixture: object) -> None:
        try:
            git_policy = {}
            for key, expected in (("gc.auto", "0"), ("maintenance.auto", "false")):
                effective = fixture.flow.git("config", "--get", key).strip()
                origins = fixture.flow.git("config", "--show-origin", "--show-scope", "--get-all", key).splitlines()
                assert effective == expected and origins
                assert origins[-1].split("\t")[0] == "local" and origins[-1].split("\t")[-1] == expected
                git_policy[key] = {"effective": effective, "origins": origins}
            write_new(args.output / f"fixture-git-policy-{args.phase}-{args.count}-{args.variant}.json", git_policy)
            pointers = [fixture.repo / ".trellis/.runtime/guru-team/python/active.json",
                        fixture.repo / ".git/guru-team/python/active.json"]
            pointer_file = next(path for path in pointers if path.is_file())
            pointer = json.loads(pointer_file.read_text())
            interpreter = Path(pointer["interpreter"])
            info = json.loads(subprocess.check_output([str(interpreter), "-c",
                "import json,sys,platform;print(json.dumps({'executable':sys.executable,'base_executable':sys._base_executable,'version':platform.python_version(),'cache_tag':sys.implementation.cache_tag}))"], text=True))
            assert info["version"] == protocol["python_version"]
            assert digest(interpreter.resolve()) == digest(Path(sys.executable).resolve())
            assets = guru / "trellis/skills/guru-team/runtime"
            manifest_file = assets / "python-runtime.json"
            manifest = json.loads(manifest_file.read_text())
            metadata = interpreter.parents[2] / "metadata.json"
            write_new(args.output / f"managed-runtime-{args.phase}-{args.count}-{args.variant}.json", {
                "pointer": pointer, "pointer_path": str(pointer_file), "pointer_sha256": digest(pointer_file),
                "interpreter": info, "interpreter_sha256": digest(interpreter.resolve()),
                "manifest_sha256": digest(manifest_file), "lock_sha256": digest(assets / manifest["lock_file"]),
                "metadata_sha256": digest(metadata), "metadata": json.loads(metadata.read_text())})
            candidate = fixture.publication["candidate"]
            tree = fixture.flow.git("ls-tree", "-r", fixture.actual, "--", *candidate["paths"])
            observed = {"head": fixture.actual, "candidate": candidate, "git_tree": tree}
            write_new(args.output / f"{args.phase}-input-{args.count}-{args.variant}.json", observed)
            assert fixture.actual == baseline["git_commit"] == frozen["exact_head"], "Original full head mismatch"
            assert candidate == frozen["candidate"] and tree == frozen["git_tree"], "Original candidate/tree mismatch"
            if args.phase == "after":
                common = fixture.repo / ".trellis/scripts/common"
                shutil.copytree(args.after_common, common, dirs_exist_ok=True, ignore=shutil.ignore_patterns("__pycache__"))
                from runtime.delivery_projection.adapter import upstream_modules
                namespace = "guru_delivery_target_" + hashlib.sha256(str(common.resolve()).encode()).hexdigest()[:16]
                for loaded in list(sys.modules):
                    if loaded == namespace or loaded.startswith(namespace + "."):
                        del sys.modules[loaded]
                fixture.projection.api = upstream_modules(fixture.repo)
                actual_file = fixture.projection.api.delivery_store.GitCandidateContent.content_ref.__code__.co_filename
                assert Path(actual_file).resolve() == (common / "delivery_store.py").resolve()
                assert source_hashes(common) == protocol["after_runtime_source_checksums"]
                cache = {}
                for name in ("delivery_store", "git_objects"):
                    source = common / (name + ".py")
                    bytecode = Path(importlib.util.cache_from_source(str(source)))
                    magic, flags, mtime, size = struct.unpack("<4sIII", bytecode.read_bytes()[:16])
                    assert flags == 0 and mtime == int(source.stat().st_mtime) and size == source.stat().st_size
                    cache[name] = {"magic": magic.hex(), "flags": flags, "mtime": mtime, "size": size, "bytecode_sha256": digest(bytecode)}
                write_new(args.output / f"cache-{args.count}-{args.variant}.json", cache)
            if args.setup_only:
                fixture.doCleanups()
                raise SystemExit(0)
        except BaseException:
            fixture.doCleanups()
            raise

    source = (benchmark / "residual_benchmark.py").read_text()
    source = replace_once(source, "shutil.copyfile(HERE/'sitecustomize_metrics.py',SKILLS/'sitecustomize.py')", "install_observer(SKILLS,HERE)")
    begin = source.index("(shim/'git').write_text(")
    end = source.index("(shim/'git').chmod", begin)
    source = source[:begin] + "install_git(shim,real_git)\n" + source[end:]
    source = replace_once(source, "fixture=m.ManualRecoveryTests();fixture.setUp()", "fixture=m.ManualRecoveryTests();fixture.setUp();ready(fixture)")
    # Only the isolated fixture's setup changes: config is untracked Git
    # metadata, set before every original commit and identical in both phases.
    setup = 'self.git("init", "-q", "-b", "main")'
    policy_setup = setup + '\n        self.git("config", "gc.auto", "0")\n        self.git("config", "maintenance.auto", "false")'
    source = replace_once(source, "f.write_text(modified)",
                          "assert modified.count(" + repr(setup) + ")==1;modified=modified.replace(" + repr(setup) + "," + repr(policy_setup) + ");f.write_text(modified)")
    source = replace_once(source, "'peak_rss_bytes':peak}", "'peak_rss_bytes':peak*1024 if peak is not None else None}")
    source = replace_once(source, "resource.getrusage(resource.RUSAGE_SELF).ru_maxrss}", "resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*1024}")
    timed = "started=time.perf_counter();out=fixture.invoke();manual=time.perf_counter()-started"
    source = replace_once(source, timed, "prior_task=(fixture.repo/fixture.flow.task_ref/'task.json').read_bytes();" + timed + ";assert n==0 or prior_task==(fixture.repo/fixture.flow.task_ref/'task.json').read_bytes()")
    try:
        exec(compile(source, str(benchmark / "residual_benchmark.py"), "exec"), {
            "__file__": str(benchmark / "residual_benchmark.py"), "__name__": "__main__",
            "ready": ready, "install_observer": install_observer, "install_git": install_git})
    finally:
        tempfile.TemporaryDirectory = old_directory
    protocol_guard(args.protocol, args.protocol_sha256, args.after_common)
    assert source_hashes(before_common) == protocol["before_runtime_source_checksums"]
    assert {name: digest(runtime / name) for name in expected_consumer} == expected_consumer
    metrics = guru.parent / f"metrics-{args.count}-{args.variant}"
    statuses = []
    assert {path.with_suffix("") for path in metrics.rglob("git-*.args")} == {path.with_suffix("") for path in metrics.rglob("git-*.rss")} == {path.with_suffix("") for path in metrics.rglob("git-*.exit")}, "Unpaired Git process records"
    for command in sorted(metrics.rglob("git-*.args")):
        status_file = command.with_suffix(".exit")
        rss = command.with_suffix(".rss")
        assert status_file.exists() and rss.exists(), "Incomplete Git process record"
        status = int(status_file.read_text())
        assert status == 0, (str(command), status)
        statuses.append({"args": str(command), "returncode": status, "rss_record": str(rss)})
    assert statuses
    write_new(args.output / f"git-exits-{args.phase}-{args.count}-{args.variant}.json", statuses)


def main() -> None:
    parser = argparse.ArgumentParser(__doc__)
    parser.add_argument("--protocol", type=Path, required=True)
    parser.add_argument("--protocol-sha256", required=True)
    parser.add_argument("--guru", type=Path, required=True)
    parser.add_argument("--before-common", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--after-common", type=Path, required=True)
    parser.add_argument("--phase", choices=("control-before", "after"), required=True)
    parser.add_argument("--count", type=int, required=True)
    parser.add_argument("--variant", choices=("repeated", "mixed"), required=True)
    parser.add_argument("--setup-only", action="store_true", help="Diagnostic: stop before any acceptance timing")
    run(parser.parse_args())


if __name__ == "__main__":
    main()
