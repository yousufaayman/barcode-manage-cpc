# Report email worker — deployment guide

This folder contains a **scheduled worker** (not an HTTP server). It:

1. Logs into the main **FastAPI backend** using `API_BASE_URL` and reporting credentials.
2. Downloads three daily PDF reports (cutting, sewing, QC) over HTTP.
3. Sends one email with those PDFs attached via **SMTP**.

Run it in **its own Docker Compose stack** on the Ubuntu VM (or any host that can reach the backend and SMTP). It is separate from the main `barcode-manage-cpc` Compose file by design.

---

## Prerequisites

- The **backend** is deployed and reachable from this container (see [API URL](#api-base-url) below).
- A **user account** exists in the app with credentials matching `REPORT_SERVICE_USERNAME` / `REPORT_SERVICE_PASSWORD`, and that user can call the report PDF endpoints.
- **Outbound SMTP** allowed from the VM/host (firewall / provider).
- **tzdata**: included in the Docker image so `SCHEDULE_TZ` works correctly.

---

## Files

| File | Purpose |
|------|---------|
| `Dockerfile` | Image: Python 3.12, installs deps, runs `scheduler.py` by default. |
| `docker-compose.yml` | Builds and runs the worker with `env_file: .env` and `host.docker.internal` mapping. |
| `.env.example` | All environment variables with placeholders. Copy to `.env` and edit. |

---

## API base URL

The worker calls paths such as `/auth/login` and `/reports/...` **relative to** `API_BASE_URL`. Your backend mounts the API under **`/api/v1`**, so `API_BASE_URL` must be:

```text
http://<host>:<port>/api/v1
```

No trailing slash.

### Same Ubuntu VM as the main Docker stack

If the main app’s **nginx** publishes port **80** on that VM, from another container the host’s published ports are usually reachable via Docker’s **host gateway**:

```dotenv
API_BASE_URL=http://host.docker.internal:80/api/v1
```

`docker-compose.yml` already sets:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

If that does not resolve on your Docker version, use the VM’s own IP and port instead, for example:

```dotenv
API_BASE_URL=http://192.168.0.100:80/api/v1
```

### Backend only on another machine

Set `API_BASE_URL` to whatever URL clients would use to reach the API, e.g.:

```dotenv
API_BASE_URL=http://192.168.0.249/api/v1
```

(Only if nginx on that host serves `/api/v1` on port 80.)

---

## Configure

```bash
cd report-email-worker
cp .env.example .env
```

Edit `.env`:

- **`REPORT_SERVICE_PASSWORD`** — required; must match the reporting user in the database.
- **`REPORT_RECIPIENT_EMAILS`** — comma-separated list; required for sending.
- **`REPORT_SENDER_EMAIL` / `REPORT_SENDER_PASSWORD`** — SMTP credentials (e.g. Gmail app password).
- **`SCHEDULE_CRON`** — five fields: `minute hour day month day_of_week` (default `0 23 * * *` = 23:00 daily in `SCHEDULE_TZ`).
- **`REPORT_DATE_MODE`** — `yesterday` or `today` (which calendar day to fetch).

---

## Build and run (scheduler)

```bash
docker compose build --pull
docker compose up -d
```

Logs:

```bash
docker compose logs -f report-email-worker
```

---

## One-shot run (manual / debugging)

Default container command is the **scheduler**. To run a **single** job and exit:

```bash
docker compose run --rm report-email-worker python run_once.py
```

Specific date:

```bash
docker compose run --rm report-email-worker python run_once.py --date 2026-04-18
```

---

## Windows Server + port forwarding (optional)

If users reach the app on **Windows** NICs (`192.168.0.249`, `192.168.0.106`) and port **80** is forwarded to the VM, the worker **on the VM** should still use **`host.docker.internal:80`** or the **VM IP** for `API_BASE_URL`, not the Windows NIC IPs, unless the worker runs on Windows itself.

---

## Troubleshooting

| Symptom | What to check |
|--------|----------------|
| `API_BASE_URL is required` / login fails | `API_BASE_URL` includes `/api/v1`, correct scheme/host/port, backend up. |
| HTTP 401 / 403 | Reporting user exists; password correct; user can access `/reports/*`. |
| SMTP errors | Firewall, Gmail “less secure” / app password, `REPORT_RECIPIENT_EMAILS` non-empty. |
| Wrong report day | `SCHEDULE_TZ`, `REPORT_DATE_MODE`, and server clock. |
| Cron never fires | `SCHEDULE_CRON` has exactly five fields; container logs for scheduler startup line. |

---

## Stop / remove

```bash
docker compose down
```

Images persist until removed with `docker image prune` or `docker compose build --no-cache` as needed.
