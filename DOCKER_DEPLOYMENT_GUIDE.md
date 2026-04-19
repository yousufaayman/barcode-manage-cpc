# Docker Deployment Guide (Windows Server + Ubuntu VM)

This project is deployed with Docker Compose on an Ubuntu VM (Hyper-V guest) running on a Windows Server host.

The stack includes:

- `nginx` (public entrypoint on port `80`)
- `frontend` (React static build served by internal Nginx)
- `backend` (FastAPI on port `8000` internal; includes PDF report routes under `/api/v1/reports/`)

A separate **report email worker** or any other report-sidecar can run in its **own** Compose stack or host; it is not part of this Compose file.

PostgreSQL is **not** containerized. It runs on the Windows Server host and is reached from containers through `host.docker.internal`.

---

## 1) Prerequisites

On the Ubuntu VM:

- Docker Engine installed
- Docker Compose v2 installed (`docker compose version`)
- Network connectivity to Windows host PostgreSQL on port `5432`

On Windows Server host:

- PostgreSQL service running
- PostgreSQL listening on reachable interface(s)
- Firewall allowing inbound TCP `5432` from VM network(s)

---

## 2) Install Docker on Ubuntu 24.04 VM

Run these commands on the Ubuntu VM as a user with sudo privileges:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo ${UBUNTU_CODENAME}) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Optional (recommended): run Docker without `sudo`:

```bash
sudo usermod -aG docker "$USER"
newgrp docker
```

Verify installation:

```bash
docker --version
docker compose version
docker run --rm hello-world
```

Enable Docker to start automatically on boot:

```bash
sudo systemctl enable docker
sudo systemctl start docker
```

---

## 3) Recommended network architecture (Windows forwards port 80 to one-NIC VM)

Use **one NIC on the Ubuntu VM** with a single IP. Windows Server sits on **both** `192.168.0.x` networks; the VM does **not** need to be attached to both. Windows listens on each server NIC and **forwards TCP 80** to the VM.

Example layout (adjust IPs to match your environment):

```text
Network 1 (192.168.0.x) ──┐
                          ├── Windows Server ──── VM (one NIC)
Network 2 (192.168.0.x) ──┘      (router)         192.168.0.100
```

| Role | Example IP | Notes |
|------|------------|--------|
| Windows NIC on network 1 | `192.168.0.249` | Clients use `http://192.168.0.249` |
| Windows NIC on network 2 | `192.168.0.106` | Clients use `http://192.168.0.106` |
| Ubuntu VM (Hyper-V guest) | `192.168.0.100` | Docker / `nginx` listens on `0.0.0.0:80` inside the VM |

**Benefits of this approach**

- The VM has one NIC and one IP—no dual-homed VM routing.
- Windows handles external presence on both networks.
- `nginx` in Docker publishes `0.0.0.0:80:80` on the VM; port proxy delivers traffic from Windows to that listener.
- **CORS** stays as the URLs browsers actually use: `http://192.168.0.249` and `http://192.168.0.106` (not the VM IP, unless you intentionally serve the UI from the VM address).

### Set up port forwarding on Windows (elevated PowerShell)

Forward port **80** from **each Windows listen address** to the VM:

```powershell
# Forward port 80 from both Windows NICs to the VM
netsh interface portproxy add v4tov4 listenaddress=192.168.0.249 listenport=80 connectaddress=192.168.0.100 connectport=80
netsh interface portproxy add v4tov4 listenaddress=192.168.0.106 listenport=80 connectaddress=192.168.0.100 connectport=80

# Open firewall for port 80
New-NetFirewallRule -DisplayName "HTTP 80" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 80

# Verify
netsh interface portproxy show all
```

Replace `192.168.0.100` if your VM uses a different address. If you remove or change rules later, use `netsh interface portproxy delete v4tov4 listenaddress=... listenport=80`.

**Compose / Docker:** No extra Docker networking is required beyond the internal bridge; only `nginx` should publish host port `80` on the **VM**.

---

## 4) Files Included

This repository includes:

- `docker-compose.yml`
- `.env.example`
- `.env` (created/managed locally by operator)
- `nginx/nginx.conf`
- `nginx/Dockerfile`
- `frontend/Dockerfile`
- `backend/Dockerfile`
- `setup.sh`

---

## 5) First-Time Setup on Ubuntu VM

From project root:

```bash
bash ./setup.sh
```

What `setup.sh` does:

1. Creates persistent host folders:
   - `/opt/appdata/media`
   - `/opt/appdata/reports`
2. Applies ownership to container user (`UID:GID 1000:1000`)
3. Creates `.env` from `.env.example` if missing
4. Verifies Docker + Compose availability

Then edit `.env` and set real DB credentials and settings before starting services.

---

## 6) Environment Configuration

Review and update `.env` values:

- `DB_HOST=host.docker.internal`
- `DB_PORT=5432`
- `DB_NAME=...`
- `DB_USER=...`
- `DB_PASSWORD=...`
- `MEDIA_ROOT=/app/media`
- `REPORTS_ROOT=/app/reports`
- `BACKEND_CORS_ORIGINS=http://192.168.0.249,http://192.168.0.106` (browser origins—the Windows NIC addresses users open in the browser; example matches the port-proxy setup above)

Notes:

- `host.docker.internal` is mapped with `extra_hosts: host-gateway` in Compose.
- Keep `MEDIA_ROOT` and `REPORTS_ROOT` as container paths. Compose maps `REPORTS_ROOT` to the backend’s `REPORTS_DIR` and bind-mounts `/opt/appdata/reports` → `/app/reports` for generated PDFs.

---

## 7) Build and Run

From project root:

```bash
docker compose build --pull
docker compose up -d
```

Check service state:

```bash
docker compose ps
docker compose logs -f nginx
docker compose logs -f backend
```

---

## 8) Validate Deployment

From a client machine on either network, open the app via the **Windows** addresses (after port forwarding):

- `http://192.168.0.249`
- `http://192.168.0.106`

Health checks (through the same host/port clients use):

- Backend (via nginx): `http://<server-ip-or-hostname>/api/v1/health/`
- Report PDF endpoints (same backend): `http://<server-ip-or-hostname>/api/v1/reports/...`

Container-level checks:

```bash
docker compose exec backend sh -lc "curl -fsS http://localhost:8000/health"
```

---

## 9) PostgreSQL Host Configuration (Windows Server)

1. In `pg_hba.conf`, allow VM subnet(s), for example:

   ```conf
   host    appdb    appuser    192.168.0.0/24    scram-sha-256
   ```

2. In `postgresql.conf`, verify:

   ```conf
   listen_addresses = '*'
   ```

3. Open firewall in elevated PowerShell:

   ```powershell
   New-NetFirewallRule -DisplayName "PostgreSQL 5432" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5432
   ```

4. Test DB connectivity from container network:

   ```bash
   docker run --rm --add-host host.docker.internal:host-gateway alpine sh -c "apk add --no-cache busybox-extras >/dev/null && nc -zv host.docker.internal 5432"
   ```

---

## 10) Operations

Stop services:

```bash
docker compose down
```

Restart services:

```bash
docker compose restart
```

Rebuild a single service after code changes:

```bash
docker compose build backend
docker compose up -d backend
```

---

## 11) Persistent Data

Persistent bind mounts:

- `/opt/appdata/media` -> shared media files
- `/opt/appdata/reports` -> generated reports

These directories survive container recreation and image updates.

---

## 12) Troubleshooting Quick Reference

- If app is unreachable, check:
  - `docker compose ps`
  - On the VM: `curl -fsS http://127.0.0.1/` (nginx container)
  - On Windows: `netsh interface portproxy show all` and firewall rule for TCP 80
  - Ubuntu VM firewall (`ufw status`)
  - Hyper-V VM has correct single IP (e.g. `192.168.0.100`) and routing from Windows host to VM
  - Windows-side network ACLs/firewall
- If DB connection fails:
  - Verify `.env` credentials
  - Verify `pg_hba.conf` subnet rule
  - Verify `listen_addresses`
  - Verify TCP `5432` open on Windows host
- If uploads/reports fail:
  - Verify `/opt/appdata/media` and `/opt/appdata/reports` exist
  - Verify owner is `1000:1000`

