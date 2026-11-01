// Local integration fixture. This simulates Twitch DOM/transport and uses the real configured model.
// It does not load an extension into Chrome, contact Twitch, or publish chat messages.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createApplication } from '../server.mjs';
import { EncryptedStore } from '../runtime/store.mjs';
import { createProvider } from '../ml/providers.mjs';

const ID = 'a'.repeat(32), CHANNEL = 'drpickles12321', port = 3213;
const app = await createApplication({ provider: createProvider(), store: new EncryptedStore(), config: { port: 0, clientId: 'fixture-only', clientSecret: 'fixture-only', viewerOrigin: '' },
  twitchFactory: options => ({ ...options, tokens: { userId: 'fixture-owner', login: CHANNEL }, status: { state: 'connected', channel: CHANNEL }, restore: async () => true, stop() {} }) });
await app.start();
const request = { headers: { 'x-firstplay-client': '1', 'x-firstplay-extension': ID, origin: `chrome-extension://${ID}` } };
const grant = app.extensionAccess.redeem(request, { code: app.extensionAccess.start({ role: 'owner', id: 'fixture-owner' }).code });
request.headers.authorization = `Bearer ${grant.token}`;
for (const [index, text] of ['That jump was clean!', 'Use Cappy to capture that frog.', 'I had pasta for dinner.'].entries()) app.engine.ingest({ id: `fixture-${index}`, text, senderId: 'fixture-viewer', displayName: 'demo_chatter', source: 'live', channelId: 'fixture-owner' });
console.log('Classifying three synthetic messages with the real model for the extension fixture…'); await app.engine.flush();
let offline = false;
const server = http.createServer(async (req, res) => {
  const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
  try {
    if (req.headers.host !== `localhost:${port}`) return send(403, { error: 'Local fixture only.' });
    const url = new URL(req.url, `http://localhost:${port}`);
    if (req.method === 'GET') {
      const resources = { '/drpickles12321': ['../test/fixtures/extension.html', 'text/html'], '/other_channel': ['../test/fixtures/extension.html', 'text/html'], '/fixture.js': ['../test/fixtures/extension.js', 'text/javascript'], '/guard.css': ['../extension/guard.css', 'text/css'], '/content.js': ['../extension/content.js', 'text/javascript'] };
      if (!resources[url.pathname]) return send(404, { error: 'Not found.' });
      const [path, type] = resources[url.pathname]; res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(await readFile(new URL(path, import.meta.url))); return;
    }
    if (req.method !== 'POST' || req.headers.origin !== `http://localhost:${port}` || req.headers['x-firstplay-client'] !== '1') return send(403, { error: 'Fixture origin required.' });
    let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 10000) throw new Error('Oversized fixture request.'); } const data = JSON.parse(raw || '{}');
    if (url.pathname === '/offline') { offline = Boolean(data.offline); return send(200, { ok: true }); }
    if (url.pathname !== '/bridge') return send(404, { error: 'Not found.' });
    if (offline) return send(200, { ok: false, error: 'Simulated unavailable service.' });
    if (data.type === 'status') return send(200, { ok: true, value: { enabled: true, paired: true, channel: CHANNEL, revision: 0 } });
    if (data.type === 'feed') return send(200, { ok: true, value: app.extensionAccess.feed(request) });
    if (data.type === 'ack') return send(200, { ok: true, value: app.extensionAccess.acknowledge(request, data) });
    return send(403, { error: 'Unsupported fixture operation.' });
  } catch (error) { send(400, { ok: false, error: error.message }); }
});
await new Promise(resolve => server.listen(port, '127.0.0.1', resolve)); console.log(`Extension integration fixture: http://localhost:${port}/${CHANNEL}\nSimulated Twitch layout; real model; no Twitch posts.`);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { void new Promise(resolve => server.close(resolve)).then(() => app.close()).then(() => process.exit(0)); });
