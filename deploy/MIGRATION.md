# Move the attendance app to the Docker host (Portainer)

Old server (Digital Ocean, PM2) stays STOPPED but untouched until the new one has run fine for 1-2 weeks.
Never start both against live users - two databases would diverge.

## 1. Prepare host
    sudo mkdir -p /srv/attendance/{pgdata,uploads,migrate}
    # copy the production .env to /srv/attendance/.env (SMTP, OCR, Turnstile, ... as on the VPS)
    printf 'POSTGRES_USER=attendance\nPOSTGRES_DB=attendance\n' > /srv/attendance/db.env

## 2. Bring over the final snapshot (taken after `pm2 stop`)
    cd /srv/attendance/migrate
    scp root@167.71.230.230:/root/attendance_final.dump .
    scp root@167.71.230.230:/root/uploads_final.tar .
    sha256sum attendance_final.dump     # must equal the hash noted on the VPS
    tar -xf uploads_final.tar -C /tmp && sudo rsync -a /tmp/uploads/ /srv/attendance/uploads/
    find /srv/attendance/uploads -type f | wc -l     # expect 3428

## 3. Start only the database (Portainer stack variables: POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD)
    docker compose up -d db
    docker exec -i attendance-db pg_restore -U attendance -d attendance --no-owner --no-privileges --exit-on-error < /srv/attendance/migrate/attendance_final.dump
    docker exec attendance-db psql -U attendance -d attendance -c \
      "select (select count(*) from employees) emp,(select count(*) from attendance_reports) reports,(select count(*) from attendance_entries) entries;"
    # expect 10533 | 2687 | 80975

## 4. Start the app
    docker compose up -d --build app
    docker logs -f attendance-app      # wait for "serving on port 5001"
    curl -I http://localhost:5001

## 5. Point the Cloudflare tunnel at http://localhost:5001 (or the host IP). Test with a test subdomain first.

## Rollback
Stop the stack, `pm2 start reactstarter` on the Digital Ocean VPS (data there is the pre-migration snapshot).
