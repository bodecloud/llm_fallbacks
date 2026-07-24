# Config-updater image for the self-hosted free-model gateway stack.
# Build context: repository root (see docker-compose.yml).

FROM python:3.12-slim-bookworm

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends docker-cli \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt setup.py pyproject.toml README.md ./
COPY src ./src
COPY deploy/scripts ./deploy/scripts

RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir -e .

RUN chmod +x /app/deploy/scripts/update-config.sh

ENV PYTHONUNBUFFERED=1

ENTRYPOINT ["/app/deploy/scripts/update-config.sh"]
