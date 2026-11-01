import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GameCatalog } from '../ml/catalog.mjs';
import { createApplication } from '../server.mjs';

// Explicit isolation: this process never configures Twitch or a public gateway.
// Real text inference still uses the configured provider and its normal usage.
const root = fileURLToPath(new URL('../../', import.meta.url));
const port = Number(process.env.FIRSTPLAY_DEMO_PORT || 3213);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('FIRSTPLAY_DEMO_PORT must be a valid port.');
const app = await createApplication({ catalog: await GameCatalog.load('subnautica'), config: {
  port, dataDirectory: resolve(root, '.data/firstplay-demo'), clientId: '', clientSecret: '', viewerOrigin: '', rehearsal: true, cookiePrefix: 'fp_demo',
} });
try {
  const url = await app.start();
  console.log(`FirstPlay local rehearsal: ${url}\nSubnautica text screening · no Twitch connection or posts.\nSeparate data: .data/firstplay-demo\nProvider: ${app.engine.provider.name} (real inference, normal account usage)`);
} catch (error) {
  await app.close().catch(() => {}); throw error;
}
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  if (stopping) return; stopping = true; void app.close().then(() => process.exit(0));
});
