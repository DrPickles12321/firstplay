const BASE = 'http://localhost:3211';
const DEFAULTS = { enabled: true, token: null, channel: null, expiresAt: null, revision: 0 };
const reserved = new Set(['directory', 'downloads', 'settings', 'search', 'inventory', 'subscriptions', 'wallet', 'videos', 'p', 'jobs', 'products', 'turbo', 'login', 'signup', 'friends', 'messages']);

export function twitchChannel(value) {
  try { const url = new URL(value); const parts = url.pathname.split('/').filter(Boolean); return url.origin === 'https://www.twitch.tv' && parts.length === 1 && /^[a-z0-9_]{1,64}$/i.test(parts[0]) && !reserved.has(parts[0].toLowerCase()) ? parts[0].toLowerCase() : null; }
  catch { return null; }
}

export function createBridge(api, fetchImpl = fetch) {
  const ready = api.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  const load = async () => { await ready; return { ...DEFAULTS, ...(await api.storage.local.get('firstplay')).firstplay }; };
  const save = async state => { await ready; await api.storage.local.set({ firstplay: state }); };
  const request = async (path, state, data) => {
    const response = await fetchImpl(BASE + path, { method: data ? 'POST' : 'GET', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(5000),
      headers: { 'X-FirstPlay-Client': '1', 'X-FirstPlay-Extension': api.runtime.id, ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}), ...(data ? { 'Content-Type': 'application/json' } : {}) },
      ...(data ? { body: JSON.stringify(data) } : {}) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'FirstPlay rejected the request.'); return result;
  };
  async function notify(state) {
    const tabs = await api.tabs.query({ url: 'https://www.twitch.tv/*' });
    await Promise.allSettled(tabs.map(tab => api.tabs.sendMessage(tab.id, { type: 'firstplay-state', enabled: state.enabled, revision: state.revision, paired: Boolean(state.token), channel: state.channel })));
  }
  const handle = async (message, sender) => {
    if (sender.id !== api.runtime.id || !message || typeof message.type !== 'string') throw new Error('Untrusted extension message.');
    const popup = sender.url === api.runtime.getURL('popup.html');
    const content = !popup && typeof sender.url === 'string' && new URL(sender.url).origin === 'https://www.twitch.tv' && sender.frameId === 0;
    if (!popup && !content) throw new Error('Unsupported extension sender.');
    const state = await load();
    const publicState = () => ({ enabled: state.enabled, paired: Boolean(state.token), channel: state.channel, expiresAt: state.expiresAt, revision: state.revision });
    if (message.type === 'status') return publicState();
    if (message.type === 'pair') {
      if (!popup) throw new Error('Pair from the extension popup.');
      const result = await request('/api/extension/redeem', {}, { code: message.code });
      Object.assign(state, result, { enabled: true, revision: state.revision + 1 }); await save(state); await notify(state); return publicState();
    }
    if (message.type === 'set-enabled') {
      if (!popup || typeof message.enabled !== 'boolean') throw new Error('Change protection from the extension popup.');
      state.enabled = message.enabled; state.revision++; await save(state); await notify(state); return publicState();
    }
    if (message.type === 'forget') {
      if (!popup) throw new Error('Disconnect from the extension popup.');
      const cleared = { ...DEFAULTS, revision: state.revision + 1 }; await save(cleared); await notify(cleared); return { enabled: true, paired: false, channel: null, expiresAt: null, revision: cleared.revision };
    }
    if (!content || !state.enabled || !state.token || twitchChannel(sender.url) !== state.channel) throw new Error('FirstPlay is not paired with this channel.');
    if (message.type === 'feed') {
      const feed = await request('/api/extension/feed', state);
      if (feed.channel?.login !== state.channel) throw new Error('The connected channel changed. Pair again.');
      return feed;
    }
    if (message.type === 'ack') return request('/api/extension/ack', state, { ids: message.ids, epoch: message.epoch });
    throw new Error('Unsupported extension operation.');
  };
  let pendingChange = Promise.resolve();
  return (message, sender) => {
    if (['pair', 'set-enabled', 'forget'].includes(message?.type)) { const result = pendingChange.then(() => handle(message, sender)); pendingChange = result.catch(() => {}); return result; }
    return pendingChange.then(() => handle(message, sender));
  };
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  const handle = createBridge(chrome);
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    handle(message, sender).then(value => reply({ ok: true, value }), () => reply({ ok: false, error: 'FirstPlay is unavailable or not paired. Open the extension to check the connection.' })); return true;
  });
}
