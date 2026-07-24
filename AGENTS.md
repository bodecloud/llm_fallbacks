# AGENTS.md

Durable instructions for AI agents working in this repository. Follow these conventions, commands, and verification steps unless the user explicitly overrides them for a single task.

## Project overview

`llm-fallbacks` is a Python library for managing LLM API fallbacks on top of [LiteLLM](https://github.com/BerriAI/litellm). It is a pure Python package — no HTTP server in `src/`. Optional gateway runtime lives in `deploy/` (Docker Compose).

- **Python:** 3.10+ (CI tests 3.10, 3.11, 3.12)
- **License:** MIT
- **Package version:** declared in `src/llm_fallbacks/__init__.py`
- **User docs:** `README.md`

## Repository layout

| Path | Purpose |
|------|---------|
| `src/llm_fallbacks/` | Package source |
| `tests/` | Pytest suite (flat layout, no `conftest.py`) |
| `configs/` | Generated model-list artifacts (committed; updated daily by CI) |
| `deploy/` | Optional Docker Compose stack (LiteLLM proxy + config-updater); cloud via `Dockerfile.gateway` |
| `docs/` | Static GitHub Pages chat UI (`index.html`, `app.js`, `config.js`) |
| `edge/` | Cloudflare Worker primary proxy (TypeScript, Wrangler) |
| `.github/workflows/` | CI, PyPI publish, daily config refresh |
| `setup.py` | Packaging manifest (`setuptools`, `src/` layout) |
| `pyproject.toml` | Tool config only (black, isort, ruff, mypy) — no `[project]` block |
| `requirements.txt` | Runtime deps for local dev and CI |
| `requirements-dev.txt` | Dev tooling (pytest, ruff, mypy, pre-commit, mkdocs) |
| `.compound-engineering/` | Compound Engineering local config (see below) |

**Agent instruction files:** `AGENTS.md` (canonical), `CLAUDE.md` (shim → `@AGENTS.md`), `.cursor/rules/` (focused Cursor rules).

**Not present:** `CONCEPTS.md`, `docs/`, `docs/solutions/`, `CONTRIBUTING.md`.

## Module map

| Module | Responsibility |
|--------|----------------|
| `core.py` | LiteLLM model registry access, cost/limit sorting, typed model getters, `get_fallback_list()` |
| `config.py` | Provider config dataclasses; import-time model enrichment from provider APIs |
| `filter_litellm.py` | `filter_models()` and module-level priority-order lists |
| `quality.py` | `compute_quality_score()` — deterministic `heuristic_v1` scoring (0–100) |
| `generate_configs.py` | CLI to write `configs/*` artifacts; used by daily CI workflow |
| `__main__.py` | Tkinter GUI (`python -m llm_fallbacks` or `llm-fallbacks` console script) |
| `__init__.py` | Public API re-exports (`__all__`) |

Public API surface is re-exported from `src/llm_fallbacks/__init__.py`. Prefer extending existing modules over adding parallel abstractions.

## Development setup

```bash
python -m pip install --upgrade pip
pip install -r requirements.txt
pip install -e .
pip install -r requirements-dev.txt   # optional: full local tooling
pre-commit install                    # optional: git hooks
```

**Dependency note:** `setup.py` declares `litellm`, `numpy`, and `pandas`. `requirements.txt` also includes `requests` and `pyyaml`, which `config.py` and `generate_configs.py` use. For full functionality, install from `requirements.txt` before the editable package — not bare `pip install -e .` alone.

Dev tools (`ruff`, `black`, `mypy`, `pytest`, etc.) install to `~/.local/bin`. If commands are not found:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

## Environment variables

| Variable | Used in | Notes |
|----------|---------|-------|
| `OPENROUTER_API_KEY` | `config.py`, CI, daily workflow | Not required (`api_key_required=False`), but when set triggers live OpenRouter fetch at import. **Always use `dummy` for tests.** |
| `OPENAI_API_KEY` | `config.py` | Optional; derived as `{PROVIDER}_API_KEY` |
| `GROQ_API_KEY` | `config.py` | Optional |
| `LITELLM_LOCAL_MODEL_COST_MAP` | `core.py` | Set to `True` to use local LiteLLM backup JSON instead of GitHub fetch |

Provider env keys follow `{PROVIDER_NAME.upper()}_API_KEY` in `CustomProviderConfig._parse_api_key()`.

## Commands and verification

Canonical commands (also enforced in `.github/workflows/python-package.yml`):

```bash
ruff check .
black --check .
OPENROUTER_API_KEY=dummy pytest --cov=llm_fallbacks tests/ -v
python3 -m build
```

**Generate configs locally:**

```bash
python -m llm_fallbacks.generate_configs --output-dir configs
# Deploy-ready YAML for Docker stack:
python -m llm_fallbacks.generate_configs --output-dir /path/to/config --deploy
```

See [deploy/README.md](deploy/README.md) for the self-hosted gateway stack.

**GUI:**

```bash
python -m llm_fallbacks
```

### CI vs local checks

| Check | CI (`python-package.yml`) | Pre-commit / local |
|-------|---------------------------|---------------------|
| `ruff check .` | Yes | Yes |
| `black --check .` | Yes | Via ruff-format hook |
| `pytest` | Yes | Yes |
| `mypy .` | No | Yes (pre-commit) |
| `isort` | No | Yes (pre-commit) |

CI passing does not guarantee `mypy .` passes locally. Run mypy before large refactors if type safety matters.

## Coding conventions

Derived from `pyproject.toml`, `.editorconfig`, and existing code:

- **Line length:** 120; **indent:** 4 spaces; **quotes:** double (black/ruff)
- **Imports:** `from __future__ import annotations` in most modules; isort force-single-line; 2 blank lines after imports
- **Docstrings:** NumPy convention (`[tool.ruff.lint.pydocstyle]`)
- **Naming:** `snake_case` functions, `PascalCase` classes, `ALL_CAPS` module constants, `_` prefix for private helpers
- **Typing:** permissive mypy config; `TYPE_CHECKING` blocks for heavy types; some `# pyright: ignore` comments exist
- **Patterns:** dataclasses for provider config; module-level singletons computed at import; `if "VAR" not in globals():` re-import guards in `config.py` / `core.py`

### Pre-existing lint findings

Do **not** fix these unless explicitly asked:

- `RUF022` — unsorted `__all__`
- `RUF069` — floating-point comparison
- Missing stubs for `requests` / `yaml`

## Architecture notes

**Import-time side effects:** Importing `llm_fallbacks.config` may hit OpenRouter, OpenAI, Groq APIs and GitHub (`core.py`) depending on env keys and network. Always set `OPENROUTER_API_KEY=dummy` when running tests or scripts that import the package.

**Module-level computed state:** Provider/model logic populates import-time globals (`ALL_MODELS`, `FREE_MODELS`, priority order lists in `filter_litellm.py`). Changes to provider logic affect all downstream imports.

**Local providers excluded from free list:** `ollama`, `vllm`, `lmstudio`, `xinference` are filtered out of `free_models.json` (`generate_configs.py`).

## Generated configs (`configs/`)

Artifacts are committed and refreshed daily at midnight UTC (`.github/workflows/daily-config-update.yml`). Key files:

- `free_models.json` / `free_models_ids.txt` — free models sorted by quality score
- `all_models.json` — full model-id → spec map
- `litellm_config.yaml` / `litellm_config_free.yaml` — LiteLLM proxy configs

When changing `generate_configs.py` or `quality.py`, run the generator locally and expect large diffs. Avoid reading entire `litellm_config.yaml` into context — files are large.

## Testing

- Flat `tests/` layout: `test_core.py` (integration smoke against live registry), `test_generate.py` and `test_quality.py` (unit tests with inline fixtures)
- `test_core.py` depends on live LiteLLM model data — assertions may vary with upstream registry changes
- No shared `conftest.py` or pytest fixtures file; inline fixture dicts are the pattern

## Review expectations

When reviewing or submitting changes:

1. Run the canonical verification commands above before claiming done
2. Keep diffs focused — match existing module boundaries and naming
3. Do not drive-by fix pre-existing lint/type issues
4. If changing config generation or quality scoring, include regenerated `configs/` or note that daily CI will commit them
5. Preserve backward compatibility of the public API exported from `__init__.py` unless the user requests a breaking change
6. Project-specific Compound Engineering review guidance lives here; agent selection is automatic via `ce-code-review`

## Common pitfalls

1. Forgetting `OPENROUTER_API_KEY=dummy` — triggers live API calls at import
2. Installing only `setup.py` deps — missing `requests`/`pyyaml` breaks config generation
3. Assuming CI runs mypy — it does not
4. Editing `configs/` manually — prefer regenerating via `generate_configs`
5. Adding tests that mock nothing in `test_core.py` style vs unit tests with inline fixtures in other files
6. GUI requires Tkinter (may be absent on minimal Linux images)
7. No root `main.py` — entry points are `python -m llm_fallbacks` and `llm-fallbacks`
8. `agentdecompile_projects/` is local Ghidra artifacts, not part of the package

## Compound Engineering

Local preferences live in `.compound-engineering/config.local.yaml` (gitignored). Copy from `.compound-engineering/config.local.example.yaml` to customize work delegation, output format, or product pulse settings. All options are commented out by default.

Re-run the `ce-setup` skill to verify tooling and config health.

## Cursor Cloud specific instructions

These notes apply to Cursor Cloud agent environments:

### Environment variable requirement

The OpenRouter provider is configured with `api_key_required=False`, so the library can be imported **without** setting `OPENROUTER_API_KEY`. However, when the key is set (even to a dummy value), OpenRouter model enrichment is attempted at import time. For tests, always set it so coverage includes the OpenRouter code paths:

```
OPENROUTER_API_KEY=dummy pytest tests/
```

### Quick command reference

See `README.md` and `.github/workflows/python-package.yml` for canonical commands:

- **Lint:** `ruff check .`
- **Format check:** `black --check .`
- **Type check:** `mypy .`
- **Tests:** `OPENROUTER_API_KEY=dummy pytest --cov=llm_fallbacks tests/ -v`
- **Pages e2e:** `npm ci && npx playwright install chromium && npm run test:e2e`
- **Build:** `python3 -m build`
