import { spawn } from 'node:child_process';
import { readFile, mkdir, access, rename, rm, chmod } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const source = fileURLToPath(new URL('../native/TextRecognizer.m', import.meta.url));
const cache = fileURLToPath(new URL('../../.data/firstplay-ocr/', import.meta.url));
let compilation;
const failure = (code, message) => Object.assign(new Error(message), { code });
const environment = () => Object.fromEntries(['PATH', 'HOME', 'USER', 'TMPDIR', 'LANG', 'LC_ALL', 'DEVELOPER_DIR', 'SDKROOT'].filter(key => process.env[key]).map(key => [key, process.env[key]]));

export function runLocalProcess(binary, args, { signal, timeoutMs = 12_000 } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(failure('aborted', 'The recognition check was stopped.'));
    const child = spawn(binary, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'], env: environment() });
    let output = '', settled = false;
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); error ? reject(error) : resolve(value); };
    const abort = () => { child.kill('SIGKILL'); finish(failure('aborted', 'The recognition check was stopped.')); };
    const timer = setTimeout(() => { child.kill('SIGKILL'); finish(failure('local_ocr_timeout', 'On-device recognition took too long. Try again.')); }, timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    child.on('error', () => finish(failure('local_ocr_unavailable', 'On-device recognition could not start. Check the macOS developer tools.')));
    child.stdout.on('data', chunk => { output += chunk; if (output.length > 300_000) { child.kill('SIGKILL'); finish(failure('local_ocr_output', 'Recognition returned too much text.')); } });
    child.stderr.on('data', () => {});
    child.on('close', code => { if (code !== 0) finish(failure('local_ocr_failed', 'On-device recognition could not read these frames.')); else finish(null, output); });
  });
}

export class NativeTextRecognizer {
  constructor({ platform = process.platform } = {}) { this.platform = platform; this.name = 'apple-vision-ocr'; }
  async prepare() {
    if (this.platform !== 'darwin') throw failure('local_ocr_unsupported', 'This on-device detector currently requires macOS.');
    if (!compilation) compilation = (async () => {
      const hash = createHash('sha256').update(await readFile(source)).update(process.arch).digest('hex').slice(0, 20), binary = join(cache, `text-recognizer-${hash}`);
      await mkdir(cache, { recursive: true, mode: 0o700 });
      try { await access(binary, constants.X_OK); return binary; } catch { /* compile our source once */ }
      const temporary = `${binary}-${randomUUID()}`;
      try { await runLocalProcess('/usr/bin/clang', ['-fobjc-arc', '-O2', source, '-framework', 'Foundation', '-framework', 'Vision', '-framework', 'ImageIO', '-framework', 'AppKit', '-o', temporary], { timeoutMs: 60_000 }); await chmod(temporary, 0o700); await rename(temporary, binary); }
      finally { await rm(temporary, { force: true }); }
      return binary;
    })().catch(error => { compilation = null; throw failure('local_ocr_build', 'On-device OCR could not be built. Check the macOS Command Line Tools installation, then try again.'); });
    return compilation;
  }
  async recognize(imagePaths, { signal } = {}) {
    const started = performance.now(), binary = await this.prepare();
    if (signal?.aborted) throw failure('aborted', 'The recognition check was stopped.');
    const output = await runLocalProcess(binary, imagePaths, { signal }); let frames;
    try { frames = JSON.parse(output); } catch { throw failure('local_ocr_output', 'On-device recognition returned an invalid result.'); }
    if (!Array.isArray(frames) || frames.length !== 2 || frames.some(frame => !Number.isInteger(frame.width) || !Number.isInteger(frame.height) || !Array.isArray(frame.lines) || frame.lines.length > 200 || frame.lines.some(line => typeof line.text !== 'string' || line.text.length > 500 || !Number.isFinite(line.confidence) || line.confidence < 0 || line.confidence > 1 || !Array.isArray(line.bounds) || line.bounds.length !== 4 || line.bounds.some(value => !Number.isFinite(value) || value < 0 || value > 1)))) throw failure('local_ocr_output', 'On-device recognition returned an invalid result.');
    return { frames, metrics: { provider: this.name, latencyMs: Math.round(performance.now() - started), local: true } };
  }
}

const clean = text => text.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
export const LOCAL_DISCOVERIES = Object.freeze([
  { factId: 'sn1.boomerang.named', eventId: 'sn1.local.boomerang_name', label: 'Boomerang', context: 'inventory' },
  { factId: 'sn1.pda.visible', eventId: 'sn1.local.pda', label: 'PDA inventory screen', context: 'pda' },
  { factId: 'sn1.scanner.named', eventId: 'sn1.local.scanner', label: 'Scanner', context: 'blueprints' },
  { factId: 'sn1.repair_tool.named', eventId: 'sn1.local.repair_tool', label: 'Repair Tool', context: 'blueprints' },
  { factId: 'sn1.seaglide.name_visible', eventId: 'sn1.local.seaglide', label: 'Seaglide', context: 'blueprints' },
  { factId: 'sn1.cave_sulfur.named', eventId: 'sn1.local.cave_sulfur', label: 'Cave Sulfur', context: 'ingredient' },
  { factId: 'sn1.writhing_weed.named', eventId: 'sn1.local.writhing_weed', label: 'Writhing Weed', context: 'world' },
  { factId: 'sn1.creepvine.named', eventId: 'sn1.local.creepvine', label: 'Creepvine', context: 'world' },
]);
const exact = (frame, value, threshold = .8) => frame.lines.find(line => line.confidence >= threshold && clean(line.text) === clean(value));
const below = (line, title, distance = .4) => line.bounds[1] > title.bounds[1] && line.bounds[1] - title.bounds[1] < distance;
function boomerangTooltip(frame) {
  const inventory = exact(frame, 'inventory'), name = exact(frame, 'boomerang');
  if (!inventory) return { reason: 'No clear inventory heading found.' };
  if (!name) return { reason: 'No clear Boomerang item label found.' };
  const [x, y, width, height] = name.bounds;
  if (!below(name, inventory, .6) || height < .008 || width < .025) return { reason: 'The item label is outside the expected inventory layout.' };
  const properties = frame.lines.filter(line => line.bounds[1] > y && line.bounds[1] - y < .23 && Math.abs(line.bounds[0] - x) < .12);
  const food = properties.find(line => line.confidence >= .3 && /^food\s*[:+−-]/i.test(clean(line.text)));
  // Vision on newer macOS can emit Cyrillic H/O lookalikes in this numeric UI marker.
  // Accept those only for tooltip context; item names still require their exact spelling.
  const water = properties.find(line => line.confidence >= .3 && /^[h\u043d][2z][o0\u043e]\s*[:+−-]/i.test(clean(line.text)));
  if (!food || !water) return { reason: 'The inventory name is visible, but the tooltip context is too small or unclear. Enlarge the game view.' };
  return { name, evidence: [inventory, name, food, water], strict: name.confidence >= .95 && inventory.confidence >= .9 };
}
function screenLabel(frame, definition) {
  if (definition.context === 'inventory') return boomerangTooltip(frame);
  const inventory = exact(frame, 'inventory'), storage = exact(frame, 'storage'), blueprints = exact(frame, 'blueprints');
  if (definition.context === 'pda') {
    if (!inventory || !storage || Math.abs(inventory.bounds[1] - storage.bounds[1]) > .06 || storage.bounds[0] - inventory.bounds[0] < .15) return {};
    return { name: inventory, evidence: [inventory, storage], strict: inventory.confidence >= .95 && storage.confidence >= .95 };
  }
  if (definition.context === 'blueprints' || definition.context === 'ingredient') {
    const name = exact(frame, definition.label), flare = exact(frame, 'flare');
    if (!blueprints || !name || !below(name, blueprints, .7) || name.bounds[2] < .025) return {};
    if (definition.context === 'ingredient' && (!flare || !below(name, flare, .25) || Math.abs(name.bounds[0] - flare.bounds[0]) > .18)) return {};
    return { name, evidence: [blueprints, ...(flare && definition.context === 'ingredient' ? [flare] : []), name], strict: name.confidence >= .95 && blueprints.confidence >= .95 && (!flare || definition.context !== 'ingredient' || flare.confidence >= .95) };
  }
  if (definition.context === 'world') {
    const name = exact(frame, definition.label);
    const oxygen = frame.lines.find(line => line.confidence >= .3 && /^[o0]\s*2(?:\s+\d{1,3})?$/.test(clean(line.text)) && line.bounds[0] < .45 && line.bounds[1] > .4);
    if (!name || !oxygen || name.bounds[0] < .3 || name.bounds[0] > .7 || name.bounds[1] < .25 || name.bounds[1] > .75 || oxygen.bounds[0] >= name.bounds[0]) return {};
    const prompt = frame.lines.find(line => line.confidence >= .8 && /^(?:pick up|cut(?: with knife)?|harvest)(?:\s*\([^)]*\))?$/.test(clean(line.text)) && Math.abs(line.bounds[0] - name.bounds[0]) < .15 && Math.abs(line.bounds[1] - name.bounds[1]) < .12);
    if (!prompt) return {};
    return { name, evidence: [name, prompt, oxygen], strict: name.confidence >= .95 && prompt.confidence >= .95 };
  }
  return {};
}
function consistentPair(frames, definition) {
  const matches = frames.map(frame => screenLabel(frame, definition));
  const missing = matches.find(match => !match.name);
  if (missing) return { found: false, diagnostic: missing.reason || 'No supported label in a clear game UI context.' };
  const [first, second] = matches.map(match => match.name.bounds);
  if (Math.abs(first[0] - second[0]) > .08 || Math.abs(first[1] - second[1]) > .08) return { found: false, diagnostic: 'The label moved too far between evidence frames.' };
  return { found: true, strict: matches.every(match => match.strict), diagnostic: 'A consistent ' + definition.label + ' label was read in both frames.', evidence: matches.map(match => match.evidence.map(line => ({ text: line.text, bounds: line.bounds }))) };
}
export function detectBoomerangName(frames) { return consistentPair(frames, LOCAL_DISCOVERIES[0]); }
export function detectSubnauticaLabels(frames) {
  return LOCAL_DISCOVERIES.map(definition => ({ definition, ...consistentPair(frames, definition) })).filter(result => result.found);
}
export function subnauticaLabelDetector({ recognizer = new NativeTextRecognizer(), isKnown = () => false } = {}) {
  return { ...LOCAL_DISCOVERIES[0], definitions: LOCAL_DISCOVERIES, intervalMs: 3000, isKnown,
    async run({ imagePaths, signal }) {
      const response = await recognizer.recognize(imagePaths, { signal });
      const matches = detectSubnauticaLabels(response.frames).filter(result => !isKnown(result.definition.factId));
      const proofs = Object.fromEntries(matches.map(result => [result.definition.eventId, { strict: result.strict, evidence: result.evidence }]));
      return { value: { events: matches.map(({ definition }) => ({ event_id: definition.eventId, positive_frame_indices: [0, 1], uncertain: false, explanation: definition.label + ' was read in two matching game UI frames. Establishes only the listed fact; no recipe or action is inferred.' })) }, proofs,
        diagnostic: matches.length ? 'Read: ' + matches.map(result => result.definition.label).join(', ') + '.' : 'Watching for supported inventory, blueprint and target labels. Enlarge the game if text is small.', metrics: response.metrics };
    } };
}
