import { strict as assert } from 'node:assert';
import test from 'node:test';
import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';

function makeRequest(origin, host = null) {
  const headers = new Headers();
  if (origin !== null) {
    headers.set('origin', origin);
  }
  if (host !== null) {
    headers.set('host', host);
  }
  return new Request('https://worldmonitor.app/api/test', { headers });
}

test('allows desktop Tauri origins', () => {
  const origins = [
    'https://tauri.localhost',
    'https://abc123.tauri.localhost',
    'tauri://localhost',
    'asset://localhost',
    'http://127.0.0.1:46123',
  ];

  for (const origin of origins) {
    const req = makeRequest(origin);
    assert.equal(isDisallowedOrigin(req), false, `origin should be allowed: ${origin}`);
    const cors = getCorsHeaders(req);
    assert.equal(cors['Access-Control-Allow-Origin'], origin);
  }
});

test('allows custom origins configured via ALLOWED_ORIGINS env var', () => {
  const oldEnv = process.env.ALLOWED_ORIGINS;
  try {
    process.env.ALLOWED_ORIGINS = 'https://my-vps.example.com,http://192.168.1.100:3000';
    const req1 = makeRequest('https://my-vps.example.com');
    assert.equal(isDisallowedOrigin(req1), false);
    assert.equal(getCorsHeaders(req1)['Access-Control-Allow-Origin'], 'https://my-vps.example.com');

    const req2 = makeRequest('http://192.168.1.100:3000');
    assert.equal(isDisallowedOrigin(req2), false);

    const req3 = makeRequest('https://unauthorized.com');
    assert.equal(isDisallowedOrigin(req3), true);
  } finally {
    if (oldEnv === undefined) {
      delete process.env.ALLOWED_ORIGINS;
    } else {
      process.env.ALLOWED_ORIGINS = oldEnv;
    }
  }
});

test('allows same-origin requests matching Host header', () => {
  const req = makeRequest('https://monitor.company.org', 'monitor.company.org');
  assert.equal(isDisallowedOrigin(req), false);
  assert.equal(getCorsHeaders(req)['Access-Control-Allow-Origin'], 'https://monitor.company.org');
});

test('rejects unrelated external origins', () => {
  const req = makeRequest('https://evil.example.com');
  assert.equal(isDisallowedOrigin(req), true);
  const cors = getCorsHeaders(req);
  assert.equal(cors['Access-Control-Allow-Origin'], 'https://worldmonitor.app');
});

test('requests without origin remain allowed', () => {
  const req = makeRequest(null);
  assert.equal(isDisallowedOrigin(req), false);
});
