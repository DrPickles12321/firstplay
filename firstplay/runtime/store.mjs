import { DatabaseSync } from 'node:sqlite';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { join } from 'node:path';

export class EncryptedStore {
  constructor(path = ':memory:', key = randomBytes(32)) {
    this.key = key;
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS records (namespace TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, expires_at INTEGER, PRIMARY KEY(namespace,id)); CREATE INDEX IF NOT EXISTS record_expiry ON records(expires_at);');
  }
  static async open(directory) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    const keyPath = join(directory, 'data.key');
    let key;
    try { key = await readFile(keyPath); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      key = randomBytes(32); await writeFile(keyPath, key, { mode: 0o600, flag: 'wx' });
    }
    if (key.length !== 32) throw new Error('Invalid local data key.');
    const store = new EncryptedStore(join(directory, 'firstplay.sqlite'), key);
    await chmod(join(directory, 'firstplay.sqlite'), 0o600);
    return store;
  }
  encrypt(value) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
  }
  decrypt(value) {
    const data = Buffer.from(value, 'base64');
    const cipher = createDecipheriv('aes-256-gcm', this.key, data.subarray(0, 12));
    cipher.setAuthTag(data.subarray(12, 28));
    return JSON.parse(Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString());
  }
  set(namespace, id, value, expiresAt = null) { this.db.prepare('INSERT INTO records VALUES(?,?,?,?) ON CONFLICT(namespace,id) DO UPDATE SET value=excluded.value,expires_at=excluded.expires_at').run(namespace, id, this.encrypt(value), expiresAt); }
  get(namespace, id, now = Date.now()) {
    const row = this.db.prepare('SELECT value,expires_at FROM records WHERE namespace=? AND id=?').get(namespace, id);
    return row && (!row.expires_at || row.expires_at > now) ? this.decrypt(row.value) : null;
  }
  list(namespace, now = Date.now()) { return this.db.prepare('SELECT value FROM records WHERE namespace=? AND (expires_at IS NULL OR expires_at>?)').all(namespace, now).map(row => this.decrypt(row.value)); }
  delete(namespace, id) { this.db.prepare('DELETE FROM records WHERE namespace=? AND id=?').run(namespace, id); }
  prune(now = Date.now()) { this.db.prepare('DELETE FROM records WHERE expires_at IS NOT NULL AND expires_at<=?').run(now); }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); this.db.exec('COMMIT'); return value; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close() { this.db.close(); }
}

// Keep run data isolated without changing the global Twitch authorization or pairing.
export class ScopedStore {
  constructor(store, prefix) { this.store = store; this.prefix = prefix; }
  namespace(name) { return `${this.prefix}:${name}`; }
  get(namespace, id, now) { return this.store.get(this.namespace(namespace), id, now); }
  set(namespace, id, value, expiresAt) { return this.store.set(this.namespace(namespace), id, value, expiresAt); }
  list(namespace, now) { return this.store.list(this.namespace(namespace), now); }
  delete(namespace, id) { return this.store.delete(this.namespace(namespace), id); }
  prune(now) { return this.store.prune(now); }
  transaction(fn) { return this.store.transaction(fn); }
}
