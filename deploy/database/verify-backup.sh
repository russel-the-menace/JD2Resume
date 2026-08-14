#!/bin/sh
set -eu

container=jd2resume-postgres
restore_database=jd2resume_restore_check
latest=$(find /opt/jd2resume/backups -maxdepth 1 -type f -name 'jd2resume-*.sql.gz' | sort | tail -n 1)

if [ -z "$latest" ]; then
  echo 'No JD2Resume backup is available.' >&2
  exit 1
fi

gzip -t "$latest"
docker exec "$container" sh -lc 'dropdb -U "$POSTGRES_USER" --if-exists jd2resume_restore_check'
docker exec "$container" sh -lc 'createdb -U "$POSTGRES_USER" jd2resume_restore_check'
gzip -dc "$latest" | docker exec -i "$container" sh -lc 'psql -U "$POSTGRES_USER" -d jd2resume_restore_check -v ON_ERROR_STOP=1'
table_count=$(docker exec "$container" sh -lc 'psql -U "$POSTGRES_USER" -d jd2resume_restore_check -Atc "select count(*) from information_schema.tables where table_schema = chr(112)||chr(117)||chr(98)||chr(108)||chr(105)||chr(99);"')
docker exec "$container" sh -lc 'dropdb -U "$POSTGRES_USER" jd2resume_restore_check'

if [ "$table_count" -lt 2 ]; then
  echo "Backup restore verification found only $table_count tables." >&2
  exit 1
fi

echo "Backup restore verified with $table_count tables."
