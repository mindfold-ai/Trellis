"""Execute exactly one committed, complete Ubuntu replication; retain every failure."""
from __future__ import annotations

import argparse
import datetime
import json
import os
import statistics
import subprocess
import sys
from pathlib import Path

from ci_fixture import original_input, pyc_preflight
from ci_support import CASES, digest, environment_identity, environment_record, host_snapshot, protocol_guard, require_linux_runtime, source_hashes, validate_result, write_new


def main() -> None:
    parser = argparse.ArgumentParser(__doc__)
    parser.add_argument("--protocol", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--before-guru", type=Path, required=True)
    parser.add_argument("--after-guru", type=Path, required=True)
    parser.add_argument("--before-common", type=Path, required=True)
    parser.add_argument("--after-common", type=Path, required=True)
    args = parser.parse_args()
    benchmark = args.protocol.resolve().parent
    expected_digest = digest(args.protocol)
    protocol = protocol_guard(args.protocol, expected_digest, args.after_common)
    require_linux_runtime(protocol)
    assert source_hashes(args.before_common) == protocol["before_runtime_source_checksums"]
    assert os.environ.get("GITHUB_RUN_ATTEMPT") == "1", "One attempt only; no job rerun"
    args.output.mkdir(parents=True, exist_ok=True)
    assert {file.name for file in args.output.iterdir()} <= {"workflow-identity.txt"}, "Evidence directory already used"
    environment = environment_record()
    assert environment["git"]["version"] == protocol["runner"]["git_version"]
    assert os.environ.get("ImageVersion") == protocol["runner"]["image_version"]
    assert protocol["runner"]["label"] == "ubuntu-24.04"
    write_new(args.output / "started.json", {"protocol_sha256": expected_digest, "environment": environment,
              "started_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(), "host": host_snapshot()})
    try:
        write_new(args.output / "pyc-preflight.json", pyc_preflight(benchmark, args.before_common, protocol["source_mtime"]))
        managed_identity = None
        for count, variant in CASES:
            case = f"{count}-{variant}"
            baseline, _, fixed_root = original_input(benchmark, count, variant)
            assert not fixed_root.exists()
            with (args.output / f"before-{case}.json").open("xb") as stream:
                stream.write((benchmark / f"before-{case}.json").read_bytes())
            for phase, guru in (("control-before", args.before_guru), ("after", args.after_guru)):
                protocol_guard(args.protocol, expected_digest, args.after_common)
                assert environment_identity(environment_record()) == environment_identity(environment), "Execution environment changed before phase"
                entry = {"case": case, "phase": phase, "host_before": host_snapshot()}
                target = args.output / f"{phase}-{case}.json"
                command = [sys.executable, str(benchmark / "ci_phase.py"), "--protocol", str(args.protocol),
                           "--protocol-sha256", expected_digest, "--output", str(args.output), "--guru", str(guru),
                           "--before-common", str(args.before_common), "--after-common", str(args.after_common),
                           "--phase", phase, "--count", str(count), "--variant", variant]
                with target.open("x") as output:
                    result = subprocess.run(command, stdout=output, stderr=subprocess.PIPE, text=True)
                entry.update(returncode=result.returncode, stderr=result.stderr, host_after=host_snapshot())
                write_new(args.output / f"status-{phase}-{case}.json", entry)
                assert result.returncode == 0, "Technical failure; cohort ends without retry"
                value = json.loads(target.read_text())
                exact = json.loads((args.output / f"{phase}-input-{case}.json").read_text())
                validate_result(value, baseline, exact)
                managed = json.loads((args.output / f"managed-runtime-{phase}-{case}.json").read_text())
                identity = {key: managed[key] for key in ("pointer", "interpreter_sha256", "manifest_sha256", "lock_sha256", "metadata_sha256")}
                if managed_identity is None:
                    managed_identity = identity
                assert identity == managed_identity, "Managed interpreter/dependencies differ across phases"
                protocol_guard(args.protocol, expected_digest, args.after_common)
                assert environment_identity(environment_record()) == environment_identity(environment), "Execution environment changed during phase"
                assert not fixed_root.exists(), "Fixture root cleanup failed"
        for name in ("frozen-standards.json",):
            with (args.output / name).open("xb") as output:
                output.write((benchmark / name).read_bytes())
        evaluator = subprocess.run([sys.executable, str(benchmark / "evaluate_results.py"), "--directory", str(args.output)],
                                   capture_output=True, text=True)
        write_new(args.output / "evaluator-process.json", {"returncode": evaluator.returncode, "stdout": evaluator.stdout, "stderr": evaluator.stderr})
        assert evaluator.returncode == 0
        absolute = json.loads((args.output / "evaluation.json").read_text())
        assert len(absolute["checks"]) == 188, "Original checks must remain complete"
        checks = []
        for count, variant in CASES:
            case = f"{count}-{variant}"
            before = json.loads((args.output / f"control-before-{case}.json").read_text())
            after = json.loads((args.output / f"after-{case}.json").read_text())
            checks.append({"check": case + "/exact_head", "passed": before["git_commit"] == after["git_commit"]})
            checks.append({"check": case + "/same_candidate_count", "passed": before["paths_including_deleted"] == after["paths_including_deleted"]})
            if count <= 30:
                continue
            factor = .95 if count == 128 else .70
            for kind in ("manual", "query2"):
                old = statistics.median(row[kind + "_seconds"] for row in before["rows"] if not row["warmup"])
                new = statistics.median(row[kind + "_seconds"] for row in after["rows"] if not row["warmup"])
                checks.append({"check": case + "/" + kind + "_paired_gain", "passed": new <= old * factor,
                               "before_seconds": old, "after_seconds": new, "after_max_seconds": old * factor})
            old = before["rows"][0]["manual_seconds"]
            new = after["rows"][0]["manual_seconds"]
            checks.append({"check": case + "/fresh_manual_no_regression", "passed": new <= old * 1.05,
                           "before_seconds": old, "after_seconds": new, "after_max_seconds": old * 1.05})
        assert len(checks) == 24
        passed = absolute["passed"] and all(check["passed"] for check in checks)
        write_new(args.output / "completed.json", {"scope": "This preregistered Ubuntu runner only; previous Mac failures remain unchanged",
                  "protocol_sha256": expected_digest, "absolute_check_count": 188,
                  "absolute_checks_passed": absolute["passed"], "paired_checks": checks,
                  "paired_checks_passed": all(check["passed"] for check in checks), "passed": passed,
                  "completed_utc": datetime.datetime.now(datetime.timezone.utc).isoformat()})
        if not passed:
            raise SystemExit(1)
    except BaseException as exc:
        write_new(args.output / "failed.json", {"kind": type(exc).__name__, "message": str(exc),
                  "no_retry": True, "utc": datetime.datetime.now(datetime.timezone.utc).isoformat()})
        raise


if __name__ == "__main__":
    main()
