import test from 'node:test';
import assert from 'node:assert/strict';
import { createApplication } from '../server.mjs';
import { EncryptedStore } from '../runtime/store.mjs';

const provider = { name: 'test-only', classify: async (_catalog, items) => ({ results: new Map(items.map(item => [item.id, { message_id: item.id, relevance: 'current_game', intents: ['recall'], references: [], unknown_information: false, unresolved_reference: false, uncertain: true, recommended_disposition: 'review', reason: 'Held test sentinel.' }])) }) };

test('HTTP role boundaries, CSRF checks and reader projections protect raw messages', async t => {
  const app = await createApplication({ provider, store: new EncryptedStore(), config: { port: 0, clientId: '', clientSecret: '' } });
  const base = (await app.start()).replace('localhost', '127.0.0.1'); t.after(() => app.close());
  const get = (path, token) => fetch(base + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const page = await get('/');
  const framePolicy = page.headers.get('content-security-policy');
  assert.ok(framePolicy.includes('frame-src https://player.twitch.tv;'));
  assert.ok(framePolicy.includes("frame-ancestors 'none'"));
  assert.equal((await get('/api/moderator')).status, 403);
  assert.equal((await get('/api/control')).status, 403);
  const hostile = await fetch(base + '/api/local-session', { method: 'POST', headers: { Origin: 'https://hostile.example', 'X-FirstPlay-Client': '1' } });
  assert.equal(hostile.status, 403);
  assert.equal((await fetch(base + '/api/local-session', { method: 'POST' })).status, 403);
  assert.equal((await fetch(base + '/api/local-session', { method: 'POST', headers: { 'X-FirstPlay-Client': '1' } })).status, 403);
  const login = await fetch(base + '/api/local-session', { method: 'POST', headers: { Origin: base, 'X-FirstPlay-Client': '1' } });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const links = app.auth.links();
  for (const path of ['/api/control', '/api/moderator', '/api/cases', '/api/catalog?kind=moon']) {
    const response = await fetch(base + path, { headers: { Authorization: `Bearer ${links.reader}`, Cookie: cookie } });
    assert.equal(response.status, 403, 'Reader capability must not inherit an ambient owner cookie.');
  }
  app.engine.ingest({ id: 'hidden', text: 'RAW SECRET SENTINEL' }); await app.engine.flush();
  const safe = await (await get('/api/reader', links.reader)).text();
  assert.ok(!safe.includes('RAW SECRET SENTINEL')); assert.ok(!safe.includes('Held test sentinel')); assert.ok(!safe.includes('frog.capture'));
  const owned = await fetch(base + '/api/moderator', { headers: { Cookie: cookie } });
  assert.ok((await owned.text()).includes('RAW SECRET SENTINEL'));
  assert.equal((await get('/research/firstplay/packs/smo-cap-cascade.v0.1.json')).status, 404);
  assert.equal((await get('/.env')).status, 404);
  const viewer = app.auth.issue('viewer', { senderId: 'someone-else' });
  const state = await (await get('/api/viewer?senderId=demo-viewer', viewer)).json();
  assert.equal(state.messages.length, 0);
  assert.equal((await get('/api/viewer', links.reader)).status, 403);
  const forbiddenAck = await fetch(base + '/api/reader/ack', { method: 'POST', headers: { Origin: base, 'X-FirstPlay-Client': '1', Authorization: `Bearer ${links.overlay}`, 'Content-Type': 'application/json' }, body: '{"ids":["hidden"]}' });
  assert.equal(forbiddenAck.status, 403);
});

test('capability revocation invalidates old links', async t => {
  const app = await createApplication({ provider, store: new EncryptedStore(), config: { port: 0, clientId: '', clientSecret: '' } });
  const base = (await app.start()).replace('localhost', '127.0.0.1'); t.after(() => app.close());
  const old = app.auth.links(); const fresh = app.auth.rotateLinks();
  assert.notEqual(old.reader, fresh.reader);
  assert.equal((await fetch(base + '/api/reader', { headers: { Authorization: `Bearer ${old.reader}` } })).status, 403);
  assert.equal((await fetch(base + '/api/reader', { headers: { Authorization: `Bearer ${fresh.reader}` } })).status, 200);
});
