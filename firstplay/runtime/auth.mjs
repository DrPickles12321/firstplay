import { createHash, randomBytes, randomUUID } from 'node:crypto';

const hash = value => createHash('sha256').update(value).digest('hex');
export function parseCookies(req) {
  const result = Object.create(null);
  for (const field of (req.headers.cookie || '').split(';')) {
    const index = field.indexOf('='); if (index < 0) continue;
    try { result[field.slice(0, index).trim()] = decodeURIComponent(field.slice(index + 1)); } catch { /* ignore malformed cookies */ }
  }
  return result;
}

export class CapabilityAuth {
  constructor(store, clock = Date.now, { cookiePrefix = 'fp' } = {}) {
    if (!/^[a-z][a-z0-9_]{1,39}$/.test(cookiePrefix)) throw new Error('Invalid local cookie namespace.');
    this.store = store; this.clock = clock;
    this.cookieNames = { operator: `${cookiePrefix}_operator`, viewer: `${cookiePrefix}_viewer`, oauth: `${cookiePrefix}_oauth`, viewerOauth: `${cookiePrefix}_viewer_oauth` };
  }
  issue(role, claims = {}, ttlMs = 8 * 3_600_000) {
    const token = randomBytes(32).toString('hex');
    this.store.set('capabilities', hash(token), { ...claims, role, id: claims.id || randomUUID(), expiresAt: this.clock() + ttlMs }, this.clock() + ttlMs);
    return token;
  }
  resolve(token) { return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token) ? this.store.get('capabilities', hash(token), this.clock()) : null; }
  actor(req, roles) {
    const authorization = req.headers.authorization;
    const cookies = parseCookies(req);
    // An explicit restricted capability must never inherit an ambient owner cookie.
    const token = authorization ? authorization.startsWith('Bearer ') ? authorization.slice(7) : '' : roles.includes('viewer') ? cookies[this.cookieNames.viewer] : cookies[this.cookieNames.operator];
    const actor = this.resolve(token);
    if (!actor || !roles.includes(actor.role)) { const error = new Error('This view is not authorized.'); error.status = 403; throw error; }
    return actor;
  }
  links() {
    const saved = this.store.get('system', 'view-links');
    if (saved && this.resolve(saved.reader) && this.resolve(saved.overlay) && this.resolve(saved.demoViewer)) return saved;
    const links = {
      reader: this.issue('reader', { id: 'primary-reader' }, 30 * 24 * 3_600_000),
      overlay: this.issue('overlay', {}, 30 * 24 * 3_600_000),
      demoViewer: this.issue('viewer', { senderId: 'demo-viewer', displayName: 'demo_viewer', demo: true }, 30 * 24 * 3_600_000),
    };
    this.store.set('system', 'view-links', links); return links;
  }
  rotateLinks() {
    const links = this.store.get('system', 'view-links');
    if (links) for (const token of Object.values(links)) this.store.delete('capabilities', hash(token));
    this.store.delete('system', 'view-links'); return this.links();
  }
}
