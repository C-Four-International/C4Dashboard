import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('AISStream service and military activity layer hook', async (t) => {
  await t.test('aisstream.ts exports required functions and interfaces', () => {
    const aisStreamSrc = fs.readFileSync('src/services/aisstream.ts', 'utf8');

    assert.ok(aisStreamSrc.includes('export function connectAisStream'), 'Must export connectAisStream');
    assert.ok(aisStreamSrc.includes('export function disconnectAisStreamSocket'), 'Must export disconnectAisStreamSocket');
    assert.ok(aisStreamSrc.includes('export function registerAisStreamListener'), 'Must export registerAisStreamListener');
    assert.ok(aisStreamSrc.includes('export function isAisStreamConnected'), 'Must export isAisStreamConnected');
    assert.ok(aisStreamSrc.includes('export function getAisStreamApiKey'), 'Must export getAisStreamApiKey');
    assert.ok(aisStreamSrc.includes('/ws/aisstream/v0/stream'), 'Must support Vite proxy /ws/aisstream in dev');
  });

  await t.test('maritime service connects AISStream listener and checks AISSTREAM_API_KEY', () => {
    const maritimeSrc = fs.readFileSync('src/services/maritime/index.ts', 'utf8');

    assert.ok(maritimeSrc.includes('registerAisStreamListener'), 'maritime/index.ts must register AISStream listener');
    assert.ok(maritimeSrc.includes('connectAisStream'), 'maritime/index.ts must connect to AISStream when key is available');
    assert.ok(maritimeSrc.includes('export async function ensureAisSnapshot'), 'maritime/index.ts must export ensureAisSnapshot');
    assert.ok(maritimeSrc.includes('getAisStreamApiKey'), 'isAisConfigured must check getAisStreamApiKey');
  });

  await t.test('military-vessels service maps naval prefixes and supports real-time updates', () => {
    const vesselsSrc = fs.readFileSync('src/services/military-vessels.ts', 'utf8');

    assert.ok(vesselsSrc.includes('export function onMilitaryVesselsUpdated'), 'Must export onMilitaryVesselsUpdated');
    assert.ok(vesselsSrc.includes("prefix: 'USS '"), 'Must recognize USS naval prefix');
    assert.ok(vesselsSrc.includes("prefix: 'HMS '"), 'Must recognize HMS naval prefix');
    assert.ok(vesselsSrc.includes("prefix: 'USNS '"), 'Must recognize USNS naval prefix');
    assert.ok(vesselsSrc.includes('scheduleVesselsUpdateNotification()'), 'Must schedule update notifications on tracked vessels');
    assert.ok(vesselsSrc.includes('ensureAisSnapshot'), 'Must await ensureAisSnapshot when initial vessels are empty');
  });

  await t.test('data-loader hooks into onMilitaryVesselsUpdated to provide live layer updates', () => {
    const loaderSrc = fs.readFileSync('src/app/data-loader.ts', 'utf8');

    assert.ok(loaderSrc.includes('onMilitaryVesselsUpdated'), 'data-loader must import onMilitaryVesselsUpdated');
    assert.ok(loaderSrc.includes('ensureMilitaryVesselsListener'), 'data-loader must implement ensureMilitaryVesselsListener');
    assert.ok(loaderSrc.includes('this.ctx.map?.setMilitaryVessels(vessels, clusters)'), 'Must update map military vessels in real time');
  });
});
