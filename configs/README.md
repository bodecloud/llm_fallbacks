# Configuration files

Generated artifacts for the LLM Fallbacks library. Updated daily at 12:00 AM UTC via [GitHub Actions](../.github/workflows/daily-config-update.yml).

Do not hand-edit JSON/YAML here — regenerate with `generate_configs`.

## Files

### `free_models.json`

Free models sorted by `quality_score` (descending). Example entry:

```json
{
  "id": "gemini/gemini-2.0-flash",
  "provider": "gemini",
  "mode": "chat",
  "is_free": true,
  "input_cost_per_token": 0,
  "output_cost_per_token": 0,
  "context_length": 1000000,
  "max_output_tokens": 8192,
  "supports_vision": true,
  "supports_function_calling": true,
  "supports_tool_choice": true,
  "supports_response_schema": true,
  "supports_system_messages": true,
  "supports_audio_input": false,
  "supports_audio_output": false,
  "supports_pdf_input": false,
  "supports_prompt_caching": true,
  "quality_score": 85.26,
  "quality_source": "heuristic_v1"
}
```

Local-only providers (`ollama`, `vllm`, `lmstudio`, `xinference`) are excluded.

The [GitHub Pages chat UI](../docs/index.html) loads this file for the model browser. The Models panel and composer picker show `quality_score`, formatted `context_length`, and capability badges (`vision`, `tools`, `schema`) derived from the fields above.

### `free_models_ids.txt`

One model ID per line, same order as `free_models.json`:

```bash
curl -s https://raw.githubusercontent.com/bodecloud/llm_fallbacks/main/configs/free_models_ids.txt | head -10
```

### `all_models.json`

Full `model_id → spec` map for all LiteLLM-known models (including paid).

### `custom_providers.json`

Serialised custom provider configs (OpenRouter, Groq, Cerebras, Google AI Studio, Mistral, DeepSeek, Together AI, Fireworks, SambaNova, NVIDIA NIM, Cohere, GitHub Models, HuggingFace, and others).

### `provider_urls.json`

Provider name → OpenAI-compatible base URL (public hosts only):

```json
{
  "groq": "https://api.groq.com/openai/v1",
  "openrouter": "https://openrouter.ai/api/v1"
}
```

Used by the chat UI and edge proxy for metadata — not for browser-direct provider calls.

### `chat_proxy.json`

Zero-config endpoint bootstrap for the public chat UI. Updated by `.github/workflows/deploy-proxies.yml` after Worker deploy. **Preserves existing secondary URLs** when `LITELLM_URL` is unset:

```json
{
  "endpoints": [
    "https://llm-fallbacks-proxy.bocloud.workers.dev",
    "https://llm-fallbacks-gateway.onrender.com"
  ],
  "guestToken": "llm-fallbacks-public",
  "description": "Zero-config demo proxy for GitHub Pages chat."
}
```

Bootstrap is three-layer: Pages CI writes `docs/config.js`, the browser fetches this file via `chatProxyUrl`, and `loadRuntimeConfig()` merges both into `FailoverProvider`.

### `litellm_config.yaml` / `litellm_config_free.yaml`

LiteLLM proxy configs for library consumers and raw URL fetchers.

**Library artifact (default):** includes the `free` alias, random `master_key`, localhost Redis/Postgres placeholders.

```bash
litellm --config configs/litellm_config_free.yaml
```

**Deploy-ready YAML:** pass `--deploy` (or `LLM_FALLBACKS_DEPLOY=1`) for env placeholders and minimal observability — used by [`deploy/`](../deploy/README.md).

```bash
python -m llm_fallbacks.generate_configs --output-dir configs --deploy
```

## Generation

```bash
python -m llm_fallbacks.generate_configs --output-dir configs
```

## Update schedule

- **Automatic:** Daily at 12:00 AM UTC via GitHub Actions
- **Manual:** Workflow dispatch or local run
- Changes are committed to version control

## Quality scoring

`quality_score` in `free_models.json` is a capability heuristic (0–100): context window, tools, vision, and other observable features. See the [README](../README.md#quality-scoring) for the full breakdown.
