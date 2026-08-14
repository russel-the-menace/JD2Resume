#!/bin/sh
set -eu

base_dir=/opt/jd2resume/database
env_file="$base_dir/.env"

install -d -m 700 "$base_dir" /opt/jd2resume/backups
if [ ! -f "$env_file" ]; then
  password=$(openssl rand -hex 32)
  umask 077
  {
    printf 'POSTGRES_DB=jd2resume\n'
    printf 'POSTGRES_USER=jd2resume\n'
    printf 'POSTGRES_PASSWORD=%s\n' "$password"
    printf 'JD2RESUME_DB_PORT=55432\n'
  } > "$env_file"
fi
chmod 600 "$env_file"
chmod 700 "$base_dir/backup.sh"

docker compose --project-directory "$base_dir" -f "$base_dir/compose.yaml" up -d

attempt=0
until [ "$(docker inspect --format '{{.State.Health.Status}}' jd2resume-postgres 2>/dev/null || true)" = healthy ]; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    docker logs --tail 100 jd2resume-postgres
    exit 1
  fi
  sleep 2
done

install -m 644 "$base_dir/jd2resume-backup.service" /etc/systemd/system/jd2resume-backup.service
install -m 644 "$base_dir/jd2resume-backup.timer" /etc/systemd/system/jd2resume-backup.timer
systemctl daemon-reload
systemctl enable --now jd2resume-backup.timer
"$base_dir/backup.sh"

docker exec jd2resume-postgres sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -Atc "select version from schema_migrations order by version;"'
