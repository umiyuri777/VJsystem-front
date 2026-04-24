#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=${K6_ENV_FILE:-test/k6/.env}
ROOT_ENV_FILE=${ROOT_ENV_FILE:-.env}

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

if [[ -f "$ROOT_ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ROOT_ENV_FILE"
  set +a
fi

k6 run "$@"