#!/bin/sh
set -eu

BACKUP_DIR=/backups
BACKUP_ENABLED="${BACKUP_ENABLED:-true}"
INTERVAL_HOURS="${BACKUP_INTERVAL_HOURS:-24}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
REQUEST_FILE="${BACKUP_DIR}/.backup-request"

mkdir -p "$BACKUP_DIR"
export MYSQL_PWD="${MYSQL_PASSWORD}"

refresh_settings() {
  value=$(mysql -h "${MYSQL_HOST}" -u "${MYSQL_USER}" -Nse "SELECT CONCAT(enabled, '|', intervalHours, '|', retentionDays) FROM backup_settings WHERE id = 1" "${MYSQL_DATABASE}" 2>/dev/null || true)
  if [ -n "$value" ]; then
    BACKUP_ENABLED=$(printf '%s' "$value" | cut -d'|' -f1)
    INTERVAL_HOURS=$(printf '%s' "$value" | cut -d'|' -f2)
    RETENTION_DAYS=$(printf '%s' "$value" | cut -d'|' -f3)
  fi
}

until mysqladmin ping -h "${MYSQL_HOST}" -u "${MYSQL_USER}" --silent; do
  echo "等待数据库可用…"
  sleep 5
done

run_backup() {
  if [ "$BACKUP_ENABLED" = "0" ] || [ "$BACKUP_ENABLED" = "false" ]; then
    return
  fi
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  target="${BACKUP_DIR}/pain-clinic_${stamp}.sql.gz"
  echo "开始数据库备份：${target}"
  mysqldump -h "${MYSQL_HOST}" -u "${MYSQL_USER}" --single-transaction --routines --events --triggers "${MYSQL_DATABASE}" | gzip -c > "${target}.tmp"
  mv "${target}.tmp" "$target"
  size=$(wc -c < "$target" | tr -d ' ')
  mysql -h "${MYSQL_HOST}" -u "${MYSQL_USER}" "${MYSQL_DATABASE}" -e "INSERT INTO backup_records (filename, sizeBytes, status) VALUES ('$(basename "$target")', ${size}, 'completed') ON DUPLICATE KEY UPDATE sizeBytes=VALUES(sizeBytes), status='completed'; INSERT INTO backup_settings (id, enabled, intervalHours, retentionDays, lastRunAt) VALUES (1, 1, ${INTERVAL_HOURS}, ${RETENTION_DAYS}, UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE lastRunAt=VALUES(lastRunAt);"
  find "$BACKUP_DIR" -type f -name 'pain-clinic_*.sql.gz' -mtime "+${RETENTION_DAYS}" -delete
  echo "数据库备份完成：${target}"
}

refresh_settings
run_backup
while true; do
  refresh_settings
  sleep_seconds=$((INTERVAL_HOURS * 3600))
  elapsed=0
  while [ "$elapsed" -lt "$sleep_seconds" ]; do
    refresh_settings
    if [ -f "$REQUEST_FILE" ]; then
      rm -f "$REQUEST_FILE"
      run_backup
      elapsed=0
    fi
    sleep 60
    elapsed=$((elapsed + 60))
  done
  run_backup
done
