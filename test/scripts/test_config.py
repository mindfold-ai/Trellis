"""Unit tests for .trellis/scripts/common/config.py — submodule & git-repo functions."""

from __future__ import annotations

import sys
import textwrap
from pathlib import Path

import pytest

# Add scripts to path so we can import common.*
SCRIPTS_DIR = Path(__file__).resolve().parent.parent.parent / ".trellis" / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

from common.config import get_default_package, get_git_packages, get_packages, get_submodule_packages


@pytest.fixture
def config_repo(tmp_path: Path) -> Path:
    """Create a minimal repo with .trellis/config.yaml."""
    trellis = tmp_path / ".trellis"
    trellis.mkdir()
    # git init so get_repo_root() can find it
    import subprocess

    subprocess.run(["git", "init"], cwd=str(tmp_path), capture_output=True, check=True)
    return tmp_path


def _write_config(repo: Path, content: str) -> None:
    (repo / ".trellis" / "config.yaml").write_text(textwrap.dedent(content))


class TestGetSubmodulePackages:
    def test_with_submodules(self, config_repo: Path) -> None:
        _write_config(
            config_repo,
            """\
            packages:
              cli:
                path: packages/cli
              docs-site:
                path: docs-site
                type: submodule
              other-sub:
                path: libs/other
                type: submodule
            """,
        )
        result = get_submodule_packages(config_repo)
        assert result == {"docs-site": "docs-site", "other-sub": "libs/other"}

    def test_no_submodules(self, config_repo: Path) -> None:
        _write_config(
            config_repo,
            """\
            packages:
              cli:
                path: packages/cli
              web:
                path: packages/web
            """,
        )
        result = get_submodule_packages(config_repo)
        assert result == {}

    def test_no_packages_config(self, config_repo: Path) -> None:
        _write_config(config_repo, "session_commit_message: test\n")
        result = get_submodule_packages(config_repo)
        assert result == {}

    def test_empty_config(self, config_repo: Path) -> None:
        _write_config(config_repo, "")
        result = get_submodule_packages(config_repo)
        assert result == {}

    def test_no_config_file(self, config_repo: Path) -> None:
        # Don't write any config file
        (config_repo / ".trellis" / "config.yaml").unlink(missing_ok=True)
        result = get_submodule_packages(config_repo)
        assert result == {}


class TestGetPackages:
    def test_returns_all_packages(self, config_repo: Path) -> None:
        _write_config(
            config_repo,
            """\
            packages:
              cli:
                path: packages/cli
              docs:
                path: docs-site
                type: submodule
            """,
        )
        result = get_packages(config_repo)
        assert "cli" in result
        assert "docs" in result
        assert result["cli"]["path"] == "packages/cli"
        assert result["docs"]["type"] == "submodule"

    def test_empty_returns_empty_dict(self, config_repo: Path) -> None:
        _write_config(config_repo, "")
        assert get_packages(config_repo) == {}


class TestGetDefaultPackage:
    def test_returns_configured_default(self, config_repo: Path) -> None:
        _write_config(config_repo, "default_package: cli\n")
        assert get_default_package(config_repo) == "cli"

    def test_returns_none_when_not_configured(self, config_repo: Path) -> None:
        _write_config(config_repo, "")
        assert get_default_package(config_repo) is None


class TestGetGitPackages:
    """Tests for get_git_packages() — packages with independent git repos."""

    def test_with_git_packages(self, config_repo: Path) -> None:
        _write_config(
            config_repo,
            """\
            packages:
              frontend:
                path: iqs-front
                git: true
              backend:
                path: iqs
                git: true
              docs:
                path: docs-site
                type: submodule
            """,
        )
        result = get_git_packages(config_repo)
        assert result == {"frontend": "iqs-front", "backend": "iqs"}

    def test_no_git_packages(self, config_repo: Path) -> None:
        _write_config(
            config_repo,
            """\
            packages:
              cli:
                path: packages/cli
              docs:
                path: docs-site
                type: submodule
            """,
        )
        result = get_git_packages(config_repo)
        assert result == {}

    def test_git_false_ignored(self, config_repo: Path) -> None:
        _write_config(
            config_repo,
            """\
            packages:
              backend:
                path: iqs
                git: false
            """,
        )
        result = get_git_packages(config_repo)
        assert result == {}

    def test_no_packages_config(self, config_repo: Path) -> None:
        _write_config(config_repo, "session_commit_message: test\n")
        result = get_git_packages(config_repo)
        assert result == {}

    def test_empty_config(self, config_repo: Path) -> None:
        _write_config(config_repo, "")
        result = get_git_packages(config_repo)
        assert result == {}

    def test_mixed_submodule_and_git(self, config_repo: Path) -> None:
        """Submodule and git repo flags are independent."""
        _write_config(
            config_repo,
            """\
            packages:
              api:
                path: api
                git: true
              docs:
                path: docs
                type: submodule
              web:
                path: web
            """,
        )
        git_pkgs = get_git_packages(config_repo)
        sub_pkgs = get_submodule_packages(config_repo)
        assert git_pkgs == {"api": "api"}
        assert sub_pkgs == {"docs": "docs"}
