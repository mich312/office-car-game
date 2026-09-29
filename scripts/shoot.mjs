// Screenshots of a running game, from the car's seat — for level and model
// work, where "does it look right" is the only test that matters.
//
//   # once: playwright lives outside the repo
//   mkdir -p /tmp/pw && (cd /tmp/pw && npm i --no-save playwright@1.56)
//   # a server on the map you're working on (build the client first)
//   npm run build && RC_MAP=cellar PORT=8123 node server/src/index.js &
//   # then
//   PW_DIR=/tmp/pw PORT=8123 node scripts/shoot.mjs out/ spots.json
//   PW_DIR=/tmp/pw PORT=8123 node scripts/shoot.mjs out/ '[["corridor",-12,1,90]]' --plan
//
// spots: JSON array (inline or a file) of [name, x, z, yawDegrees] in metres;
// yaw 0 faces north (+z), 90 east. Each spot parks your car there and shoots
// out/<name>.png. --plan adds out/plan.png, the whole floor from above.
// (From above the world reads mirrored: north is up, east is on the LEFT.)
// --wide makes 1600×900 shots instead of 1100×620. Chromium comes from
// /opt/pw-browsers/chromium (the cloud image) unless CHROMIUM says otherwise.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const [outDir = 'shots', spotsArg = '[]', ...flags] = process.argv.slice(2);
const req = createRequire(path.resolve(process.env.PW_DIR || process.cwd()) + '/');
const { chromium } = req('playwright');
const port = process.env.PORT || 8080;
const spots = JSON.parse(fs.existsSync(spotsArg) ? fs.readFileSync(spotsArg, 'utf8') : spotsArg);
const wide = flags.includes('--wide');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: wide ? { width: 1600, height: 900 } : { width: 1100, height: 620 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 240)}`); });

await page.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
await page.waitForTimeout(6000);
await page.evaluate(() => window.__rcStore.setState({ name: 'Shooter', screen: 'game', drivingTest: 'done' }));
await page.waitForTimeout(12000);
await page.addStyleTag({ content: '.lobby-rail{display:none!important}' });
const info = await page.evaluate(() => ({ map: window.__rcStore.getState().mapId, phase: window.__rcStore.getState().phase }));
console.log(`map ${info.map} · phase ${info.phase}`);

for (const [name, x, z, yawDeg = 0] of spots) {
  await page.evaluate(([x, z, yaw]) => window.__rcTeleport?.(x, z, yaw), [x, z, (yawDeg * Math.PI) / 180]);
  await page.waitForTimeout(2400);
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
  const gl = await page.evaluate(() => window.__glStats || null);
  console.log(`${name}.png${gl ? ` · ${gl.calls} draw calls, ${(gl.triangles / 1000).toFixed(0)}k tris` : ''}`);
}

if (flags.includes('--plan')) {
  // photo mode + the free-camera hook: straight down over the middle
  await page.evaluate(() => {
    window.__rcStore.setState({ photoMode: true });
    // world units: the whole floor fits a 60° view from this height
    window.__rcCamOverride = { x: 0.1, y: 130, z: -8, tx: 0, ty: 0, tz: 0 };
  });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(outDir, 'plan.png') });
  console.log('plan.png');
}

console.log('ERRORS', [...new Set(errors)].join('\n') || 'none');
await browser.close();
process.exit(0);
