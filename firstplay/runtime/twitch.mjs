import { TwitchConnection } from '../../lib/twitch.mjs';

const TEST_MESSAGES = new Map([
  ['mario', ['Hello FirstPlay — checking the chat connection.', 'Use Cappy to capture that frog.']],
  ['subnautica', ['Hello FirstPlay — checking the chat connection.', 'Catch a bladderfish and make water.']],
]);

export class EncryptedTwitchConnection extends TwitchConnection {
  constructor(options) { super(options); this.store = options.store; }
  async save() { this.store.set('auth', 'twitch-channel', this.tokens); }
  async restore() {
    this.tokens = this.store.get('auth', 'twitch-channel');
    if (!this.tokens) return false;
    try { await this.validate(); this.connect(); return true; }
    catch { this.setStatus('error', 'Saved Twitch authorization needs to be renewed.'); return false; }
  }
  async disconnect() { this.stop(); this.tokens = null; this.store.delete('auth', 'twitch-channel'); this.setStatus('disconnected'); }
  async sendTestMessages(gameId = 'mario') {
    const messages = TEST_MESSAGES.get(gameId); if (!messages) throw new Error('Unsupported live-check game.');
    await this.validate();
    if (!this.tokens.scopes?.includes('user:write:chat')) throw new Error('Authorize the optional Twitch chat-send permission before running a live check.');
    if (this.lastTestAt && Date.now() - this.lastTestAt < 30_000) throw new Error('Wait thirty seconds before sending another live check.');
    const headers = { Authorization: `Bearer ${this.tokens.accessToken}`, 'Client-Id': this.clientId };
    const shared = await fetch(`https://api.twitch.tv/helix/shared_chat/session?broadcaster_id=${this.tokens.userId}`, { headers, signal: AbortSignal.timeout(12_000) });
    if (shared.ok) {
      const data = (await shared.json()).data;
      if ((Array.isArray(data) && data.length) || data?.session_id) throw new Error('Live checks are disabled during Shared Chat to avoid posting in other channels.');
      if (!Array.isArray(data)) throw new Error('Could not verify the Shared Chat response.');
    } else if (shared.status !== 404) throw new Error('Could not verify that the check will stay in this channel.');
    this.lastTestAt = Date.now(); const sent = [];
    for (const message of messages) {
      const response = await fetch('https://api.twitch.tv/helix/chat/messages', {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ broadcaster_id: this.tokens.userId, sender_id: this.tokens.userId, message }), signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) throw new Error(`Twitch could not send the test message (${response.status}).`);
      const result = (await response.json()).data?.[0];
      if (!result?.is_sent) throw new Error('Twitch did not publish a test message. Check native moderation settings.');
      sent.push({ id: result.message_id, text: message });
    }
    return sent;
  }
}

export async function authenticateViewer(code, { clientId, clientSecret, redirectUri }) {
  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST', body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, grant_type: 'authorization_code', redirect_uri: redirectUri }), signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error('Twitch sign-in failed. Try again.');
  const token = await response.json();
  const validation = await fetch('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: `OAuth ${token.access_token}` }, signal: AbortSignal.timeout(12_000) });
  if (!validation.ok) throw new Error('Twitch could not verify this account.');
  const info = await validation.json();
  if (info.client_id !== clientId || !info.user_id || !info.login) throw new Error('Twitch identity could not be verified.');
  // Identity only: no viewer access/refresh token is stored or exposed to clients.
  return { senderId: info.user_id, displayName: info.login };
}
