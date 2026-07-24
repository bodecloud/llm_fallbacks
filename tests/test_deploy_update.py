"""Tests for deploy helper scripts."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
UPDATE_SCRIPT = REPO_ROOT / "deploy" / "scripts" / "update-config.sh"


class TestUpdateConfigScript:
    def test_once_mode_generates_litellm_config_free(self, tmp_path: Path):
        env = {"OPENROUTER_API_KEY": "dummy", "CONFIG_DIR": str(tmp_path), "RESTART_LITELLM": "false"}
        result = subprocess.run(
            [str(UPDATE_SCRIPT), "--once"],
            cwd=REPO_ROOT,
            env={**os.environ, **env},
            capture_output=True,
            text=True,
            check=False,
        )
        assert result.returncode == 0, result.stderr
        assert (tmp_path / "litellm_config_free.yaml").is_file()
        assert (tmp_path / ".last_updated").is_file()
        content = (tmp_path / "litellm_config_free.yaml").read_text(encoding="utf-8")
        assert "free" in content
        assert "LITELLM_MASTER_KEY" in content
