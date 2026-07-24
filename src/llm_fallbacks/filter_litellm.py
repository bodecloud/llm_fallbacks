"""Fallback lists for different model types, sorted by cost and token limits."""

from __future__ import annotations

import json
import re

from typing import Any
from pathlib import Path

if __name__ == "__main__":
    import os
    import sys

    sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from llm_fallbacks.config import ALL_CHAT_MODELS, LiteLLMBaseModelSpec
from llm_fallbacks.core import (
    get_audio_input_models,
    get_audio_output_models,
    get_audio_speech_models,
    get_audio_transcription_models,
    get_completion_models,
    get_embedding_models,
    get_function_calling_models,
    get_image_generation_models,
    get_image_input_models,
    get_moderation_models,
    get_pdf_input_models,
    get_rerank_models,
    get_vision_models,
    sort_models_by_cost_and_limits,
)

# Chat Model Fallbacks
CHAT_MODEL_PRIORITY_ORDER: list[tuple[str, LiteLLMBaseModelSpec]] = ALL_CHAT_MODELS

# Completion Model Fallbacks
COMPLETION_MODEL_PRIORITY_ORDER: list[tuple[str, LiteLLMBaseModelSpec]] = sort_models_by_cost_and_limits(
    get_completion_models()
)

# Embedding Model Fallbacks
EMBEDDING_MODEL_PRIORITY_ORDER: list[tuple[str, LiteLLMBaseModelSpec]] = sort_models_by_cost_and_limits(
    get_embedding_models()
)

# Image Generation Model Fallbacks
IMAGE_GENERATION_MODEL_PRIORITY_ORDER: list[tuple[str, LiteLLMBaseModelSpec]] = sort_models_by_cost_and_limits(
    get_image_generation_models()
)

# Audio Transcription Model Fallbacks
AUDIO_TRANSCRIPTION_MODEL_PRIORITY_ORDER: list[tuple[str, LiteLLMBaseModelSpec]] = sort_models_by_cost_and_limits(
    get_audio_transcription_models()
)

# Audio Speech Model Fallbacks
AUDIO_SPEECH_MODEL_PRIORITY_ORDER: list[tuple[str, LiteLLMBaseModelSpec]] = sort_models_by_cost_and_limits(
    get_audio_speech_models()
)

# Moderation Model Fallbacks
MODERATION_MODEL_PRIORITY_ORDER: list[tuple[str, LiteLLMBaseModelSpec]] = sort_models_by_cost_and_limits(
    get_moderation_models()
)

# Rerank Model Fallbacks
RERANK_MODEL_PRIORITY_ORDER: list[tuple[str, LiteLLMBaseModelSpec]] = sort_models_by_cost_and_limits(
    get_rerank_models()
)

# Vision Model Fallbacks
VISION_MODEL_PRIORITY_ORDER: list[tuple[str, LiteLLMBaseModelSpec]] = sort_models_by_cost_and_limits(
    get_vision_models()
)

# Function Calling Model Fallbacks
FUNCTION_CALLING_MODEL_PRIORITY_ORDER: list[tuple[str, LiteLLMBaseModelSpec]] = sort_models_by_cost_and_limits(
    get_function_calling_models()
)

# Image Input Model Fallbacks
IMAGE_INPUT_MODEL_PRIORITY_ORDER: list[tuple[str, LiteLLMBaseModelSpec]] = sort_models_by_cost_and_limits(
    get_image_input_models()
)

# Audio Input Model Fallbacks
AUDIO_INPUT_MODEL_PRIORITY_ORDER: list[tuple[str, LiteLLMBaseModelSpec]] = sort_models_by_cost_and_limits(
    get_audio_input_models()
)

# Audio Output Model Fallbacks
AUDIO_OUTPUT_MODEL_PRIORITY_ORDER: list[tuple[str, LiteLLMBaseModelSpec]] = sort_models_by_cost_and_limits(
    get_audio_output_models()
)

# PDF Input Model Fallbacks
PDF_INPUT_MODEL_PRIORITY_ORDER: list[tuple[str, LiteLLMBaseModelSpec]] = sort_models_by_cost_and_limits(
    get_pdf_input_models()
)


def filter_models(
    model_type: str = "chat",
    *,
    free_only: bool = False,
    max_cost_per_token: float | None = None,
    min_context_length: int | None = None,
    supports_vision: bool | None = None,
    supports_audio_input: bool | None = None,
    supports_audio_output: bool | None = None,
    supports_function_calling: bool | None = None,
    provider: str | None = None,
) -> list[str]:
    """Filter models based on various criteria.

    Args:
        model_type: Type of model to filter ("chat", "completion", "embedding", etc.)
        free_only: Only include free models
        max_cost_per_token: Maximum cost per token
        min_context_length: Minimum context length
        supports_vision: Filter for models that support vision
        supports_audio_input: Filter for models that support audio input
        supports_audio_output: Filter for models that support audio output
        supports_function_calling: Filter for models that support function calling
        provider: Filter for models from a specific provider

    Returns:
        List of model names that match the criteria
    """
    # Get the appropriate models based on model_type
    if model_type == "chat":
        models = dict(CHAT_MODEL_PRIORITY_ORDER)
    elif model_type == "completion":
        models = dict(COMPLETION_MODEL_PRIORITY_ORDER)
    elif model_type == "embedding":
        models = dict(EMBEDDING_MODEL_PRIORITY_ORDER)
    elif model_type == "image_generation":
        models = dict(IMAGE_GENERATION_MODEL_PRIORITY_ORDER)
    elif model_type == "audio_transcription":
        models = dict(AUDIO_TRANSCRIPTION_MODEL_PRIORITY_ORDER)
    elif model_type == "audio_speech":
        models = dict(AUDIO_SPEECH_MODEL_PRIORITY_ORDER)
    elif model_type == "moderation":
        models = dict(MODERATION_MODEL_PRIORITY_ORDER)
    elif model_type == "rerank":
        models = dict(RERANK_MODEL_PRIORITY_ORDER)
    elif model_type == "vision":
        models = dict(VISION_MODEL_PRIORITY_ORDER)
    elif model_type == "function_calling":
        models = dict(FUNCTION_CALLING_MODEL_PRIORITY_ORDER)
    elif model_type == "image_input":
        models = dict(IMAGE_INPUT_MODEL_PRIORITY_ORDER)
    elif model_type == "audio_input":
        models = dict(AUDIO_INPUT_MODEL_PRIORITY_ORDER)
    elif model_type == "audio_output":
        models = dict(AUDIO_OUTPUT_MODEL_PRIORITY_ORDER)
    elif model_type == "pdf_input":
        models = dict(PDF_INPUT_MODEL_PRIORITY_ORDER)
    else:
        raise ValueError(f"Unknown model type: {model_type}")

    # Filter models based on criteria
    filtered_models = {}
    for name, spec in models.items():
        # Skip if not free and free_only is True
        if free_only and spec.get("input_cost_per_token", 0) > 0:
            continue

        # Skip if cost per token is too high
        if max_cost_per_token is not None and spec.get("input_cost_per_token", 0) > max_cost_per_token:
            continue

        # Skip if context length is too small
        if min_context_length is not None and spec.get("max_tokens", 0) < min_context_length:
            continue

        # Skip if vision support doesn't match
        if supports_vision is not None and spec.get("supports_vision", False) != supports_vision:
            continue

        # Skip if audio input support doesn't match
        if supports_audio_input is not None and spec.get("supports_audio_input", False) != supports_audio_input:
            continue

        # Skip if audio output support doesn't match
        if supports_audio_output is not None and spec.get("supports_audio_output", False) != supports_audio_output:
            continue

        # Skip if function calling support doesn't match
        if (
            supports_function_calling is not None
            and spec.get("supports_function_calling", False) != supports_function_calling
        ):
            continue

        # Skip if provider doesn't match
        if provider is not None and not name.startswith(provider):
            continue

        filtered_models[name] = spec

    # Sort and return model names
    sorted_models: list[tuple[str, LiteLLMBaseModelSpec]] = sort_models_by_cost_and_limits(
        filtered_models, free_only=free_only
    )
    return [name for name, _ in sorted_models]


if __name__ == "__main__":

    def convert_floats_in_dict(d: dict) -> dict:
        result: dict[str, Any] = {}
        for k, v in d.items():
            if isinstance(v, dict):
                result[k] = convert_floats_in_dict(v)
            elif isinstance(v, float):
                # Convert to string with many decimal places and strip trailing zeros
                float_str = f"{v:.100f}".rstrip("0")
                # If it ends with decimal point, add back one zero
                if float_str.endswith("."):
                    float_str += "0"
                result[k] = float_str
            else:
                result[k] = v
        return result

    model_priority_orders: dict[str, list[tuple[str, LiteLLMBaseModelSpec]]] = {
        "Chat Model Priority Order": CHAT_MODEL_PRIORITY_ORDER,
        "Completion Model Priority Order": COMPLETION_MODEL_PRIORITY_ORDER,
        "Embedding Model Priority Order": EMBEDDING_MODEL_PRIORITY_ORDER,
        "Image Generation Model Priority Order": IMAGE_GENERATION_MODEL_PRIORITY_ORDER,
        "Audio Transcription Model Priority Order": AUDIO_TRANSCRIPTION_MODEL_PRIORITY_ORDER,
        "Audio Speech Model Priority Order": AUDIO_SPEECH_MODEL_PRIORITY_ORDER,
        "Moderation Model Priority Order": MODERATION_MODEL_PRIORITY_ORDER,
        "Rerank Model Priority Order": RERANK_MODEL_PRIORITY_ORDER,
        "Vision Model Priority Order": VISION_MODEL_PRIORITY_ORDER,
        "Function Calling Model Priority Order": FUNCTION_CALLING_MODEL_PRIORITY_ORDER,
        "Image Input Model Priority Order": IMAGE_INPUT_MODEL_PRIORITY_ORDER,
        "Audio Input Model Priority Order": AUDIO_INPUT_MODEL_PRIORITY_ORDER,
        "Audio Output Model Priority Order": AUDIO_OUTPUT_MODEL_PRIORITY_ORDER,
        "PDF Input Model Priority Order": PDF_INPUT_MODEL_PRIORITY_ORDER,
    }
    from pathlib import Path

    model_priority_orders_path: Path = Path(__file__).parent / "model_priority_orders.json"
    converted_orders: dict[str, list[tuple[str, LiteLLMBaseModelSpec]]] = convert_floats_in_dict(model_priority_orders)
    json_output: str = json.dumps(converted_orders, indent=2)
    # Only remove quotes around values, not keys
    json_output = json.dumps(json.loads(json_output), indent=2, separators=(",", ": "))
    # Handle both cases - with and without trailing comma
    json_output = (
        json_output.replace('": "', '": ')
        .replace('",\n', ",\n")
        .replace('"\n', ",\n")
        .replace('"}', "}")
        .replace('"]', "]")
    )
    # Remove trailing comma before closing brace/bracket
    json_output = re.sub(r",(\s*[}\]])", r"\1", json_output)
    json_output = json_output.replace(": nan", ": -1").replace(": inf", ": -1")
    model_priority_orders_path.write_text(json_output)
