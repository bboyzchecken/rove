#!/usr/bin/env bash
# Nightly mysqldump to Cloudflare R2 (DEV_SPEC §8.3). Run from cron:
#   0 3 * * * /opt/rove/deploy/backup.sh >> /var/log/rove-backup.log 2>&1
set -euo pipefail

cd "$(dirname "$0")"
source ../.env

STAMP="$(date -u +%Y%m%d-%H%M%S)"
FILE="/tmp/rove-${STAMP}.sql.gz"

docker compose -f docker-compose.prod.yml exec -T mysql \
	mysqldump -u root -p"${MYSQL_ROOT_PASSWORD}" --single-transaction --quick "${MYSQL_DATABASE}" \
	| gzip > "$FILE"

echo "dumped $(du -h "$FILE" | cut -f1) to $FILE"

# TODO(A0.10): upload to R2 with rclone or the aws cli, then keep 14 days:
#   aws s3 cp "$FILE" "s3://${R2_EXPORT_BUCKET}/backups/" --endpoint-url "${R2_ENDPOINT}"

rm -f "$FILE"
