#!/usr/bin/env bash
# Daily backup: database dump + uploads. Run from cron, e.g.
#   30 2 * * * /srv/attendance/backup.sh >> /srv/attendance/backup.log 2>&1
# Keep copies on a SECOND disk / another machine too.
set -euo pipefail
DEST=${DEST:-/srv/attendance/backups}
KEEP_DAYS=${KEEP_DAYS:-14}
DB_CONTAINER=${DB_CONTAINER:-attendance-db}
. /srv/attendance/db.env        # POSTGRES_USER=... POSTGRES_DB=...
mkdir -p "$DEST"
STAMP=$(date +%F_%H%M)
docker exec "$DB_CONTAINER" pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB" > "$DEST/db_$STAMP.dump"
# uploads are only added to, so an rsync mirror is enough
rsync -a /srv/attendance/uploads/ "$DEST/uploads_mirror/"
# LPC signing CA (key + cert + p12) - cannot be regenerated, keep a copy
rsync -a /srv/attendance/pki/ "$DEST/pki_copy/"
find "$DEST" -maxdepth 1 -name 'db_*.dump' -mtime +"$KEEP_DAYS" -delete
echo "$(date -Is) backup ok: db_$STAMP.dump"
