import { createHash, randomBytes } from 'node:crypto';

const digest = value => createHash('sha256').update(value).digest('hex');
const extensionIdPattern = /^[a-p]{32}$/;
function fail(message, status = 403) { const error = new Error(message); error.status = status; throw error; }

export class ExtensionAccess {
  constructor({ auth, engine, store, channel, connection, clock = Date.now }) {
    Object.assign(this, { auth, engine, store, channel, connection, clock }); this.attempts = [];
  }
  owner(actor) { if (actor?.role !== 'owner') fail('Only the owner can pair or revoke extensions.'); }
  currentChannel() {
    const channel = this.channel();
    if (!channel?.id || !channel.login) fail('Connect Twitch before pairing the extension.', 409);
    return { id: channel.id, login: channel.login.toLowerCase() };
  }
  start(actor) {
    this.owner(actor); const channel = this.currentChannel();
    for (const entry of this.store.list('extension-pairing', this.clock())) this.store.delete('extension-pairing', entry.key);
    const raw = randomBytes(16).toString('hex'), key = digest(raw), expiresAt = this.clock() + 300_000;
    this.store.set('extension-pairing', key, { key, channel, expiresAt }, expiresAt);
    return { code: raw.toUpperCase().match(/.{4}/g).join('-'), expiresAt, channel: channel.login };
  }
  checkRequest(req) {
    const id = req.headers['x-firstplay-extension'], origin = req.headers.origin;
    if (!extensionIdPattern.test(id || '') || req.headers['x-firstplay-client'] !== '1' || (origin && origin !== `chrome-extension://${id}`)) fail('The extension request is not authorized.');
    return id;
  }
  redeem(req, value) {
    const extensionId = this.checkRequest(req), now = this.clock();
    this.attempts = this.attempts.filter(time => time > now - 60_000);
    if (this.attempts.length >= 10) fail('Too many pairing attempts. Wait a minute.', 429);
    this.attempts.push(now);
    const code = typeof value.code === 'string' ? value.code.replaceAll('-', '').replaceAll(' ', '').toLowerCase() : '';
    if (!/^[a-f0-9]{32}$/.test(code)) fail('Pairing code is invalid or expired.');
    const key = digest(code), record = this.store.get('extension-pairing', key, now), current = this.currentChannel();
    if (!record || record.channel.id !== current.id) fail('Pairing code is invalid or expired.');
    const expiresAt = now + 30 * 24 * 3_600_000;
    let token;
    this.store.transaction(() => {
      this.store.delete('extension-pairing', key);
      token = this.auth.issue('reader', { kind: 'chrome-extension', extensionId, channelId: current.id, channelLogin: current.login }, expiresAt - now);
      this.store.set('extension-grants', digest(token), { key: digest(token), extensionId, channel: current.login, pairedAt: now }, expiresAt);
    });
    return { token, channel: current.login, expiresAt };
  }
  actor(req) {
    const extensionId = this.checkRequest(req), actor = this.auth.actor(req, ['reader']), current = this.currentChannel();
    if (actor.kind !== 'chrome-extension' || actor.extensionId !== extensionId || actor.channelId !== current.id || actor.channelLogin !== current.login) fail('This extension is not paired with the connected channel.');
    return actor;
  }
  touch(req, actor, field) {
    const key = digest(req.headers.authorization.slice(7)), grant = this.store.get('extension-grants', key, this.clock());
    if (grant) this.store.set('extension-grants', key, { ...grant, [field]: this.clock() }, actor.expiresAt);
  }
  feed(req) {
    const actor = this.actor(req), engine = typeof this.engine === 'function' ? this.engine() : this.engine, feed = engine.safeFeed();
    this.touch(req, actor, 'lastSeenAt');
    return { ...feed,
      messages: feed.messages.filter(message => { const original = engine.messages.get(message.id); return original.source === 'live' && original.channelId === actor.channelId; }),
      channel: { id: actor.channelId, login: actor.channelLogin }, connection: this.connection(),
      session: { ...feed.session, mode: engine.policy.mode, gentleHints: engine.policy.allowGentleHints, knownCount: engine.ledger.state.factIds.length },
    };
  }
  acknowledge(req, value) {
    const actor = this.actor(req), engine = typeof this.engine === 'function' ? this.engine() : this.engine;
    if (value.epoch !== engine.epoch || !Array.isArray(value.ids) || value.ids.length > 250 || value.ids.some(id => typeof id !== 'string')) fail('The reader acknowledgement is stale or invalid.', 409);
    const ids = value.ids.filter(id => { const message = engine.messages.get(id); return message?.source === 'live' && message.channelId === actor.channelId && message.disposition === 'allow' && message.epoch === engine.epoch; });
    engine.acknowledge(ids, actor); if (ids.length && !engine.paused) this.touch(req, actor, 'lastRenderedAt'); return { ok: true };
  }
  status() {
    const grants = this.store.list('extension-grants', this.clock()), channel = this.channel(), login = typeof channel?.login === 'string' ? channel.login.toLowerCase() : null;
    const matched = grants.filter(grant => { const actor = this.store.get('capabilities', grant.key, this.clock()); return channel && login && actor?.channelId === channel.id && actor.channelLogin === login; });
    const latest = (items, field) => Math.max(0, ...items.map(item => item[field] || 0)) || null;
    return { paired: grants.length, lastSeenAt: latest(grants, 'lastSeenAt'), lastRenderedAt: latest(grants, 'lastRenderedAt'), pairedToChannel: matched.length, lastSeenForChannelAt: latest(matched, 'lastSeenAt'), lastRenderedForChannelAt: latest(matched, 'lastRenderedAt') };
  }
  revoke(actor) {
    this.owner(actor);
    for (const grant of this.store.list('extension-grants', this.clock())) { this.store.delete('capabilities', grant.key); this.store.delete('extension-grants', grant.key); }
    for (const entry of this.store.list('extension-pairing', this.clock())) this.store.delete('extension-pairing', entry.key);
    return { ok: true };
  }
}
