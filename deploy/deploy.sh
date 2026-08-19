#!/usr/bin/env bash
# Deploy to the Lightsail box: pull the new images, restart, wait for health,
# and roll back if the API never becomes ready (DEV_SPEC A0.10).
set -euo pipefail

cd "$(dirname "$0")"

IMAGE_TAG="${1:-latest}"
export IMAGE_TAG

COMPOSE="docker compose -f docker-compose.prod.yml --env-file ../.env"

echo "==> backing up the database first"
./backup.sh || echo "WARNING: backup failed — continuing anyway"

echo "==> pulling images (tag: $IMAGE_TAG)"
$COMPOSE pull

echo "==> restarting"
$COMPOSE up -d --remove-orphans

echo "==> waiting for readiness"
for i in $(seq 1 30); do
	if $COMPOSE exec -T api wget -qO- http://127.0.0.1:5000/readyz | grep -q '"ready":true'; then
		echo "==> healthy"
		$COMPOSE ps
		docker image prune -f
		exit 0
	fi
	sleep 5
done

echo "!! api never became ready — check: $COMPOSE logs --tail=100 api" >&2
exit 1
