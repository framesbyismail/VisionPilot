// Vision Pilot desktop — link to the Vision Pilot Chrome extension in the user's main browser.
// The app listens on this computer only (127.0.0.1:47821). The extension connects to it and runs the app's prompts and
// image jobs in the browser where the user is signed in to ChatGPT, Claude and Gemini, then sends the result back.
const {WebSocketServer} = require('ws');
const {spawn} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 47821;
let wss = null, ext = null, info = null, nextId = 1;
const pending = new Map(); // id -> {resolve, reqId}
let onProgress = () => {};

function start(progressCb) {
  if (progressCb) onProgress = progressCb;
  if (wss) return;
  wss = new WebSocketServer({host:'127.0.0.1', port:PORT, path:'/vp-extension'});
  wss.on('error', () => {}); // another copy of the app may already own the port
  wss.on('connection', (ws, req) => {
    // only a Chrome extension may connect
    if (!/^chrome-extension:\/\//.test(req.headers.origin || '')) { ws.close(); return; }
    ws.on('message', raw => {
      let m; try { m = JSON.parse(raw); } catch (e) { return; }
      if (m.type === 'hello') { ext = ws; info = {version:m.version, models:m.models, since:Date.now()}; return; }
      if (m.type === 'VP_PROGRESS') { onProgress(m); return; }
      if (m.type === 'response' && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); p.resolve(m.result); }
    });
    ws.on('close', () => {
      if (ext === ws) { ext = null; info = null; }
      pending.forEach(p => p.resolve({ok:false, error:'The browser extension disconnected before finishing.'}));
      pending.clear();
    });
  });
  // keep the extension's worker awake while connected
  setInterval(() => { if (ext) try { ext.send(JSON.stringify({type:'ping'})); } catch (e) {} }, 20000);
}

const connected = () => !!ext;
const status = () => ({connected:connected(), version:info?.version || null, since:info?.since || null, port:PORT});

function findChrome() {
  const c = process.platform === 'win32'
    ? [path.join(process.env['PROGRAMFILES'] || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe'), path.join(process.env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)', 'Google/Chrome/Application/chrome.exe'), path.join(os.homedir(), 'AppData/Local/Google/Chrome/Application/chrome.exe')]
    : process.platform === 'darwin' ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'] : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return c.find(p => fs.existsSync(p)) || null;
}
// Chrome not running: start it in the background with no window, the extension then connects by itself
async function ensureBrowser(waitMs = 20000) {
  if (connected()) return true;
  const chrome = findChrome();
  if (chrome) { try { spawn(chrome, ['--no-startup-window'], {detached:true, stdio:'ignore'}).unref(); } catch (e) {} }
  const t0 = Date.now();
  while (!connected() && Date.now() - t0 < waitMs) await new Promise(r => setTimeout(r, 300));
  return connected();
}

async function request(payload) {
  if (!(await ensureBrowser())) {
    return {ok:false, error:'Open Google Chrome with the VisionPilot AI Bridge extension. The app connects to it by itself.'};
  }
  const id = 'd' + Date.now().toString(36) + (nextId++);
  return new Promise(resolve => {
    pending.set(id, {resolve, reqId:payload.reqId});
    try { ext.send(JSON.stringify({type:'request', id, payload})); }
    catch (e) { pending.delete(id); resolve({ok:false, error:'Could not reach the browser extension.'}); }
  });
}

module.exports = {start, request, status, connected, ensureBrowser, PORT};
