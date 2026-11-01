let youtubeReady;
function loadYouTube() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!youtubeReady) youtubeReady = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The video player did not load. Use manual timing and open the source recording.')), 15_000);
    window.onYouTubeIframeAPIReady = () => { clearTimeout(timer); resolve(window.YT); };
    const script = document.createElement('script'); script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => { clearTimeout(timer); reject(new Error('The video player is unavailable. Use manual timing and open the recording.')); }; document.head.append(script);
  });
  return youtubeReady;
}
const clock = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const outcome = { pending: 'Checking', allow: 'Allowed', reject: 'Blocked', review: 'Held for review', expired: 'Expired', removed: 'Removed' };

export async function videoRehearsalView({ app, api, el, button, link, nav, reviewTabs, toast, color }) {
  await api('/api/local-session', { method: 'POST', data: {}, token: '' });
  const metadata = await api('/api/rehearsal'); document.title = 'FirstPlay · Subnautica rehearsal';
  app.append(nav()); const main = el('main', 'replay-layout'); main.append(reviewTabs()); app.append(main);
  if (!metadata.available) {
    main.append(el('h1', '', 'Subnautica video rehearsal'), el('p', 'muted', 'Example chats run in a separate rehearsal. Your live Twitch chat and saved discoveries stay separate.'));
    const open = link('Open video rehearsal', metadata.rehearsalUrl); open.className = 'primary replay-open'; main.append(open, el('p', 'small muted', 'If it is not running, start it from the project folder with npm run demo.')); return;
  }
  let scene = metadata.chapters[0], trial = null, player, playerReadyTimer, selectedId, busy = false, sending = false, checkpointReached = false, gateChosen = false, manualMode = false, playbackMoved = false, ended = false, generation = 0, observedTime = null, observedWall = 0, currentTime = scene.start;
  const drafts = new Map();
  let savedReviews = [], savedReviewSignature = null;
  const heading = el('div', 'page-heading'), headingText = el('div'); headingText.append(el('h1', '', 'Subnautica chat rehearsal'), el('p', 'small muted', 'Fictional chat, real model decisions. Watch a discovery, then compare what reaches the streamer.')); heading.append(headingText, el('span', 'tag', 'LOCAL · NO TWITCH POSTS')); main.append(heading);
  const toolbar = el('div', 'replay-toolbar'), sceneSelect = el('select'); sceneSelect.setAttribute('aria-label', 'Rehearsal scene');
  for (const chapter of metadata.chapters) { const option = el('option', '', `${clock(chapter.start)} · ${chapter.title}`); option.value = chapter.id; sceneSelect.append(option); }
  const start = button('Start scene', startScene, 'primary'), manual = button('Use manual timing', () => { manualMode = true; checkpointReached = true; currentTime = scene.checkpoint.at; player?.pauseVideo?.(); playback.textContent = 'Manual timing · watch the source recording, then confirm or skip the checkpoint.'; draw(); }, 'subtle');
  const sendNext = button('Send next chat batch', async () => { await sendCue('after', Math.max(currentTime, scene.checkpoint.at + 4)); }, 'subtle');
  const exportLink = link('Export saved reviews', '/api/rehearsal/reviews/export'); exportLink.className = 'subtle export-link'; exportLink.download = '';
  toolbar.append(sceneSelect, start, manual, sendNext, exportLink); main.append(toolbar);
  const purpose = el('p', 'small replay-purpose', scene.purpose), playback = el('p', 'tiny muted', 'Start a scene to generate its first four messages. The next batch follows the discovery checkpoint.'); main.append(purpose, playback);
  const columns = el('div', 'replay-columns'), videoColumn = el('section', 'replay-video-column'), stage = el('div', 'replay-video'), mount = el('div', 'replay-player-mount'); mount.id = 'subnautica-rehearsal-player';
  const placeholder = el('div', 'replay-video-placeholder'); placeholder.append(el('strong', '', 'Subnautica · Part 1'), el('span', '', 'The source recording loads when you start a scene.')); stage.append(mount, placeholder); videoColumn.append(stage);
  const credit = el('p', 'tiny muted'); credit.append(document.createTextNode('Recorded gameplay: Royalty Free Game Clips · '), link('Open source recording ↗', metadata.video.url, true)); videoColumn.append(credit);
  const checkpoint = el('section', 'replay-checkpoint'); videoColumn.append(checkpoint);
  const makeChat = (title, detail, className) => { const section = el('section', `replay-chat ${className}`), header = el('div', 'replay-chat-title'); header.append(el('strong', '', title), el('span', 'tiny muted', detail)); const log = el('div', 'replay-chat-feed'); log.setAttribute('role', 'log'); log.setAttribute('aria-label', title); section.append(header, log); return { section, log }; };
  const community = makeChat('Community chat', 'Synthetic examples · all messages', 'community'), streamer = makeChat('Streamer preview', 'Only approved original messages', 'streamer');
  columns.append(videoColumn, community.section, streamer.section); main.append(columns);
  const health = el('p', 'small replay-health'); health.setAttribute('role', 'status'); main.append(health);
  const savedBox = el('details', 'replay-saved-reviews'); main.append(savedBox);
  const review = el('section', 'replay-review'), reviewHeader = el('div', 'page-heading'), list = el('div', 'replay-decisions'), detail = el('article', 'replay-judgment');
  const caption = el('div'); caption.append(el('h2', '', 'Filtering decisions'), el('p', 'tiny muted', 'Select a message to see what was known when it arrived, read the reason, and record your judgment. This is an operator view containing spoilers.')); reviewHeader.append(caption); review.append(reviewHeader); const reviewGrid = el('div', 'replay-review-grid'); reviewGrid.append(list, detail); review.append(reviewGrid); main.append(review);
  const notice = el('p', 'tiny muted replay-disclosure', 'Discovery tracking in this Subnautica rehearsal is manual. Video frames are never sent to the model. A timestamp does not prove recognition. Saved judgments remain on this computer across scenes and restarts, separate from the Test cases benchmark.'); main.append(notice);
  function labels(rows) { const ul = el('ul'); for (const row of rows) ul.append(el('li', '', row.label)); return ul; }
  function chatLine(row, isCommunity) {
    const node = el('div', 'chat-message'); node.append(el('span', 'message-time', clock(row.at)), el('span', `name ${color(row.name)}`, row.name), document.createTextNode(` ${row.text}`));
    if (isCommunity) { const disposition = row.decision?.disposition || (row.archived ? 'expired' : 'pending'); node.append(el('span', `replay-inline-status ${disposition}`, outcome[disposition])); }
    if (isCommunity && row.archived) node.append(el('span', 'replay-inline-status', 'History'));
    return node;
  }
  function draw() {
    const waiting = Boolean(trial?.screening.pending), hasAfter = trial?.sentCues.includes('after');
    start.disabled = busy; sceneSelect.disabled = busy; manual.disabled = !trial || busy || gateChosen || playbackMoved; sendNext.disabled = !trial || busy || sending || !gateChosen || hasAfter || playbackMoved; exportLink.setAttribute('aria-disabled', String(!savedReviews.length));
    if (trial) start.textContent = 'Restart scene';
    checkpoint.replaceChildren(el('div', 'row between'));
    checkpoint.firstChild.append(el('strong', '', `Discovery checkpoint · ${clock(scene.checkpoint.at)}`), el('span', 'tag', trial?.confirmed ? 'MANUALLY CONFIRMED' : gateChosen ? 'SKIPPED' : 'CONFIRMATION REQUIRED'));
    checkpoint.append(el('p', 'small muted', trial ? trial.events.map(event => event.label).join(' · ') : 'Inspect the specific discovery shown in this scene.'));
    const info = el('details'); info.append(el('summary', 'tiny', 'Evidence and exact discovery grants'));
    if (trial) { for (const event of trial.events) info.append(el('p', 'small', event.evidence_required), el('p', 'tiny muted', event.must_not_infer)); info.append(labels(trial.grants)); } else info.append(el('p', 'small muted', 'Start the scene to inspect this checkpoint.'));
    checkpoint.append(info);
    const checkpointText = trial?.confirmed ? 'New messages use the confirmed discoveries. Earlier hidden chat is not released.' : gateChosen ? 'Knowledge stays unchanged. The next batch will use the same unknown discoveries.' : checkpointReached ? waiting ? 'Finishing the first message checks. Then inspect the evidence and confirm or skip.' : 'Watch the evidence above. Confirm only what you actually saw; you can also skip it.' : `Playback pauses near ${clock(scene.checkpoint.at)} for you to inspect the discovery. If the player is unavailable, use manual timing.`;
    checkpoint.append(el('p', 'tiny muted', checkpointText));
    if (!gateChosen) {
      const actions = el('div', 'row'); const confirm = button('I saw this — confirm discovery', async () => {
        const id = trial.id; busy = true; draw();
        try { apply(await api('/api/rehearsal/confirm', { method: 'POST', data: { trialId: id, mediaTime: Math.max(currentTime, scene.checkpoint.at) } }), id); gateChosen = true; playback.textContent = manualMode ? 'Discovery confirmed. Send the next chat batch when ready.' : 'Discovery confirmed. Playback resumed; the next chat batch follows shortly.'; if (!manualMode) player?.playVideo?.(); }
        finally { busy = false; draw(); }
      }, 'primary');
      const skip = button('Continue without confirming', () => { gateChosen = true; playback.textContent = manualMode ? 'Discovery skipped. Send the next chat batch when ready.' : 'Discovery skipped. Playback resumed; knowledge is unchanged.'; if (!manualMode) player?.playVideo?.(); draw(); }, 'subtle'); confirm.disabled = skip.disabled = !trial || !checkpointReached || waiting || busy || playbackMoved; actions.append(confirm, skip); checkpoint.append(actions);
    }
    community.log.replaceChildren(); streamer.log.replaceChildren(); list.replaceChildren();
    if (!trial?.messages.length) { community.log.append(el('p', 'small muted', 'Start a scene to generate example chat.')); streamer.log.append(el('p', 'small muted', 'Approved messages will appear here after screening.')); list.append(el('p', 'small muted', 'The actual model decisions will appear here.')); }
    else {
      for (const row of trial.messages) community.log.append(chatLine(row, true));
      const visibleIds = new Set(trial.streamer.map(row => row.id));
      for (const row of trial.messages.filter(row => visibleIds.has(row.messageId))) streamer.log.append(chatLine(row, false));
      if (!visibleIds.size) streamer.log.append(el('p', 'small muted', trial.archivedMessageCount ? 'Earlier messages expired from this preview. Their original decisions remain in the review history. Restart the scene for fresh chat.' : 'No approved messages yet. Unchecked messages stay hidden.'));
      if (!trial.messages.some(row => row.messageId === selectedId)) selectedId = trial.messages[0].messageId;
      for (const row of trial.messages) {
        const disposition = row.decision?.disposition || (row.archived ? 'expired' : 'pending'); const item = button('', () => { selectedId = row.messageId; draw(); }, `replay-decision${selectedId === row.messageId ? ' selected' : ''}`); item.setAttribute('aria-label', `Review message: ${row.text}`); item.setAttribute('aria-current', String(selectedId === row.messageId));
        item.append(el('span', 'tiny muted', `${clock(row.at)} · ${row.cueId === 'before' ? 'Before checkpoint' : 'After checkpoint'}`), el('span', '', row.text), el('span', `replay-inline-status ${disposition}`, outcome[disposition])); if (row.judgment) item.append(el('span', 'tiny muted', `Your label: ${outcome[row.judgment.disposition]}`)); list.append(item);
      }
    }
    const completed = trial?.messages.filter(row => row.decision).length || 0;
    health.textContent = trial ? `${completed} / ${trial.messages.length} checked · ${trial.knownCount} discoveries confirmed · ${trial.modelLatenciesMs.length} model ${trial.modelLatenciesMs.length === 1 ? 'call' : 'calls'}${trial.modelLatenciesMs.length ? ` · last ${(trial.modelLatenciesMs.at(-1) / 1000).toFixed(1)}s` : ''}${waiting ? ' · Screening messages…' : ''}${trial.screening.state === 'unavailable' ? ' · Classifier unavailable; unchecked messages stay hidden.' : ''}` : '32 authored example messages across four scenes. Discovery mode · unsolicited hints off.';
    if (trial?.archivedMessageCount) health.textContent += ` · ${trial.archivedMessageCount} older messages kept as review history`;
    drawSavedReviews();
    drawJudgment(trial?.messages.find(row => row.messageId === selectedId));
  }
  function drawSavedReviews() {
    const signature = savedReviews.map(row => `${row.trial.id}:${row.reviewRevision}`).join('|');
    if (signature === savedReviewSignature) return; savedReviewSignature = signature;
    const total = savedReviews.reduce((sum, row) => sum + row.reviewedCount, 0), scenes = new Set(savedReviews.map(row => row.trial.chapterId)).size;
    savedBox.replaceChildren(el('summary', 'small', `Saved reviews · ${total} ${total === 1 ? 'judgment' : 'judgments'} across ${scenes} ${scenes === 1 ? 'scene' : 'scenes'}`));
    savedBox.append(el('p', 'tiny muted', 'Saved locally when you click Save judgment. Scene changes and server restarts keep these reviews. Model answers were visible during review; these are not independent accuracy measurements.'));
    if (!savedReviews.length) savedBox.append(el('p', 'small muted', 'No saved judgments yet. Select a filtering decision below to save your first review.'));
    for (const report of savedReviews) {
      const section = el('section', 'replay-saved-scene'); section.append(el('h3', '', report.chapterTitle), el('p', 'tiny muted', `${report.reviewedCount} saved · ${report.modelAgreements} same as model · ${report.modelDisagreements} different · ${new Date(report.savedAt).toLocaleString()}`));
      for (const row of report.trial.messages.filter(row => row.judgment)) {
        const item = el('div', 'replay-saved-judgment'); item.append(el('p', 'small', row.text), el('p', 'tiny muted', `Your judgment: ${outcome[row.judgment.disposition]} · Model: ${outcome[row.decision?.disposition] || 'No decision recorded'} · ${row.cueId === 'before' ? 'Before checkpoint' : 'After checkpoint'}`));
        if (row.judgment.note) item.append(el('p', 'small', row.judgment.note)); section.append(item);
      } savedBox.append(section);
    }
  }
  function drawJudgment(row) {
    detail.replaceChildren(); if (!row) { detail.append(el('h3', '', 'Review a message'), el('p', 'small muted', 'Your expected outcome and the model’s outcome are separate.')); return; }
    const draft = drafts.get(row.messageId) || { choice: row.judgment?.disposition || '', note: row.judgment?.note || '' }; drafts.set(row.messageId, draft);
    detail.append(el('h3', '', 'Should the streamer see this?'), el('p', 'replay-review-message', row.text), el('strong', 'small', `Known when received · revision ${row.knowledgeRevision}`));
    detail.append(row.knowledgeAtMessage.length ? labels(row.knowledgeAtMessage) : el('p', 'small muted', 'No discoveries confirmed.'));
    detail.append(el('p', 'small', row.decision ? `${outcome[row.decision.disposition]} · ${row.decision.reason}` : row.archived ? 'This message expired before a final decision was saved.' : 'The real model is checking this message.'));
    if (row.archived) detail.append(el('p', 'tiny muted', 'This message expired from the streamer preview. Its original text, decision and knowledge snapshot remain here for review.'));
    if (row.decision?.disposition === 'review' && row.currentDisposition === 'expired') detail.append(el('p', 'tiny muted', 'The live review TTL expired. The original hold decision is kept here for inspection.'));
    const choices = el('div', 'judgment-choices'); for (const [value, label] of [['allow', 'Allow'], ['reject', 'Block'], ['review', 'Hold for review']]) { const choice = button(label, () => { draft.choice = value; drawJudgment(row); }, 'subtle'); choice.setAttribute('aria-pressed', String(value === draft.choice)); choices.append(choice); } detail.append(choices);
    const note = el('textarea'); note.value = draft.note; note.maxLength = 1000; note.rows = 2; note.placeholder = 'Optional: explain an ambiguity'; note.setAttribute('aria-label', 'Rehearsal review note'); note.addEventListener('input', () => { draft.note = note.value; });
    const save = button('Save judgment', async () => { const id = trial.id; apply(await api('/api/rehearsal/judge', { method: 'POST', data: { trialId: id, messageId: row.messageId, disposition: draft.choice, note: draft.note } }), id); toast('Saved locally. Your judgment stays available after changing scenes or restarting.'); }); save.disabled = !draft.choice;
    detail.append(note, save); const expected = el('details'); expected.append(el('summary', 'tiny muted', 'Compare with unreviewed draft expectation'), el('p', 'small', outcome[row.draftExpected])); detail.append(expected);
  }
  function apply(value, id) { if (ended || !value.trial || id && value.trial.id !== id || id && trial?.id !== id) return; if (value.savedReviews) savedReviews = value.savedReviews; trial = value.trial; if (trial.confirmed || trial.sentCues.includes('after')) gateChosen = true; draw(); }
  async function sendCue(cueId, mediaTime) {
    if (!trial || sending || trial.sentCues.includes(cueId)) return; sending = true; const id = trial.id;
    try { apply(await api('/api/rehearsal/cue', { method: 'POST', data: { trialId: id, cueId, mediaTime } }), id); }
    finally { sending = false; draw(); }
  }
  function videoError(message) { manualMode = true; checkpointReached = true; playback.textContent = message; draw(); }
  async function startScene() {
    const version = ++generation; busy = true; manualMode = gateChosen = checkpointReached = playbackMoved = false; observedTime = null; currentTime = scene.start; drafts.clear(); selectedId = null; draw();
    try {
      const value = await api('/api/rehearsal/start', { method: 'POST', data: { chapterId: scene.id } }); if (ended || version !== generation) return; trial = value.trial; if (value.savedReviews) savedReviews = value.savedReviews; draw();
      await sendCue('before', scene.start + 1);
      playback.textContent = `Playback cues · ${clock(scene.start)}–${clock(scene.end)}. Video stops at the checkpoint; chat uses the real classifier.`;
      if (manualMode) { checkpointReached = true; currentTime = scene.checkpoint.at; playback.textContent = 'Manual timing selected. Watch the linked source and confirm or skip the checkpoint.'; return; }
      const YT = await loadYouTube(); if (ended || version !== generation) return;
      if (player) { player.mute(); player.loadVideoById({ videoId: metadata.video.id, startSeconds: scene.start, endSeconds: scene.end }); observedTime = null; }
      else {
        placeholder.hidden = true;
        playerReadyTimer = setTimeout(() => videoError('The embedded video did not become ready. Open the source recording and use manual timing; chat screening is still available.'), 12_000);
        player = new YT.Player(mount, { host: 'https://www.youtube-nocookie.com', videoId: metadata.video.id, playerVars: { origin: location.origin, playsinline: 1, start: scene.start, end: scene.end, autoplay: 0, rel: 0 }, events: { onReady: event => { clearTimeout(playerReadyTimer); if (ended) return; event.target.getIframe().referrerPolicy = 'strict-origin-when-cross-origin'; event.target.mute(); event.target.playVideo(); }, onError: () => { clearTimeout(playerReadyTimer); videoError('YouTube could not play this embed. Open the recording and use manual timing; the chat checks still work.'); } } });
      }
    } catch (error) { videoError(error.message); }
    finally { busy = false; draw(); }
  }
  sceneSelect.addEventListener('change', () => { generation++; scene = metadata.chapters.find(row => row.id === sceneSelect.value); player?.pauseVideo?.(); trial = null; selectedId = null; gateChosen = checkpointReached = playbackMoved = false; observedTime = null; currentTime = scene.start; purpose.textContent = scene.purpose; start.textContent = 'Start scene'; playback.textContent = 'Start the selected scene to begin a new isolated trial.'; draw(); });
  exportLink.addEventListener('click', event => { if (!savedReviews.length) event.preventDefault(); });
  const timer = setInterval(() => {
    if (!trial || manualMode || playbackMoved || busy || !player?.getCurrentTime) return;
    const now = performance.now(), position = player.getCurrentTime(), playing = player.getPlayerState() === 1;
    if (observedTime === null && (!playing || position < scene.start - 1)) return;
    if (observedTime !== null && (position < observedTime - 1 || position - observedTime > (now - observedWall) / 1000 + 3)) { playbackMoved = true; player.pauseVideo(); playback.textContent = 'Playback was moved. Restart this scene to align chat and discoveries; seeking never grants knowledge.'; draw(); return; }
    observedTime = currentTime = position; observedWall = now;
    if (!playing) return;
    if (position >= scene.checkpoint.at && !gateChosen) { player.pauseVideo(); checkpointReached = true; playback.textContent = `${clock(position)} · Inspect the discovery checkpoint, then confirm or continue without it.`; draw(); return; }
    if (gateChosen && position >= scene.checkpoint.at + 4) void sendCue('after', Math.min(position, scene.end)).catch(error => toast(error.message));
    if (position >= scene.end - .5) player.pauseVideo();
  }, 500);
  window.addEventListener('pagehide', () => { ended = true; generation++; clearInterval(timer); clearTimeout(playerReadyTimer); player?.destroy?.(); }, { once: true });
  let existing;
  try { existing = await api('/api/rehearsal/state'); }
  catch { existing = { trial: null }; playback.textContent = 'The previous rehearsal could not be restored. Start a new scene to continue.'; }
  if (existing.savedReviews) savedReviews = existing.savedReviews;
  if (existing.trial) {
    trial = existing.trial; scene = metadata.chapters.find(row => row.id === trial.chapterId); sceneSelect.value = scene.id; purpose.textContent = scene.purpose;
    manualMode = checkpointReached = true; gateChosen = trial.confirmed || trial.sentCues.includes('after'); currentTime = Math.max(trial.lastPlaybackTime, scene.checkpoint.at);
    playback.textContent = 'Resumed the existing chat trial with manual timing. Restart scene to replay the video and chat together.';
  }
  if (!trial && savedReviews.length) savedBox.open = true;
  draw();
  return async () => {
    if (!trial || busy) return; const id = trial.id, value = await api('/api/rehearsal/state');
    if (value.trial?.id !== id) { player?.pauseVideo?.(); playbackMoved = true; playback.textContent = 'Another window replaced this rehearsal. Restart the scene to continue.'; draw(); return; }
    // Avoid replacing a note while the operator is typing in it.
    if (detail.contains(document.activeElement) && document.activeElement.tagName === 'TEXTAREA') { trial = value.trial; return; }
    apply(value, id);
  };
}
