import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import { createProvider } from './ml/providers.mjs';
import { ModelHealth } from './runtime/model-health.mjs';
import { EncryptedStore } from './runtime/store.mjs';
import { GameSessions } from './runtime/sessions.mjs';
import { CapabilityAuth, parseCookies } from './runtime/auth.mjs';
import { EncryptedTwitchConnection, authenticateViewer } from './runtime/twitch.mjs';
import { createViewerGateway } from './runtime/viewer-gateway.mjs';
import { ExtensionAccess } from './runtime/extension-access.mjs';
import { EvaluationDesk } from './runtime/evaluation.mjs';
import { VideoRehearsal, SUBNAUTICA_REHEARSAL } from './runtime/video-rehearsal.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const UI = new URL('./public/', import.meta.url);
const cookie = (name, value, path = '/') => `${name}=${value}; HttpOnly; SameSite=${name.endsWith('_oauth') ? 'Lax' : 'Strict'}; Path=${path}; Max-Age=28800`;
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
async function body(req) {
  let length = 0; const chunks = [];
  for await (const chunk of req) { length += chunk.length; if (length > 6_000_000) { const error = new Error('Request is too large.'); error.status = 413; throw error; } chunks.push(chunk); }
  return length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
}
function json(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); }

export async function createApplication({ catalog, provider = createProvider(), store, config = {}, twitchFactory = options => new EncryptedTwitchConnection(options) } = {}) {
  const dataDirectory = resolve(config.dataDirectory || resolve(ROOT, '.data/firstplay'));
  store ||= await EncryptedStore.open(dataDirectory);
  const port = config.port ?? Number(process.env.PORT || 3211);
  const sessions = await GameSessions.create({ catalog, provider, store });
  let engine = sessions.engine, observer = sessions.observer; catalog = sessions.catalog;
  const syncSession = () => { engine = sessions.engine; observer = sessions.observer; catalog = sessions.catalog; };
  const modelHealth = new ModelHealth();
  const evaluation = new EvaluationDesk({ store, directory: dataDirectory });
  const rehearsal = new VideoRehearsal({ catalog: sessions.catalogs.get('subnautica'), provider, reviewStore: config.rehearsal ? store : undefined });
  const auth = new CapabilityAuth(store, Date.now, { cookiePrefix: config.cookiePrefix || 'fp' }), cookieNames = auth.cookieNames;
  const oauthStates = new Map();
  let source = 'replay', server, origin = `http://localhost:${port}`;
  const clientId = config.clientId ?? process.env.TWITCH_CLIENT_ID;
  const clientSecret = config.clientSecret ?? process.env.TWITCH_CLIENT_SECRET;
  const configured = Boolean(clientId && clientSecret);
  const publicViewerOrigin = config.viewerOrigin ?? process.env.FIRSTPLAY_VIEWER_ORIGIN;
  const rehearsalAvailable = Boolean(config.rehearsal && !configured && !publicViewerOrigin);
  const viewerGateway = publicViewerOrigin ? createViewerGateway({ engine: () => engine, auth, clientId, clientSecret, publicOrigin: publicViewerOrigin, port: config.viewerPort ?? Number(process.env.FIRSTPLAY_VIEWER_PORT || 3212) }) : null;
  const redirectUri = config.redirectUri ?? process.env.TWITCH_REDIRECT_URI ?? `${origin}/auth/callback`;
  const twitch = twitchFactory({ clientId, clientSecret, redirectUri, store, onStatus: () => {}, onEvent: (type, event) => {
    if (type === 'channel.chat.message') {
      if (event.source_broadcaster_user_id && event.source_broadcaster_user_id !== event.broadcaster_user_id) return;
      engine.ingest({ id: event.message_id, text: event.message.text, senderId: event.chatter_user_id, displayName: event.chatter_user_name, replyTo: event.reply?.parent_message_id, source: 'live', channelId: event.broadcaster_user_id });
    } else if (type === 'channel.chat.message_delete') engine.remove(event.message_id);
    else if (type === 'channel.chat.clear_user_messages') engine.removeUser(event.target_user_id);
    else if (type === 'channel.chat.clear') engine.clear();
  } });

  const connectionState = () => ({ source, rehearsal: Boolean(config.rehearsal), twitch: twitch.status, twitchConfigured: configured, model: { provider: provider.name, local: provider.name === 'codex-cli', lastLatencyMs: engine.metrics.latencyMs.at(-1) || null, error: engine.metrics.lastError, lastSuccessAt: engine.metrics.lastSuccessAt, check: modelHealth.status() }, paused: engine.paused });
  const extensionAccess = new ExtensionAccess({ auth, engine: () => engine, store, channel: () => source === 'live' && twitch.tokens?.userId ? { id: twitch.tokens.userId, login: twitch.tokens.login } : null, connection: connectionState });
  function verifyHost(req) {
    const actualPort = server?.address()?.port ?? port;
    if (![ `localhost:${actualPort}`, `127.0.0.1:${actualPort}` ].includes(req.headers.host)) { const error = new Error('This FirstPlay instance accepts local connections only.'); error.status = 403; throw error; }
  }
  function verifyMutation(req) {
    const expectedOrigin = `http://${req.headers.host}`;
    if (req.headers.origin !== expectedOrigin || req.headers['sec-fetch-site'] === 'cross-site' || req.headers['x-firstplay-client'] !== '1') { const error = new Error('Request origin is not authorized.'); error.status = 403; throw error; }
  }
  async function staticFile(res, filename) {
    const type = filename.endsWith('.css') ? 'text/css' : filename.endsWith('.js') ? 'text/javascript' : 'text/html';
    res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); res.end(await readFile(new URL(filename, UI)));
  }

  server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Content-Type-Options', 'nosniff');
    const videoRehearsalPage = config.rehearsal && req.url?.split('?')[0] === '/rehearsal';
    if (videoRehearsalPage) res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self'${videoRehearsalPage ? ' https://www.youtube.com https://s.ytimg.com' : ''}; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; frame-src https://player.twitch.tv${videoRehearsalPage ? ' https://www.youtube.com https://www.youtube-nocookie.com' : ''}; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`);
    try {
      verifyHost(req); const url = new URL(req.url, origin);
      if (req.method === 'GET') {
        if (['/', '/reader', '/overlay', '/moderator', '/status', '/capture', '/evaluate', '/rehearsal'].includes(url.pathname)) return await staticFile(res, 'index.html');
        if (['/app.js', '/app.css', '/rehearsal.js'].includes(url.pathname)) return await staticFile(res, url.pathname.slice(1));
        if (url.pathname === '/api/games') { auth.actor(req, ['owner']); return json(res, 200, { games: sessions.games(), savedRuns: sessions.savedRuns(), session: sessions.summary() }); }
        if (url.pathname === '/api/health') return json(res, 200, { ok: true, ...connectionState() });
        if (url.pathname === '/api/extension/feed') return json(res, 200, extensionAccess.feed(req));
        if (url.pathname === '/api/reader') {
          const reader = auth.actor(req, ['reader', 'overlay']);
          if (reader.kind === 'chrome-extension') return json(res, 403, { error: 'Use the channel-bound extension endpoint.' });
          return json(res, 200, { ...engine.safeFeed(), connection: connectionState(), knownCount: engine.ledger.state.factIds.length });
        }
        if (url.pathname === '/api/control') {
          auth.actor(req, ['owner']);
          return json(res, 200, { connection: connectionState(), canSendTest: Boolean(twitch.tokens?.scopes?.includes('user:write:chat')), policy: engine.policy, objective: engine.objective, helpRequest: engine.helpRequest, links: auth.links(), extension: extensionAccess.status(), publicViewerOrigin: viewerGateway?.origin || null, session: sessions.summary(), progress: observer.summary(), games: sessions.games(), savedRuns: sessions.savedRuns(), knownCount: engine.ledger.state.factIds.length, screening: engine.screeningStatus(), metrics: { pending: engine.pendingCount(), review: engine.moderatorState().review.length, received: engine.metrics.received }, savedDiscoveries: catalog.spoilerSafeDiscoveries([...engine.ledger.state.factIds, ...engine.ledger.state.relationIds]) });
        }
        if (url.pathname === '/api/moderator') { auth.actor(req, ['owner', 'moderator']); return json(res, 200, { ...engine.moderatorState(), observations: observer.list(engine.epoch), observationStatus: observer.status(), session: sessions.summary(), connection: connectionState() }); }
        if (url.pathname === '/api/catalog') {
          auth.actor(req, ['owner', 'moderator']);
          const kind = url.searchParams.get('kind'), query = (url.searchParams.get('q') || '').slice(0, 200);
          let references = kind === 'all' ? query ? catalog.retrieve(query, 50).map(hit => hit.reference) : [] : [...catalog.references.values()].filter(reference => reference.type === kind && (kind !== 'moon' || reference.kingdom === 'Cascade'));
          if (query && kind !== 'all') references = references.filter(reference => `${reference.name || reference.statement} ${reference.id}`.toLowerCase().includes(query.toLowerCase()));
          return json(res, 200, { references: references.slice(0, 100) });
        }
        if (url.pathname === '/api/viewer') { const actor = auth.actor(req, ['viewer']); return json(res, 200, { ...engine.viewerState(actor), identity: { name: actor.displayName || actor.senderId, demo: Boolean(actor.demo) }, connection: connectionState() }); }
        if (url.pathname === '/api/cases') {
          auth.actor(req, ['owner']);
          const requestedRun = sessions.run.id, selectedCatalog = catalog, setId = url.searchParams.get('set') || 'main', rows = await evaluation.cases(selectedCatalog, setId); sessions.assertCurrent(requestedRun);
          return json(res, 200, { session: sessions.summary(), caseSet: setId, reviewedExport: evaluation.filename(selectedCatalog, setId), reportFilename: evaluation.definition(selectedCatalog, setId).report, evaluationDirectory: config.rehearsal ? '.data/firstplay-demo' : '.data/firstplay', caseSets: evaluation.sets(selectedCatalog).map(({ id, label }) => ({ id, label })), facts: [...selectedCatalog.references.values()].map(({ id, label, statement, name }) => ({ id, label: label || name || statement })), cases: rows });
        }
        if (url.pathname === '/api/cases/export') {
          auth.actor(req, ['owner']); sessions.assertCurrent(url.searchParams.get('run')); const requestedRun = sessions.run.id, output = await evaluation.export(catalog, url.searchParams.get('set') || 'main'); sessions.assertCurrent(requestedRun);
          res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Content-Disposition': `attachment; filename="${output.filename}"` }); res.end(output.text); return;
        }
        if (url.pathname === '/api/evaluation') {
          auth.actor(req, ['owner']);
          const requestedRun = sessions.run.id, result = await evaluation.report(catalog, url.searchParams.get('set') || 'main'); sessions.assertCurrent(requestedRun);
          return json(res, 200, { ...result, session: sessions.summary() });
        }
        if (url.pathname.startsWith('/api/rehearsal')) {
          const actor = auth.actor(req, ['owner']);
          if (url.pathname === '/api/rehearsal') return json(res, 200, { ...SUBNAUTICA_REHEARSAL, available: rehearsalAvailable && source === 'replay', rehearsalUrl: 'http://localhost:3213/rehearsal' });
          if (!rehearsalAvailable || source !== 'replay') return json(res, 403, { error: 'Video chat rehearsals run only in the isolated, Twitch-disabled rehearsal app.' });
          if (url.pathname === '/api/rehearsal/state') return json(res, 200, { ...rehearsal.state(actor), savedReviews: rehearsal.savedReviews(actor) });
          if (url.pathname === '/api/rehearsal/reviews') return json(res, 200, { savedReviews: rehearsal.savedReviews(actor) });
          if (url.pathname === '/api/rehearsal/reviews/export') { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="firstplay-saved-scene-reviews.json"' }); res.end(JSON.stringify(rehearsal.exportReviews(actor), null, 2)); return; }
          if (url.pathname === '/api/rehearsal/export') { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="firstplay-subnautica-rehearsal.json"' }); res.end(JSON.stringify(rehearsal.export(actor), null, 2)); return; }
        }
        if (url.pathname === '/auth/twitch') {
          if (!configured) return json(res, 400, { error: 'Add your Twitch application credentials to .env and restart FirstPlay.' });
          const role = url.searchParams.get('role') === 'viewer' ? 'viewer' : 'owner';
          if (role === 'owner') auth.actor(req, ['owner']);
          const state = randomBytes(24).toString('hex');
          for (const [id, record] of oauthStates) if (record.expiresAt <= Date.now()) oauthStates.delete(id);
          oauthStates.set(state, { role, expiresAt: Date.now() + 600_000 });
          const target = new URL('https://id.twitch.tv/oauth2/authorize');
          target.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: role === 'owner' ? url.searchParams.get('send') === '1' ? 'user:read:chat user:write:chat' : 'user:read:chat' : '', state, force_verify: 'true' }).toString();
          res.writeHead(302, { Location: target.href, 'Set-Cookie': cookie(cookieNames.oauth, state, '/auth') }); res.end(); return;
        }
        if (url.pathname === '/auth/callback') {
          const state = url.searchParams.get('state'), record = oauthStates.get(state); oauthStates.delete(state);
          if (!record || record.expiresAt <= Date.now() || !equal(parseCookies(req)[cookieNames.oauth], state)) return json(res, 400, { error: 'Sign-in expired or was started in another browser. Try again.' });
          if (url.searchParams.has('error') || !url.searchParams.get('code')) return json(res, 400, { error: 'Twitch sign-in was not completed.' });
          if (record.role === 'owner') {
            await twitch.authorize(url.searchParams.get('code')); engine.clear(); source = 'live'; twitch.connect();
            res.writeHead(302, { Location: '/', 'Set-Cookie': cookie(cookieNames.oauth, '', '/auth') + '; Max-Age=0' });
          } else {
            const identity = await authenticateViewer(url.searchParams.get('code'), { clientId, clientSecret, redirectUri });
            const token = auth.issue('viewer', identity);
            res.writeHead(302, { Location: '/status', 'Set-Cookie': [cookie(cookieNames.viewer, token), cookie(cookieNames.oauth, '', '/auth') + '; Max-Age=0'] });
          }
          res.end(); return;
        }
        return json(res, 404, { error: 'Not found.' });
      }
      if (req.method !== 'POST' || !url.pathname.startsWith('/api/')) return json(res, 405, { error: 'Method not allowed.' });
      if (url.pathname === '/api/extension/redeem') { extensionAccess.checkRequest(req); return json(res, 200, extensionAccess.redeem(req, await body(req))); }
      if (url.pathname === '/api/extension/ack') { extensionAccess.checkRequest(req); return json(res, 200, extensionAccess.acknowledge(req, await body(req))); }
      verifyMutation(req);
      if (url.pathname === '/api/local-session') {
        // This explicit loopback-only development mode is not a public hosting authentication scheme.
        const token = auth.issue('owner', { id: 'local-owner' });
        res.setHeader('Set-Cookie', cookie(cookieNames.operator, token)); return json(res, 200, { ok: true });
      }
      if (url.pathname === '/api/reader/ack') { const actor = auth.actor(req, ['reader']); if (actor.kind === 'chrome-extension') return json(res, 403, { error: 'Use the channel-bound extension endpoint.' }); const data = await body(req); if (!Array.isArray(data.ids) || data.ids.some(id => typeof id !== 'string')) throw new Error('Invalid receipt.'); engine.acknowledge(data.ids, actor); return json(res, 200, { ok: true }); }
      const actor = auth.actor(req, ['owner', 'moderator']);
      const data = await body(req);
      if (url.pathname.startsWith('/api/rehearsal/')) {
        if (!rehearsalAvailable || source !== 'replay') return json(res, 403, { error: 'Video chat rehearsals run only in the isolated, Twitch-disabled rehearsal app.' });
        if (url.pathname === '/api/rehearsal/start') return json(res, 200, { ...rehearsal.start(data.chapterId, actor), savedReviews: rehearsal.savedReviews(actor) });
        if (url.pathname === '/api/rehearsal/cue') return json(res, 200, rehearsal.send(data, actor));
        if (url.pathname === '/api/rehearsal/confirm') return json(res, 200, rehearsal.confirm(data, actor));
        if (url.pathname === '/api/rehearsal/judge') return json(res, 200, { ...rehearsal.judge(data, actor), savedReviews: rehearsal.savedReviews(actor) });
        return json(res, 404, { error: 'Not found.' });
      }
      if (['/api/policy', '/api/pause', '/api/help/request', '/api/message', '/api/review', '/api/discovery', '/api/discovery/undo', '/api/knowledge/reset', '/api/clear', '/api/observe', '/api/observations/source', '/api/observations/source/invalidate', '/api/observations/source/end', '/api/observations/confirm', '/api/observations/dismiss', '/api/observations/preferences', '/api/live-check', '/api/model/check', '/api/cases/review', '/api/cases/reopen'].includes(url.pathname)) sessions.assertCurrent(data.expectedRunId);
      if (url.pathname === '/api/session/start') { sessions.start(data.gameId, actor, data.expectedRunId); syncSession(); return json(res, 200, { ok: true, session: sessions.summary() }); }
      else if (url.pathname === '/api/session/restore') { sessions.restore(data.runId, actor, data.expectedRunId); syncSession(); return json(res, 200, { ok: true, session: sessions.summary() }); }
      else if (url.pathname === '/api/model/check') { const currentRun = sessions.run.id, currentEngine = engine; const check = await modelHealth.check({ engine: currentEngine, actor, assertCurrent: () => sessions.assertCurrent(currentRun) }); return json(res, 200, { check, session: sessions.summary() }); }
      else if (url.pathname === '/api/policy') { if (actor.role !== 'owner') return json(res, 403, { error: 'Only the owner can change the policy.' }); engine.setPolicy(data.policy, actor, data.objective); }
      else if (url.pathname === '/api/extension/pair') return json(res, 200, extensionAccess.start(actor));
      else if (url.pathname === '/api/extension/revoke') return json(res, 200, extensionAccess.revoke(actor));
      else if (url.pathname === '/api/pause') engine.setPaused(data.paused, actor);
      else if (url.pathname === '/api/help/request') engine.requestHint(data.topic, actor);
      else if (url.pathname === '/api/message') {
        if (source !== 'replay') return json(res, 409, { error: 'Local messages are disabled during a live Twitch session.' });
        const message = engine.ingest({ text: data.text, senderId: 'demo-viewer', displayName: 'demo_viewer', source: 'replay', replyTo: data.replyTo || null }); return json(res, 202, { id: message.id });
      }
      else if (url.pathname === '/api/review') engine.review(data.id, data.action, actor);
      else if (url.pathname === '/api/discovery') { engine.confirmDiscovery({ id: data.id, eventId: data.eventId, known: data.known !== false, actor, evidence: data.evidence || 'Confirmed in moderator console' }); if (data.known === false) observer.automaticProgress?.block([data.id]); }
      else if (url.pathname === '/api/discovery/undo') { const operation = engine.ledger.history(1)[0]; engine.undoDiscovery({ operationId: data.operationId, expectedRevision: data.knowledgeRevision, actor }); observer.automaticProgress?.block(operation.changes.filter(change => change.after).map(change => change.id)); }
      else if (url.pathname === '/api/knowledge/reset') { engine.ledger.reset(actor); engine.epoch = randomBytes(16).toString('hex'); observer.automaticProgress?.configure(false, actor, engine); }
      else if (url.pathname === '/api/clear') engine.clear();
      else if (url.pathname === '/api/disconnect') { if (actor.role !== 'owner') return json(res, 403, { error: 'Owner access required.' }); await twitch.disconnect(); engine.clear(); source = 'replay'; }
      else if (url.pathname === '/api/live-check') { if (actor.role !== 'owner' || source !== 'live') return json(res, 403, { error: 'A live owner connection is required.' }); return json(res, 200, { sent: await twitch.sendTestMessages(catalog.gameId) }); }
      else if (url.pathname === '/api/links/rotate') { if (actor.role !== 'owner') return json(res, 403, { error: 'Owner access required.' }); return json(res, 200, { links: auth.rotateLinks() }); }
      else if (url.pathname === '/api/observations/source') { if (data.kind === 'synthetic' && !config.rehearsal) throw new Error('Synthetic feeds are available only in the isolated rehearsal.'); return json(res, 200, { source: data.recover === true ? observer.recoverSource(data.kind, data.previousId, actor) : observer.beginSource(data.kind, actor) }); }
      else if (url.pathname === '/api/observations/source/invalidate' || url.pathname === '/api/observations/source/end') return json(res, 200, { source: observer.invalidateSource(data.id, data.generation, actor, url.pathname.endsWith('/end')) });
      else if (url.pathname === '/api/observe') { if (!data.source) throw new Error('Select a current game window or recording before checking video.'); const requestedObserver = observer, epoch = engine.epoch, candidates = await requestedObserver.observe(data.frames, epoch, undefined, data.source); sessions.assertCurrent(data.expectedRunId); if (epoch !== engine.epoch) { requestedObserver.list(engine.epoch); const error = new Error('The playthrough permissions changed during the video check. Capture fresh evidence.'); error.status = 409; throw error; } const autoConfirmed = requestedObserver.automaticProgress?.process({ observer: requestedObserver, engine, actor }) || []; return json(res, 200, { candidates, autoConfirmed }); }
      else if (url.pathname === '/api/observations/preferences') { if (!observer.automaticProgress) throw new Error('Automatic confirmation is available for local Subnautica recognition.'); observer.automaticProgress.configure(data.automatic, actor, engine); }
      else if (url.pathname === '/api/observations/confirm') observer.confirm(data.id, engine, actor);
      else if (url.pathname === '/api/observations/dismiss') observer.dismiss(data.id, engine, actor);
      else if (url.pathname === '/api/cases/review') {
        const result = await evaluation.save({ catalog, setId: data.caseSet || 'main', id: data.id, expected: data.expected, note: data.note || '', sourceHash: data.sourceHash, expectedRevision: data.reviewRevision, actor, assertCurrent: () => sessions.assertCurrent(data.expectedRunId) });
        return json(res, 200, { ...result, session: sessions.summary() });
      } else if (url.pathname === '/api/cases/reopen') {
        const result = await evaluation.reopen({ catalog, setId: data.caseSet || 'main', id: data.id, sourceHash: data.sourceHash, expectedRevision: data.reviewRevision, actor, assertCurrent: () => sessions.assertCurrent(data.expectedRunId) });
        return json(res, 200, { ...result, session: sessions.summary() });
      } else return json(res, 404, { error: 'Not found.' });
      return json(res, 200, { ok: true, session: sessions.summary() });
    } catch (error) {
      if (!res.headersSent) json(res, error.status || (error instanceof SyntaxError ? 400 : 400), { error: error.message || 'The request could not be completed.', code: error.code || 'request_error' });
      else res.end();
    }
  });
  const pruneTimer = setInterval(() => { engine.prune(); observer.prune(); }, 1000); pruneTimer.unref();
  return { server, get engine() { return engine; }, get observer() { return observer; }, get catalog() { return catalog; }, sessions, auth, twitch, store, extensionAccess, rehearsal,
    async start() { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); }); origin = `http://localhost:${server.address().port}`; if (viewerGateway) await viewerGateway.start(); if (configured && await twitch.restore()) source = 'live'; return origin; },
    async close() { clearInterval(pruneTimer); modelHealth.close(); twitch.stop(); rehearsal.close(); sessions.close(); if (viewerGateway) await viewerGateway.close(); await new Promise(resolve => server.close(resolve)); store.close(); },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const app = await createApplication();
  const url = await app.start(); console.log(`FirstPlay: ${url}\nProvider: ${app.engine.provider.name}\nLocal development server; no public deployment.`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { void app.close().then(() => process.exit(0)); });
}
