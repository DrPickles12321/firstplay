(() => {
  'use strict';
  const css = `:host{font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#efeff1;background:#18181b}*{box-sizing:border-box}button,a{font:inherit}button{cursor:pointer}a{color:#bf94ff;text-decoration:none}a:hover{text-decoration:underline}.panel{height:100%;display:flex;flex-direction:column;background:#18181b}.tabs{height:50px;min-height:50px;display:flex;border-bottom:1px solid #35353b;padding:0 12px;gap:20px}.tabs button{border:0;border-bottom:2px solid transparent;padding:0 2px;background:none;color:#adadb8;font-size:12px;font-weight:650}.tabs button[aria-selected=true]{color:#bf94ff;border-color:#bf94ff}.heading{padding:13px 15px;border-bottom:1px solid #2b2b31;display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:11px}.badge{font-size:10px;color:#4ed4a4}.notice{padding:10px 15px;color:#d6bb82;background:#211e18;font-size:11px;line-height:1.65;border-bottom:1px solid #3b3429}.feed{flex:1;min-height:0;overflow:auto;padding:11px 10px;scrollbar-width:thin}.message{padding:5px;font-size:13px;line-height:1.65;overflow-wrap:anywhere}.message:hover{background:#25252b}.name{font-weight:700;color:#bf94ff}.time{color:#858590;font-size:10px;margin-right:7px}.empty{padding:50px 20px;text-align:center;color:#adadb8;font-size:12px;line-height:1.8}.session{padding:20px 16px;overflow:auto;flex:1}.session h2{font-size:15px;margin:0 0 20px}.fact{border-bottom:1px solid #303036;padding:12px 0;font-size:12px}.fact span{display:block;color:#adadb8;font-size:10px;margin-bottom:7px}.footer{padding:14px 15px;border-top:1px solid #35353b;color:#adadb8;font-size:10px;line-height:1.6}.cover{height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:35px;color:#efeff1;background:#0e0e10}.cover h1{font-size:22px}.cover p{max-width:460px;color:#adadb8;line-height:1.8}.cover a{display:inline-block;margin-top:15px}button:focus-visible,a:focus-visible{outline:2px solid #bf94ff;outline-offset:4px}:host([data-surface="dashboard"]){display:block;min-width:0;min-height:0}:host([data-surface="dashboard"]) .tabs{height:40px;min-height:40px}:host([data-surface="dashboard"]) .heading{padding:10px 12px;flex-wrap:wrap}:host([data-surface="dashboard"]) .heading strong{min-width:0;overflow-wrap:anywhere}:host([data-surface="dashboard"]) .footer{padding:10px 12px}[hidden]{display:none!important}`;
  const reserved = new Set(['directory', 'downloads', 'settings', 'search', 'inventory', 'subscriptions', 'wallet', 'videos', 'p', 'jobs', 'products', 'turbo', 'login', 'signup', 'friends', 'messages']);
  let enabled = true, state = null, revision = -1, nativeChat, host, cover, ui, activeTab = 'chat', lastRoute, dashboardTarget, epoch, busy = false;
  const nodes = new Map(), acknowledged = new Set();
  const create = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  // Layout is path-based so the original local DOM fixture runs this exact script.
  // The background independently validates the origin, frame and paired channel.
  function context() {
    const parts = location.pathname.split('/').filter(Boolean), valid = login => /^[a-z0-9_]{1,64}$/i.test(login || '') && !reserved.has(login.toLowerCase());
    if (parts.length === 3 && parts[0] === 'u' && parts[2] === 'stream-manager' && valid(parts[1])) return { surface: 'dashboard', channel: parts[1].toLowerCase() };
    return { surface: location.hostname === 'dashboard.twitch.tv' ? 'dashboard' : 'channel', channel: parts.length === 1 && valid(parts[0]) ? parts[0].toLowerCase() : null };
  }
  function route() { return context().channel; }
  function routeKey() { const value = context(); return value.surface + ':' + value.channel; }
  function findDashboardChat() {
    for (const panel of document.querySelectorAll('.mosaic-window')) {
      const heading = panel.querySelector('.stream-manager-panel-header h2');
      if (heading?.textContent.trim().toLowerCase() !== 'my chat') continue;
      const body = panel.querySelector(':scope > .mosaic-window-body');
      const native = body?.querySelector('.live-chat, .chat-room, [data-test-selector="chat-room-component-layout"]');
      // The widget title is the boundary. Cover its body even if Twitch changes
      // the native chat subtree or is still loading it.
      if (body) return { panel, heading, body, native: native || body };
    }
    return null;
  }
  function unmount() {
    clearFeed(); dashboardTarget?.body.removeAttribute('data-firstplay-dashboard-body');
    host?.remove(); cover?.remove(); host = cover = ui = nativeChat = dashboardTarget = null;
  }
  function shadow(element) { const root = element.attachShadow({ mode: 'open' }); const sheet = new CSSStyleSheet(); sheet.replaceSync(css); root.adoptedStyleSheets = [sheet]; return root; }
  function clearFeed() { nodes.clear(); acknowledged.clear(); epoch = null; ui?.feed.replaceChildren(); }
  function showCover(text) {
    if (!cover) { cover = create('div'); cover.id = 'firstplay-extension-cover'; const root = shadow(cover), content = create('div', 'cover'); const heading = create('h1', '', 'FirstPlay is protecting this page'); const note = create('p'); const link = create('a', '', 'Open FirstPlay'); link.href = 'http://localhost:3211/'; link.target = '_blank'; link.rel = 'noreferrer'; content.append(heading, note, link); root.append(content); cover.note = note; document.documentElement.append(cover); }
    cover.note.textContent = text;
  }
  function status(text, empty = true) {
    if (!ui) return; ui.notice.textContent = text; ui.notice.hidden = !text;
    if (empty) { clearFeed(); ui.feed.append(create('div', 'empty', text || 'Approved chat will appear here.')); ui.channel.textContent = 'Protected chat'; ui.badge.textContent = 'NATIVE CHAT HIDDEN'; delete ui.session.dataset.key; ui.session.replaceChildren(create('h2', '', 'Your FirstPlay session'), create('p', '', text || 'Waiting for a connection.')); }
  }
  function buildPanel(parent = document.body, surface = 'channel') {
    host = create('div'); host.id = 'firstplay-extension-panel'; host.setAttribute('aria-label', 'FirstPlay protected chat'); host.dataset.surface = surface; const root = shadow(host);
    const panel = create('section', 'panel'), tabs = create('div', 'tabs'); tabs.setAttribute('role', 'tablist');
    const chatTab = create('button', '', 'FirstPlay'), sessionTab = create('button', '', 'Session');
    for (const button of [chatTab, sessionTab]) { button.type = 'button'; button.setAttribute('role', 'tab'); }
    chatTab.id = 'firstplay-chat-tab'; sessionTab.id = 'firstplay-session-tab'; chatTab.setAttribute('aria-controls', 'firstplay-chat-panel'); sessionTab.setAttribute('aria-controls', 'firstplay-session-panel');
    const heading = create('div', 'heading'), channel = create('strong', '', 'Protected chat'), badge = create('span', 'badge', 'NATIVE CHAT HIDDEN'); heading.append(channel, badge);
    const notice = create('div', 'notice'); notice.setAttribute('role', 'status'); notice.textContent = 'Connecting to FirstPlay…';
    const feed = create('div', 'feed'); feed.id = 'firstplay-chat-panel'; feed.setAttribute('role', 'tabpanel'); feed.setAttribute('aria-labelledby', chatTab.id); feed.setAttribute('aria-live', 'polite');
    const session = create('section', 'session'); session.id = 'firstplay-session-panel'; session.setAttribute('role', 'tabpanel'); session.setAttribute('aria-labelledby', sessionTab.id); session.hidden = true;
    const footer = create('div', 'footer', 'Screened by FirstPlay · Original chat stays on Twitch.');
    function tab(next) { activeTab = next; chatTab.setAttribute('aria-selected', String(next === 'chat')); sessionTab.setAttribute('aria-selected', String(next === 'session')); chatTab.tabIndex = next === 'chat' ? 0 : -1; sessionTab.tabIndex = next === 'session' ? 0 : -1; feed.hidden = next !== 'chat'; session.hidden = next !== 'session'; }
    chatTab.addEventListener('click', () => { tab('chat'); void poll(); }); sessionTab.addEventListener('click', () => tab('session')); tab(activeTab);
    tabs.addEventListener('keydown', event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 'chat' : event.key === 'End' ? 'session' : activeTab === 'chat' ? 'session' : 'chat'; tab(next); (next === 'chat' ? chatTab : sessionTab).focus(); if (next === 'chat') void poll(); } });
    tabs.append(chatTab, sessionTab); panel.append(tabs, heading, notice, feed, session, footer); root.append(panel); parent.append(host);
    ui = { notice, feed, session, channel, badge }; clearFeed();
  }
  function reconcile() {
    const html = document.documentElement, current = context();
    if (!enabled) {
      html.setAttribute('data-firstplay-native', 'show'); html.removeAttribute('data-firstplay-channel'); html.removeAttribute('data-firstplay-ready');
      unmount(); return;
    }
    html.removeAttribute('data-firstplay-native');
    if (routeKey() !== lastRoute) { lastRoute = routeKey(); unmount(); }
    if (!current.channel) {
      html.removeAttribute('data-firstplay-channel'); html.setAttribute('data-firstplay-ready', 'true');
      if (current.surface === 'dashboard') html.setAttribute('data-firstplay-dashboard', 'outside');
      unmount(); return;
    }
    if (current.surface === 'dashboard') {
      html.setAttribute('data-firstplay-dashboard', 'protected'); html.removeAttribute('data-firstplay-channel');
      const target = findDashboardChat();
      if (!target) { html.removeAttribute('data-firstplay-ready'); unmount(); return; }
      if (dashboardTarget?.body !== target.body || host?.parentElement !== target.body) {
        unmount(); dashboardTarget = target; nativeChat = target.native;
        target.body.setAttribute('data-firstplay-dashboard-body', ''); buildPanel(target.body, 'dashboard');
      } else { dashboardTarget = target; nativeChat = target.native; }
      html.setAttribute('data-firstplay-ready', 'true'); return;
    }
    html.removeAttribute('data-firstplay-dashboard'); html.setAttribute('data-firstplay-channel', 'true');
    if (innerWidth < 800) { html.removeAttribute('data-firstplay-ready'); showCover('Use a wider desktop window for the Twitch integration. Native chat remains covered.'); return; }
    nativeChat = document.getElementById('live-page-chat');
    if (!nativeChat || !document.body || getComputedStyle(nativeChat).display !== 'none') {
      html.removeAttribute('data-firstplay-ready'); showCover('Waiting for the supported Twitch chat layout. If Twitch has changed its layout, chat stays covered until FirstPlay is updated.'); return;
    }
    if (!host?.isConnected) buildPanel();
    html.setAttribute('data-firstplay-ready', 'true'); cover?.remove(); cover = null;
  }
  function readerVisible() {
    if (!host?.isConnected || !ui || ui.feed.hidden || document.visibilityState !== 'visible' || getComputedStyle(host).visibility !== 'visible') return false;
    for (let parent = host.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (style.visibility !== 'visible' || Number(style.opacity) === 0) return false;
    }
    const rect = ui.feed.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight;
  }
  async function send(message) { const response = await chrome.runtime.sendMessage(message); if (!response?.ok) throw new Error(response?.error || 'FirstPlay is unavailable.'); return response.value; }
  function accept(next) { if (!Number.isInteger(next.revision) || next.revision < revision) return; revision = next.revision; state = next; enabled = next.enabled !== false; reconcile(); }
  function render(packet) {
    if (packet.channel?.login !== route() || !Array.isArray(packet.messages) || packet.messages.length > 250 || packet.messages.some(message => typeof message.id !== 'string' || typeof message.text !== 'string' || message.text.length > 2000 || typeof message.displayName !== 'string')) throw new Error('The protected feed could not be verified.');
    if (packet.connection?.twitch?.state !== 'connected' || packet.connection.source !== 'live') { status('Twitch is disconnected. Reconnect in FirstPlay settings.'); return; }
    if (epoch !== packet.epoch) { clearFeed(); epoch = packet.epoch; }
    ui.channel.textContent = packet.channel.login; ui.badge.textContent = packet.paused ? 'DELIVERY PAUSED' : 'PROTECTED';
    const visible = new Set(packet.messages.map(message => message.id)); for (const [id, node] of nodes) if (!visible.has(id)) { node.remove(); nodes.delete(id); }
    const atBottom = ui.feed.scrollHeight - ui.feed.scrollTop - ui.feed.clientHeight < 80;
    ui.feed.querySelector('.empty')?.remove();
    for (const message of packet.messages) {
      if (!nodes.has(message.id)) {
        const node = create('div', 'message'), timestamp = create('span', 'time', new Date(message.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        node.append(timestamp, create('span', 'name', `${message.displayName}: `), document.createTextNode(message.text)); nodes.set(message.id, node);
      }
      ui.feed.append(nodes.get(message.id));
    }
    if (!packet.messages.length) ui.feed.append(create('div', 'empty', packet.paused ? 'Chat delivery is paused.' : 'You’re connected. Approved messages will appear here.'));
    if (atBottom) ui.feed.scrollTop = ui.feed.scrollHeight;
    const health = packet.screening || {};
    const note = health.state === 'unavailable' ? 'Screening is unavailable. Unchecked chat stays hidden.' : health.state === 'delayed' ? `Checking messages · oldest ${Math.floor(health.oldestPendingAgeMs / 1000)}s. Unchecked chat stays hidden.` : health.pending ? `Checking ${health.pending} messages…` : '';
    ui.notice.textContent = note; ui.notice.hidden = !note;
    const mode = packet.session?.mode === 'strict_social' ? 'Strict social' : packet.session?.gentleHints ? 'Discovery · gentle hints on' : 'Discovery · no hints';
    const sessionKey = JSON.stringify([packet.channel.login, packet.session?.name, packet.session?.segment, mode, packet.session?.knownCount]);
    if (ui.session.dataset.key !== sessionKey) {
    ui.session.dataset.key = sessionKey; ui.session.replaceChildren(create('h2', '', 'Your FirstPlay session'));
    for (const [label, value] of [['Channel', packet.channel.login], ['Game', packet.session?.name || 'FirstPlay'], ['Segment', packet.session?.segment || 'Current session'], ['Filtering', mode], ['Progress', `${packet.session?.knownCount || 0} confirmed discoveries`], ['Connection', 'Twitch connected']]) { const row = create('div', 'fact'); row.append(create('span', '', label), create('strong', '', value)); ui.session.append(row); }
    const settings = create('a', '', 'Open FirstPlay settings ↗'); settings.href = 'http://localhost:3211/?settings=1'; settings.target = '_blank'; settings.rel = 'noreferrer'; ui.session.append(settings);
    }
    const ids = packet.messages.filter(message => !acknowledged.has(message.id)).map(message => message.id), capturedRoute = route(), capturedEpoch = epoch;
    if (ids.length && activeTab === 'chat' && readerVisible() && !packet.paused) requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!enabled || route() !== capturedRoute || epoch !== capturedEpoch || activeTab !== 'chat' || !readerVisible() || !document.documentElement.hasAttribute('data-firstplay-ready')) return;
      void send({ type: 'ack', ids, epoch: capturedEpoch }).then(() => ids.forEach(id => acknowledged.add(id)), () => {});
    }));
  }
  async function poll() {
    if (busy) return; busy = true; const capturedRoute = route();
    try {
      accept(await send({ type: 'status' }));
      if (!enabled || !capturedRoute || !ui) return;
      if (!state.paired) { status('Pair this extension in FirstPlay Settings → Chrome extension. Native chat stays covered.'); return; }
      if (state.channel !== capturedRoute) { status(`This channel is not paired. FirstPlay is paired with ${state.channel}. Native chat stays covered while protection is on.`); return; }
      const requestedRevision = revision, requestedHost = host;
      const packet = await send({ type: 'feed' });
      if (enabled && revision === requestedRevision && host === requestedHost && route() === capturedRoute && ui) render(packet);
    } catch { if (enabled) { reconcile(); status('FirstPlay is unavailable. Start the local service or check pairing in the extension popup. Native chat stays covered.'); } }
    finally { busy = false; }
  }
  function start() {
    reconcile();
    new MutationObserver(() => {
      if (!enabled) return;
      const current = context(), dashboardChanged = current.surface === 'dashboard' && dashboardTarget && (!dashboardTarget.heading.isConnected || dashboardTarget.heading.textContent.trim().toLowerCase() !== 'my chat' || host?.parentElement !== dashboardTarget.body);
      if (routeKey() !== lastRoute || !nativeChat?.isConnected || !host?.isConnected || current.surface === 'channel' && nativeChat.id !== 'live-page-chat' || dashboardChanged) reconcile();
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['id', 'class', 'data-a-target', 'data-test-selector'] });
    addEventListener('resize', () => { reconcile(); void poll(); }); addEventListener('popstate', () => { reconcile(); void poll(); });
    chrome.runtime.onMessage.addListener((message, sender) => { if (sender.id === chrome.runtime.id && message.type === 'firstplay-state') { accept(message); void poll(); } });
    void poll(); setInterval(poll, 1200);
  }
  if (document.documentElement) start();
  else { const observer = new MutationObserver(() => { if (document.documentElement) { observer.disconnect(); start(); } }); observer.observe(document, { childList: true, subtree: true }); }
})();
