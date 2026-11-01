import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

const TYPES = ['channel.chat.message', 'channel.chat.message_delete', 'channel.chat.clear_user_messages', 'channel.chat.clear'];
const DEFAULT_SOCKET = 'wss://eventsub.wss.twitch.tv/ws';

export class TwitchConnection {
  constructor({ clientId, clientSecret, redirectUri, tokenPath, onEvent, onStatus }) {
    Object.assign(this, { clientId, clientSecret, redirectUri, tokenPath, onEvent, onStatus });
    this.status = { state: 'disconnected', channel: null };
    this.generation = 0; this.backoff = 1000; this.seen = new Map();
    this.closingSockets = new WeakSet();
  }
  setStatus(state, detail = '') {
    this.status = { state, detail, channel: this.tokens?.login || null };
    this.onStatus(this.status);
  }
  closeSocket(socket) {
    if (!socket || this.closingSockets.has(socket)) return;
    this.closingSockets.add(socket);
    // Node's WebSocket may synchronously emit another error from close().
    try { socket.close(); } catch { /* An already-failed socket still reconnects through its close event. */ }
  }
  async restore() {
    try { this.tokens = JSON.parse(await readFile(this.tokenPath, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') this.setStatus('error', 'Saved connection could not be loaded. Connect again.'); return false; }
    try { await this.validate(); this.connect(); return true; }
    catch { this.setStatus('error', 'Saved Twitch authorization expired. Connect again.'); return false; }
  }
  async save() {
    await mkdir(dirname(this.tokenPath), { recursive: true, mode: 0o700 });
    await writeFile(this.tokenPath, JSON.stringify(this.tokens), { mode: 0o600 });
  }
  async tokenRequest(fields) {
    const response = await fetch('https://id.twitch.tv/oauth2/token', { method: 'POST', body: new URLSearchParams({ client_id: this.clientId, client_secret: this.clientSecret, ...fields }), signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error('Twitch authorization failed. Check the application settings and reconnect.');
    return response.json();
  }
  async authorize(code) {
    this.stop();
    const token = await this.tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: this.redirectUri });
    this.tokens = { accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt: Date.now() + token.expires_in * 1000 };
    await this.validate();
    await this.save();
  }
  async refresh() {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      const token = await this.tokenRequest({ grant_type: 'refresh_token', refresh_token: this.tokens.refreshToken });
      Object.assign(this.tokens, { accessToken: token.access_token, refreshToken: token.refresh_token || this.tokens.refreshToken, expiresAt: Date.now() + token.expires_in * 1000 });
      await this.save();
    })();
    try { await this.refreshing; } finally { this.refreshing = null; }
  }
  async validate() {
    if (!this.tokens) throw new Error('Connect to Twitch first.');
    if (this.tokens.expiresAt < Date.now() + 60_000) await this.refresh();
    let response = await fetch('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: `OAuth ${this.tokens.accessToken}` }, signal: AbortSignal.timeout(12_000) });
    if (response.status === 401) {
      await this.refresh();
      response = await fetch('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: `OAuth ${this.tokens.accessToken}` }, signal: AbortSignal.timeout(12_000) });
    }
    if (!response.ok) throw new Error('Twitch authorization is no longer valid.');
    const info = await response.json();
    if (info.client_id !== this.clientId || !info.user_id || !info.scopes?.includes('user:read:chat')) throw new Error('Twitch authorization is missing read-chat permission. Reconnect.');
    Object.assign(this.tokens, { userId: info.user_id, login: info.login, scopes: info.scopes });
    await this.save();
  }
  async subscribe(sessionId) {
    if (this.tokens.expiresAt < Date.now() + 60_000) await this.refresh();
    await Promise.all(TYPES.map(async type => {
      const response = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
        method: 'POST',
        headers: { 'Client-Id': this.clientId, Authorization: `Bearer ${this.tokens.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, version: '1', condition: { broadcaster_user_id: this.tokens.userId, user_id: this.tokens.userId }, transport: { method: 'websocket', session_id: sessionId } }),
        signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) throw new Error(`Twitch subscription failed (${response.status}). Reconnect your channel.`);
    }));
  }
  connect() {
    this.stop(); this.running = true;
    this.setStatus('connecting');
    this.open(DEFAULT_SOCKET, false, this.generation);
    this.validationTimer = setInterval(() => this.validate().catch(() => {
      this.stop(); this.setStatus('error', 'Twitch authorization expired. Connect again.');
    }), 60 * 60_000);
    this.validationTimer.unref();
  }
  open(url, transfer, generation) {
    if (!this.running || generation !== this.generation) return;
    const target = new URL(url);
    if (target.protocol !== 'wss:' || target.hostname !== 'eventsub.wss.twitch.tv') {
      this.stop(); this.setStatus('error', 'Invalid reconnect address from Twitch.'); return;
    }
    const previous = this.socket;
    const socket = new WebSocket(url);
    this.socket = socket;
    let watchdog = setTimeout(() => this.closeSocket(socket), 20_000);
    const alive = seconds => { clearTimeout(watchdog); watchdog = setTimeout(() => this.closeSocket(socket), (seconds + 5) * 1000); watchdog.unref(); };
    let keepalive = 10;
    socket.addEventListener('message', async message => {
      if (generation !== this.generation || this.socket !== socket) return;
      try {
        const payload = JSON.parse(String(message.data));
        alive(keepalive);
        const kind = payload.metadata?.message_type;
        if (kind === 'session_welcome') {
          keepalive = payload.payload.session.keepalive_timeout_seconds || 10;
          alive(keepalive);
          if (!transfer) await this.subscribe(payload.payload.session.id);
          if (generation !== this.generation || this.socket !== socket) return;
          if (transfer && previous) this.closeSocket(previous);
          this.backoff = 1000; this.setStatus('connected');
        } else if (kind === 'session_reconnect') {
          this.setStatus('reconnecting');
          this.open(payload.payload.session.reconnect_url, true, generation);
        } else if (kind === 'revocation') {
          this.stop(); this.setStatus('error', 'Twitch revoked a subscription. Reconnect your channel.');
        } else if (kind === 'notification') {
          const id = payload.metadata.message_id;
          if (!this.seen.has(id)) {
            this.seen.set(id, Date.now());
            if (this.seen.size > 5000) this.seen.delete(this.seen.keys().next().value);
            this.onEvent(payload.payload.subscription.type, payload.payload.event);
          }
        }
      } catch (error) {
        if (generation !== this.generation) return;
        this.setStatus('error', error.message.startsWith('Twitch subscription') ? error.message : 'Twitch connection failed. Retrying.');
        this.closeSocket(socket);
      }
    });
    socket.addEventListener('error', () => this.closeSocket(socket));
    socket.addEventListener('close', () => {
      clearTimeout(watchdog);
      if (!this.running || generation !== this.generation || this.socket !== socket) return;
      this.setStatus('reconnecting', 'Connection interrupted. Reconnecting automatically.');
      this.retryTimer = setTimeout(async () => {
        try {
          await this.validate();
          if (this.running && generation === this.generation) this.open(DEFAULT_SOCKET, false, generation);
        } catch {
          this.stop(); this.setStatus('error', 'Could not restore Twitch connection. Connect again.');
        }
      }, this.backoff);
      this.retryTimer.unref(); this.backoff = Math.min(this.backoff * 2, 30_000);
    });
  }
  stop() {
    this.running = false; this.generation++;
    clearTimeout(this.retryTimer); clearInterval(this.validationTimer);
    if (this.socket) { this.closeSocket(this.socket); this.socket = null; }
  }
  async disconnect() {
    this.stop(); this.tokens = null;
    await rm(this.tokenPath, { force: true });
    this.setStatus('disconnected');
  }
}
