const status = document.querySelector('#status');
let current;
async function send(message) { const result = await chrome.runtime.sendMessage(message); if (!result?.ok) throw new Error(result?.error || 'FirstPlay could not respond.'); return result.value; }
function render(state) {
  current = state; document.querySelector('#pairing').hidden = state.paired; document.querySelector('#paired').hidden = !state.paired;
  status.textContent = state.paired ? state.enabled ? 'FirstPlay is on. Supported Twitch chat panels are protected.' : 'FirstPlay is off. Twitch chat is unfiltered.' : 'Pair with your local FirstPlay service.';
  document.querySelector('#channel').textContent = state.channel ? `Paired channel: ${state.channel}` : '';
  const toggle = document.querySelector('#toggle'); toggle.textContent = state.enabled ? 'FirstPlay on' : 'FirstPlay off'; toggle.setAttribute('aria-checked', String(state.enabled));
}
function action(selector, fn) { const button = document.querySelector(selector); button.addEventListener('click', async () => { button.disabled = true; try { render(await fn()); } catch (error) { status.textContent = error.message; } finally { button.disabled = false; } }); }
action('#pair', async () => {
  // The user-initiated popup Document can host a local-network prompt if Chrome requires it.
  // The background worker must not be the first context to trigger that permission.
  status.textContent = 'Connecting to your local FirstPlay service…';
  let health; try { health = await fetch('http://localhost:3211/api/health', { credentials: 'omit', cache: 'no-store', targetAddressSpace: 'loopback', signal: AbortSignal.timeout(5000) }); }
  catch { throw new Error('Could not reach FirstPlay. Start the local service and allow localhost access if Chrome prompts.'); }
  if (!health.ok) throw new Error('The local FirstPlay service could not respond.');
  return send({ type: 'pair', code: document.querySelector('#code').value.trim() });
});
action('#toggle', () => send({ type: 'set-enabled', enabled: !current.enabled }));
action('#forget', () => send({ type: 'forget' }));
send({ type: 'status' }).then(render, error => { status.textContent = error.message; });
