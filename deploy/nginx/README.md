# Nginx Static Fallback Deployment Guide

This configuration deploys the WorldMonitor dashboard as an ultra-optimized, static HTML/JS dashboard on your home-hosted VM with zero backend dependencies, no AI/LLM models, and automatic greying-out of unavailable dynamic API layers.

## 1. Build the Static Dashboard

Build the production artifacts on your development machine or CI:

```bash
# Clean install dependencies
npm ci

# Build optimized static bundle with .gz and .br precompression
npm run build
```

This populates the `dist/` directory. Static pre-compression automatically creates `.gz` and `.br` files for all JavaScript, CSS, HTML, WASM, and GeoJSON assets.

## 2. Deploy to the VM

Copy the `dist/` folder to your VM document root (e.g., `/var/www/worldmonitor/dist`):

```bash
# Example using rsync
rsync -avz --delete ./dist/ user@vm.home.local:/var/www/worldmonitor/dist/
```

Ensure web server permissions:

```bash
sudo chown -R www-data:www-data /var/www/worldmonitor/dist
sudo chmod -R 755 /var/www/worldmonitor/dist
```

## 3. Configure Nginx

### Option A: Add to Existing Nginx Server

Copy `worldmonitor-fallback.conf` into `/etc/nginx/conf.d/` (or `/etc/nginx/sites-available/` and symlink to `sites-enabled/`):

```bash
sudo cp deploy/nginx/worldmonitor-fallback.conf /etc/nginx/conf.d/worldmonitor.conf
sudo nginx -t
sudo systemctl reload nginx
```

### Option B: Standalone VM or Docker / Podman Container

Use the provided `nginx.conf` and `worldmonitor-fallback.conf` directly:

```bash
sudo cp deploy/nginx/nginx.conf /etc/nginx/nginx.conf
sudo cp deploy/nginx/worldmonitor-fallback.conf /etc/nginx/conf.d/worldmonitor.conf
sudo nginx -t
sudo systemctl restart nginx
```

## 4. Key Features & Optimizations

- **Zero AI Overhead:** HuggingFace transformers (`@xenova/transformers`) and ONNX web runtime have been stubbed and purged from the build, saving ~1 MB of bundle weight and 100+ MB of model weights.
- **Instant Pre-compressed Serving:** `gzip_static on;` serves `.gz` files directly from disk without consuming CPU cycles for on-the-fly compression.
- **Immutable Asset Caching:** JavaScript and CSS assets with content hashes in `/assets/` are cached for 1 year (`max-age=31536000, immutable`).
- **Dynamic API Fallback:** Unproxied `/api/` endpoints return JSON `503` so client probes gracefully mark layers as unavailable without throwing unhandled exceptions.
- **Red Banner Notification:** Automatically displays:
  > **⚠️ Fallback dashboard in operation. AI functionality is unavailable.**
