# Oracle payroll READ-ONLY gateway (see app.py). Keep this container STOPPED;
# start it from Portainer only while syncing employees.
FROM python:3.11-slim-bookworm

# Oracle Instant Client 19.18 Basic Lite (free download, checked by SHA-256).
# 19c talks to the payroll database (Oracle 11.1) — tested 2026-11-07.
ARG IC_URL=https://download.oracle.com/otn_software/linux/instantclient/1918000/instantclient-basiclite-linux.x64-19.18.0.0.0dbru.zip
ARG IC_SHA256=4bbddce86dd70701f9ca7a12cf4de07c6041712fe16460c6f74324fad326fbbc

RUN apt-get update \
 && apt-get install -y --no-install-recommends libaio1 curl unzip ca-certificates \
 && curl -fsSL -o /tmp/ic.zip "$IC_URL" \
 && echo "$IC_SHA256  /tmp/ic.zip" | sha256sum -c - \
 && unzip -q /tmp/ic.zip -d /opt/oracle \
 && rm /tmp/ic.zip \
 && mkdir -p /opt/oracle/instantclient_19_18/network/admin \
 && echo "DIAG_ADR_ENABLED=OFF" > /opt/oracle/instantclient_19_18/network/admin/sqlnet.ora \
 && apt-get purge -y curl unzip && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

ENV ORACLE_CLIENT_LIB=/opt/oracle/instantclient_19_18 \
    LD_LIBRARY_PATH=/opt/oracle/instantclient_19_18 \
    TNS_ADMIN=/opt/oracle/instantclient_19_18/network/admin \
    HOME=/tmp \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY queries.py app.py test_queries.py ./
# The read-only guard must pass, or the image is not built
RUN python -m unittest test_queries

# Run as an unprivileged user
RUN useradd --system --no-create-home oracle-sync
USER oracle-sync

EXPOSE 8000
CMD ["python", "app.py"]
