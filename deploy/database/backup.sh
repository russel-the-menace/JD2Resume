#!/bin/sh
set -eu

backup_dir=/opt/jd2resume/backups
container=jd2resume-postgres
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
target="$backup_dir/jd2resume-$timestamp.sql.gz"

install -d -m 700 "$backup_dir"
docker exec "$container" sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges' | gzip -9 > "$target"
chmod 600 "$target"
gzip -t "$target"
find "$backup_dir" -type f -name 'jd2resume-*.sql.gz' -mtime +14 -delete
