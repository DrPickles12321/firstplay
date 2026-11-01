import test from 'node:test';
import assert from 'node:assert/strict';
import { EncryptedTwitchConnection } from '../runtime/twitch.mjs';

function connection(scopes) {
  const client = Object.create(EncryptedTwitchConnection.prototype);
  client.tokens = { userId: 'test-owner', accessToken: 'test-token', scopes }; client.clientId = 'test-client'; client.validate = async () => {};
  return client;
}
test('read-only authorization cannot send test messages', async t => {
  let calls = 0; t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('must not call'); });
  await assert.rejects(connection(['user:read:chat']).sendTestMessages(), /chat-send permission/); assert.equal(calls, 0);
});
test('shared sessions block test posts to avoid unrequested recipients', async t => {
  const calls = []; t.mock.method(globalThis, 'fetch', async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({ data: [{ session_id: 'shared' }] }) }; });
  await assert.rejects(connection(['user:read:chat', 'user:write:chat']).sendTestMessages(), /Shared Chat/); assert.equal(calls.length, 1);
});
test('the optional writer posts only two fixed messages as the connected channel owner', async t => {
  const posted = []; t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.includes('shared_chat')) return { ok: false, status: 404 };
    posted.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ data: [{ is_sent: true, message_id: `test-${posted.length}` }] }) };
  });
  const result = await connection(['user:read:chat', 'user:write:chat']).sendTestMessages();
  assert.equal(result.length, 2); assert.equal(posted.length, 2);
  assert.ok(posted.every(message => message.broadcaster_id === 'test-owner' && message.sender_id === 'test-owner'));
});

test('Subnautica checks use the fixed Subnautica instruction and reject arbitrary fixture selections', async t => {
  const posted = []; t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.includes('shared_chat')) return { ok: false, status: 404 };
    posted.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ data: [{ is_sent: true, message_id: `sn-${posted.length}` }] }) };
  });
  await connection(['user:read:chat', 'user:write:chat']).sendTestMessages('subnautica');
  assert.deepEqual(posted.map(row => row.message), ['Hello FirstPlay — checking the chat connection.', 'Catch a bladderfish and make water.']);
  await assert.rejects(connection(['user:write:chat']).sendTestMessages('anything-else'), /Unsupported/); assert.equal(posted.length, 2);
});
