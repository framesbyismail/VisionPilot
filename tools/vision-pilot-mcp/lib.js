// Vision Pilot MCP — the browser / desktop driver behind the MCP tools (also usable from plain Node scripts).
// It starts the website from the GitHub folder (or the live site) in Chrome, or the Electron desktop app,
// and talks to the running app through Chrome DevTools (puppeteer-core) and the app's window.VPTest hooks.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn, execSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// inside the GitHub repo this folder is tools/vision-pilot-mcp (site = the repo, app = desktop/);
// on its own it sits next to VisionPilot-GitHub and "Vision Pilot"
const IN_REPO = fs.existsSync(path.resolve(HERE, '..', '..', 'scripts', 'build-site.mjs'));
export const CONFIG = {
  siteDir: process.env.VP_SITE_DIR || (IN_REPO ? path.resolve(HERE, '..', '..') : path.resolve(HERE, '..', 'VisionPilot-GitHub')),
  desktopDir: process.env.VP_DESKTOP_DIR || (IN_REPO ? path.resolve(HERE, '..', '..', 'desktop') : path.resolve(HERE, '..', 'Vision Pilot')),
  port: +(process.env.VP_PORT || 8775),
  debugPort: +(process.env.VP_DEBUG_PORT || 9333),
  repo: process.env.VP_REPO || 'framesbyismail/VisionPilot',
  shotsDir: process.env.VP_SHOTS_DIR || path.join(os.tmpdir(), 'vision-pilot-shots')
};
const MIME = {'.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'text/javascript', '.mjs':'text/javascript', '.json':'application/json',
  '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.wasm':'application/wasm',
  '.onnx':'application/octet-stream', '.tflite':'application/octet-stream', '.glb':'model/gltf-binary', '.gltf':'model/gltf+json', '.zip':'application/zip'};

const st = {server:null, browser:null, page:null, desktop:null, target:null};
const sleep = ms => new Promise(r => setTimeout(r, ms));

function findChrome() {
  const c = [process.env.VP_CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  const hit = c.find(p => p && fs.existsSync(p));
  if (!hit) throw new Error('Chrome or Edge was not found. Set VP_CHROME to the browser executable.');
  return hit;
}

// ---------- start / stop ----------
function serveSite(dir, port) {
  dir = path.resolve(dir); // same slashes as the paths built below (Windows)
  return new Promise((resolve, reject) => {
    const srv = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      const fp = path.join(dir, u === '/' ? 'index.html' : u.slice(1));
      if (!fp.startsWith(dir) || !fs.existsSync(fp) || !fs.statSync(fp).isFile()) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, {'content-type':MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'cache-control':'no-store'});
      fs.createReadStream(fp).pipe(r);
    });
    srv.once('error', reject);
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}

// withExtension: load the Vision Pilot Chrome extension from the GitHub folder; profileDir keeps sign-ins (ChatGPT, Claude,
// Gemini) between runs, so you sign in once in that window and later tests reuse it. Both need a visible window.
export async function startWebsite({url, width = 1600, height = 950, headless = true, withExtension = false, profileDir} = {}) {
  await stopWebsite();
  let target = url;
  if (!target) { st.server = await serveSite(CONFIG.siteDir, CONFIG.port); target = `http://localhost:${CONFIG.port}/`; }
  const ext = path.join(CONFIG.siteDir, 'extension');
  const args = [`--window-size=${width},${height}`, '--no-first-run', '--no-default-browser-check'];
  if (headless && !withExtension) args.push('--enable-unsafe-swiftshader', '--use-angle=swiftshader');
  // Chrome 137+ ignores --load-extension: the extension is loaded through the debugging pipe instead (Extensions.loadUnpacked)
  if (withExtension) args.push('--enable-unsafe-extension-debugging');
  st.browser = await puppeteer.launch({executablePath:findChrome(), headless:(headless && !withExtension) ? 'new' : false, args, pipe:withExtension,
    userDataDir:profileDir || (withExtension ? path.resolve(HERE, '..', 'vp-test-browser-profile') : undefined),
    ignoreDefaultArgs:withExtension ? ['--disable-extensions'] : undefined, defaultViewport:null});
  if (withExtension) {
    const cdp = await st.browser.target().createCDPSession();
    st.extId = (await cdp.send('Extensions.loadUnpacked', {path:ext})).id;
  }
  st.page = (await st.browser.pages())[0] || await st.browser.newPage();
  if (!withExtension) await st.page.setViewport({width, height});
  hookPage(st.page);
  await st.page.goto(target, {waitUntil:'domcontentloaded', timeout:60000});
  st.target = 'web';
  const ready = await waitReady();
  return {ok:true, target, siteDir:url ? null : CONFIG.siteDir, ...ready};
}
// One real job through the extension: the AI model describes a sample image (start_website with withExtension first).
// ChatGPT also works signed out; Claude and Gemini need a profileDir where the person signed in once.
export async function testAiModel({model = 'gpt', image = 'add/add_image_1.png'} = {}) {
  if (!st.page || !st.extId) return {ok:false, error:'Start the website with withExtension: true first.'};
  const t0 = Date.now();
  const r = await st.page.evaluate(async (model, image) => {
    const img = new Image(); img.src = image; await img.decode();
    try { return {text: await VPAIBridge.runReferenceImageStep({id:'mcp-' + Date.now(), img}, model)}; } catch (e) { return {error: e.message}; }
  }, model, image);
  return {ok:!!r.text, model, seconds:Math.round((Date.now() - t0) / 1000), ...r};
}
export async function stopWebsite() {
  if (st.target === 'web' && st.browser) await st.browser.close().catch(() => {});
  if (st.server) await new Promise(r => st.server.close(r));
  st.server = null; if (st.target === 'web') { st.browser = null; st.page = null; st.target = null; st.extId = null; }
  return {ok:true};
}

export async function startDesktop({width = 1600, height = 950} = {}) {
  await stopDesktop();
  const dir = CONFIG.desktopDir;
  if (!fs.existsSync(path.join(dir, 'package.json'))) throw new Error('Desktop app folder not found: ' + dir);
  const electron = path.join(dir, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron');
  // the folder name has a space ("Vision Pilot"): quote the command for the Windows shell
  st.desktop = spawn(process.platform === 'win32' ? '"' + electron + '"' : electron, ['.', `--remote-debugging-port=${CONFIG.debugPort}`, `--vp-window=${width}x${height}`],
    {cwd:dir, shell:process.platform === 'win32', stdio:'ignore', env:{...process.env, VP_TEST_MODE:'1'}});
  // wait for the DevTools endpoint, then attach to the main window (not the splash)
  let browser;
  for (let i = 0; i < 120 && !browser; i++) {
    await sleep(500);
    browser = await puppeteer.connect({browserURL:`http://127.0.0.1:${CONFIG.debugPort}`, defaultViewport:null}).catch(() => null);
  }
  if (!browser) throw new Error('The desktop app did not open its debug port.');
  st.browser = browser;
  let page;
  for (let i = 0; i < 120 && !page; i++) {
    const pages = await browser.pages();
    page = pages.find(p => /index\.html|127\.0\.0\.1:\d+\/?$|localhost:\d+\/?$/.test(p.url()) && !/splash/.test(p.url()));
    if (!page) await sleep(500);
  }
  if (!page) throw new Error('The desktop main window did not appear.');
  st.page = page; hookPage(page); st.target = 'desktop';
  const ready = await waitReady();
  return {ok:true, target:'desktop', url:page.url(), ...ready};
}
export async function stopDesktop() {
  if (st.target === 'desktop' && st.browser) await st.browser.disconnect().catch(() => {});
  if (st.desktop) {
    try { process.platform === 'win32' ? execSync(`taskkill /pid ${st.desktop.pid} /T /F`, {stdio:'ignore'}) : st.desktop.kill('SIGTERM'); } catch (e) {}
  }
  st.desktop = null; if (st.target === 'desktop') { st.browser = null; st.page = null; st.target = null; }
  return {ok:true};
}

const logs = [];
function hookPage(page) {
  page.on('console', m => { logs.push({type:m.type(), text:m.text()}); if (logs.length > 300) logs.shift(); });
  page.on('pageerror', e => { logs.push({type:'pageerror', text:String(e.message || e)}); });
}
export function consoleLogs({onlyErrors = false, limit = 50} = {}) {
  const l = onlyErrors ? logs.filter(x => x.type === 'error' || x.type === 'pageerror') : logs;
  return l.slice(-limit);
}
// the page being tested (for scripts that need puppeteer directly)
export function page() { if (!st.page) throw new Error('Nothing is running. Call start_website or start_desktop first.'); return st.page; }

// the app reports readiness itself (window.VPTest.ready); no fixed timers
export async function waitReady(timeout = 30000) {
  const t0 = Date.now();
  try {
    // builds without the VPTest hook: fall back to "engine up and page loaded"
    await page().waitForFunction(() => window.VPTest ? window.VPTest.ready === true : (window.AC && document.readyState === 'complete'), {timeout});
  } catch (e) { return {ready:false, waitedMs:Date.now() - t0}; }
  return {ready:true, waitedMs:Date.now() - t0};
}

// ---------- reading and driving the UI ----------
export async function getState() {
  return page().evaluate(() => {
    const S = window.AC?.S || {};
    const card = [...document.querySelectorAll('.card[id]')].filter(c => c.offsetParent !== null);
    return {
      target:location.href,
      loadingFinished:window.VPTest?.ready === true,
      loadMs:window.VPTest?.loadMs ?? null,
      app:S.app, controls:S.mode, advancedUnlocked:document.body.classList.contains('pro'),
      openPanels:card.map(c => ({id:c.id, name:c.dataset.name || c.id, collapsed:!!c.closest('.tgroup.collapsed'), size:[Math.round(c.offsetWidth), Math.round(c.offsetHeight)]})),
      focus:{mode:S.focus?.mode, on:S.focus?.on, selectedSubjects:S.focus?.activeSubjs || [], shown:S.focus?.multiSel || ''},
      video3d:window.VPTest?.video3d?.() || null,
      extension:window.VPTest?.extension?.() || null,
      signedIn:!!(window.localStorage && localStorage.getItem('vp-token'))
    };
  });
}
async function locate(p, {selector, text}) {
  if (selector) { const h = await p.$(selector); if (!h) throw new Error('No element matches ' + selector); return h; }
  if (text) {
    const h = await p.evaluateHandle(t => {
      const all = [...document.querySelectorAll('button,[role=button],a,label,.tab,.tog,.chip,summary')].filter(e => e.offsetParent !== null);
      return all.find(e => e.textContent.trim().toLowerCase() === t.toLowerCase()) || all.find(e => e.textContent.trim().toLowerCase().includes(t.toLowerCase())) || null;
    }, text);
    if (!(await h.evaluate(e => !!e))) throw new Error('No visible button with text ' + JSON.stringify(text));
    return h;
  }
  throw new Error('Give a selector or a text');
}
export async function click(o) { const p = page(), h = await locate(p, o); await h.evaluate(e => e.scrollIntoView({block:'center'})); await h.click(); await sleep(150); return {ok:true}; }
export async function typeText({selector, text, clear = true}) {
  const p = page(); const h = await locate(p, {selector});
  if (clear) await h.evaluate(e => { e.value = ''; });
  await h.type(String(text)); await h.evaluate(e => e.dispatchEvent(new Event('change', {bubbles:true})));
  return {ok:true};
}
export async function setValue({selector, value}) {
  await page().evaluate((s, v) => {
    const e = document.querySelector(s); if (!e) throw new Error('No element matches ' + s);
    e.value = v; e.dispatchEvent(new Event('input', {bubbles:true})); e.dispatchEvent(new Event('change', {bubbles:true}));
  }, selector, String(value));
  return {ok:true};
}
export async function selectChip({text}) { return click({text}); }
// put local files into a file input (e.g. #file for images, #objUploadFile for 3D models)
export async function uploadFiles({selector, paths}) {
  const h = await page().$(selector); if (!h) throw new Error('No element matches ' + selector);
  await h.uploadFile(...paths); await sleep(300);
  return {ok:true, files:paths.length};
}
export async function evaluate({script}) { return page().evaluate(new Function(`return (async () => { ${script} })()`)); }
export async function screenshot({selector, file} = {}) {
  const p = page(); fs.mkdirSync(CONFIG.shotsDir, {recursive:true});
  const out = file || path.join(CONFIG.shotsDir, `vp-${Date.now()}${selector ? '-' + selector.replace(/[^a-z0-9]+/gi, '') : ''}.png`);
  if (selector) { const h = await locate(p, {selector}); await h.evaluate(e => e.scrollIntoView({block:'nearest'})); await h.screenshot({path:out}); }
  else await p.screenshot({path:out});
  return {file:out, base64:fs.readFileSync(out).toString('base64')};
}

// ---------- checks ----------
// every control and every piece of text must stay inside its panel
export async function checkLayout({sizes} = {}) {
  const p = page();
  const run = () => p.evaluate(() => {
    const bad = [];
    const name = e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : '');
    const panels = [...document.querySelectorAll('.card[id], .view[id]')].filter(c => c.offsetParent !== null && !c.closest('.tgroup.collapsed') && !c.classList.contains('min'));
    for (const c of panels) {
      for (const e of c.querySelectorAll('button,input,select,textarea,label,span,p,output,canvas,.tog,.chip,.dd-btn')) {
        if (e.offsetParent === null || e.closest('[hidden]') || e.closest('.vp-rs')) continue;
        const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
        // walk up to the panel: a box that scrolls is fine (the user can reach it), a box that hides overflow is not
        let why = '';
        for (let a = e.parentElement; a && a !== c.parentElement; a = a.parentElement) {
          const cs = getComputedStyle(a), ar = a.getBoundingClientRect();
          const sx = /(auto|scroll)/.test(cs.overflowX), sy = /(auto|scroll)/.test(cs.overflowY);
          const hx = /(hidden|clip)/.test(cs.overflowX), hy = /(hidden|clip)/.test(cs.overflowY);
          const outX = r.left < ar.left - 1 || r.right > ar.right + 1, outY = r.top < ar.top - 1 || r.bottom > ar.bottom + 1;
          if ((outX && hx && !sx) || (outY && hy && !sy)) { why = 'cut off by ' + name(a); break; }
          if ((outX && sx) || (outY && sy)) break; // reachable by scrolling this box
          // spills out of a box that does not clip it, over whatever is next to it
          if (a !== c && !sy && !hy && r.bottom > ar.bottom + 4 && !/(absolute|fixed)/.test(getComputedStyle(e).position) && ar.height > 20) { why = 'spills out of ' + name(a); break; }
          if (a === c && (outX || outY) && !/(hidden|clip|auto|scroll)/.test(cs.overflowX + cs.overflowY)) { why = 'sticks out of the panel'; break; }
        }
        if (!why && e.children.length === 0 && /^(SPAN|LABEL|BUTTON|OUTPUT)$/.test(e.tagName) && e.scrollWidth > e.clientWidth + 2 && !/(ellipsis)/.test(getComputedStyle(e).textOverflow)) why = 'text wider than its box';
        if (why) bad.push({panel:c.dataset.name || c.id, el:name(e), text:(e.textContent || e.value || '').trim().slice(0, 40), why});
      }
    }
    return bad;
  });
  const results = [];
  const list = sizes || [null];
  for (const s of list) {
    if (s) await p.evaluate(sz => window.VPTest?.resizeAll?.(sz), s);
    await sleep(250);
    const bad = await run();
    results.push({size:s || 'current', problems:bad.slice(0, 40), count:bad.length});
  }
  if (sizes) await p.evaluate(() => window.VPTest?.resetSizes?.());
  return {ok:results.every(r => !r.count), results};
}

// 3D camera zoom must move the camera forward with one or several subjects, and stop before entering a subject
export async function check3dZoom() {
  return page().evaluate(async () => {
    if (!window.VPTest?.zoomTest) return {ok:false, error:'This build has no VPTest.zoomTest hook (open Video mode first).'};
    return window.VPTest.zoomTest();
  });
}

// Remove Background through the AI bridge: did the image come back, how long did it take, any error
export async function testRemoveBackground({timeoutMs = 120000} = {}) {
  const p = page(); const t0 = Date.now();
  const r = await p.evaluate(async t => {
    if (!window.VPTest?.removeBackground) return {ok:false, error:'This build has no VPTest.removeBackground hook.'};
    return window.VPTest.removeBackground({timeoutMs:t});
  }, timeoutMs).catch(e => ({ok:false, error:String(e.message || e)}));
  return {...r, totalMs:Date.now() - t0};
}

export async function checkExtension() {
  return page().evaluate(async () => {
    if (window.VPTest?.extensionStatus) return window.VPTest.extensionStatus();
    return {connected:false, error:'No VPTest.extensionStatus hook in this build.'};
  });
}

// new commits on GitHub compared with the local GitHub folder (git) or a known commit
export async function checkGithub({since} = {}) {
  const res = await fetch(`https://api.github.com/repos/${CONFIG.repo}/commits?per_page=5`, {headers:{'user-agent':'vision-pilot-mcp', accept:'application/vnd.github+json'}});
  if (!res.ok) return {ok:false, error:'GitHub answered ' + res.status};
  const commits = (await res.json()).map(c => ({sha:c.sha.slice(0, 7), date:c.commit.author.date, message:c.commit.message.split('\n')[0]}));
  let local = since || null;
  if (!local) { try { local = execSync('git rev-parse --short HEAD', {cwd:CONFIG.siteDir}).toString().trim(); } catch (e) {} }
  const idx = local ? commits.findIndex(c => c.sha.startsWith(local) || local.startsWith(c.sha)) : -1;
  return {ok:true, repo:CONFIG.repo, latest:commits[0], local, upToDate:idx === 0, newCommits:idx < 0 ? commits : commits.slice(0, idx)};
}

export async function shutdown() { await stopWebsite(); await stopDesktop(); }

// attach to a browser that is already running with --remote-debugging-port (e.g. the sign-in session)
export async function attachBrowser({port = 9444} = {}) {
  const b = await puppeteer.connect({browserURL:`http://127.0.0.1:${port}`, defaultViewport:null});
  st.browser = b; st.target = 'attached';
  const pages = await b.pages();
  st.page = pages.find(p => /localhost:\d+\/?($|\?)|github\.io\/VisionPilot/i.test(p.url())) || pages[0];
  hookPage(st.page);
  return {ok:true, url:st.page.url(), tabs:pages.map(p => p.url())};
}
export async function detach() { if (st.target === 'attached' && st.browser) await st.browser.disconnect().catch(() => {}); st.browser = null; st.page = null; st.target = null; return {ok:true}; }
