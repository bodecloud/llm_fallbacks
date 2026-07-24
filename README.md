# LLM Fallbacks

[![Python Package](https://github.com/bodecloud/llm_fallbacks/actions/workflows/python-package.yml/badge.svg)](https://github.com/bodecloud/llm_fallbacks/actions/workflows/python-package.yml)
[![Daily Config Update](https://github.com/bodecloud/llm_fallbacks/actions/workflows/daily-config-update.yml/badge.svg)](https://github.com/bodecloud/llm_fallbacks/actions/workflows/daily-config-update.yml)
[![GitHub Pages](https://img.shields.io/badge/chat-GitHub%20Pages-blue)](https://bodecloud.github.io/llm_fallbacks/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Python library for managing fallbacks for LLM API calls using the [LiteLLM](https://github.com/BerriAI/litellm) library.

## Features

- 🔄 **Automatic Fallbacks**: Gracefully handle API failures by providing alternative models
- 📊 **Model Filtering**: Filter models based on various criteria like cost, context length, and capabilities
- 💰 **Cost Optimization**: Sort models by cost to optimize your API usage
- 🧠 **Model Discovery**: Discover available models and their capabilities
- 🏆 **Quality Scoring**: Transparent heuristic scoring of free models based on capabilities
- 📦 **Machine-Consumable Artifacts**: Daily-updated JSON/text lists of free models, ready for downstream use
- 🌐 **Web Chat UI**: Public GitHub Pages chat with browser-first llm-fallbacks routing (BYOK)
- 🛠️ **GUI Tool**: Includes a GUI tool for exploring and filtering available models

## Installation

```bash
pip install llm-fallbacks
```

## Quick Start

```python
from llm_fallbacks import get_chat_models, filter_models, get_fallback_list

# Get all available chat models
chat_models = get_chat_models()
print(f"Found {len(chat_models)} chat models")

# Filter models based on criteria
vision_models = filter_models(
    model_type="chat",
    supports_vision=True,
    max_cost_per_token=0.001
)
print(f"Found {len(vision_models)} vision-capable models under 0.001 per token")

# Get a fallback list for a specific model type
fallbacks = get_fallback_list("chat")
print(f"Recommended fallback order: {fallbacks}")
```

## Self-Hosted Gateway

Run a local OpenAI-compatible proxy with a self-hosted `free` model alias (ranked fallback chain over discovered free models):

```bash
cp deploy/.env.example deploy/.env
# Set LITELLM_MASTER_KEY and OPENROUTER_API_KEY in deploy/.env

docker compose -f deploy/docker-compose.yml --env-file deploy/.env up --build
```

See [deploy/README.md](deploy/README.md) for smoke tests, environment variables, and the difference between `free` and `openrouter/free`.

## Live Chat Demo (GitHub Pages)

A static chat UI ships in [`docs/`](docs/index.html) and deploys to GitHub Pages as the project homepage:

**https://bodecloud.github.io/llm_fallbacks/**

Architecture:

- **Pages** — static UI loads `free_models.json`; no provider API keys in the browser
- **Cloudflare Worker** — primary OpenAI-compatible proxy (guest token + short model chain)
- **Render/Koyeb LiteLLM** — secondary backend with full `free` alias fallback chain

See [edge/README.md](edge/README.md), [STRATEGY.md](STRATEGY.md), and [docs/plans/2026-07-24-002-feat-static-chat-ha-gateway-plan.md](docs/plans/2026-07-24-002-feat-static-chat-ha-gateway-plan.md).

## Automated Model Lists

The `configs/` directory contains machine-consumable model lists that are **automatically updated daily** at midnight UTC via GitHub Actions.

### Available Artifacts

| File | Description |
|------|-------------|
| [`free_models.json`](configs/free_models.json) | Rich array of free models sorted by quality score, with capabilities and metadata |
| [`free_models_ids.txt`](configs/free_models_ids.txt) | Plain text list of free model IDs, one per line (same order as JSON) |
| [`all_models.json`](configs/all_models.json) | Full model-id → spec map for all known models |
| [`custom_providers.json`](configs/custom_providers.json) | Serialised custom provider configurations |
| [`provider_urls.json`](configs/provider_urls.json) | Provider name → OpenAI-compatible base URL map |
| [`litellm_config.yaml`](configs/litellm_config.yaml) | LiteLLM proxy config with all models |
| [`litellm_config_free.yaml`](configs/litellm_config_free.yaml) | LiteLLM proxy config with free models only |

### Stable Raw URLs

Downstream projects can fetch the latest lists directly:

```
https://raw.githubusercontent.com/bodecloud/llm_fallbacks/main/configs/free_models.json
https://raw.githubusercontent.com/bodecloud/llm_fallbacks/main/configs/free_models_ids.txt
```

### Consumer Examples

**Python:**
```python
import json
import urllib.request

url = "https://raw.githubusercontent.com/bodecloud/llm_fallbacks/main/configs/free_models.json"
with urllib.request.urlopen(url) as resp:
    free_models = json.loads(resp.read())

# Get top 5 free models by quality
for model in free_models[:5]:
    print(f"{model['id']:50s}  quality={model['quality_score']:.1f}  mode={model['mode']}")
```

**curl:**
```bash
# Get just the model IDs
curl -s https://raw.githubusercontent.com/bodecloud/llm_fallbacks/main/configs/free_models_ids.txt

# Get full JSON
curl -s https://raw.githubusercontent.com/bodecloud/llm_fallbacks/main/configs/free_models.json | python3 -m json.tool | head -30
```

### Quality Scoring

Each free model in `free_models.json` includes a `quality_score` (0–100) computed from a transparent, deterministic heuristic (`heuristic_v1`):

| Factor | Max Points | Description |
|--------|-----------|-------------|
| Context window | 30 | Log-scaled: 4K→0, 8K→5, 32K→15, 128K→25, 1M→30 |
| Max output tokens | 10 | Log-scaled bonus for large output windows |
| Function calling | 10 | Supports function/tool calling |
| Vision | 8 | Supports image input |
| Response schema | 7 | Supports structured output schemas |
| Tool choice | 5 | Supports tool choice parameter |
| System messages | 5 | Supports system message role |
| Parallel function calling | 5 | Supports parallel tool calls |
| Prompt caching | 3 | Supports prompt caching |
| Audio input | 3 | Supports audio input |
| Audio output | 3 | Supports audio output |
| PDF input | 3 | Supports PDF document input |
| Assistant prefill | 3 | Supports assistant message prefill |

The raw sum is normalised to 0–100. The score is a **capability heuristic**, not a benchmark — it reflects what the model _can do_, not how well it does it.

### Supported Free Providers

The library tracks 20+ free-tier API providers:

| Provider | Free Tier | Sign-up |
|----------|-----------|---------|
| [OpenRouter](https://openrouter.ai) | 50 req/day, 24+ free models | No CC |
| [Groq](https://console.groq.com) | 30–60 RPM, Llama 3.3 70B | No CC |
| [Cerebras](https://cloud.cerebras.ai) | 30 RPM, 1M tokens/day | No CC |
| [Google AI Studio](https://aistudio.google.com) | 250K TPM, Gemini models | No CC |
| [Mistral](https://console.mistral.ai) | 1B tokens/month | Phone verify |
| [DeepSeek](https://platform.deepseek.com) | V3, R1, generous limits | No CC |
| [Together AI](https://api.together.xyz) | $5 credits, Llama 4 | No CC |
| [Fireworks AI](https://fireworks.ai) | 10 RPM free tier | No CC |
| [SambaNova](https://cloud.sambanova.ai) | $5 credits, Llama 3.3 70B | No CC |
| [NVIDIA NIM](https://build.nvidia.com) | 40 RPM, 1K credits | No CC |
| [Cohere](https://cohere.com) | 1K req/month, Command R+ | No CC |
| [GitHub Models](https://github.com/marketplace/models) | 50–150 req/day | GitHub account |
| [HuggingFace](https://huggingface.co) | 300+ models, small credits | No CC |
| + Novita, Hyperbolic, Nebius, GLHF, Featherless, Chutes, Completions.me | | |

When API keys for these providers are set as repository secrets, the daily workflow enriches the model list with additional models discovered via their `/models` endpoints. This is optional — the generator works without any keys, using LiteLLM's public model database plus OpenRouter when configured.

## Generating Configs Locally

```bash
# Generate all artifacts into configs/
python -m llm_fallbacks.generate_configs --output-dir configs

# With OpenRouter enrichment
OPENROUTER_API_KEY=your-key python -m llm_fallbacks.generate_configs --output-dir configs
```

## GUI Tool

LLM Fallbacks includes a GUI tool for exploring and filtering available models:

```bash
python -m llm_fallbacks
```

## API Reference

### Core Functions

- `get_chat_models()`: Get all available chat models
- `get_completion_models()`: Get all available completion models
- `get_embedding_models()`: Get all available embedding models
- `get_image_generation_models()`: Get all available image generation models
- `get_audio_transcription_models()`: Get all available audio transcription models
- `get_audio_speech_models()`: Get all available audio speech models
- `get_moderation_models()`: Get all available moderation models
- `get_rerank_models()`: Get all available rerank models
- `get_vision_models()`: Get all available vision models
- `get_function_calling_models()`: Get all available function calling models
- `get_parallel_function_calling_models()`: Get all available parallel function calling models
- `get_image_input_models()`: Get all available image input models
- `get_audio_input_models()`: Get all available audio input models
- `get_audio_output_models()`: Get all available audio output models
- `get_pdf_input_models()`: Get all available PDF input models
- `get_models()`: Get all available models
- `get_fallback_list(model_type)`: Get a fallback list for a specific model type
- `filter_models(model_type, **kwargs)`: Filter models based on various criteria
- `calculate_cost_per_token(model_spec)`: Calculate the approximate cost per token for a model

### Filtering Models

The `filter_models` function allows you to filter models based on various criteria:

```python
from llm_fallbacks import filter_models

# Get free chat models that support vision
free_vision_models = filter_models(
    model_type="chat",
    free_only=True,
    supports_vision=True
)

# Get models with a minimum context length
long_context_models = filter_models(
    model_type="chat",
    min_context_length=16000
)

# Get models from a specific provider
openai_models = filter_models(
    model_type="chat",
    provider="openai"
)
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
