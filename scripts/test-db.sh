#!/usr/bin/env bash
set -euo pipefail
# Always creates and removes its own disposable local container. No DB URL input.
docker_local() {
  env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH docker --host=unix:///var/run/docker.sock "$@"
}
container_id=$(docker_local run --detach --rm --tmpfs /var/lib/postgresql/data --publish 127.0.0.1::5432 --env POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine)
cleanup() { docker_local stop "$container_id" >/dev/null 2>&1 || true; }
trap cleanup EXIT
for attempt in $(seq 1 30); do
  if docker_local exec "$container_id" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
docker_local exec "$container_id" pg_isready -U postgres >/dev/null
port=$(docker_local port "$container_id" 5432/tcp)
P0_DISPOSABLE_DB=1 P0_TEST_PG_PORT="${port##*:}" node --import tsx --test tests/integration/database.test.mts
