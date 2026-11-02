const probe = document.querySelector('#guard-probe'), dashboard = location.pathname.startsWith('/u/');
const firstNative = document.querySelector(dashboard ? '.live-chat' : '#live-page-chat');
const initiallyHidden = dashboard ? getComputedStyle(firstNative).display === 'none' : getComputedStyle(document.body).display === 'none' && getComputedStyle(firstNative).display === 'none';
probe.textContent = initiallyHidden ? 'PASS: native chat was hidden before content.js ran.' : 'FAIL: native chat guard was missing.';
const listeners = []; let stale = false, expectedProtection = true;
window.chrome = { runtime: { id: 'a'.repeat(32), onMessage: { addListener: listener => listeners.push(listener) }, sendMessage: async message => {
  if (stale && message.type === 'status') { stale = false; await new Promise(resolve => setTimeout(resolve, 150)); return { ok: true, value: { enabled: false, paired: false, channel: null, revision: 0 } }; }
  return (await fetch('/bridge', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-FirstPlay-Client': '1' }, body: JSON.stringify(message) })).json();
} } };
new MutationObserver(() => { if (expectedProtection && document.documentElement.getAttribute('data-firstplay-native') === 'show') probe.textContent = 'FAIL: native chat was uncovered.'; }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-firstplay-native'] });
const post = async (path, data) => (await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-FirstPlay-Client': '1' }, body: JSON.stringify(data) })).json();
const click = (id, action) => document.getElementById(id)?.addEventListener('click', action);
click('stale', async () => { const value = await post('/protection', { enabled: true }); expectedProtection = true; stale = true; for (const listener of listeners) listener({ type: 'firstplay-state', ...value }, { id: 'a'.repeat(32) }); });
click('offline', () => void post('/offline', { offline: true })); click('restore', () => void post('/offline', { offline: false }));
function navigate(path) { history.pushState({}, '', path); document.querySelector('#native-sentinel').textContent = 'RAW-NATIVE-SENTINEL — navigation must not reveal this.'; }
click('navigate', () => navigate('/other_channel')); click('return', () => navigate('/drpickles12321'));
click('layout', () => {
  const node = document.querySelector(dashboard ? '.live-chat' : '#live-page-chat');
  node.id = 'unknown-new-chat'; node.className = 'unknown-native-layout';
  if (dashboard) { const nested = node.querySelector('.chat-room'); nested.className = 'unknown-room'; nested.removeAttribute('data-test-selector'); }
  else { node.parentElement.className = 'unknown-layout'; node.parentElement.removeAttribute('data-a-target'); }
});
if (dashboard) {
  const template = document.querySelector('#chat-slot').innerHTML;
  async function toggle(enabled) { expectedProtection = enabled; const value = await post('/protection', { enabled }); for (const listener of listeners) listener({ type: 'firstplay-state', ...value }, { id: 'a'.repeat(32) }); }
  click('off', () => void toggle(false)); click('on', () => void toggle(true));
  click('resize', () => document.querySelector('#manager').classList.toggle('narrow'));
  click('replace', () => { document.querySelector('#chat-slot').innerHTML = template; });
  click('hide', () => { document.querySelector('#chat-slot').hidden = true; }); click('show', () => { document.querySelector('#chat-slot').hidden = false; });
  click('queue', () => void post('/greeting', {}));
  async function delivery() { try { const value = await (await fetch('/fixture-state')).json(); document.querySelector('#delivery-probe').textContent = `Approved: ${value.approved} · rendered: ${value.rendered} · rejected: ${value.rejected} · fixture protection ${value.enabled ? 'on' : 'off'}`; } catch { /* A stopped local fixture has no data to show. */ } }
  void delivery(); setInterval(delivery, 700);
}
