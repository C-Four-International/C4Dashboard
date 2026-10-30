# WorldMonitor Debian 12 (Bookworm) Deployment Guide

This guide provides step-by-step instructions for deploying and running WorldMonitor on a VPS running **Debian 12 ("Bookworm")** (e.g. OVH, Hetzner, DigitalOcean, Linode, AWS EC2).

---

## 1. Debian 12 Architecture Overview

```
                      Internet / Browser Clients
                                 │
                                 ▼
                     ┌───────────────────────┐
                     │     Nginx (443/80)    │  (Terminates SSL via Certbot,
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

---

## 2. Option A: Deployment with Docker & Docker Compose (Recommended)

### Step 1: Install Docker on Debian 12
Debian 12 minimal installations require initial dependencies:

```bash
# 1. Update package lists and install prerequisites
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg lsb-release

# 2. Add Docker's official GPG key for Debian
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

# 3. Set up the Debian 12 (Bookworm) repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# 4. Install Docker Engine and Docker Compose plugin
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 5. Enable and start Docker service
sudo systemctl enable --now docker
```

*(Optional) Allow non-root user to manage Docker:*
```bash
sudo usermod -aG docker $USER
newgrp docker
```

---

### Step 2: Clone Repository & Configure Environment
```bash
sudo mkdir -p /opt/worldmonitor
sudo chown -R $USER:$USER /opt/worldmonitor
cd /opt/worldmonitor

git clone -b ovh-vps https://github.com/C-Four-International/C4Dashboard.git .

# Copy production environment configuration template
cp .env.production.example .env
nano .env
```

Ensure the core variables are configured in `.env`:
```ini
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
RELAY_PORT=3004
RELAY_HOST=127.0.0.1
WS_RELAY_URL=http://127.0.0.1:3004
RELAY_SHARED_SECRET=your_secure_random_string_here
ALLOWED_ORIGINS=https://your-domain.com
```

---

### Step 3: Launch with Docker Compose
```bash
# Build images and start containers in the background
docker compose up -d --build
```

---

### Step 4: Verify Containers & Health
```bash
# Check container status
docker compose ps

# Test the health probe
curl -i http://localhost:3000/health

# View live container logs
docker compose logs -f
```

---

## 3. Option B: Native Systemd + Node.js 22 Deployment

If running directly on Debian 12 bare metal without container virtualization:

### Step 1: Install Node.js 22 LTS on Debian 12
```bash
sudo apt-get update
sudo apt-get install -y curl ca-certificates gnupg git build-essential

# Add NodeSource Node.js 22 LTS repo
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify versions
node -v  # Expected: v22.x.x
npm -v   # Expected: 10.x.x
```

---

### Step 2: Create Service User & Setup Directories
On Debian 12, create a dedicated system user without login shell:

```bash
sudo useradd -r -s /usr/sbin/nologin -d /var/www/worldmonitor worldmonitor

sudo mkdir -p /var/www/worldmonitor
sudo chown -R worldmonitor:worldmonitor /var/www/worldmonitor
```

Clone the repository and install dependencies:
```bash
cd /var/www/worldmonitor
sudo -u worldmonitor git clone -b ovh-vps https://github.com/C-Four-International/C4Dashboard.git .

# Install dependencies and build production assets
sudo -u worldmonitor npm ci
sudo -u worldmonitor npm run build:linux
```

---

### Step 3: Configure Environment
```bash
sudo cp .env.production.example .env
sudo nano .env

# Lock permissions so only worldmonitor and root can read secrets
sudo chown worldmonitor:worldmonitor .env
sudo chmod 600 .env
```

---

### Step 4: Install Systemd Services
Debian 12 uses systemd as its default init system.

```bash
# Copy provided service files
sudo cp deploy/systemd/worldmonitor.service /etc/systemd/system/
sudo cp deploy/systemd/worldmonitor-relay.service /etc/systemd/system/

# Update user to worldmonitor (or keep www-data)
sudo sed -i 's/User=www-data/User=worldmonitor/g' /etc/systemd/system/worldmonitor.service
sudo sed -i 's/Group=www-data/Group=worldmonitor/g' /etc/systemd/system/worldmonitor.service
sudo sed -i 's/User=www-data/User=worldmonitor/g' /etc/systemd/system/worldmonitor-relay.service
sudo sed -i 's/Group=www-data/Group=worldmonitor/g' /etc/systemd/system/worldmonitor-relay.service

# Reload systemd and start services
sudo systemctl daemon-reload
sudo systemctl enable --now worldmonitor-relay
sudo systemctl enable --now worldmonitor
```

Check status and logs:
```bash
sudo systemctl status worldmonitor-relay
sudo systemctl status worldmonitor

# View live systemd journal logs
journalctl -u worldmonitor -f
```

---

## 4. Nginx Reverse Proxy & SSL Setup on Debian 12

### Step 1: Install Nginx & Certbot
In Debian 12, Python packages are managed through apt:

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

---

### Step 2: Configure Virtual Host
```bash
sudo cp deploy/nginx/worldmonitor.conf /etc/nginx/sites-available/worldmonitor.conf

# Edit domain name
sudo nano /etc/nginx/sites-available/worldmonitor.conf
# Replace 'your-domain.com' with your actual server domain or VPS IP

# Enable site
sudo ln -sf /etc/nginx/sites-available/worldmonitor.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t
sudo systemctl reload nginx
```

---

### Step 3: Obtain Let's Encrypt SSL Certificate
```bash
sudo certbot --nginx -d your-domain.com
```

Certbot automatically configures automatic certificate renewal via a systemd timer on Debian 12:
```bash
systemctl list-timers | grep certbot
```

---

## 5. Security & UFW Firewall Setup on Debian 12

Debian 12 minimal installations do not include UFW by default:

```bash
# Install UFW
sudo apt-get install -y ufw

# Configure rules (deny all incoming except SSH and Web)
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 80/tcp comment 'HTTP'
sudo ufw allow 443/tcp comment 'HTTPS'

# Enable firewall
sudo ufw enable
sudo ufw status verbose
```

---

## 6. GitHub Actions Automated CI/CD for Debian 12

The repository includes a GitHub Actions workflow in [`.github/workflows/docker-image.yml`](file:///.github/workflows/docker-image.yml).

### Secrets Required in GitHub
Add the following in your GitHub repo under **Settings** → **Secrets and variables** → **Actions**:

| Secret Name | Value | Description |
|-------------|-------|-------------|
| `VPS_HOST` | e.g. `51.68.123.45` | Public IP or domain of your Debian 12 VPS |
| `VPS_USERNAME` | e.g. `debian` or `root` | SSH user |
| `VPS_SSH_KEY` | Private SSH key | Matches `~/.ssh/authorized_keys` on Debian 12 |
| `VPS_PORT` | `22` | SSH port (defaults to 22 if omitted) |

When you push to `main` or `ovh-vps`, GitHub Actions will:
1. Build the multi-stage Docker image with GHA build caching.
2. Push the image to GitHub Container Registry (`ghcr.io`).
3. SSH into your Debian 12 VPS, run `docker compose pull`, restart the container with zero downtime, and verify the `/health` endpoint.

---

## 7. Verification Checklist

1. **Health Check**:
   ```bash
   curl -I https://your-domain.com/health
   # Expected: HTTP 200 OK
   ```

2. **API Release Version**:
   ```bash
   curl https://your-domain.com/api/version
   # Expected: JSON response with release metadata
   ```

3. **Sebuf RPC Route Verification**:
   ```bash
   curl -X OPTIONS -i https://your-domain.com/api/wildfire/v1/list-fire-detections
   # Expected: HTTP 204 No Content with CORS headers
   ```

4. **Live WebSocket Stream**:
   Open Developer Tools in your browser visiting `https://your-domain.com`. Verify WebSocket connection to `wss://your-domain.com/ws` upgrades with status `101 Switching Protocols`.
