import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { authenticateViewer } from './twitch.mjs';
import { parseCookies } from './auth.mjs';

// Expose this port, never the local operator port. There are no operator or model routes here.
export function createViewerGateway({ engine, auth, clientId, clientSecret, publicOrigin, port = 3212 }) {
  const origin = new URL(publicOrigin);
  if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) throw new Error('FIRSTPLAY_VIEWER_ORIGIN must be an HTTPS origin without a path.');
  const states = new Map(), redirectUri = `${origin.origin}/auth/callback`;
  const send = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    try {
      if (req.method !== 'GET') return send(res, 405, { error: 'This gateway provides viewer status only.' });
      if (req.headers.host !== origin.host) return send(res, 403, { error: 'Unexpected viewer gateway host.' });
      const url = new URL(req.url, origin);
      if (url.pathname === '/') { res.writeHead(302, { Location: '/status' }); res.end(); return; }
      if (['/status', '/app.js', '/app.css'].includes(url.pathname)) {
        const name = url.pathname === '/status' ? 'index.html' : url.pathname.slice(1);
        res.writeHead(200, { 'Content-Type': name.endsWith('.js') ? 'text/javascript; charset=utf-8' : name.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8' });
        res.end(await readFile(new URL(`../public/${name}`, import.meta.url))); return;
      }
      if (url.pathname === '/api/viewer') { const actor = auth.actor(req, ['viewer']); return send(res, 200, { ...(typeof engine === 'function' ? engine() : engine).viewerState(actor), identity: { name: actor.displayName || actor.senderId, demo: false } }); }
      if (url.pathname === '/auth/twitch') {
        if (!clientId || !clientSecret) return send(res, 503, { error: 'Twitch sign-in is not configured.' });
        if (url.searchParams.get('role') !== 'viewer') return send(res, 403, { error: 'Operator sign-in is not available on this gateway.' });
        for (const [key, record] of states) if (record.expiresAt < Date.now()) states.delete(key);
        const state = randomBytes(24).toString('hex'); states.set(state, { expiresAt: Date.now() + 600_000 });
        const target = new URL('https://id.twitch.tv/oauth2/authorize');
        target.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: '', state, force_verify: 'true' }).toString();
        res.writeHead(302, { Location: target.href, 'Set-Cookie': `${auth.cookieNames.viewerOauth}=${state}; Secure; HttpOnly; SameSite=Lax; Path=/auth; Max-Age=600` }); res.end(); return;
      }
      if (url.pathname === '/auth/callback') {
        const state = url.searchParams.get('state'), record = states.get(state); states.delete(state);
        const saved = parseCookies(req)[auth.cookieNames.viewerOauth];
        if (!record || record.expiresAt < Date.now() || typeof saved !== 'string' || typeof state !== 'string' || saved.length !== state.length || !timingSafeEqual(Buffer.from(saved), Buffer.from(state)) || url.searchParams.has('error') || !url.searchParams.get('code')) return send(res, 400, { error: 'Viewer sign-in expired. Try again.' });
        const identity = await authenticateViewer(url.searchParams.get('code'), { clientId, clientSecret, redirectUri });
        const token = auth.issue('viewer', identity);
        res.writeHead(302, { Location: '/status', 'Set-Cookie': [`${auth.cookieNames.viewer}=${token}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`, `${auth.cookieNames.viewerOauth}=; Secure; HttpOnly; SameSite=Lax; Path=/auth; Max-Age=0`] }); res.end(); return;
      }
      return send(res, 404, { error: 'Not found.' });
    } catch (error) { send(res, error.status || 400, { error: error.message }); }
  });
  return { server, origin: origin.origin, redirectUri,
    start: () => new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); }),
    close: () => new Promise(resolve => server.close(resolve)),
  };
}
