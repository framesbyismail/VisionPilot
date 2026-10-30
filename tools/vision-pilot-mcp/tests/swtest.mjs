// Service worker update test: build A -> visit -> change resize.js -> build B -> reload once -> the new file must be served,
// and a cached model must survive the update.
import {execSync} from 'node:child_process';
import fs from 'node:fs';
const {CONFIG} = await import('../lib.js');
const REPO = CONFIG.siteDir;
const MARK = '\nwindow.__vpBuildMark = "B";\n';
const build = () => execSync('node scripts/build-site.mjs', {cwd:REPO, env:{...process.env, VP_OUT:'_site'}}).toString().trim().split('\n').pop();
const undo = () => fs.writeFileSync(REPO + '/resize.js', fs.readFileSync(REPO + '/resize.js', 'utf8').split(MARK).join(''));
process.env.VP_SITE_DIR = REPO + '/_site';
const vp = await import('../lib.js');
const wait = ms => new Promise(r => setTimeout(r, ms));
// the page may reload itself once when the new service worker takes over: try again after it
const S = async s => { for (let i = 0; ; i++) { try { return await vp.evaluate({script:s}); } catch (e) { if (i > 4 || !/context was destroyed|navigation/i.test(e.message)) throw e; await wait(1500); } } };
const reload = async () => { await S('setTimeout(() => location.reload(), 10); return 1').catch(() => {}); await wait(5000); };
const state = () => S(`
  const v = await fetch('version.json', {cache:'no-store'}).then(async r => r.ok ? r.json() : ({version:'HTTP' + r.status})).catch(e => ({version:'ERR ' + e.message}));
  const m = await (await caches.open('visionpilot-meta')).match('./__vp-manifest.json');
  const stored = m ? (await m.json()).version : null;
  const app = await caches.open('visionpilot-app-v44');
  const c = await app.match(location.origin + '/resize.js', {ignoreSearch:true});
  return {mark: window.__vpBuildMark || 'none', site: String(v.version).slice(0, 7), stored: String(stored).slice(0, 7),
    cachedHasMark: c ? (await c.text()).includes('__vpBuildMark') : 'no entry', controlled: !!navigator.serviceWorker.controller};`);
try {
  console.log('A', build());
  await vp.startWebsite({width:1400, height:900});
  await S('for (let i = 0; i < 100 && !navigator.serviceWorker.controller; i++) await new Promise(r => setTimeout(r, 100)); return 1');
  await S(`const c = await caches.open('visionpilot-models'); await c.put(location.origin + '/models/fake-test.onnx', new Response('x'.repeat(2000))); return 1`);
  await reload();
  console.log('after A reload', JSON.stringify(await state()));
  fs.appendFileSync(REPO + '/resize.js', MARK);
  console.log('B', build());
  await reload();
  console.log('after B reload', JSON.stringify(await state()));
  console.log('fake model kept:', await S(`return !!(await (await caches.open('visionpilot-models')).match(location.origin + '/models/fake-test.onnx'))`));
} finally {
  undo();
  await vp.shutdown().catch(() => {});
}
