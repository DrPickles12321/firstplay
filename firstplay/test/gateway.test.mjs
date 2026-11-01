import test from 'node:test';
import assert from 'node:assert/strict';
import { EncryptedStore } from '../runtime/store.mjs';
import { CapabilityAuth } from '../runtime/auth.mjs';
import { createViewerGateway } from '../runtime/viewer-gateway.mjs';
import http from 'node:http';

test('public viewer gateway has no operator, model or raw moderation routes even with an owner credential', async t => {
  const store = new EncryptedStore(), auth = new CapabilityAuth(store);
  const gateway = createViewerGateway({ engine: { viewerState: actor => ({ messages: [{ text: `Only ${actor.senderId}` }] }) }, auth, publicOrigin: 'https://firstplay.example', port: 0, clientId: '', clientSecret: '' });
  await gateway.start(); t.after(async () => { await gateway.close(); store.close(); });
  const base = `http://127.0.0.1:${gateway.server.address().port}`, owner = auth.issue('owner');
  const call = (path, token = '', method = 'GET') => new Promise((resolve, reject) => {
    const req = http.request(base + path, { method, headers: { Host: 'firstplay.example', ...(token ? { Authorization: `Bearer ${token}` } : {}) } }, res => {
      let body = ''; res.on('data', chunk => { body += chunk; }); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
    }); req.on('error', reject); req.end();
  });
  for (const path of ['/api/local-session', '/api/control', '/api/moderator', '/api/catalog', '/api/cases', '/api/observe', '/.env', '/moderator']) {
    const response = await call(path, owner);
    assert.equal(response.status, 404, path);
  }
  assert.equal((await call('/api/local-session', '', 'POST')).status, 405);
  const viewer = auth.issue('viewer', { senderId: 'alice' });
  const response = await call('/api/viewer?senderId=bob', viewer);
  assert.deepEqual(response.body, { messages: [{ text: 'Only alice' }], identity: { name: 'alice', demo: false } });
  assert.equal((await call('/api/viewer', owner)).status, 403);
});
