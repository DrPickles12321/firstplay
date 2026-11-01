const app = document.querySelector('#app');
const view = location.pathname === '/' ? 'control' : location.pathname.slice(1);
document.body.dataset.view = view;
let activeRunId, activeSelectionRevision = 0;
let capability = location.hash.slice(1), control, readerToken, polling = false, stream, video, toastTimer;
const icons = {
  shield: '<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
  chat: '<path d="M4 4h16v12H9l-5 4Z"/><path d="M8 8h8M8 12h5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
  close: '<path d="m7 7 10 10M7 17 17 7"/>',
  arrow: '<path d="M6 18 18 6M6 6h12v12"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  gear: '<path d="m9 3-1 3-3 1-2 3 2 2-1 3 3 2 3-1 2 2 3-1 1-3 3-1 1-3-2-2V5l-3-1-2 1Z"/><circle cx="11" cy="10" r="3"/>',
  screen: '<rect x="3" y="4" width="18" height="12" rx="1"/><path d="M8 21h8M12 16v5"/>',
  play: '<path d="m9 5 11 7-11 7Z"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  chevron: '<path d="m7 10 5 5 5-5"/>',
};
function el(tag, className = '', text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
function icon(name) { const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); node.setAttribute('viewBox', '0 0 24 24'); node.setAttribute('aria-hidden', 'true'); node.innerHTML = icons[name] || icons.chat; return node; }
function button(text, action, className = '') { const node = el('button', className, text); node.type = 'button'; if (action) node.addEventListener('click', () => Promise.resolve(action()).catch(error => toast(error.message))); return node; }
function link(text, href, external = false) { const node = el('a', '', text); node.href = href; if (external) { node.target = '_blank'; node.rel = 'noreferrer'; } return node; }
function toast(text) { const node = document.querySelector('#toast'); node.textContent = text; node.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('visible'), 5500); }
async function api(path, { method = 'GET', data, token = capability, keepalive = false } = {}) {
  const headers = { 'X-FirstPlay-Client': '1' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (data !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(path, { method, headers, credentials: 'same-origin', keepalive, body: data === undefined ? undefined : JSON.stringify({ expectedRunId: activeRunId, ...data }) });
  const result = await response.json();
  if (result.session) {
    if (result.session.selectionRevision < activeSelectionRevision) throw new Error('The game session changed. Refreshing…');
    activeSelectionRevision = result.session.selectionRevision || activeSelectionRevision; activeRunId = result.session.runId;
  }
  if (!response.ok) { const error = new Error(result.error || 'Request failed.'); error.status = response.status; error.code = result.code; throw error; }
  return result;
}
function nav({ openSettings, videoMenu } = {}) {
  const bar = el('header', 'topbar'), brand = link('', '/'); brand.className = 'brand';
  const mark = el('span', 'brand-mark'); mark.append(icon('shield')); brand.append(mark, el('span', '', 'FirstPlay')); bar.append(brand);
  const tabs = el('nav', 'topnav'); tabs.setAttribute('aria-label', 'FirstPlay views');
  const destinations = view === 'status' ? [['Message status', '/status', 'status']] : [['Stream', '/', 'control'], ['Moderation', '/moderator', 'moderator'], ['Gameplay', '/capture', 'capture'], ['Lab', '/evaluate', 'evaluate']];
  for (const [name, path, match] of destinations) { const tab = link(name, path); if (view === match || view === 'rehearsal' && match === 'evaluate') tab.className = 'active'; tabs.append(tab); }
  const right = el('div', 'topbar-right');
  if (view === 'status') right.append(el('span', 'small muted', 'Message delivery'));
  else {
    if (videoMenu) right.append(videoMenu);
    const settings = openSettings ? button('', openSettings, 'topbar-settings') : link('', '/?settings=1'); settings.className = 'topbar-settings'; settings.append(icon('gear'), document.createTextNode('Settings')); right.append(settings);
  }
  bar.append(tabs, right); return bar;
}
function titleBlock(title, description) { const head = el('div', 'page-heading'), text = el('div'); text.append(el('h1', '', title), el('p', '', description)); head.append(text); return head; }
function reviewTabs() { const tabs = el('nav', 'review-tabs'); tabs.setAttribute('aria-label', 'Test tools'); for (const [name, path, selected] of [['Case review', '/evaluate', view === 'evaluate'], ['Video rehearsal', '/rehearsal', view === 'rehearsal']]) { const tab = link(name, path); if (selected) { tab.className = 'active'; tab.setAttribute('aria-current', 'page'); } tabs.append(tab); } return tabs; }
function section(title) { const node = el('section', 'section'); node.append(el('h2', '', title)); return node; }
function field(label, node) { if (!node.hasAttribute('aria-label')) node.setAttribute('aria-label', label); const row = el('div', 'field'), caption = el('label', '', label); caption.append(node); row.append(caption); return row; }
function setButtonBusy(node, busy, original) { node.disabled = busy; node.textContent = busy ? 'Working…' : original; }
function color(id) { let n = 0; for (const ch of id) n = (n * 31 + ch.charCodeAt(0)) | 0; return `c${Math.abs(n) % 8}`; }
function time(value) { return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }

function createRoom(overlay = false) {
  const room = el(view === 'control' ? 'aside' : 'main', 'room'); room.setAttribute('aria-label', 'Protected stream chat');
  if (!overlay) {
    const heading = el('div', 'room-heading'), game = el('div', 'game-mark', 'FP'); const text = el('div', 'grow');
    const gameTitle = el('div', 'room-title', 'FirstPlay'), segment = el('div', 'room-subtitle', 'Protected reader'); gameTitle.id = 'reader-game-title'; segment.id = 'reader-game-segment'; game.id = 'reader-game-mark'; text.append(gameTitle, segment);
    const source = el('span', 'tag', 'LOCAL TEST'); source.id = 'source-tag'; heading.append(game, text, source);
    const title = el('div', 'chat-title'), left = el('div', 'row'); left.append(icon('shield'), el('span', '', 'STREAM CHAT'));
    const detail = el('span', 'mini-status', 'Discovery'); detail.id = 'chat-policy'; title.append(left, detail);
    const screening = el('div', 'screening-note'); screening.id = 'screening-note'; screening.setAttribute('role', 'status'); screening.hidden = true;
    room.append(heading, title, screening);
  }
  const feed = el('div', 'chat-feed'); feed.id = 'feed'; feed.setAttribute('role', 'log'); feed.setAttribute('aria-live', 'polite'); feed.setAttribute('aria-label', 'Screened stream chat'); room.append(feed);
  if (!overlay) { const footer = el('div', 'chat-footer'); footer.append(icon('shield'), el('span', '', 'Only approved messages reach this reader.')); if (view !== 'control') { const twitchLink = link('Open Twitch', 'https://www.twitch.tv', true); twitchLink.id = 'twitch-link'; footer.append(twitchLink); } room.append(footer); }
  return room;
}
let messageNodes = new Map(), lastEpoch;
function renderFeed(state) {
  const feed = document.querySelector('#feed'); if (!feed) return;
  const gameTitle = document.querySelector('#reader-game-title'), segment = document.querySelector('#reader-game-segment'), mark = document.querySelector('#reader-game-mark');
  if (gameTitle && state.session) { gameTitle.textContent = state.session.name; segment.textContent = `${state.session.segment} · Private reader`; mark.textContent = state.session.id === 'subnautica' ? 'S' : 'M'; }
  const nearBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 90;
  if (state.epoch !== lastEpoch) { messageNodes.clear(); feed.replaceChildren(); lastEpoch = state.epoch; }
  const valid = new Set(state.messages.map(message => message.id));
  for (const [id, node] of messageNodes) if (!valid.has(id)) { node.remove(); messageNodes.delete(id); }
  if (!state.messages.length) {
    if (feed.querySelector('.empty-chat')?.dataset.paused !== String(state.paused)) {
      const empty = el('div', 'empty-chat'); empty.dataset.paused = String(state.paused); empty.append(icon(state.paused ? 'pause' : 'chat'), el('strong', '', state.paused ? 'Chat delivery paused' : 'Your stream chat, screened.'), el('p', '', state.paused ? 'Resume from the reader controls when you’re ready.' : 'Approved messages appear here. Your community keeps chatting normally on Twitch.')); feed.replaceChildren(empty);
    }
  } else {
    feed.querySelector('.empty-chat')?.remove();
    for (const message of state.messages) {
      let node = messageNodes.get(message.id);
      if (!node) { node = el('div', 'chat-message'); node.dataset.messageId = message.id;
        node.append(el('span', 'message-time', time(message.receivedAt)), el('span', `name ${color(message.senderId)}`, message.displayName), document.createTextNode(` ${message.text}`)); messageNodes.set(message.id, node); }
      feed.append(node);
    }
  }
  if (nearBottom) feed.scrollTop = feed.scrollHeight;
  const tag = document.querySelector('#source-tag'); if (tag) { const live = state.connection.source === 'live'; tag.textContent = live ? state.connection.twitch.state === 'connected' ? 'CHAT CONNECTED' : 'RECONNECTING' : 'LOCAL TEST'; tag.className = `tag${live ? ' live' : ''}`; }
  const twitchLink = document.querySelector('#twitch-link'); if (twitchLink && state.connection.twitch.channel) twitchLink.href = `https://www.twitch.tv/${encodeURIComponent(state.connection.twitch.channel)}`;
  const screening = document.querySelector('#screening-note');
  if (screening) {
    if (state.connection.twitch.state === 'error') { screening.hidden = false; screening.dataset.state = 'unavailable'; screening.textContent = view === 'control' ? 'Twitch chat is disconnected. Reconnect in Settings.' : 'Twitch chat is disconnected. Reconnect FirstPlay to resume delivery.'; return; }
    const health = state.screening || { state: 'ready' };
    screening.hidden = !['checking', 'delayed', 'unavailable'].includes(health.state); screening.dataset.state = health.state;
    if (health.state === 'checking') screening.textContent = `Checking ${health.pending} ${health.pending === 1 ? 'message' : 'messages'}…`;
    else if (health.state === 'delayed') screening.textContent = `Screening is taking longer · oldest message ${Math.floor(health.oldestPendingAgeMs / 1000)}s. Messages stay hidden while checking.`;
    else if (health.state === 'unavailable') {
      const causes = { usage_limit: 'Codex usage limit reached.', login_required: 'Sign in to Codex to resume screening.', codex_not_found: 'Codex could not be found.', model_budget_reached: 'The screening request budget was reached.' };
      screening.textContent = `${causes[health.errorCode] || 'The classifier could not complete a check.'} Unchecked messages stay hidden.`;
    }
  }
}
async function pollReader() {
  const token = readerToken || capability;
  const state = await api('/api/reader', { token }); renderFeed(state);
  if (view !== 'overlay' && document.visibilityState === 'visible' && state.messages.length && !state.paused) await api('/api/reader/ack', { method: 'POST', data: { ids: state.messages.map(message => message.id) }, token });
}

function watchPage() {
  const layout = el('div', 'watch-layout');
  const content = el('main', 'watch-content'), stage = el('section', 'stream-stage'); stage.setAttribute('aria-label', 'Stream video');
  const videoMenu = el('details', 'video-menu'), videoSummary = el('summary'), sourceButtons = el('div', 'video-menu-items'), sourceDetail = el('p', 'source-caption');
  videoSummary.append(icon('screen'), document.createTextNode('Preview'), icon('chevron')); videoMenu.append(videoSummary, sourceButtons);
  document.addEventListener('click', event => { if (!videoMenu.contains(event.target)) videoMenu.open = false; });
  videoMenu.addEventListener('keydown', event => { if (event.key === 'Escape') { videoMenu.open = false; videoSummary.focus(); } });
  let source = 'twitch', channel = '', rehearsal = false, localStream, localUrl, playerKey = '', frame;
  function stopPreview() { localStream?.getTracks().forEach(track => track.stop()); localStream = null; if (localUrl) URL.revokeObjectURL(localUrl); localUrl = null; }
  function selectSource(next) {
    source = next;
    videoMenu.open = false; sourceDetail.hidden = next === 'twitch';
    twitchButton.classList.toggle('active', source === 'twitch'); fileLabel.classList.toggle('active', source === 'file');
    twitchButton.setAttribute('aria-pressed', String(source === 'twitch'));
  }
  function placeholder(title, text) {
    const empty = el('div', 'player-empty'); empty.append(icon('screen'), el('strong', '', title), el('p', '', text)); stage.replaceChildren(empty); frame = null;
  }
  function twitchPlayer() {
    if (source !== 'twitch') return;
    const canEmbed = stage.clientWidth >= 400;
    const key = `${channel}:${canEmbed}:${rehearsal}`; if (key === playerKey) return; playerKey = key;
    if (rehearsal) { placeholder('Local rehearsal', 'Practice chat screening and automatic progress here. Twitch is disabled in this rehearsal. Try a message from Settings → Local message test.'); return; }
    if (!channel) { placeholder('Your stream goes here', 'Connect your channel in Settings. Gameplay is where you start automatic progress.'); return; }
    if (!canEmbed) { placeholder(channel, 'Widen this window to watch the Twitch player alongside your chat.'); return; }
    const url = new URL('https://player.twitch.tv/'); url.search = new URLSearchParams({ channel, parent: location.hostname, autoplay: 'false', muted: 'true' }).toString();
    frame = el('iframe', 'twitch-player'); frame.title = `${channel} Twitch stream`; frame.src = url.href; frame.allow = 'autoplay; fullscreen; picture-in-picture'; frame.allowFullscreen = true; frame.referrerPolicy = 'strict-origin-when-cross-origin'; stage.replaceChildren(frame);
  }
  const twitchButton = button('', () => { stopPreview(); selectSource('twitch'); playerKey = ''; twitchPlayer(); sourceDetail.textContent = 'Video only · your community keeps regular Twitch chat'; }, 'source-tab active'); twitchButton.append(icon('play'), document.createTextNode('Twitch stream'));
  twitchButton.setAttribute('aria-label', 'Twitch stream');
  const fileLabel = el('label', 'source-tab file-source'), fileInput = el('input'); fileInput.type = 'file'; fileInput.accept = 'video/*'; fileInput.setAttribute('aria-label', 'Preview a local video'); fileLabel.append(icon('upload'), document.createTextNode('Preview video file'), fileInput);
  fileInput.addEventListener('change', async () => {
    if (!fileInput.files[0]) return; stopPreview(); selectSource('file'); localUrl = URL.createObjectURL(fileInput.files[0]);
    const preview = el('video', 'game-preview'); preview.src = localUrl; preview.controls = true; preview.muted = true; preview.playsInline = true; stage.replaceChildren(preview); sourceDetail.textContent = 'Preview only · set up automatic progress in Gameplay';
    try { await preview.play(); } catch { /* Native play controls remain available. */ } fileInput.value = '';
  });
  const external = link('Open channel on Twitch ↗', 'https://www.twitch.tv', true); external.className = 'video-external'; sourceButtons.append(twitchButton, fileLabel, external);
  external.addEventListener('click', () => { videoMenu.open = false; });
  const info = el('section', 'channel-info'), avatar = el('div', 'channel-avatar main-avatar', 'FP'), identity = el('div', 'channel-identity'), name = el('h1', '', 'Your channel');
  const sessionTitle = el('p', 'session-title', 'FirstPlay'); identity.append(name, sessionTitle);
  const tags = el('div', 'channel-tags'), ruleTag = el('span', '', 'Discovery'), protectedTag = el('span', '', 'Protected chat'); tags.append(ruleTag, protectedTag); identity.append(tags);
  info.append(avatar, identity);
  const below = el('section', 'session-about'); below.id = 'session-about';
  below.append(el('h2', '', 'Discover it together.'), el('p', '', 'Your community keeps chatting on Twitch. You see the conversation through FirstPlay, with spoilers and unwanted hints screened before they reach you.'));
  const sessionFacts = el('div', 'session-facts'), ruleFact = el('div'), progressFact = el('div'); ruleFact.append(el('span', '', 'CHAT RULES')); const ruleValue = el('strong', '', 'Discovery'); ruleFact.append(ruleValue); progressFact.append(el('span', '', 'PROGRESS')); const progressValue = el('strong', '', 'No discoveries confirmed'); progressFact.append(progressValue); sessionFacts.append(ruleFact, progressFact); const setup = el('dl', 'setup-summary'); setup.setAttribute('aria-label', 'Session status'); below.append(sessionFacts, setup);
  content.append(stage, sourceDetail, info, below);
  const chat = createRoom(); layout.append(content, chat);
  new ResizeObserver(() => twitchPlayer()).observe(stage);
  window.addEventListener('pagehide', stopPreview, { once: true }); selectSource('twitch');
  return { element: layout, videoMenu, update: state => {
    const next = state.connection.twitch.channel || ''; channel = /^[a-zA-Z0-9_]{1,64}$/.test(next) ? next : ''; rehearsal = state.connection.rehearsal === true;
    if (state.session) sessionTitle.textContent = `${state.session.name} · ${state.session.segment}`;
    name.textContent = channel || (rehearsal ? 'Local rehearsal' : 'Your channel'); avatar.textContent = channel ? channel.slice(0, 2).toUpperCase() : 'FP';
    external.href = channel ? `https://www.twitch.tv/${encodeURIComponent(channel)}` : 'https://www.twitch.tv';
    ruleValue.textContent = ruleTag.textContent = state.policy.mode === 'strict_social' ? 'Strict social' : state.policy.allowGentleHints ? 'Gentle hints' : 'Discovery';
    progressValue.textContent = `${state.knownCount} ${state.knownCount === 1 ? 'discovery' : 'discoveries'} confirmed`;
    const signal = state.connection.model, check = signal.check || { state: 'unchecked' };
    const lastSuccess = Math.max(signal.lastSuccessAt || 0, check.state === 'ready' ? check.checkedAt || 0 : 0);
    const problem = signal.error || (check.state === 'failed' && (check.checkedAt || 0) >= lastSuccess ? check.errorCode : null);
    const errors = { usage_limit: 'Usage limit reached', login_required: 'Sign in to Codex', codex_not_found: 'Codex CLI not found', provider_not_configured: 'Model setup needed' };
    const extensionActive = state.extension?.lastSeenForChannelAt && Date.now() - state.extension.lastSeenForChannelAt < 15_000;
    const progress = state.progress;
    const rows = [
      ['Channel', rehearsal ? 'Local rehearsal · no Twitch posts' : state.connection.source === 'live' ? state.connection.twitch.state === 'connected' ? 'Connected to Twitch' : 'Reconnecting to Twitch' : 'Connect Twitch in Settings', rehearsal ? '' : state.connection.twitch.state === 'connected' ? 'ready' : ''],
      ['Reader', state.connection.paused ? 'Delivery paused' : extensionActive ? 'FirstPlay is active on Twitch' : state.extension?.pairedToChannel ? 'Paired · open your Twitch channel' : 'Standalone reader on this page', state.connection.paused ? 'waiting' : 'ready'],
      ['Screening', check.state === 'checking' ? 'Checking model connection…' : problem ? errors[problem] || 'Model needs attention · check Settings' : lastSuccess ? 'Model connection verified' : 'Waiting for a first message · test in Settings', problem ? 'error' : lastSuccess ? 'ready' : ''],
      ['Progress', progress?.watching ? progress.automatic ? 'Learning supported labels automatically' : 'Watching · moderator review' : progress?.connected ? 'Video connected · waiting for frames' : state.session.localObservationEnabled ? 'Start video sharing in Gameplay' : 'Moderator-confirmed discoveries', progress?.watching ? 'ready' : ''],
    ];
    setup.replaceChildren(); for (const [label, text, tone] of rows) { const value = el('dd', tone, text); setup.append(el('dt', '', label), value); }
    twitchPlayer();
  } };
}

async function controlView() {
  await api('/api/local-session', { method: 'POST', data: {}, token: '' });
  capability = ''; control = await api('/api/control'); readerToken = control.links.reader;
  const drawer = el('dialog', 'reader-drawer'); drawer.setAttribute('aria-label', 'Reader controls');
  const side = el('aside', 'sidepanel'), sideTitle = el('div', 'sidepanel-title'); const close = button('', () => drawer.close(), 'icon-button'); close.append(icon('close')); close.setAttribute('aria-label', 'Close reader controls'); sideTitle.append(el('span', '', 'READER CONTROLS'), close); side.append(sideTitle);
  const openControls = () => drawer.showModal();
  drawer.addEventListener('click', event => { const bounds = drawer.getBoundingClientRect(); if (event.target === drawer && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) drawer.close(); });
  const connection = section('Channel connection'), connectionStatus = el('div', 'connection-line'), connect = link('Connect Twitch', '/auth/twitch?role=owner'); connect.className = 'primary';
  connectionStatus.id = 'connection-status'; connection.append(connectionStatus);
  const connectionAction = el('div', 'row'); connectionAction.id = 'connection-action'; connection.append(connectionAction, el('p', '', 'Your community uses regular Twitch chat. FirstPlay screens only this reader.'));
  const liveCheck = el('div', 'row'); connection.append(liveCheck);
  const gameSection = section('Game session'), gameSelect = el('select'), savedSelect = el('select'), gameStatus = el('p', 'small muted');
  for (const game of control.games) { const option = el('option', '', game.name); option.value = game.id; gameSelect.append(option); } gameSelect.value = control.session.id;
  const startGame = button('Start new session', async () => {
    setButtonBusy(startGame, true);
    try { await api('/api/session/start', { method: 'POST', data: { gameId: gameSelect.value, expectedRunId: shownRunId } }); await update(); toast('New game session started. Previous progress is saved.'); }
    finally { setButtonBusy(startGame, false, 'Start new session'); }
  }, 'primary');
  const restoreGame = button('Resume saved session', async () => { if (!savedSelect.value) return; await api('/api/session/restore', { method: 'POST', data: { runId: savedSelect.value, expectedRunId: shownRunId } }); await update(); toast('Saved game progress restored.'); }, 'subtle');
  gameSection.append(field('Game', gameSelect), gameStatus, startGame, field('Saved sessions', savedSelect), restoreGame, el('p', '', 'Each session keeps its own discoveries. Switching saves your current progress and clears the reader.'));
  let shownRunId = control.session.runId, savedSignature = '';
  const rules = section('Chat rules'), mode = el('select');
  for (const [value, text] of [['discovery', 'Discovery'], ['strict_social', 'Strict social — no game discussion']]) { const option = el('option', '', text); option.value = value; mode.append(option); } mode.value = control.policy.mode;
  const gentle = el('input'); gentle.type = 'checkbox'; gentle.checked = control.policy.allowGentleHints;
  const gentleLabel = el('label', 'check'); gentleLabel.append(gentle, el('span', '', 'Allow gentle exploration hints'));
  const objective = el('input'); objective.value = control.objective; objective.placeholder = 'Current objective (optional)';
  rules.append(field('Filtering mode', mode), gentleLabel, field('Current objective', objective));
  const apply = button('Apply rules', async () => { await api('/api/policy', { method: 'POST', data: { policy: { mode: mode.value, allowGentleHints: gentle.checked }, objective: objective.value, expectedRunId: shownRunId } }); toast('Rules updated.'); await update(); }, 'primary');
  const pause = button('Pause', async () => { await api('/api/pause', { method: 'POST', data: { paused: !control.connection.paused, expectedRunId: shownRunId } }); await update(); }, 'subtle');
  const actions = el('div', 'row'); actions.append(apply, pause); rules.append(actions);
  const summary = el('p', 'rule-summary'); rules.append(summary);
  rules.append(button('Request one gentle hint', async () => { await api('/api/help/request', { method: 'POST', data: { topic: objective.value, expectedRunId: shownRunId } }); toast('One hint requested for this obstacle. A moderator can release a suitable hint for 60 seconds.'); await update(); }, 'subtle'));
  const discovery = section('Confirmed discoveries'), known = el('div', 'small muted'); discovery.append(known, el('p', '', 'Gameplay records supported discoveries automatically. Moderator tools handle other observed events.'));
  const integration = section('OBS & viewer panel');
  for (const [text, path, token] of [['Private OBS dock', '/reader', control.links.reader], ['Broadcast overlay', '/overlay', control.links.overlay]]) {
    const href = `${location.origin}${path}#${token}`, row = el('div', 'link-row'); row.append(link(text, href, true), button('Copy URL', async () => { await navigator.clipboard.writeText(href); toast('URL copied.'); }, 'subtle')); integration.append(row);
  }
  integration.append(el('p', '', 'Use the reader as an OBS dock for your own chat view. Add the overlay as a Browser Source when you want viewers to see approved chat.'));
  const viewerLink = link('Message status', '/status', true), viewerRow = el('div', 'link-row'), viewerNote = el('p');
  viewerRow.append(viewerLink, button('Copy URL', async () => { await navigator.clipboard.writeText(viewerLink.href); toast('Status URL copied.'); }, 'subtle')); integration.append(viewerRow, viewerNote);
  const extension = section('Chrome extension'), extensionState = el('p'), pairing = el('div', 'extension-pairing'); pairing.hidden = true;
  extension.append(extensionState, el('p', '', 'Read FirstPlay inside your Twitch channel. Load the firstplay/extension folder in Chrome, then pair it once.'));
  extension.append(button('Create pairing code', async () => {
    const grant = await api('/api/extension/pair', { method: 'POST', data: {} }); pairing.hidden = false; pairing.replaceChildren();
    pairing.append(el('code', 'pairing-code', grant.code), el('p', '', `For ${grant.channel} · expires in 5 minutes. Paste this into the extension popup.`), button('Copy pairing code', async () => { await navigator.clipboard.writeText(grant.code); toast('Pairing code copied.'); }, 'subtle'));
  }, 'primary'), pairing, button('Disconnect paired extensions', async () => { await api('/api/extension/revoke', { method: 'POST', data: {} }); pairing.hidden = true; toast('Extension reader access revoked. Native chat stays protected until you turn FirstPlay off.'); await update(); }, 'subtle'));
  const modelSection = section('Model connection'), modelCheckStatus = el('p', 'small muted');
  const testModel = button('Check model connection', async () => { setButtonBusy(testModel, true); try { const result = await api('/api/model/check', { method: 'POST', data: { expectedRunId: shownRunId } }); toast(result.check.state === 'ready' ? 'Model connected. No chat was posted.' : 'Model needs attention. See the connection details.'); await update(); } finally { setButtonBusy(testModel, false, 'Check model connection'); } }, 'subtle'); modelSection.append(modelCheckStatus, testModel, el('p', '', 'Runs one small private model check using your configured account. It does not post to Twitch.'));
  const testing = section('Local message test'), message = el('textarea'); message.placeholder = 'Try a reaction, a hint, or a spoiler…'; message.setAttribute('aria-label', 'Local test message');
  const send = button('Send test message', async () => { const text = message.value.trim(); if (!text) return; await api('/api/message', { method: 'POST', data: { text, expectedRunId: shownRunId } }); message.value = ''; toast('Queued for real model classification.'); }, 'primary'); testing.append(message, el('div', 'row')); testing.lastChild.append(send);
  const model = el('p'); testing.append(model);
  const tools = section('Session'); tools.append(button('Clear displayed chat', async () => { await api('/api/clear', { method: 'POST', data: { expectedRunId: shownRunId } }); await update(); }, 'subtle'));
  side.append(connection, gameSection, rules, discovery, extension, integration, modelSection, testing, tools); drawer.append(side); const watch = watchPage(); app.append(nav({ openSettings: openControls, videoMenu: watch.videoMenu }), watch.element, drawer);
  if (new URLSearchParams(location.search).get('settings') === '1') openControls();
  async function update() {
    control = await api('/api/control'); readerToken = control.links.reader;
    if (shownRunId !== control.session.runId) { shownRunId = control.session.runId; mode.value = control.policy.mode; gentle.checked = control.policy.allowGentleHints; objective.value = control.objective; gameSelect.value = control.session.id; message.value = ''; }
    gameStatus.textContent = `${control.session.segment} · ${control.session.support}`;
    const signature = JSON.stringify(control.savedRuns.map(run => [run.id, run.active, run.knownCount]));
    if (signature !== savedSignature) { savedSignature = signature; const previous = savedSelect.value; savedSelect.replaceChildren(); const empty = el('option', '', 'Choose a saved session'); empty.value = ''; savedSelect.append(empty);
      for (const run of control.savedRuns.filter(run => !run.active)) { const option = el('option', '', `${run.name} · ${new Date(run.createdAt).toLocaleString()} · ${run.knownCount} ${run.knownCount === 1 ? 'discovery' : 'discoveries'}`); option.value = run.id; savedSelect.append(option); } savedSelect.value = [...savedSelect.options].some(option => option.value === previous) ? previous : ''; }
    restoreGame.disabled = !control.savedRuns.some(run => !run.active);
    connectionStatus.replaceChildren(el('span', `pill-dot ${control.connection.twitch.state === 'connected' ? 'green' : ''}`), document.createTextNode(control.connection.source === 'live' ? `${control.connection.twitch.channel || 'Twitch'} · ${control.connection.twitch.state}` : control.connection.rehearsal ? 'Local rehearsal · Twitch disabled' : 'Not connected to Twitch'));
    connect.textContent = control.connection.twitch.state === 'error' ? 'Reconnect Twitch' : 'Connect Twitch'; connect.href = control.canSendTest ? '/auth/twitch?role=owner&send=1' : '/auth/twitch?role=owner';
    connectionAction.replaceChildren(control.connection.source === 'live' && control.connection.twitch.state !== 'error' ? button('Disconnect Twitch', async () => { await api('/api/disconnect', { method: 'POST', data: {} }); await update(); }, 'subtle') : connect);
    connect.hidden = !control.connection.twitchConfigured;
    liveCheck.replaceChildren(); extension.hidden = control.connection.rehearsal === true;
    if (control.connection.source === 'live') {
      if (control.canSendTest) liveCheck.append(button('Send live check', async () => { await api('/api/live-check', { method: 'POST', data: {} }); toast('Two test messages sent to Twitch.'); }, 'subtle'));
      else { const grant = link('Enable test messages', '/auth/twitch?role=owner&send=1'); grant.className = 'text-button small'; liveCheck.append(grant); }
    }
    if (!control.connection.twitchConfigured && !connectionAction.querySelector('.small')) connectionAction.append(el('span', 'small muted', control.connection.rehearsal ? 'Twitch is disabled for this separate rehearsal.' : 'Add Twitch credentials to .env, then restart.'));
    pause.textContent = control.connection.paused ? 'Resume' : 'Pause';
    known.textContent = `${control.knownCount} ${control.knownCount === 1 ? 'discovery' : 'discoveries'} recorded`;
    viewerLink.href = control.publicViewerOrigin ? `${control.publicViewerOrigin}/status` : control.connection.source === 'live' ? `${location.origin}/status` : `${location.origin}/status#${control.links.demoViewer}`;
    viewerLink.textContent = control.publicViewerOrigin ? 'Audience message status' : control.connection.source === 'live' ? 'Your message status · sign in with Twitch' : 'Local test-message status';
    viewerNote.textContent = control.publicViewerOrigin ? 'Viewers sign in with their own Twitch account to see their message delivery status.' : 'This status panel works on this computer. A separate HTTPS viewer gateway is needed for remote audience access.';
    extensionState.textContent = `${control.extension?.paired || 0} paired ${(control.extension?.paired || 0) === 1 ? 'extension' : 'extensions'} · approved chat access only`;
    send.disabled = message.disabled = control.connection.source === 'live';
    const modelProbe = control.connection.model.check || { state: 'unchecked' };
    const modelErrors = { usage_limit: 'Codex usage limit reached. Try again after it resets.', login_required: 'Sign in to Codex, then check again.', codex_not_found: 'Install the Codex CLI and sign in.', provider_not_configured: 'Configure the selected model provider in .env.', invalid_probe_response: 'The model did not return a valid connection-check response.' };
    modelCheckStatus.textContent = modelProbe.state === 'ready' ? `Connected · last check ${(modelProbe.latencyMs / 1000).toFixed(1)}s` : modelProbe.state === 'checking' ? 'Checking the configured model…' : modelProbe.state === 'failed' ? modelErrors[modelProbe.errorCode] || 'The model check failed. Run npm run doctor for setup details, then try again.' : 'Not checked yet. Normal chat also verifies the model when it arrives.';
    if (modelProbe.state === 'checking') testModel.disabled = true;

    model.textContent = (control.connection.source === 'live' ? 'Send messages in your normal Twitch chat while connected. ' : '') + `${control.connection.model.provider === 'codex-cli' ? 'Uses your local Codex login' : 'Uses the configured model API'}${control.connection.model.lastLatencyMs ? ` · last batch ${(control.connection.model.lastLatencyMs / 1000).toFixed(1)}s` : ''}. ${control.metrics.pending} checking · ${control.metrics.review} awaiting review.`;
    summary.textContent = control.policy.mode === 'strict_social' ? 'Game-related messages are hidden, including harmless game reactions.' : control.policy.allowGentleHints ? 'Gentle search guidance is permitted. Exact reveals and concrete instructions are hidden.' : 'Known-event conversation is permitted. Spoilers and unsolicited guidance are hidden.';
    if (control.helpRequest?.remaining && control.helpRequest.expiresAt > Date.now()) summary.textContent = `One hint requested: ${control.helpRequest.topic}. Moderator confirmation required.`;
    document.querySelector('#chat-policy').textContent = control.policy.mode === 'strict_social' ? 'Strict social' : control.policy.allowGentleHints ? 'Gentle hints on' : 'Discovery';
    watch.update(control);
    await pollReader();
  }
  await update(); return update;
}

function eventTitle(event) { return event.label || event.id.replace(/^sn1\.event\.|^confirm_/, '').replaceAll('_', ' ').replace(/\b2d\b/i, '2D').replace(/^\w/, letter => letter.toUpperCase()); }
function progressControls(state, refresh) {
  const section = el('section', 'manual-progress'), select = el('select'), description = el('p', 'small muted'), grants = el('ul', 'progress-grants'), note = el('input');
  select.setAttribute('aria-label', 'Observed discovery'); const empty = el('option', '', 'Choose what you observed'); empty.value = ''; select.append(empty);
  const facts = new Map(state.facts.map(fact => [fact.id, fact]));
  for (const event of state.events) { const option = el('option', '', eventTitle(event)); option.value = event.id; select.append(option); }
  note.placeholder = 'Evidence note or recording timestamp (optional)'; note.setAttribute('aria-label', 'Discovery evidence note'); note.maxLength = 400;
  const confirm = button('Confirm observed discovery', async () => {
    if (!select.value) return; setButtonBusy(confirm, true);
    try { await api('/api/discovery', { method: 'POST', data: { eventId: select.value, expectedRunId: state.session.runId, evidence: note.value.trim() || 'Operator verified the selected on-screen event.' } }); await refresh(); toast('Observed discovery confirmed.'); }
    finally { setButtonBusy(confirm, false, 'Confirm observed discovery'); }
  }, 'primary'); confirm.disabled = true;
  select.addEventListener('change', () => { const event = state.events.find(event => event.id === select.value), ids = event ? [...event.confirms_fact_ids, ...event.confirms_relation_ids] : [], known = new Set([...state.knowledge.factIds, ...state.knowledge.relationIds]);
    const alreadyConfirmed = Boolean(event) && ids.every(id => known.has(id)); confirm.disabled = !event || alreadyConfirmed; confirm.textContent = alreadyConfirmed ? 'Already confirmed' : 'Confirm observed discovery'; grants.replaceChildren(); description.textContent = event?.operator_guidance || (typeof event?.evidence_required === 'string' ? event.evidence_required : 'Confirm only what you independently observed in gameplay.');
    for (const id of ids) grants.append(el('li', '', facts.get(id)?.label || facts.get(id)?.statement || id)); });
  section.append(select, description, grants, note, confirm); return section;
}

function discoveryActivity(state, refresh) {
  const section = el('section', 'discovery-activity'); section.append(el('h3', '', 'Discovery history'));
  if (!state.discoveryActivity?.length) { section.append(el('p', 'small muted', 'Confirmed discoveries and evidence notes will appear here.')); return section; }
  for (const operation of state.discoveryActivity) {
    const row = el('article', 'activity-row'), heading = el('div', 'row between'), stamp = el('time', 'tiny muted', new Date(operation.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }));
    const event = operation.eventId && state.events.find(item => item.id === operation.eventId); heading.append(el('strong', '', event ? eventTitle(event) : operation.label), stamp); row.append(heading);
    const details = el('details'), summary = el('summary', 'small', `${operation.changes.length} ${operation.changes.length === 1 ? 'entry' : 'entries'} · view evidence`), changes = el('ul');
    for (const change of operation.changes) changes.append(el('li', '', `${change.after ? 'Confirmed' : 'Removed'}: ${change.label}`));
    details.append(summary, changes); if (operation.evidence) details.append(el('p', 'small muted', operation.evidence)); row.append(details);
    if (operation.canUndo) {
      const undo = button('Undo last change', async () => {
        setButtonBusy(undo, true);
        try { await api('/api/discovery/undo', { method: 'POST', data: { operationId: operation.id, knowledgeRevision: state.knowledge.revision, expectedRunId: state.session.runId } }); await refresh(); toast('Discovery change undone. The reader was cleared.'); }
        finally { setButtonBusy(undo, false, 'Undo last change'); }
      }, 'subtle'); row.append(el('p', 'tiny muted', 'Undo restores the previous knowledge and clears the current reader.'), undo);
    } else if (operation.legacy) row.append(el('p', 'tiny muted', 'Earlier entries can be adjusted individually in Moderation.'));
    section.append(row);
  }
  return section;
}

function observationCards(state, update, { diagnostics = true } = {}) {
  const openEvidence = new Set([...document.querySelectorAll('.automatic-evidence[open]')].map(node => node.dataset.observationId));
  const content = el('div'), last = state.observationStatus?.lastCheck, local = state.observationStatus?.mode === 'local-labels';
  if (diagnostics && state.observationStatus?.busy) content.append(el('p', 'small muted', `${local ? 'Reading game text on this Mac' : 'Checking video evidence'}…`));
  else if (diagnostics && last?.state === 'complete') content.append(el('p', 'tiny muted', `Last ${local ? 'on-device' : 'video'} check: ${(last.latencyMs / 1000).toFixed(1)}s · ${last.candidates} new ${last.candidates === 1 ? 'suggestion' : 'suggestions'}. ${last.diagnostic || 'Waiting for clear supported game text.'}`));
  const runId = state.session.runId;
  for (const candidate of state.observations) {
    const row = el('article', 'review-row'), event = state.events.find(event => event.id === candidate.eventId);
    row.append(el('strong', 'small', candidate.label || (event ? eventTitle(event) : 'Observed event')));
    if (candidate.source?.kind === 'synthetic') row.append(el('p', 'tiny', 'ORIGINAL TEST SOURCE · NOT GAMEPLAY'));
    row.append(el('p', 'tiny muted', candidate.mode === 'local-labels' ? candidate.automatic ? 'Added automatically · applies to new chat messages' : candidate.strict && state.observationStatus?.automatic?.enabled && !state.observationStatus.automatic.blockedFactIds.includes(candidate.factId) && candidate.source?.kind !== 'synthetic' ? 'Verifying again automatically · no action needed' : 'Optional review · confirms only this name or UI fact' : candidate.uncertain ? 'Uncertain evidence · verify before confirming' : 'Model suggestion · your confirmation is required'), el('p', 'small', candidate.explanation));
    const evidence = el('div', 'evidence');
    for (const [index, frame] of candidate.frames.entries()) {
      const thumb = button('', () => {
        const dialog = el('dialog', 'observation-evidence-viewer'), close = button('Close evidence', () => dialog.close(), 'subtle'), image = el('img'); image.src = frame; image.alt = `Evidence frame ${index + 1}`;
        dialog.append(close, image); document.body.append(dialog); dialog.addEventListener('close', () => dialog.remove(), { once: true }); dialog.showModal();
      }, 'evidence-thumb'); thumb.setAttribute('aria-label', `Enlarge evidence frame ${index + 1}`);
      const image = el('img'); image.src = frame; image.alt = `Evidence frame ${index + 1}`; thumb.append(image); evidence.append(thumb);
    } if (candidate.automatic) { const details = el('details', 'automatic-evidence'); details.dataset.observationId = candidate.id; details.open = openEvidence.has(candidate.id); details.append(el('summary', 'small', 'View four-frame evidence'), evidence); row.append(details); } else row.append(evidence);
    if (candidate.status === 'confirmed') row.append(el('span', 'small muted', candidate.automatic ? 'Added automatically · undo is available in Discovery history' : 'Confirmed by moderator'));
    else {
      const actions = el('div', 'row'); actions.append(button(candidate.mode === 'local-labels' ? 'Confirm this discovery' : 'Confirm observed event', async () => { await api('/api/observations/confirm', { method: 'POST', data: { id: candidate.id, expectedRunId: runId } }); await update(); }, 'primary'), button('Dismiss', async () => { await api('/api/observations/dismiss', { method: 'POST', data: { id: candidate.id, expectedRunId: runId } }); await update(); }, 'subtle')); row.append(actions);
    } content.append(row);
  }
  return content;
}

async function moderatorView() {
  let state = await api('/api/moderator'), searchText = '', kind = 'route', shownRun = '', renderedKnowledge = -1, progressRevision = -1, discoveryRequest = 0, reviewKey, recentKey, observationKey;
  app.append(nav()); const wide = el('main', 'wide'); wide.append(titleBlock('Moderation', 'Raw review queue and discovery controls. This view contains game spoilers.'));
  const grid = el('div', 'mod-grid'), left = el('section', 'mod-column'), right = el('section', 'mod-column');
  const reviewHeader = el('div', 'panel-head'), reviewList = el('div'), observations = el('div'), recentHeader = el('div', 'panel-head', 'Recent decisions'), recentList = el('div', 'decision-list');
  left.append(reviewHeader, reviewList, observations, recentHeader, recentList);
  right.append(el('div', 'panel-head', 'Discovery record'));
  const events = el('div', 'event-strip');
  const search = el('input'); search.placeholder = 'Search discoveries…'; search.setAttribute('aria-label', 'Search discoveries');
  const type = el('select');
  const searchBar = el('div', 'discovery-search stack'); searchBar.append(type, search); const discoveries = el('div', 'discovery-list'); right.append(events, searchBar, discoveries); grid.append(left, right); wide.append(grid); app.append(wide);
  async function renderDiscoveries() {
    const request = ++discoveryRequest, revision = state.knowledge.revision;
    const known = new Set([...state.knowledge.factIds, ...state.knowledge.relationIds]);
    let refs = state.facts.filter(ref => ref.confirmationEligible !== false); const renderedRun = state.session.runId;
    if (kind !== 'route') refs = (await api(`/api/catalog?kind=${encodeURIComponent(kind)}&q=${encodeURIComponent(searchText)}`)).references;
    else if (searchText) refs = refs.filter(ref => `${ref.statement} ${ref.id}`.toLowerCase().includes(searchText.toLowerCase()));
    if (request !== discoveryRequest || renderedRun !== state.session.runId || revision !== state.knowledge.revision) return;
    renderedKnowledge = revision; discoveries.dataset.run = renderedRun;
    refs = refs.filter(ref => ref.confirmationEligible !== false); discoveries.replaceChildren();
    for (const ref of refs) {
      const row = el('label', 'discovery-row'), check = el('input'); check.type = 'checkbox'; check.checked = known.has(ref.id);
      const text = el('span', '', ref.name || ref.statement); text.append(el('code', '', ref.id)); row.append(check, text);
      check.addEventListener('change', async () => { try { await api('/api/discovery', { method: 'POST', data: { id: ref.id, known: check.checked, expectedRunId: renderedRun } }); await update(); } catch (error) { check.checked = !check.checked; toast(error.message); } }); discoveries.append(row);
    }
    if (!refs.length) discoveries.append(el('div', 'section-empty', 'No matching discoveries.'));
  }
  search.addEventListener('input', () => { searchText = search.value; void renderDiscoveries().catch(error => toast(error.message)); });
  type.addEventListener('change', () => { kind = type.value; void renderDiscoveries().catch(error => toast(error.message)); });
  async function update() {
    state = await api('/api/moderator');
    if (shownRun !== state.session.runId) {
      shownRun = state.session.runId; kind = 'route'; type.replaceChildren(); search.value = searchText = '';
      const options = [['route', 'Supported facts & relationships'], ...(state.session.id === 'mario' ? [['moon', 'All 40 Cascade Moons'], ['regional_coins', 'Cascade purple-coin groups']] : [])];
      for (const [value, label] of options) { const option = el('option', '', label); option.value = value; type.append(option); }
    }
    if (progressRevision !== state.knowledge.revision || events.dataset.run !== state.session.runId) { progressRevision = state.knowledge.revision; events.dataset.run = state.session.runId; events.replaceChildren(el('p', 'small muted', `${state.session.name} · ${state.session.segment}`), progressControls(state, update), discoveryActivity(state, update)); }
    reviewHeader.replaceChildren(document.createTextNode('Awaiting review'), el('span', 'muted', `${state.review.length} messages · 30s TTL`));
    const timings = state.metrics.screeningMs || [], ordered = [...timings].sort((a, b) => a - b);
    const p95 = ordered.length ? `${(ordered[Math.ceil(.95 * ordered.length) - 1] / 1000).toFixed(1)}s p95 · ${ordered.length} checks` : 'No completed checks';
    recentHeader.replaceChildren(document.createTextNode('Recent decisions'), el('span', 'muted', p95));
    const recent = state.recent.filter(record => ['allow', 'reject', 'expired', 'removed'].includes(record.disposition) && record.text).slice(-20).reverse();
    const nextRecentKey = JSON.stringify([state.session.runId, recent, state.metrics.cacheHits, state.metrics.repeatedInBatch]);
    if (recentKey !== nextRecentKey) {
      recentKey = nextRecentKey; recentList.replaceChildren();
      if (!recent.length) recentList.append(el('div', 'section-empty', 'Completed decisions appear here with their private reasons.'));
      for (const record of recent) {
        const row = el('article', 'decision-row'), heading = el('div', 'row between');
        const labels = { allow: 'Approved', reject: 'Rejected', expired: 'Expired', removed: 'Removed' };
        heading.append(el('strong', `decision-label ${record.disposition}`, labels[record.disposition]), el('span', 'tiny muted', time(record.receivedAt)));
        row.append(heading, el('div', `name small ${color(record.senderId)}`, record.displayName), el('p', '', record.text), el('div', 'reason', record.reason || 'Removed from chat.')); recentList.append(row);
      }
      if (state.metrics.cacheHits || state.metrics.repeatedInBatch) recentList.append(el('p', 'reuse-summary', `${state.metrics.cacheHits} exact repeats reused · ${state.metrics.repeatedInBatch} identical messages combined in model batches`));
    }
    const nextReviewKey = JSON.stringify([state.session.runId, state.review]);
    if (reviewKey !== nextReviewKey) {
      reviewKey = nextReviewKey; reviewList.replaceChildren();
      if (!state.review.length) reviewList.append(el('div', 'section-empty', 'The review queue is clear. Obvious violations are rejected automatically.'));
      const renderedRunId = state.session.runId;
      for (const record of state.review) {
        const row = el('article', 'review-row'), head = el('div', 'row between'); head.append(el('strong', `name ${color(record.senderId)}`, record.displayName), el('span', 'tiny muted', time(record.receivedAt))); row.append(head, el('p', '', record.text), el('div', 'reason', record.reason));
        if (record.hintRequestId) row.append(el('div', 'reason', `Verify this hint stays within: ${record.snapshot.helpRequest.topic}`));
        const actions = el('div', 'review-actions'); for (const [text, action, className] of [['Release', 'allow', 'primary'], ['Reject', 'reject', 'subtle']]) actions.append(button(text, async () => {
          const controls = [...actions.querySelectorAll('button')]; controls.forEach(control => { control.disabled = true; });
          try { await api('/api/review', { method: 'POST', data: { id: record.id, action, expectedRunId: renderedRunId } }); await update(); }
          finally { controls.forEach(control => { if (control.isConnected) control.disabled = false; }); }
        }, className));
        const expiry = el('span', 'small muted'); expiry.dataset.reviewExpiresAt = record.reviewExpiresAt; actions.append(expiry); row.append(actions); reviewList.append(row);
      }
    }
    for (const expiry of reviewList.querySelectorAll('[data-review-expires-at]')) expiry.textContent = `${Math.max(0, Math.ceil((Number(expiry.dataset.reviewExpiresAt) - Date.now()) / 1000))}s left`;
    const nextObservationKey = JSON.stringify([state.session.runId, state.observations.map(candidate => [candidate.id, candidate.status, candidate.strict, candidate.automatic]), state.observationStatus?.automatic]);
    if (observationKey !== nextObservationKey) { observationKey = nextObservationKey; observations.replaceChildren(observationCards(state, update)); }
    if (!discoveries.contains(document.activeElement) && (renderedKnowledge !== state.knowledge.revision || discoveries.dataset.run !== state.session.runId)) await renderDiscoveries();
  }
  await update(); return update;
}

const STATUS = { delivered: ['check', 'Delivered to FirstPlay reader'], approved: ['clock', 'Approved · waiting for reader'], pending: ['clock', 'Checking'], review: ['clock', 'Awaiting moderator review'], not_delivered: ['close', 'Not delivered'], expired: ['clock', 'Expired without delivery'], removed: ['close', 'Removed'] };
async function statusView() {
  app.append(nav()); const shell = el('main', 'status-shell'); shell.append(el('h1', '', 'Your message status'), el('p', 'small muted', 'Your Twitch chat stays the same. These markers show delivery to the private FirstPlay reader—not whether the streamer read your message.')); const content = el('div'); shell.append(content); app.append(shell);
  async function update() {
    let state; try { state = await api('/api/viewer'); } catch (error) { if (error.status !== 403) throw error; content.replaceChildren(el('p', 'small muted', 'Sign in with the Twitch account you use in chat.')); const login = link('Sign in with Twitch', '/auth/twitch?role=viewer'); login.className = 'primary'; content.append(login); return; }
    content.replaceChildren(el('p', 'small muted', `${state.identity.demo ? 'Local test panel' : 'Signed in as'} ${state.identity.name}`));
    if (!state.messages.length) content.append(el('div', 'section-empty', 'No FirstPlay records yet. Only messages received while FirstPlay is connected can appear here.'));
    for (const message of [...state.messages].reverse()) { const row = el('article', 'status-row'), status = STATUS[message.status] || ['clock', 'Checking']; const label = el('div', `receipt ${message.status}`); label.append(icon(status[0]), el('span', '', status[1]), el('span', 'grow'), el('span', 'tiny muted', time(message.receivedAt))); row.append(label, el('p', '', message.text)); content.append(row); }
  }
  await update(); return update;
}

async function captureView() {
  let state = await api('/api/moderator'), shownRun, shownKnowledge, source = null, sourceVersion = 0, sourcePending = false, checking = false, lastCheckAt = 0, localUrl, syntheticTimer, failures = 0, retryAt = 0;
  app.append(nav());
  const wide = el('main', 'wide capture-layout'), heading = titleBlock('Automatic progress', ''), summary = heading.querySelector('p'), resources = el('div', 'row');
  const visual = el('section', 'visual-assist'), buttons = el('div', 'capture-buttons'), status = el('p', 'recognition-status'), detail = el('p', 'small muted'), disclosure = el('p', 'tiny muted');
  const shell = el('div', 'video-shell'), placeholder = el('div', 'capture-empty'), observations = el('div', 'capture-observations'), activity = el('div'), known = el('section', 'recognized-facts');
  const advanced = el('details', 'capture-advanced'), advancedTitle = el('summary', '', 'Advanced controls and moderator tools'), tools = el('div', 'capture-buttons'), manual = el('div'), autoLabel = el('label', 'check'), automatic = el('input'), autoGrantLabel = el('label', 'check'), autoGrant = el('input');
  automatic.type = autoGrant.type = 'checkbox'; automatic.setAttribute('aria-label', 'Watch gameplay automatically'); autoGrant.setAttribute('aria-label', 'Add clear discoveries automatically');
  autoLabel.append(automatic, el('span', '', 'Watch gameplay automatically')); autoGrantLabel.append(autoGrant, el('span', '', 'Add clear discoveries automatically after repeated checks'));
  video = el('video'); video.autoplay = true; video.muted = true; video.playsInline = true; video.hidden = true;
  placeholder.append(icon('shield'), el('strong', '', 'Share the game. FirstPlay keeps up.'), el('p', '', 'After you choose a game window or video tab, recognition starts automatically. Keep this page open while playing.'));
  shell.append(video, placeholder);
  const refreshControls = () => {
    analyze.disabled = checking || sourcePending || !source; automatic.disabled = sourcePending || !source;
    pause.disabled = !source || sourcePending; pause.textContent = video.ended ? 'Replay recording' : automatic.checked ? 'Pause recognition' : 'Resume recognition';
    stop.disabled = !source && !stream && !localUrl; screen.textContent = source ? 'Change video source' : state.observationStatus?.source ? 'Switch sharing to this tab' : 'Share game window';
    video.hidden = !source; placeholder.hidden = Boolean(source);
  };
  function stopVideo() {
    const previous = source; source = null; sourceVersion++; sourcePending = false; automatic.checked = false; failures = 0; retryAt = 0;
    if (syntheticTimer) clearInterval(syntheticTimer); syntheticTimer = null;
    stream?.getTracks().forEach(track => track.stop()); stream = null;
    video.pause(); video.srcObject = null; video.removeAttribute('src'); video.load();
    if (localUrl) URL.revokeObjectURL(localUrl); localUrl = null;
    if (previous) void api('/api/observations/source/end', { method: 'POST', keepalive: true, data: { id: previous.id, generation: previous.generation, expectedRunId: previous.runId } }).catch(() => {});
    status.textContent = 'Not watching · choose a video source'; refreshControls();
  }
  async function attach(kind, runId, { recover = false, previousId, resumeWatching } = {}) {
    const version = sourceVersion; sourcePending = true; refreshControls();
    try {
      const result = await api('/api/observations/source', { method: 'POST', data: { kind, recover, previousId, expectedRunId: runId } });
      if (version !== sourceVersion || runId !== activeRunId) { if (result.source) void api('/api/observations/source/end', { method: 'POST', data: { id: result.source.id, generation: result.source.generation, expectedRunId: runId } }).catch(() => {}); return; }
      source = { ...result.source, runId }; automatic.checked = typeof resumeWatching === 'boolean' ? resumeWatching : Boolean(state.session.localObservationEnabled); lastCheckAt = 0;
      status.textContent = kind === 'synthetic' ? 'Original test source · review only' : automatic.checked ? 'Watching · recognition starts automatically' : 'Video connected · ready to check';
      if (kind === 'synthetic') detail.textContent = 'Original test imagery checks recognition without changing progress automatically.';
    } finally { if (version === sourceVersion) sourcePending = false; refreshControls(); }
  }
  const screen = button('Share game window', async () => {
    const runId = state.session.runId; let chosen;
    try { chosen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }); }
    catch (error) { status.textContent = error.name === 'InvalidStateError' ? 'Open this page in the active Chrome tab, then click Share game window.' : 'No video selected. Click Share game window when ready.'; return; }
    if (runId !== activeRunId) { chosen.getTracks().forEach(track => track.stop()); throw new Error('The game session changed.'); }
    stopVideo(); stream = chosen; video.srcObject = chosen; video.controls = false; await video.play(); await attach('window', runId);
    chosen.getVideoTracks()[0].addEventListener('ended', () => { if (stream === chosen) stopVideo(); });
  }, 'primary');
  const file = el('input'); file.type = 'file'; file.accept = 'video/*'; file.setAttribute('aria-label', 'Open local recording');
  const fileLabel = el('label', 'file-label', 'Open local recording'); fileLabel.append(file);
  file.addEventListener('change', () => { void (async () => {
    if (!file.files[0]) return; const chosen = file.files[0], runId = state.session.runId; stopVideo(); localUrl = URL.createObjectURL(chosen); video.src = localUrl; video.controls = true;
    try { await video.play(); } catch { /* Playback controls remain available. */ }
    await attach('recording', runId); file.value = '';
  })().catch(error => { status.textContent = error.message; }); });
  const pause = button('Pause recognition', async () => { if (video.ended) { video.currentTime = 0; await video.play(); } automatic.checked = !automatic.checked; lastCheckAt = 0; retryAt = 0; failures = 0; if (!automatic.checked && source) invalidate(); status.textContent = automatic.checked ? 'Watching · checking supported labels automatically' : 'Paused · video stays connected'; refreshControls(); }, 'subtle');
  const stop = button('Stop sharing', stopVideo, 'subtle'); buttons.append(screen, fileLabel, pause, stop);
  async function checkGameplay(fromTimer = false) {
    if (checking || sourcePending) return;
    if (!state.session.observationEnabled) throw new Error('This game currently uses manual progress confirmation.');
    if (!source || video.readyState < 2 || video.paused || video.seeking) return;
    const expectedRunId = state.session.runId, version = sourceVersion, selectedSource = { ...source };
    checking = true; lastCheckAt = Date.now(); refreshControls(); analyze.textContent = 'Checking…';
    status.textContent = 'Watching · reading two frames';
    try {
      const frame = () => { const canvas = document.createElement('canvas'); canvas.width = Math.min(state.session.localObservationEnabled ? 1920 : 960, video.videoWidth); canvas.height = Math.round(video.videoHeight * canvas.width / video.videoWidth); canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height); return canvas.toDataURL('image/jpeg', state.session.localObservationEnabled ? .9 : .72); };
      const mediaTimes = [video.currentTime], frames = [frame()]; await new Promise(resolve => setTimeout(resolve, 1000));
      if (version !== sourceVersion || expectedRunId !== activeRunId || video.seeking || video.paused) return;
      mediaTimes.push(video.currentTime); frames.push(frame());
      const result = await api('/api/observe', { method: 'POST', data: { frames, source: { id: selectedSource.id, generation: selectedSource.generation, mediaTimes }, expectedRunId } });
      if (version !== sourceVersion || expectedRunId !== activeRunId) return;
      failures = 0; retryAt = 0;
      const added = result.autoConfirmed || [], pending = result.candidates.filter(item => item.status !== 'confirmed');
      status.textContent = added.length ? 'Added automatically: ' + added.map(item => item.label).join(', ') : pending.some(item => item.strict && !state.observationStatus?.automatic?.blockedFactIds.includes(item.factId)) && selectedSource.kind !== 'synthetic' && state.observationStatus?.automatic?.enabled ? 'Watching · checking the label again before adding it' : pending.length ? 'Watching · unclear discoveries are available for optional review' : 'Watching · progress is up to date';
      detail.textContent = added.length ? 'New chat messages now use these discoveries. You can undo a mistaken update below.' : 'Clear supported labels need two consecutive checks. Small or uncertain text stays unconfirmed. Use a large game view.';
      if (!fromTimer && added.length) toast(status.textContent);
      await update();
    } catch (error) {
      if (version === sourceVersion && expectedRunId === activeRunId && error.code === 'source_changed') {
        try { await attach(selectedSource.kind, expectedRunId, { recover: true, previousId: selectedSource.id, resumeWatching: automatic.checked }); failures = 0; retryAt = 0; status.textContent = 'Reconnected · recognition will continue automatically'; return; }
        catch (recoveryError) { error = recoveryError; }
      }
      if (version === sourceVersion && error.code === 'source_in_use') { stopVideo(); status.textContent = 'Another tab is handling recognition'; detail.textContent = 'Use the newer sharing tab. This preview has stopped.'; return; }
      if (version === sourceVersion) { failures++; retryAt = Date.now() + Math.min(30_000, 3000 * 2 ** Math.min(failures, 3)); status.textContent = 'Recognition interrupted · retrying shortly'; detail.textContent = error.message; }
    } finally { checking = false; analyze.textContent = 'Check once'; refreshControls(); }
  }
  const analyze = button('Check once', () => checkGameplay(), 'subtle');
  const fixtureKind = el('select'); fixtureKind.setAttribute('aria-label', 'Original label test');
  for (const [value, label] of [['positive', 'Test: inventory tooltip'], ['blueprints', 'Test: blueprint names'], ['world', 'Test: world target'], ['wrong', 'Test: unsupported item'], ['chat', 'Test: name in chat']]) { const option = el('option', '', label); option.value = value; fixtureKind.append(option); }
  const synthetic = button('Use original label test', async () => {
    const runId = state.session.runId; stopVideo(); const canvas = el('canvas'), local = state.session.localObservationEnabled; canvas.width = local ? 1280 : 640; canvas.height = local ? 720 : 360;
    const context = canvas.getContext('2d'); let tick = 0;
    const draw = () => {
      tick++; context.fillStyle = '#08151f'; context.fillRect(0, 0, canvas.width, canvas.height);
      const text = (value, x, y, size = 26) => { context.fillStyle = '#fff'; context.font = `${size}px monospace`; context.fillText(value, x, y + size); };
      if (local) {
        text('FirstPlay ORIGINAL LABEL TEST - not gameplay', 45, 30, 20);
        if (fixtureKind.value === 'chat') { text('COMMUNITY CHAT', 180, 110, 30); text('viewer: Boomerang', 230, 240); text('viewer: FOOD H2O INVENTORY', 230, 280); }
        else if (fixtureKind.value === 'blueprints') { text('BLUEPRINTS', 180, 110, 30); text('Scanner', 230, 240); text('Repair Tool', 230, 310); text('Seaglide', 230, 380); }
        else if (fixtureKind.value === 'world') { text('Writhing Weed', 575, 320); text('Pick up', 575, 370); text('O2 45', 100, 560); }
        else { text('INVENTORY', 180, 110, 30); text('STORAGE', 740, 110, 30); context.fillStyle = '#29292f'; context.fillRect(205, 220, 390, 200); text(fixtureKind.value === 'wrong' ? 'Peeper' : 'Boomerang', 230, 240); text('FOOD: +8', 230, 280, 22); text('H2O: -3', 230, 315, 22); text('Small, edible prey fish.', 230, 350, 22); }
        text(`Original test frame ${tick}`, 45, 650, 18);
      } else { for (let index = 0; index < 7; index++) { context.fillStyle = `hsl(${index * 48},55%,45%)`; context.fillRect(index * 92, 90, 92, 170); } context.fillStyle = '#fff'; context.fillRect((tick * 9) % 610, 270, 30, 25); text('FirstPlay synthetic test feed', 25, 20, 20); }
    };
    draw(); syntheticTimer = setInterval(draw, 100); stream = canvas.captureStream(10); video.srcObject = stream; video.controls = false; await video.play(); await attach('synthetic', runId);
  }, 'subtle');
  function invalidate() {
    if (!source) return; const previous = source, version = ++sourceVersion; source = null; sourcePending = true; refreshControls();
    void api('/api/observations/source/invalidate', { method: 'POST', data: { id: previous.id, generation: previous.generation, expectedRunId: previous.runId } }).then(result => {
      if (version === sourceVersion && previous.runId === activeRunId) { source = { ...result.source, runId: previous.runId }; lastCheckAt = 0; status.textContent = video.ended ? 'Recording ended · discoveries are saved' : automatic.checked ? 'Playback changed · recognition will resume' : 'Paused · video stays connected'; } else if (result.source) void api('/api/observations/source/end', { method: 'POST', data: { id: result.source.id, generation: result.source.generation, expectedRunId: previous.runId } }).catch(() => {});
    }).catch(error => { if (version === sourceVersion) { automatic.checked = false; status.textContent = error.message; } }).finally(() => { if (version === sourceVersion) sourcePending = false; refreshControls(); });
  }
  fixtureKind.addEventListener('change', () => { if (source?.kind === 'synthetic') invalidate(); });
  video.addEventListener('seeking', invalidate);
  video.addEventListener('ended', () => { automatic.checked = false; invalidate(); status.textContent = 'Recording ended · discoveries are saved'; });
  automatic.addEventListener('change', () => { lastCheckAt = 0; if (!automatic.checked && source) invalidate(); status.textContent = automatic.checked ? 'Watching · recognition is automatic' : 'Paused · video stays connected'; refreshControls(); });
  autoGrant.addEventListener('change', () => { void api('/api/observations/preferences', { method: 'POST', data: { automatic: autoGrant.checked, expectedRunId: state.session.runId } }).then(update).catch(error => { autoGrant.checked = !autoGrant.checked; toast(error.message); }); });
  const timer = setInterval(() => {
    const interval = state.session.localObservationEnabled ? 3000 : 20_000;
    if (automatic.checked && !checking && !sourcePending && source && !video.paused && !video.seeking && Date.now() >= retryAt && Date.now() - lastCheckAt >= interval) void checkGameplay(true);
  }, 500);
  tools.append(analyze, synthetic, fixtureKind); advanced.append(advancedTitle, autoLabel, autoGrantLabel, tools, el('p', 'tiny muted', 'Manual moderator tools below may reveal game details. Use them only for something independently observed.'), manual);
  const visualTitle = el('h2', '', 'Watch once. Keep chatting.'), visualDescription = el('p', 'small muted');
  visual.append(visualTitle, visualDescription, buttons, status, detail, disclosure, shell, known, observations);
  wide.append(heading, resources, visual, activity, advanced); app.append(wide);
  window.addEventListener('pagehide', () => { clearInterval(timer); stopVideo(); }, { once: true });
  async function update() {
    state = await api('/api/moderator'); const runChanged = shownRun !== state.session.runId;
    observations.replaceChildren(observationCards(state, update, { diagnostics: false }));
    shell.hidden = !source && Boolean(state.observationStatus?.source);
    const local = state.session.localObservationEnabled;
    if (!source && state.observationStatus?.source) { const recent = Date.now() - (state.observationStatus.lastCheck?.finishedAt || 0) < 15_000; status.textContent = recent ? 'Recognition is running in another tab' : 'Video was opened in another tab'; detail.textContent = recent ? 'Keep that sharing tab open. Discoveries and chat filtering update here automatically.' : 'That tab may be paused or closed. Share a new source here if you want to resume.'; }
    if (!source && !state.observationStatus?.source && ['Recognition is running in another tab', 'Video was opened in another tab'].includes(status.textContent)) { status.textContent = 'Not watching · choose a video source'; detail.textContent = 'The other sharing tab stopped. Recorded discoveries stay saved.'; }
    if (!runChanged && shownKnowledge === state.knowledge.revision) { autoGrant.checked = Boolean(state.observationStatus?.automatic?.enabled); refreshControls(); return; }
    shownRun = state.session.runId; shownKnowledge = state.knowledge.revision;
    if (runChanged) { stopVideo(); resources.replaceChildren(); if (state.observationStatus?.source) status.textContent = Date.now() - (state.observationStatus.lastCheck?.finishedAt || 0) < 15_000 ? 'Recognition is running in another tab' : 'Video was opened in another tab'; }
    summary.textContent = `${state.session.name} · ${state.session.segment}. ${local ? 'Share video once. Supported text discoveries update chat filtering automatically.' : 'Visual suggestions require moderator confirmation.'}`;
    visualDescription.textContent = local ? 'Clear labels are added after four matching frames across two checks. Uncertain evidence stays available for review. You can undo automatic updates.' : 'Mario visual suggestions require moderator confirmation.';
    disclosure.textContent = local ? 'Video text is read on this Mac. Screenshots stay local. Names never unlock recipes, tool ownership or completed actions.' : 'Two sampled images per check are sent to the configured model.';
    autoGrant.checked = Boolean(state.observationStatus?.automatic?.enabled); autoGrantLabel.hidden = !local;
    synthetic.hidden = !state.connection.rehearsal; fixtureKind.hidden = !(local && state.connection.rehearsal); visual.hidden = !state.session.observationEnabled;
    heading.querySelector('h1').textContent = local ? 'Automatic progress' : 'Gameplay progress'; if (runChanged) advanced.open = !local; autoLabel.hidden = !state.session.observationEnabled; visualTitle.textContent = local ? 'Watch once. Keep chatting.' : 'Video assistance';
    if (!state.session.observationEnabled) summary.textContent = `${state.session.name} · Confirm independently observed progress below. Automatic text recognition requires macOS.`;
    if (runChanged && state.session.id === 'subnautica') resources.append(link('Open Part 1 recording ↗', 'https://www.youtube.com/watch?v=hh5dckAV5Pg&t=265s', true));
    const conciseNames = { 'sn1.boomerang.named': 'Boomerang', 'sn1.pda.visible': 'PDA screen', 'sn1.scanner.named': 'Scanner', 'sn1.repair_tool.named': 'Repair Tool', 'sn1.seaglide.name_visible': 'Seaglide', 'sn1.cave_sulfur.named': 'Cave Sulfur', 'sn1.writhing_weed.named': 'Writhing Weed', 'sn1.creepvine.named': 'Creepvine' };
    const factMap = new Map(state.facts.map(fact => [fact.id, fact])), chips = el('div', 'known-chips');
    for (const id of state.knowledge.factIds) { const fact = factMap.get(id); chips.append(el('span', '', conciseNames[id] || fact?.label || fact?.statement || 'Observed discovery')); }
    known.replaceChildren(el('h3', '', 'What chat can now reference'), state.knowledge.factIds.length ? chips : el('p', 'small muted', 'No discoveries recorded yet. Conversation and reactions still pass under your chat rules.'));
    manual.replaceChildren(progressControls(state, update)); activity.replaceChildren(discoveryActivity(state, update)); refreshControls();
  }
  await update(); return update;
}

async function evaluationView() {
  const mixed = value => ({ ...value, cases: [...value.cases].sort((a, b) => a.source_hash.localeCompare(b.source_hash)) });
  let current = mixed(await api('/api/cases')), result = await api('/api/evaluation'), selectedId, busy = false, loadSequence = 0;
  const drafts = new Map(), labels = { allow: 'Allow', reject: 'Block', review: 'Hold for review' };
  app.append(nav()); const wide = el('main', 'wide evaluation-layout'), heading = titleBlock('Review desk', 'Optional testing tools · not required while streaming. Judge each message against its discoveries; this view contains game information.'); wide.append(reviewTabs());
  const progress = el('span', 'tag'), runNote = el('div', 'evaluation-run'), toolbar = el('div', 'evaluation-toolbar'), caseSet = el('select'), filter = el('select'), search = el('input'), download = link('Download reviewed cases', '');
  caseSet.setAttribute('aria-label', 'Case set'); filter.setAttribute('aria-label', 'Review filter'); search.setAttribute('aria-label', 'Search cases'); search.placeholder = 'Search messages or case IDs';
  for (const [value, text] of [['pending', 'Needs review'], ['all', 'All cases'], ['reviewed', 'Reviewed']]) { const option = el('option', '', text); option.value = value; filter.append(option); }
  download.className = 'subtle export-link'; download.download = ''; download.addEventListener('click', event => { if (download.getAttribute('aria-disabled') === 'true') event.preventDefault(); });
  toolbar.append(field('Case set', caseSet), field('Show', filter), field('Find a case', search), download);
  const grid = el('div', 'evaluation-grid'), queue = el('aside', 'evaluation-queue'), work = el('section', 'evaluation-work'); queue.setAttribute('aria-label', 'Case queue'); work.setAttribute('aria-label', 'Case review'); grid.append(queue, work); heading.append(progress); wide.append(heading, runNote, toolbar, grid); app.append(wide);
  const keyFor = row => `${current.session.runId}:${current.caseSet}:${row.id}:${row.source_hash}`;
  const visible = () => current.cases.filter(row => (filter.value !== 'pending' || row.status !== 'human_reviewed') && (filter.value !== 'reviewed' || row.status === 'human_reviewed') && `${row.id} ${row.message.text}`.toLowerCase().includes(search.value.toLowerCase()));
  const judgment = row => { const key = keyFor(row); if (!drafts.has(key)) drafts.set(key, { choice: row.status === 'human_reviewed' ? row.expected_disposition : '', note: row.review_note || '', dirty: false }); return drafts.get(key); };
  async function load(setId = current.caseSet) {
    const sequence = ++loadSequence, next = await api(`/api/cases?set=${encodeURIComponent(setId)}`), nextResult = await api(`/api/evaluation?set=${encodeURIComponent(setId)}`);
    if (sequence !== loadSequence) return;
    if (next.session.runId !== nextResult.session.runId) return load('main');
    current = mixed(next); result = nextResult; render();
  }
  function render() {
    const reviewed = current.cases.filter(row => row.status === 'human_reviewed').length;
    heading.querySelector('p').textContent = `${current.session.name} · ${current.session.segment}. Review messages against their case knowledge; live progress is unchanged.`;
    progress.textContent = `${reviewed} / ${current.cases.length} reviewed`;
    caseSet.replaceChildren(); for (const set of current.caseSets) { const option = el('option', '', set.label); option.value = set.id; caseSet.append(option); } caseSet.value = current.caseSet;
    download.href = `/api/cases/export?set=${encodeURIComponent(current.caseSet)}&run=${encodeURIComponent(current.session.runId)}`; download.setAttribute('aria-disabled', String(!reviewed));
    download.title = reviewed ? 'Download the current saved judgments.' : 'Save a judgment to enable export.';
    runNote.replaceChildren();
    if (result.report) {
      const report = result.report, reviewedRun = report.kind === 'reviewed_label_evaluation', details = el('details'); details.append(el('summary', '', `${reviewedRun ? 'Reviewed-label' : 'Development'} run available · ${report.total} cases${report.timestamp ? ' · ' + new Date(report.timestamp).toLocaleString() : ''}`), el('p', 'small', `${report.exactLabelMatchPercent}% matched ${reviewedRun ? 'reviewed' : 'draft'} labels · ${report.providerFailures || 0} provider failures`), el('p', 'tiny muted', report.warning || 'Review evaluation provenance before making accuracy claims.')); runNote.append(details);
    } else runNote.append(el('p', 'small muted', result.outdated ? result.outdatedReason || 'The saved run belongs to another pack revision. Run evaluation again before comparing results.' : 'No development run for this case set yet. Your judgments can still be saved and exported.'));
    const rows = visible(); if (!rows.some(row => row.id === selectedId)) selectedId = rows[0]?.id;
    queue.replaceChildren(el('div', 'queue-heading', `${rows.length} ${rows.length === 1 ? 'case' : 'cases'}`));
    for (const row of rows) {
      const number = current.cases.findIndex(item => item.id === row.id) + 1;
      const item = button('', () => { selectedId = row.id; render(); }, `queue-case${selectedId === row.id ? ' active' : ''}`); item.setAttribute('aria-label', `Review case ${number}`); item.setAttribute('aria-current', String(selectedId === row.id));
      item.disabled = busy;
      item.append(el('span', 'tiny muted', `Case ${number} · ${row.status === 'human_reviewed' ? 'Reviewed' : 'Needs review'}`), el('span', 'queue-preview', row.message.text)); queue.append(item);
    }
    renderCase(current.cases.find(row => row.id === selectedId));
  }
  function renderCase(row) {
    work.replaceChildren(); if (!row) { work.append(el('h2', '', filter.value === 'pending' && !search.value ? 'This queue is reviewed' : 'No matching cases'), el('p', 'small muted', 'Change the filter or case set to continue. Reviewed judgments remain available for export.')); return; }
    const draft = judgment(row), runId = current.session.runId, setId = current.caseSet, header = el('div', 'row between'), title = el('div');
    title.append(el('h2', '', 'What should the streamer see?'), el('p', 'tiny muted', `Case ${current.cases.findIndex(item => item.id === row.id) + 1}`)); const position = el('span', 'tiny muted', `${visible().findIndex(item => item.id === row.id) + 1} of ${visible().length}`); header.append(title, position); work.append(header);
    work.append(el('div', 'case-message', row.message.text));
    const rules = el('div', 'case-rules'); rules.append(el('span', 'tag', row.policy.mode === 'strict_social' ? 'Strict social' : 'Discovery'), el('span', 'tag', row.policy.allow_gentle_exploration_hints || row.policy.allowGentleHints ? 'Gentle hints allowed' : 'No unsolicited hints')); work.append(rules);
    const knowledge = el('section', 'case-knowledge'); knowledge.append(el('h3', '', 'Confirmed discoveries in this case')); const names = new Map(current.facts.map(fact => [fact.id, fact.label])), known = [...row.known_fact_ids, ...(row.known_relation_ids || [])];
    if (known.length) { const list = el('ul'); for (const id of known) list.append(el('li', '', names.get(id) || id)); knowledge.append(list); } else knowledge.append(el('p', 'small muted', 'No discoveries have been confirmed.'));
    if (row.context) knowledge.append(el('p', 'tiny muted', row.context)); work.append(knowledge);
    if (row.message.reply_parent) { const parent = row.message.reply_parent; const reply = el('div', 'case-parent'); reply.append(el('strong', 'small', `Reply parent · ${parent.disposition || 'unavailable'}`), el('p', 'small', parent.text || 'Parent text unavailable.')); work.append(reply); }
    if (row.stale_review) work.append(el('p', 'review-warning', 'This case changed since its earlier review. Please judge the current version again.'));
    const choices = el('div', 'judgment-choices'); choices.setAttribute('role', 'group'); choices.setAttribute('aria-label', 'Your expected outcome');
    for (const [value, label] of Object.entries(labels)) { const choice = button(label, () => { draft.choice = value; draft.dirty = true; renderCase(row); }, 'subtle'); choice.setAttribute('aria-pressed', String(draft.choice === value)); choice.title = { allow: 'The original message may reach the streamer.', reject: 'Keep the entire message hidden.', review: 'Keep hidden until a moderator checks it.' }[value]; choice.disabled = busy; choices.append(choice); }
    const note = el('textarea'); note.setAttribute('aria-label', 'Review note'); note.placeholder = 'Why? Add context for ambiguous cases (optional).'; note.maxLength = 1000; note.rows = 2; note.value = draft.note; note.disabled = busy;
    const noteDetails = el('details', 'review-note'); noteDetails.open = Boolean(draft.note) || Boolean(draft.noteOpen); noteDetails.append(el('summary', 'small', 'Add a review note (optional)'), note); noteDetails.addEventListener('toggle', () => { draft.noteOpen = noteDetails.open; });
    const dirty = el('span', 'tiny muted', draft.dirty ? 'Unsaved judgment' : row.status === 'human_reviewed' ? 'Your saved judgment' : 'Choose an outcome');
    note.addEventListener('input', () => { draft.note = note.value; draft.dirty = true; dirty.textContent = 'Unsaved judgment'; });
    const save = button('Save & next', () => saveReview(row, runId, setId), 'primary'); save.disabled = busy || !draft.choice;
    const navigation = el('div', 'review-navigation'), rows = visible(), index = rows.findIndex(item => item.id === row.id);
    for (const [text, offset] of [['Previous', -1], ['Next', 1]]) { const control = button(text, () => { selectedId = rows[index + offset].id; render(); }, 'subtle'); control.disabled = busy || !rows[index + offset]; navigation.append(control); }
    navigation.append(el('span', 'grow'), dirty, save); work.append(el('h3', '', 'Your judgment'), choices, noteDetails, navigation, el('p', 'tiny muted', '1 Allow · 2 Block · 3 Review · Ctrl/⌘ + Enter saves. Labels apply to this test case only.'));
    const comparison = el('details', 'case-comparison'); comparison.append(el('summary', 'small', 'Compare with draft and model'), el('code', 'tiny muted', row.id));
    const model = result.report?.results?.find(item => item.id === row.id); comparison.append(el('p', 'small', `Draft: ${labels[row.draft_disposition]} · ${row.draft_reason}`));
    if (model && model.caseSourceHash === row.source_hash) comparison.append(el('p', 'small', `Model: ${labels[model.actual] || model.actual} · ${model.reason || model.providerFailure || 'No diagnostic recorded.'}`)); else comparison.append(el('p', 'small muted', model ? 'This older result has no matching case fingerprint. Run evaluation again to compare it.' : 'No model result recorded for this case.'));
    if (row.status === 'human_reviewed') {
      comparison.append(el('p', 'tiny muted', `Your label: ${labels[row.expected_disposition]} · saved ${new Date(row.reviewed_at).toLocaleString()}`));
      comparison.append(button('Mark needs review', async () => { if (busy) return; busy = true; try { await api('/api/cases/reopen', { method: 'POST', data: { id: row.id, caseSet: setId, sourceHash: row.source_hash, reviewRevision: row.review_revision, expectedRunId: runId } }); drafts.delete(keyFor(row)); toast('Case returned to review. Its previous judgment stays in the audit history.'); await load(setId); } finally { busy = false; render(); } }, 'subtle'));
    } work.append(comparison);
    if (current.cases.some(item => item.status === 'human_reviewed')) { const help = el('details', 'case-comparison'); help.append(el('summary', 'small', 'Evaluate your reviewed labels'), el('p', 'small muted', 'Download the reviewed cases, or use the local export after saving. Run this command from the project folder; it calls the real model.'), el('code', 'evaluation-command', `npm run evaluate -- --game ${current.session.id} --dataset ${current.evaluationDirectory}/${current.reviewedExport} --output ${current.evaluationDirectory}/${current.reportFilename}`)); work.append(help); }
  }
  async function saveReview(row, runId, setId) {
    const draft = judgment(row); if (busy || !draft.choice) return; const rows = visible(), index = rows.findIndex(item => item.id === row.id), nextId = rows[index + 1]?.id || rows[index - 1]?.id; busy = true; render(); caseSet.disabled = filter.disabled = search.disabled = true;
    try {
      const saved = await api('/api/cases/review', { method: 'POST', data: { id: row.id, caseSet: setId, expected: draft.choice, note: draft.note, sourceHash: row.source_hash, reviewRevision: row.review_revision, expectedRunId: runId } });
      draft.dirty = false; drafts.delete(keyFor(row)); selectedId = nextId; toast(saved.exportWarning || 'Judgment saved. Live chat rules are unchanged.'); await load(setId);
    } catch (error) { toast(error.message); if (error.status === 409) await load(setId).catch(() => load('main')); }
    finally { busy = false; caseSet.disabled = filter.disabled = search.disabled = false; render(); }
  }
  caseSet.addEventListener('change', () => { selectedId = null; filter.value = 'pending'; search.value = ''; void load(caseSet.value).catch(error => toast(error.message)); });
  filter.addEventListener('change', render); search.addEventListener('input', render);
  const keyboard = event => {
    const row = current.cases.find(row => row.id === selectedId); if (!row || busy) return;
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void saveReview(row, current.session.runId, current.caseSet); return; }
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable) return;
    const value = { '1': 'allow', '2': 'reject', '3': 'review' }[event.key]; if (value) { event.preventDefault(); const draft = judgment(row); draft.choice = value; draft.dirty = true; renderCase(row); }
  };
  document.addEventListener('keydown', keyboard); window.addEventListener('pagehide', () => document.removeEventListener('keydown', keyboard), { once: true }); render();
  return async () => { const state = await api('/api/games'); if (!busy && state.session.runId !== current.session.runId) { selectedId = null; filter.value = 'pending'; search.value = ''; await load('main'); } };
}

async function boot() {
  try {
    let update;
    if (view === 'control') update = await controlView();
    else if (view === 'reader' || view === 'overlay') { app.append(createRoom(view === 'overlay')); await pollReader(); update = pollReader; }
    else if (view === 'moderator') update = await moderatorView();
    else if (view === 'status') update = await statusView();
    else if (view === 'capture') update = await captureView();
    else if (view === 'evaluate') update = await evaluationView();
    else if (view === 'rehearsal') { const { videoRehearsalView } = await import('/rehearsal.js'); update = await videoRehearsalView({ app, api, el, button, link, nav, reviewTabs, toast, color }); }
    if (update) setInterval(async () => { if (polling) return; polling = true; try { await update(); } catch (error) { toast(error.message); } finally { polling = false; } }, view === 'moderator' ? 2000 : 1200);
  } catch (error) {
    const message = el('div', 'auth-message'); message.append(icon('shield'), el('h1', '', 'Open FirstPlay controls'), el('p', '', error.message), link('Return to local controls', '/')); app.replaceChildren(message);
  }
}
void boot();
