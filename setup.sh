#!/usr/bin/env bash
set -euo pipefail

MEDIA_DIR="/opt/appdata/media"
REPORTS_DIR="/opt/appdata/reports"
ENV_FILE=".env"
ENV_EXAMPLE=".env.example"
COMPOSE_FILE="docker-compose.yml"

echo "Preparing host directories..."
mkdir -p "${MEDIA_DIR}" "${REPORTS_DIR}"
chown -R 1000:1000 "${MEDIA_DIR}" "${REPORTS_DIR}"

if [[ ! -f "${ENV_EXAMPLE}" ]]; then
    echo "ERROR: ${ENV_EXAMPLE} is missing in project root."
    exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
    cp "${ENV_EXAMPLE}" "${ENV_FILE}"
    echo "Created ${ENV_FILE} from ${ENV_EXAMPLE}."
    echo "WARNING: Edit .env and set real database credentials before starting containers."
else
    echo ".env already exists. Leaving it unchanged."
fi

if ! command -v docker >/dev/null 2>&1; then
    echo "ERROR: docker is not installed or not in PATH."
    exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
    echo "ERROR: docker compose v2 is not available."
    exit 1
fi

if [[ ! -f "${COMPOSE_FILE}" ]]; then
    echo "ERROR: ${COMPOSE_FILE} is missing in project root."
    exit 1
fi

echo "Pulling latest base images referenced by the compose stack..."
docker compose pull || true

echo
echo "Setup completed successfully:"
echo "  - Ensured ${MEDIA_DIR} exists"
echo "  - Ensured ${REPORTS_DIR} exists"
echo "  - Applied ownership 1000:1000 to both directories"
echo "  - Ensured ${ENV_FILE} exists"
echo "  - Verified docker and docker compose availability"
echo "  - Pulled latest images where available"
echo
echo "Next steps:"
echo "  1) Edit .env and fill all required values"
echo "  2) Build images: docker compose build --pull"
echo "  3) Start stack:  docker compose up -d"
