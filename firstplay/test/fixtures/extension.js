const probe = document.querySelector('#guard-probe');
probe.textContent = getComputedStyle(document.body).display === 'none' && getComputedStyle(document.querySelector('#live-page-chat')).display === 'none' ? 'PASS: native chat was hidden before content.js ran.' : 'FAIL: native chat guard was missing.';
const listeners = [];
let stale = false;
window.chrome = { runtime: { id: 'a'.repeat(32), onMessage: { addListener: listener => listeners.push(listener) }, sendMessage: async message => {
  if (stale && message.type === 'status') { stale = false; await new Promise(resolve => setTimeout(resolve, 150)); return { ok: true, value: { enabled: false, paired: false, channel: null, revision: 0 } }; }
  return (await fetch('/bridge', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-FirstPlay-Client': '1' }, body: JSON.stringify(message) })).json();
} } };
new MutationObserver(() => { if (document.documentElement.getAttribute('data-firstplay-native') === 'show') probe.textContent = 'FAIL: native chat was uncovered.'; }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-firstplay-native'] });
document.querySelector('#stale').addEventListener('click', () => { stale = true; for (const listener of listeners) listener({ type: 'firstplay-state', enabled: true, paired: true, channel: 'drpickles12321', revision: 1 }, { id: 'a'.repeat(32) }); });
async function offline(value) { await fetch('/offline', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-FirstPlay-Client': '1' }, body: JSON.stringify({ offline: value }) }); }
document.querySelector('#offline').addEventListener('click', () => void offline(true)); document.querySelector('#restore').addEventListener('click', () => void offline(false));
function navigate(path) { history.pushState({}, '', path); document.querySelector('#native-sentinel').textContent = 'RAW-NATIVE-SENTINEL — navigation must not reveal this.'; }
document.querySelector('#navigate').addEventListener('click', () => navigate('/other_channel')); document.querySelector('#return').addEventListener('click', () => navigate('/drpickles12321'));
document.querySelector('#layout').addEventListener('click', () => { const node = document.querySelector('#live-page-chat'); node.id = 'unknown-new-chat'; node.parentElement.className = 'unknown-layout'; node.parentElement.removeAttribute('data-a-target'); });
