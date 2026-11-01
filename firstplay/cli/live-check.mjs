const base = process.env.FIRSTPLAY_LOCAL_URL || `http://localhost:${process.env.PORT || 3211}`;
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)) throw new Error('Live checks use the local operator server only.');
const headers = { Origin: base, 'X-FirstPlay-Client': '1', 'Content-Type': 'application/json' };
try {
  const session = await fetch(`${base}/api/local-session`, { method: 'POST', headers, body: '{}' });
  if (!session.ok) throw new Error('Could not open a local operator session.');
  const cookie = session.headers.get('set-cookie').split(';')[0];
  const request = async (path, options = {}) => {
    const response = await fetch(base + path, { ...options, headers: { ...headers, Cookie: cookie, ...(options.headers || {}) } });
    const value = await response.json(); if (!response.ok) throw new Error(value.error || 'Request failed.'); return value;
  };
  const control = await request('/api/control');
  if (control.connection.source !== 'live' || !control.canSendTest) throw new Error('Connect Twitch and approve the optional chat-send permission in FirstPlay first.');
  const { sent } = await request('/api/live-check', { method: 'POST', body: JSON.stringify({ expectedRunId: control.session.runId }) });
  console.log(JSON.stringify({ stage: 'posted_to_connected_twitch_channel', messages: sent }));
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const state = await request('/api/moderator');
    if (state.session.runId !== control.session.runId) throw new Error('The game session changed during the live check.');
    const records = sent.map(message => state.recent.find(record => record.id === message.id));
    if (records.every(record => record && record.disposition !== 'pending')) {
      const reader = await request('/api/reader', { headers: { Authorization: `Bearer ${control.links.reader}` } });
      const safeIds = new Set(reader.messages.map(message => message.id));
      const passed = records[0].disposition === 'allow' && records[1].disposition === 'reject' && safeIds.has(sent[0].id) && !safeIds.has(sent[1].id);
      const report = { kind: 'real_twitch_model_reader_check', gameId: control.session.id, runId: control.session.runId, passed, cases: records.map(record => ({ id: record.id, disposition: record.disposition, reason: record.reason, presentInReader: safeIds.has(record.id), renderedReceipt: Boolean(record.deliveredAt) })) };
      console.log(JSON.stringify(report, null, 2)); process.exitCode = passed ? 0 : 1; break;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (Date.now() >= deadline) throw new Error('Twitch/model delivery did not complete within sixty seconds.');
} catch (error) { console.error(JSON.stringify({ ok: false, error: error.message })); process.exitCode = 1; }
