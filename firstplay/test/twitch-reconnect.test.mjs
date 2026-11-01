import test from 'node:test';
import assert from 'node:assert/strict';
import { TwitchConnection } from '../../lib/twitch.mjs';

class ReentrantSocket extends EventTarget {
  closes = 0;
  close() { this.closes++; this.dispatchEvent(new Event('error')); this.dispatchEvent(new Event('close')); }
}
function setup(t) {
  const socket = new ReentrantSocket();
  t.mock.method(globalThis, 'WebSocket', function () { return socket; });
  const client = new TwitchConnection({ clientId: 'test', clientSecret: 'test', onStatus() {}, onEvent() {} });
  t.after(() => client.stop()); client.connect(); return { client, socket };
}
test('a synchronous error during socket.close does not recurse or crash the service', t => {
  const { client, socket } = setup(t);
  socket.dispatchEvent(new Event('error'));
  assert.equal(socket.closes, 1); assert.equal(client.status.state, 'reconnecting'); assert.ok(client.retryTimer);
});
test('stopping a failed socket is idempotent and does not schedule a reconnect', t => {
  const { client, socket } = setup(t);
  client.stop(); client.stop(); assert.equal(socket.closes, 1); assert.equal(client.running, false); assert.equal(client.retryTimer, undefined);
});
