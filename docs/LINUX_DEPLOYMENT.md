# WorldMonitor Linux VPS Deployment Guide

This guide details how to deploy and operate WorldMonitor independently on a Linux Virtual Private Server (VPS) — such as OVH, Hetzner, DigitalOcean, Linode, or AWS EC2 — pivoting away from serverless platforms like Vercel and Railway.

---

## 1. Architecture Overview

```
                      Internet / Browser Clients
                                 │
                                 ▼
                     ┌───────────────────────┐
                     │     Nginx (443/80)    │  (Terminates SSL / Certbot,
                     │ Reverse Proxy & Cache │   Gzip/Brotli, Security Headers)
                     └───────────┬───────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 │                               │
        /api/* & Static (SPA)                /ws (WebSocket)
                 │                               │
                 ▼                               ▼
       ┌───────────────────┐           ┌───────────────────┐
       │   WorldMonitor    │           │     AIS / OpenSky │
       │ Standalone Server │──(HTTP)──▶│    WebSocket Relay│
       │    (Port 3000)    │           │    (Port 3004)    │
       └───────────────────┘           └─────────┬─────────┘
                 │                               │
                 ▼                               ▼
       Upstream APIs (FIRMS,           Upstream WebSockets
        ACLED, FRED, EIA, etc.)        (AISStream, OpenSky, etc.)
```

### Components
1. **Frontend & API Server (`server/standalone.mjs` - Port 3000)**:
   - Serves pre-built Vite static assets with SPA fallback (`dist/index.html`).
   - Implements caching rules (immutable hashed assets, no-cache `index.html`).
   - Applies security headers (CSP, HSTS, X-Content-Type-Options, etc.).
   - Dispatches dynamic API routes (`/api/*`) and compiled sebuf RPC routes (`/api/[domain]/v1/*`).
   - Handles telemetry proxies (`/ingest/*`).
   - Proxies WebSocket upgrade connections directly to the local relay if accessed without Nginx.
2. **AIS / OpenSky Relay (`scripts/ais-relay.cjs` - Port 3004)**:
   - Maintains persistent upstream WebSocket connections (e.g. `aisstream.io`).
   - Caches OpenSky military/civil flight states and Telegram early intel.
   - Listens on internal port 3004 with shared secret authentication.
3. **Supervisor (`scripts/start-all.mjs`)**:
   - Concurrently boots and monitors both the web server and relay process.
4. **Nginx Reverse Proxy**:
   - Manages SSL certificates (Let's Encrypt / Certbot), HTTP/2, and routes public traffic.

---

## 2. Option A: Deployment with Docker Compose (Recommended)

Docker Compose provides an isolated, multi-stage build that packages both the frontend, API server, and relay without requiring global dependencies on your host.

### Step 1: Install Docker & Docker Compose
On Ubuntu / Debian:
```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

### Step 2: Clone Repository and Configure Environment
```bash
cd /opt
sudo git clone https://github.com/koala73/worldmonitor.git
cd worldmonitor

# Create environment configuration
sudo cp .env.production.example .env
sudo nano .env
```

Ensure the following variables are set in `.env`:
```ini
NODE_ENV=production
PORT=3000
RELAY_PORT=3004
WS_RELAY_URL=http://127.0.0.1:3004
RELAY_SHARED_SECRET=generate_a_secure_random_string_here
ALLOWED_ORIGINS=https://your-domain.com
```

### Step 3: Build and Launch
```bash
sudo docker compose up -d --build
```

### Step 4: Verify Deployment
```bash
# Check container status
sudo docker compose ps

# Test health check
curl -i http://localhost:3000/health

# Inspect live supervisor logs
sudo docker compose logs -f
```

---

## 3. Option B: Native Systemd + Nginx Deployment

For maximum performance on bare metal or VPS instances without Docker virtualization.

### Step 1: Install Node.js 22 LTS & Build Tools
On Ubuntu / Debian:
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs nginx certbot python3-certbot-nginx git build-essential
```

### Step 2: Create Service User & Clone Repository
```bash
sudo useradd -r -d /var/www/worldmonitor -s /bin/false worldmonitor

sudo mkdir -p /var/www/worldmonitor
cd /var/www
sudo git clone https://github.com/koala73/worldmonitor.git worldmonitor
cd /var/www/worldmonitor
```

### Step 3: Install Dependencies & Build Artifacts
```bash
# Install dependencies
npm ci

# Build both Sebuf RPC gateway and Vite frontend
npm run build:linux
```

### Step 4: Configure Environment File
```bash
sudo cp .env.production.example .env
sudo nano .env

# Lock permissions so only worldmonitor and root can read secrets
sudo chown -R worldmonitor:worldmonitor /var/www/worldmonitor
sudo chmod 600 /var/www/worldmonitor/.env
```

### Step 5: Configure Systemd Services
WorldMonitor provides systemd units in `deploy/systemd/`:

```bash
# Copy unit files
sudo cp deploy/systemd/worldmonitor.service /etc/systemd/system/
sudo cp deploy/systemd/worldmonitor-relay.service /etc/systemd/system/

# Reload systemd daemon
sudo systemctl daemon-reload

# Enable and start services
sudo systemctl enable --now worldmonitor-relay
sudo systemctl enable --now worldmonitor
```

Check service status:
```bash
sudo systemctl status worldmonitor-relay
sudo systemctl status worldmonitor
```

To view live application logs:
```bash
journalctl -u worldmonitor -f
journalctl -u worldmonitor-relay -f
```

---

## 4. Nginx Reverse Proxy & SSL Setup

### Step 1: Install Nginx Configuration
```bash
sudo cp deploy/nginx/worldmonitor.conf /etc/nginx/sites-available/worldmonitor.conf

# Edit domain name
sudo nano /etc/nginx/sites-available/worldmonitor.conf
# Replace 'your-domain.com' with your actual server domain or VPS IP

# Enable site
sudo ln -s /etc/nginx/sites-available/worldmonitor.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
```

### Step 2: Obtain SSL Certificate via Let's Encrypt
```bash
sudo certbot --nginx -d your-domain.com
```

### Step 3: Test and Reload Nginx
```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## 5. Security & Firewall Configuration (UFW)

Protect internal ports (`3000`, `3004`) from public exposure while allowing HTTP/HTTPS and SSH:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

---

## 6. Verification Checklist

1. **Health Check Endpoint**:
   ```bash
   curl -I https://your-domain.com/health
   # Expected: HTTP 200 OK
   ```

2. **API Version Check**:
   ```bash
   curl https://your-domain.com/api/version
   # Expected: JSON response with current release tag
   ```

3. **Sebuf RPC Route Verification**:
   ```bash
   curl -X OPTIONS -i https://your-domain.com/api/wildfire/v1/list-fire-detections
   # Expected: HTTP 204 No Content with CORS headers
   ```

4. **Live WebSocket Stream**:
   Open Developer Tools in your browser visiting `https://your-domain.com`. Verify WebSocket connection to `wss://your-domain.com/ws` upgrades with status 101 Switching Protocols.

---

## 7. Updates & Maintenance

To deploy an update on your Linux VPS:

### Docker Compose
```bash
cd /opt/worldmonitor
sudo git pull origin main
sudo docker compose up -d --build
```

### Native Systemd
```bash
cd /var/www/worldmonitor
sudo git pull origin main
npm ci
npm run build:linux
sudo systemctl restart worldmonitor-relay
sudo systemctl restart worldmonitor
```

