#!/usr/bin/env node
/**
 * WorldMonitor Standalone Production Server for Linux VPS
 *
 * Runs without Vercel or Railway dependencies.
 * Serves:
 *   1. Static frontend assets from dist/ (SPA routing, Brotli/Gzip, cache headers)
 *   2. Serverless/Edge API endpoints in api/ (*.js and [domain]/v1/[rpc].js)
 *   3. WebSocket upgrade proxy to local AIS/OpenSky relay (port 3004)
 *   4. Telemetry rewrites (/ingest/* to PostHog)
 *   5. Health probe (/health)
 *
 * Usage:
 *   NODE_ENV=production node server/standalone.mjs
 *   Or: npm start
 */

import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { brotliCompress, gzipSync } from 'node:zlib';

const brotliCompressAsync = promisify(brotliCompress);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// ── Automatically resolve and load .env if present ─────────────────────────
let envLoadedFrom = null;
try {
  const envCandidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(projectRoot, '.env'),
    '/opt/dashboard/C4Dashboard/.env',
    '/etc/worldmonitor/worldmonitor.env',
    '/var/www/worldmonitor/.env',
    '/opt/worldmonitor/.env',
  ];
  for (const envPath of envCandidates) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!(key in process.env)) {
            process.env[key] = val;
          }
        }
      }
      envLoadedFrom = envPath;
      break;
    }
  }
} catch {}

// ── Environment Configuration ───────────────────────────────────────────────
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const RELAY_PORT = Number(process.env.RELAY_PORT || 3004);
const RELAY_HOST = process.env.RELAY_HOST || '127.0.0.1';
const DIST_DIR = path.resolve(process.env.DIST_DIR || path.join(projectRoot, 'dist'));
const API_DIR = path.resolve(process.env.API_DIR || path.join(projectRoot, 'api'));

// ── Security Headers ─────────────────────────────────────────────────────────
const CSP_HEADER = process.env.CSP_HEADER || [
  "default-src 'self'",
  "connect-src 'self' https: http://localhost:5173 http://localhost:3000 http://127.0.0.1:3000 ws: wss: blob: data: https://api.adsb.lol",
  "img-src 'self' data: blob: https:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "script-src 'self' 'wasm-unsafe-eval' https://www.googletagmanager.com https://www.youtube.com https://static.cloudflareinsights.com https://us-assets.i.posthog.com",
  "worker-src 'self' blob:",
  "font-src 'self' data: https:",
  "media-src 'self' data: blob: https:",
  "frame-src 'self' https://worldmonitor.app https://tech.worldmonitor.app https://happy.worldmonitor.app https://www.youtube.com https://www.youtube-nocookie.com",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
].join('; ');

const BASE_SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'Content-Security-Policy': CSP_HEADER,
};

// ── MIME Types ───────────────────────────────────────────────────────────────
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.geojson': 'application/geo+json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

// ── Dynamic API Routing Table ────────────────────────────────────────────────
function isBracketSegment(segment) {
  return segment.startsWith('[') && segment.endsWith(']');
}

function splitRoutePath(routePath) {
  return routePath.split('/').filter(Boolean);
}

function routePriority(routePath) {
  const parts = splitRoutePath(routePath);
  return parts.reduce((score, part) => {
    if (part.startsWith('[[...') && part.endsWith(']]')) return score + 0;
    if (part.startsWith('[...') && part.endsWith(']')) return score + 1;
    if (isBracketSegment(part)) return score + 2;
    return score + 10;
  }, 0);
}

function matchRoute(routePath, pathname) {
  const routeParts = splitRoutePath(routePath);
  const pathParts = splitRoutePath(pathname.replace(/^\/api/, ''));

  let i = 0;
  let j = 0;

  while (i < routeParts.length && j < pathParts.length) {
    const routePart = routeParts[i];
    const pathPart = pathParts[j];

    if (routePart.startsWith('[[...') && routePart.endsWith(']]')) return true;
    if (routePart.startsWith('[...') && routePart.endsWith(']')) return true;

    if (isBracketSegment(routePart)) {
      i += 1;
      j += 1;
      continue;
    }

    if (routePart !== pathPart) return false;
    i += 1;
    j += 1;
  }

  if (i === routeParts.length && j === pathParts.length) return true;

  if (i === routeParts.length - 1) {
    const tail = routeParts[i];
    if (tail?.startsWith('[[...') && tail.endsWith(']]')) return true;
    if (tail?.startsWith('[...') && tail.endsWith(']')) return j < pathParts.length;
  }

  return false;
}

async function buildRouteTable(root) {
  if (!fs.existsSync(root)) return [];

  const files = [];

  async function walk(dir) {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
        continue;
      }
      if (!entry.name.endsWith('.js')) continue;
      if (entry.name.startsWith('_')) continue;
      if (entry.name.endsWith('.test.mjs') || entry.name.endsWith('.test.js')) continue;

      const relative = path.relative(root, absolute).replace(/\\/g, '/');
      const routePath = relative.replace(/\.js$/, '').replace(/\/index$/, '');
      files.push({ routePath, modulePath: absolute });
    }
  }

  await walk(root);
  files.sort((a, b) => routePriority(b.routePath) - routePriority(a.routePath));
  return files;
}

const moduleCache = new Map();

async function importHandler(modulePath) {
  let mod = moduleCache.get(modulePath);
  if (!mod) {
    mod = await import(pathToFileURL(modulePath).href);
    moduleCache.set(modulePath, mod);
  }
  return mod;
}

function toHeaders(nodeHeaders) {
  const headers = new Headers();
  const effectiveHost = nodeHeaders['x-forwarded-host'] || nodeHeaders['host'];
  if (effectiveHost) {
    headers.set('host', String(effectiveHost));
  }
  for (const [key, value] of Object.entries(nodeHeaders)) {
    if (key.toLowerCase() === 'host') continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else if (typeof value === 'string') {
      headers.set(key, value);
    }
  }
  return headers;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

// ── Compression Helper ───────────────────────────────────────────────────────
async function maybeCompress(body, headers, acceptEncoding = '') {
  if (!body || body.length < 1024) return body;
  if (headers['content-encoding']) return body;

  const existingVary = headers['vary'] || headers['Vary'] || '';
  headers['Vary'] = existingVary ? `${existingVary}, Accept-Encoding` : 'Accept-Encoding';

  if (acceptEncoding.includes('br')) {
    headers['Content-Encoding'] = 'br';
    return await brotliCompressAsync(body);
  }
  if (acceptEncoding.includes('gzip')) {
    headers['Content-Encoding'] = 'gzip';
    return gzipSync(body);
  }
  return body;
}

// ── Telemetry (PostHog) Reverse Proxy ────────────────────────────────────────
async function proxyPosthog(req, res, targetUrl) {
  try {
    const url = new URL(targetUrl);
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await readBody(req);
    const headers = { ...req.headers, host: url.host };
    delete headers['connection'];

    const clientReq = https.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: req.method,
      headers,
    }, (clientRes) => {
      res.writeHead(clientRes.statusCode, clientRes.headers);
      clientRes.pipe(res);
    });

    clientReq.on('error', (err) => {
      console.warn('[PostHog Proxy] Error:', err.message);
      res.writeHead(502);
      res.end('Telemetry proxy error');
    });

    if (body) clientReq.write(body);
    clientReq.end();
  } catch (err) {
    res.writeHead(500);
    res.end('Proxy internal error');
  }
}

// ── WebSocket Upgrade Proxy to Local AIS Relay ───────────────────────────────
function setupWebSocketProxy(server) {
  server.on('upgrade', (req, clientSocket, head) => {
    // Forward WebSocket connections (e.g. /ws or any upgrade request) to the local relay
    const relaySocket = net.connect(RELAY_PORT, RELAY_HOST, () => {
      // Rebuild initial upgrade HTTP request to relay
      const rawRequest = `${req.method} ${req.url} HTTP/1.1\r\n` +
        Object.entries(req.headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\r\n') + '\r\n\r\n';

      relaySocket.write(rawRequest);
      if (head && head.length > 0) relaySocket.write(head);

      relaySocket.pipe(clientSocket);
      clientSocket.pipe(relaySocket);
    });

    relaySocket.on('error', (err) => {
      console.warn(`[WS Proxy] Cannot connect to relay at ${RELAY_HOST}:${RELAY_PORT}:`, err.message);
      clientSocket.destroy();
    });

    clientSocket.on('error', () => relaySocket.destroy());
  });
}

// ── Static Asset Serving ─────────────────────────────────────────────────────
function getCacheControl(filePath, urlPath) {
  if (urlPath === '/' || urlPath === '/index.html' || filePath.endsWith('index.html')) {
    return 'no-cache, no-store, must-revalidate';
  }
  if (urlPath.startsWith('/assets/')) {
    return 'public, max-age=31536000, immutable';
  }
  if (urlPath.startsWith('/favico/')) {
    return 'public, max-age=604800';
  }
  if (urlPath === '/offline.html') {
    return 'public, max-age=86400';
  }
  return 'public, max-age=3600';
}

async function serveStaticFile(req, res, filePath, urlPath) {
  try {
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) return false;

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const cacheControl = getCacheControl(filePath, urlPath);

    // ETag based on size and mtime
    const etag = `"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, {
        'ETag': etag,
        'Cache-Control': cacheControl,
      });
      res.end();
      return true;
    }

    let fileBuffer = await fs.promises.readFile(filePath);
    const headers = {
      'Content-Type': contentType,
      'Cache-Control': cacheControl,
      'ETag': etag,
    };

    if (contentType.startsWith('text/html')) {
      Object.assign(headers, BASE_SECURITY_HEADERS);
    }

    const acceptEncoding = req.headers['accept-encoding'] || '';
    fileBuffer = await maybeCompress(fileBuffer, headers, acceptEncoding);
    headers['Content-Length'] = Buffer.byteLength(fileBuffer);

    res.writeHead(200, headers);
    if (req.method !== 'HEAD') {
      res.end(fileBuffer);
    } else {
      res.end();
    }
    return true;
  } catch (err) {
    return false;
  }
}

// ── Main Server Factory ──────────────────────────────────────────────────────
export async function createStandaloneServer() {
  const routes = await buildRouteTable(API_DIR);
  console.log(`[Server] Discovered ${routes.length} API route modules in ${API_DIR}`);

  const server = http.createServer(async (req, res) => {
    const rawUrl = req.url || '/';
    const parsedUrl = new URL(rawUrl, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // 1. Health Probe
    if (pathname === '/health' || pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        uptime: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
        relay: `${RELAY_HOST}:${RELAY_PORT}`,
        envLoadedFrom: envLoadedFrom || 'systemd/environment',
        allowedOrigins: process.env.ALLOWED_ORIGINS || '(default domain list)',
      }));
      return;
    }

    // 2. Telemetry proxy (/ingest/* -> PostHog)
    if (pathname.startsWith('/ingest/static/')) {
      const target = `https://us-assets.i.posthog.com/static/${pathname.replace('/ingest/static/', '')}${parsedUrl.search}`;
      return proxyPosthog(req, res, target);
    }
    if (pathname.startsWith('/ingest/')) {
      const target = `https://us.i.posthog.com/${pathname.replace('/ingest/', '')}${parsedUrl.search}`;
      return proxyPosthog(req, res, target);
    }

    // 2b. Stub Vercel analytics / speed-insights in standalone environments
    if (pathname.startsWith('/_vercel/')) {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end('/* standalone: vercel analytics stubbed */');
      return;
    }

    // 3. API Routes (/api/*)
    if (pathname.startsWith('/api/')) {
      // Find matching route module
      const matched = routes.find(r => matchRoute(r.routePath, pathname));

      if (matched) {
        try {
          const mod = await importHandler(matched.modulePath);
          if (typeof mod.default === 'function') {
            const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await readBody(req);
            const request = new Request(parsedUrl.toString(), {
              method: req.method,
              headers: toHeaders(req.headers),
              body,
            });

            const response = await mod.default(request);

            if (response instanceof Response) {
              const resHeaders = Object.fromEntries(response.headers.entries());
              let resBody = Buffer.from(await response.arrayBuffer());

              const acceptEncoding = req.headers['accept-encoding'] || '';
              resBody = await maybeCompress(resBody, resHeaders, acceptEncoding);

              if (resHeaders['content-encoding']) {
                delete resHeaders['content-length'];
              }

              res.writeHead(response.status, resHeaders);
              res.end(resBody);
              return;
            }
          }
        } catch (err) {
          console.error(`[Server API Error] ${pathname}:`, err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal API Server Error', message: err.message }));
          return;
        }
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Endpoint Not Found', pathname }));
      return;
    }

    // 4. Static Files from dist/
    if (fs.existsSync(DIST_DIR)) {
      // Prevent directory traversal
      const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
      const candidateFile = path.join(DIST_DIR, safePath);

      if (candidateFile.startsWith(DIST_DIR)) {
        const served = await serveStaticFile(req, res, candidateFile, pathname);
        if (served) return;
      }

      // 5. SPA Fallback (index.html)
      const indexPath = path.join(DIST_DIR, 'index.html');
      if (fs.existsSync(indexPath) && (req.method === 'GET' || req.method === 'HEAD')) {
        const served = await serveStaticFile(req, res, indexPath, '/index.html');
        if (served) return;
      }
    }

    // 6. Not Found Fallback
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  setupWebSocketProxy(server);

  return {
    server,
    start() {
      return new Promise((resolve, reject) => {
        server.once('error', (err) => {
          if (err.code === 'EADDRINUSE') {
            console.error(`[Server] Error: Port ${PORT} is already in use (EADDRINUSE).`);
            console.error(`[Server] Check if another service (or Docker container) is running on port ${PORT}.`);
          } else {
            console.error('[Server] Fatal startup error:', err);
          }
          reject(err);
        });

        server.listen(PORT, HOST, () => {
          console.log(`[Server] WorldMonitor dashboard running at http://${HOST}:${PORT}`);
          console.log(`[Server] Serving static files from: ${DIST_DIR}`);
          console.log(`[Server] WebSocket proxy to AIS relay at: ${RELAY_HOST}:${RELAY_PORT}`);
          resolve({ port: PORT, host: HOST });
        });
      });
    },
    close() {
      return new Promise((resolve) => server.close(resolve));
    },
  };
}

// ── Startup Execution ────────────────────────────────────────────────────────
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  try {
    const app = await createStandaloneServer();
    await app.start();

    const shutdown = async () => {
      console.log('\n[Server] Shutting down gracefully...');
      await app.close();
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (err) {
    console.error('[Server] Startup failed:', err.message || err);
    process.exit(1);
  }
}

