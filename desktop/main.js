// Vision Pilot desktop (Electron) — one codebase for Windows, macOS and Linux.
// Start: splash box -> GitHub update check (only changed files are downloaded) -> the app opens when it reports ready (max 10 s).
// AI work goes to the Vision Pilot Chrome extension in the user's main browser (see extension-link.js).
const {app, BrowserWindow, ipcMain, shell} = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const updater = require('./updater');
const extLink = require('./extension-link');

if (process.platform === 'linux') { app.commandLine.appendSwitch('enable-transparent-visuals'); app.commandLine.appendSwitch('disable-gpu-compositing'); }
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

const BUNDLED = [path.join(process.resourcesPath || '', 'site'), path.join(__dirname, 'site')].find(d => fs.existsSync(path.join(d, 'index.html'))) || path.join(__dirname, 'site');
const MAX_SPLASH_MS = 10000;
const SITE_ORIGINS = ['https://framesbyismail.github.io', 'https://visionpilot.us.ci'];
const MIME = {'.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.mjs':'application/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.ico':'image/x-icon',
  '.wasm':'application/wasm', '.onnx':'application/octet-stream', '.tflite':'application/octet-stream', '.zip':'application/zip', '.glb':'model/gltf-binary'};
const winArg = (process.argv.find(a => a.startsWith('--vp-window=')) || '').split('=')[1];
const [WIN_W, WIN_H] = winArg ? winArg.split('x').map(Number) : [1440, 900];

let siteDir = BUNDLED, server = null, baseUrl = null, splash = null, win = null, siteVersion = 'bundled';

/* ---------- shared sign-in state (app, browser and extension) ---------- */
const syncFile = () => path.join(app.getPath('userData'), 'vp-shared-sync.json');
let sync = {token:null, user:null, pro:null, updatedAt:0};
try { sync = {...sync, ...JSON.parse(fs.readFileSync(syncFile(), 'utf8'))}; } catch (e) {}
const saveSync = patch => { Object.entries(patch || {}).forEach(([k, v]) => { if (v !== undefined && v !== null) sync[k] = v; }); sync.updatedAt = Date.now(); try { fs.writeFileSync(syncFile(), JSON.stringify(sync, null, 2)); } catch (e) {} };

/* ---------- local server for the app files ---------- */
function startServer() {
  return new Promise(resolve => {
    server = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      // the sign-in kept here is only for VisionPilot: its website, this app's own pages and the Chrome extension
      const origin = req.headers.origin || '';
      const trusted = !origin || origin === baseUrl || /^chrome-extension:\/\//.test(origin) || SITE_ORIGINS.includes(origin);
      if (u.pathname.startsWith('/api/')) {
        if (!trusted) { res.writeHead(403); res.end(); return; }
        if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Access-Control-Allow-Private-Network', 'true'); // Chrome asks before a website may reach this computer
      }
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      if (u.pathname === '/api/sync-state') {
        if (req.method === 'POST') {
          let body = ''; req.on('data', c => { body += c; });
          req.on('end', () => { try { const inc = JSON.parse(body || '{}'); saveSync(inc); if (inc.token && win) win.webContents.send('vp:auth-token', inc.token); } catch (e) {} res.writeHead(200, {'content-type':MIME['.json']}); res.end(JSON.stringify({ok:true})); });
          return;
        }
        res.writeHead(200, {'content-type':MIME['.json']}); res.end(JSON.stringify(sync)); return;
      }
      // sign-in in the user's browser comes back here, then the token goes to the app
      if (u.pathname === '/api/auth-callback') {
        res.writeHead(200, {'content-type':MIME['.html']});
        res.end(`<!doctype html><meta charset="utf-8"><title>Vision Pilot — Signed in</title><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0c0d10;color:#eef0f5;font-family:system-ui;text-align:center"><div><h2 style="color:#3fb950">Signed in to Vision Pilot</h2><p>You can close this tab and go back to the app.</p></div><script>const t=(location.hash.match(/vp_token=([^&]+)/)||[])[1];if(t)fetch('/api/sync-state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:t})});</script>`);
        return;
      }
      let rel = decodeURIComponent(u.pathname); if (rel === '/') rel = '/index.html';
      const full = path.resolve(siteDir, '.' + rel);
      if (!full.startsWith(path.resolve(siteDir)) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, {'content-type':MIME[path.extname(full).toLowerCase()] || 'application/octet-stream', 'cache-control':'no-cache'});
      fs.createReadStream(full).pipe(res);
    });
    const listen = port => { server.once('error', () => listen(0)); server.listen(port, '127.0.0.1', () => { baseUrl = `http://127.0.0.1:${server.address().port}`; resolve(baseUrl); }); };
    listen(45780);
  });
}

/* ---------- windows ---------- */
let splashPct = 0;
const status = (text, pct) => {
  if (typeof pct === 'number') splashPct = Math.max(splashPct, pct);
  const m = {text, pct:splashPct};
  if (splash && !splash.isDestroyed()) splash.webContents.send('vp:update-status', m);
  if (win && !win.isDestroyed()) win.webContents.send('vp:update-status', m);
};
function createSplash() {
  // only the loading box itself is visible: a frameless, truly transparent window exactly its size
  splash = new BrowserWindow({width:960, height:540, frame:false, transparent:true, resizable:false, movable:true, center:true, show:false, skipTaskbar:false,
    hasShadow:false, backgroundColor:'#00000000', title:'Vision Pilot', icon:path.join(__dirname, 'build', 'icon.png'),
    webPreferences:{preload:path.join(__dirname, 'preload.js'), contextIsolation:true, nodeIntegration:false}});
  splash.loadFile(path.join(BUNDLED, 'splash.html'));
  splash.once('ready-to-show', () => splash && splash.show());
  splash.webContents.setWindowOpenHandler(({url}) => { shell.openExternal(url).catch(() => {}); return {action:'deny'}; });
}
function createMain() {
  win = new BrowserWindow({width:WIN_W, height:WIN_H, minWidth:1024, minHeight:640, show:false, autoHideMenuBar:true, backgroundColor:'#0c0d10', title:'Vision Pilot',
    icon:path.join(__dirname, 'build', 'icon.png'),
    webPreferences:{preload:path.join(__dirname, 'preload.js'), contextIsolation:true, nodeIntegration:false, backgroundThrottling:false}});
  win.webContents.setWindowOpenHandler(({url}) => {
    if (url.startsWith(baseUrl)) return {action:'allow'};
    shell.openExternal(url).catch(() => {}); // sign-in and links open in the user's own browser
    return {action:'deny'};
  });
  win.on('closed', () => { win = null; });
  win.loadURL(`${baseUrl}/index.html?app=1`);
}
let shown = false;
function showMain() {
  if (shown || !win) return; shown = true;
  status('Ready', 100);
  win.show(); win.focus();
  setTimeout(() => { if (splash && !splash.isDestroyed()) splash.close(); splash = null; }, 120);
}

/* ---------- IPC for the page ---------- */
ipcMain.handle('vp:get-version', () => app.getVersion());
ipcMain.handle('vp:site-version', () => siteVersion);
ipcMain.handle('vp:check-updates', async () => {
  const r = await updater.checkAndUpdate({userData:app.getPath('userData'), bundled:BUNDLED});
  return {status:r.updated ? 'updated' : r.offline ? 'offline' : 'up-to-date', version:r.version, restartNeeded:r.updated};
});
ipcMain.handle('vp:open-external-signin', async (_e, url) => { if (/^https?:\/\//i.test(url || '')) { await shell.openExternal(url); return {ok:true}; } return {ok:false}; });
ipcMain.handle('vp:silent-ai-bridge', async (_e, payload = {}) => {
  const action = payload.action || 'status';
  if (action === 'status') return {ok:true, installed:extLink.connected(), desktop:true, ...extLink.status(), models:['visionpilot', 'claude', 'gpt', 'gemini']};
  if (action === 'open_login') return extLink.request({...payload, focusTab:true});
  return extLink.request(payload);
});
ipcMain.handle('vp:ext-status', async () => ({...extLink.status(), desktop:true}));
ipcMain.on('vp:load-progress', (_e, pct, label) => { if (!shown) status(label || 'Starting…', 30 + .7 * Math.max(0, Math.min(100, +pct || 0))); });
ipcMain.on('vp:app-ready', () => showMain());

/* ---------- start ---------- */
app.whenReady().then(async () => {
  const t0 = Date.now();
  extLink.start(p => { if (win && !win.isDestroyed()) win.webContents.send('vp:bridge-progress', p); },
    a => { saveSync(a); if (win && !win.isDestroyed()) win.webContents.send('vp:auth-token', a.token); });
  createSplash();
  // the GitHub check runs while the splash shows; the update step is the first 30 % of the bar
  const up = await updater.checkAndUpdate({userData:app.getPath('userData'), bundled:BUNDLED, onStatus:m => status(m.text, .3 * (m.pct || 0))});
  siteDir = up.dir; siteVersion = up.version || 'bundled';
  await startServer();
  status('Starting Vision Pilot…', 30);
  createMain();
  // the page says when it is ready; never keep the splash longer than 10 s in total
  setTimeout(showMain, Math.max(500, MAX_SPLASH_MS - (Date.now() - t0)));
  if (process.argv.includes('--verify-smoke-test')) {
    win.webContents.once('did-finish-load', () => setTimeout(() => { console.log('VISIONPILOT_SMOKE_OK ' + JSON.stringify({siteVersion, updated:up.updated, siteDir})); app.quit(); }, 2500));
  }
});
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => { app.quit(); });
