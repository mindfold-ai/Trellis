"""Shared guards for the separately preregistered Linux replication only."""
from __future__ import annotations

import datetime
import hashlib
import json
import os
import platform
import subprocess
import sys
from pathlib import Path

CASES = [(3, "repeated"), (30, "repeated"), (128, "repeated"), (128, "mixed"),
         (10001, "repeated"), (10001, "mixed")]
GURU_REF = "f70b64b026725b27d59fed17ed710cc2f831439f"
FORK_REF = "0e3b23a3045357b76e69ca91e84b97b294dfb147"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def source_hashes(path: Path) -> dict[str, str]:
    return {file.name: digest(file) for file in sorted(path.glob("*.py"))}


def write_new(path: Path, value: object) -> None:
    with path.open("x", encoding="utf-8") as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write("\n")


def protocol_guard(path: Path, expected_digest: str, after_common: Path,
                   *, require_committed: bool = True) -> dict:
    assert digest(path) == expected_digest, "Protocol checksum mismatch"
    protocol = json.loads(path.read_text())
    assert protocol["cases"] == [list(case) for case in CASES]
    assert protocol["phase_order"] == ["control-before", "after"]
    assert protocol["repetitions_per_phase"] == {
        "first_fresh_manual_warmup": 1, "timed_idempotent_manual_and_query2": 2}
    assert protocol["python_version"] == "3.14.8"
    assert protocol["additional_fresh_paired_gates"] == {"128_paths_manual_and_query2_min_gain_percent": 5, "10001_paths_manual_and_query2_min_gain_percent": 30, "first_fresh_manual_after_max_times_control_before": 1.05}
    assert protocol["pinned_refs"] == {"guru": GURU_REF, "fork_before": FORK_REF}
    assert source_hashes(after_common) == protocol["after_runtime_source_checksums"]
    assert {file.name for file in path.parent.glob("ci_*.py")} <= protocol["measurement_tools_checksums"].keys(), "Every CI tool must be preregistered"
    for section in ("measurement_tools_checksums", "frozen_files_checksums"):
        for name, expected in protocol[section].items():
            assert digest(path.parent / name) == expected, f"Changed registered input/tool: {name}"
    repo = Path(subprocess.check_output(["git", "-C", str(path.parent), "rev-parse", "--show-toplevel"], text=True).strip())
    workflow = repo / protocol["workflow_path"]
    assert digest(workflow) == protocol["workflow_sha256"], "Registered workflow checksum mismatch"
    if require_committed:
        head = subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD"], text=True).strip()
        parent = subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD^"], text=True).strip()
        assert parent == protocol["registration_parent"], "Only the registered immediate child commit may run"
        relative_protocol = path.resolve().relative_to(repo).as_posix()
        latest = subprocess.check_output(["git", "-C", str(repo), "log", "-1", "--format=%H", "--", relative_protocol], text=True).strip()
        assert latest == head, "This HEAD must be the protocol registration commit"
        for file in [path, workflow, *(path.parent / name for name in protocol["measurement_tools_checksums"]),
                     *(path.parent / name for name in protocol["frozen_files_checksums"])]:
            relative = file.resolve().relative_to(repo).as_posix()
            registered = subprocess.check_output(["git", "-C", str(repo), "show", "HEAD:" + relative])
            assert registered == file.read_bytes(), f"Not committed at HEAD: {relative}"
    return protocol


def require_linux_runtime(protocol: dict) -> None:
    assert sys.platform == "linux" and platform.python_version() == protocol["python_version"]
    assert sys.implementation.cache_tag == "cpython-314" and sys.flags.optimize == 0
    assert not sys.dont_write_bytecode and sys.pycache_prefix is None
    assert "SOURCE_DATE_EPOCH" not in os.environ
    assert int(os.environ.get("GIT_CONFIG_COUNT", "0")) == 0, "Implicit command Git config forbidden"
    assert not os.environ.get("GIT_CONFIG_PARAMETERS"), "Implicit Git config parameters forbidden"
    assert os.environ.get("LC_ALL") == protocol["locale"] == "C", "Both phases require registered locale"
    assert Path("/var/folders").resolve() == Path("/private/var/folders"), "Recreate original root alias before setup"


def host_snapshot() -> dict:
    process = subprocess.run(["ps", "-axo", "pid,ppid,pcpu,pmem,comm"], capture_output=True, text=True, check=True)
    rows = []
    for line in process.stdout.splitlines()[1:]:
        values = line.split(None, 4)
        if len(values) != 5:
            continue
        rows.append({"pid": int(values[0]), "ppid": int(values[1]), "cpu_percent": float(values[2]),
                     "memory_percent": float(values[3]), "executable": Path(values[4]).name})
    return {"utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "load_average_1_5_15": list(os.getloadavg()), "logical_cpu_count": os.cpu_count(),
            "process_count": len(rows), "top_cpu_processes": sorted(rows, key=lambda row: row["cpu_percent"], reverse=True)[:12]}


def environment_record() -> dict:
    executable = Path(sys.executable).resolve()
    git = Path(subprocess.check_output(["which", "git"], text=True).strip()).resolve()
    names = ("GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT", "GITHUB_JOB", "GITHUB_REPOSITORY", "GITHUB_SHA",
             "RUNNER_OS", "RUNNER_ARCH", "ImageOS", "ImageVersion", "LC_ALL", "LANG", "TZ")
    return {"python": {"executable": str(executable), "base_executable": getattr(sys, "_base_executable", None),
                       "version": sys.version, "sha256": digest(executable), "cache_tag": sys.implementation.cache_tag},
            "git": {"executable": str(git), "sha256": digest(git), "version": subprocess.check_output([str(git), "--version"], text=True).strip()},
            "gnu_time": {"path": "/usr/bin/time", "sha256": digest(Path("/usr/bin/time")),
                         "version": subprocess.check_output(["/usr/bin/time", "--version"], text=True).splitlines()[0]},
            "checkout_git_head": subprocess.check_output(["git", "-C", str(Path(__file__).resolve().parent), "rev-parse", "HEAD"], text=True).strip(),
            "platform": platform.platform(), "uname": list(platform.uname()),
            "os_release": Path("/etc/os-release").read_text(), "memory_info": Path("/proc/meminfo").read_text(),
            "cgroup": Path("/proc/self/cgroup").read_text(), "cpu_info": Path("/proc/cpuinfo").read_text(),
            "job_environment": {name: os.environ.get(name) for name in names},
            "pip_freeze": subprocess.check_output([sys.executable, "-m", "pip", "freeze", "--all"], text=True),
            "uid": os.getuid(), "nice": os.getpriority(os.PRIO_PROCESS, 0)}


def validate_result(value: dict, baseline: dict, exact_candidate: dict) -> None:
    assert value["git_commit"] == baseline["git_commit"]
    assert exact_candidate["head"] == baseline["git_commit"]
    assert value["oracle_equal"] is True
    assert len(value["rows"]) == 3
    for index, row in enumerate(value["rows"]):
        assert row["iteration"] == index and row["warmup"] == (index == 0)
        assert row["manual_exit"] == "delivered" and row["query2_deliveries"] == 1 and row["retries"] == 0
        assert row["manual_seconds"] > 0 and row["query2_seconds"] > 0
    expected = {f"{index}-{kind}" for index in range(3) for kind in ("manual", "query2")}
    assert set(value["resources"]) == expected | {"component"}
    for name in expected:
        resource = value["resources"][name]
        assert resource["python_processes"] and resource["git_processes"], (name, "missing process records")
        def roles(rows: list[dict]) -> dict[str, int]:
            counts = {"command": 0, "validation": 0, "provider": 0}
            for process in rows:
                argv = process["argv"]
                assert argv
                if argv[0].endswith("runtime/command.py"):
                    counts["command"] += 1
                elif argv[0].endswith("/gh"):
                    counts["provider"] += 1
                else:
                    counts["validation"] += 1
            return counts
        expected_roles = {"command": 1, "validation": 3, "provider": (7 if name == "0-manual" else 6) if name.endswith("manual") else 4}
        assert roles(resource["python_processes"]) == roles(baseline["resources"][name]["python_processes"]) == expected_roles, (name, "Missing Python process scope")
        commands = [row for row in resource["python_processes"] if row["argv"] and row["argv"][0].endswith("runtime/command.py")]
        assert len(commands) == 1
        for row in resource["python_processes"]:
            assert isinstance(row["python_process_peak_rss_bytes"], int) and row["python_process_peak_rss_bytes"] > 0
            assert row["python_process_user_seconds"] >= 0 and row["python_process_system_seconds"] >= 0
        for row in resource["git_processes"]:
            assert isinstance(row["peak_rss_bytes"], int) and row["peak_rss_bytes"] > 0, (name, "missing Git RSS")
        for batch in commands[0].get("git_batches", []):
            assert batch["returncode"] == 0


def environment_identity(value: dict) -> dict:
    """Memory availability and CPU frequencies are observations, not identities."""
    return {key: item for key, item in value.items() if key not in ("memory_info", "cpu_info")}
