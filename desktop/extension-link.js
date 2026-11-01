// Vision Pilot desktop — link to the Vision Pilot Chrome extension in the user's main browser.
// The app listens on this computer only (127.0.0.1:47821). The extension connects to it and runs the app's prompts and
// image jobs in the browser where the user is signed in to ChatGPT, Claude, Gemini and Google Flow, then sends the result back.
const http = require('http');
const crypto = require('crypto');
const {spawn, execFileSync} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 47821;
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
let server = null, pingTimer = null, ext = null, extInfo = null, nextId = 1;
const clients = new Set(); // { ws, info }
const pending = new Map(); // id -> {resolve, reqId, timer, ws}
let onProgress = () => {};
let onAuth = () => {};

function compareVersions(a = '0.0.0', b = '0.0.0') {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

function pickBestClient() {
  let best = null;
  for (const c of clients) {
    if (!best) { best = c; continue; }
    const hasFlowA = Array.isArray(c.info?.models) && c.info.models.includes('flow');
    const hasFlowB = Array.isArray(best.info?.models) && best.info.models.includes('flow');
    if (hasFlowA !== hasFlowB) {
      if (hasFlowA) best = c;
      continue;
    }
    const cmp = compareVersions(c.info?.version, best.info?.version);
    if (cmp > 0) best = c;
  }
  ext = best ? best.ws : null;
  extInfo = best ? best.info : null;
  return best;
}

function encodeWsFrame(text, opcode = 0x01) {
  const payload = Buffer.isBuffer(text) ? text : Buffer.from(String(text), 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function attachWsSocket(socket, onMessage, onClose) {
  let buf = Buffer.alloc(0);
  let fragments = [];
  let closed = false;
  const ws = {
    send(data) {
      if (closed || socket.destroyed) return;
      try { socket.write(encodeWsFrame(data, 0x01)); } catch (e) {}
    },
    close() {
      if (closed) return;
      closed = true;
      try { socket.end(encodeWsFrame(Buffer.alloc(0), 0x08)); } catch (e) {}
      try { socket.destroy(); } catch (e) {}
    }
  };
  socket.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const b0 = buf[0];
      const b1 = buf[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let payloadLen = b1 & 0x7f;
      let offset = 2;
      if (payloadLen === 126) {
        if (buf.length < 4) return;
        payloadLen = buf.readUInt16BE(2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (buf.length < 10) return;
        payloadLen = Number(buf.readBigUInt64BE(2));
        offset = 10;
      }
      const maskLen = masked ? 4 : 0;
      if (buf.length < offset + maskLen + payloadLen) return;
      const mask = masked ? buf.subarray(offset, offset + 4) : null;
      offset += maskLen;
      const payload = Buffer.from(buf.subarray(offset, offset + payloadLen));
      buf = buf.subarray(offset + payloadLen);
      if (masked && mask) {
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      }
      if (opcode === 0x08) { ws.close(); return; }
      if (opcode === 0x09) { try { socket.write(encodeWsFrame(payload, 0x0a)); } catch (e) {} continue; }
      if (opcode === 0x0a) continue;
      if (opcode === 0x01 || opcode === 0x02 || opcode === 0x00) {
        fragments.push(payload);
        if (fin) {
          const full = Buffer.concat(fragments).toString('utf8');
          fragments = [];
          try { onMessage(full); } catch (e) {}
        }
      }
    }
  });
  const handleClose = () => {
    if (closed) return;
    closed = true;
    try { onClose(); } catch (e) {}
  };
  socket.on('close', handleClose);
  socket.on('end', handleClose);
  socket.on('error', handleClose);
  return ws;
}

// progressCb(message): live stages of AI jobs; authCb({token, user, pro}): the user signed in on the website in Chrome
function start(progressCb, authCb) {
  if (progressCb) onProgress = progressCb;
  if (authCb) onAuth = authCb;
  if (server) return;
  server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({ok: true, service: 'visionpilot-desktop'}));
  });
  server.on('error', () => {}); // another copy of the app may already own the port
  server.on('upgrade', (req, socket) => {
    if (!req.url || !req.url.startsWith('/vp-extension')) { socket.destroy(); return; }
    const origin = req.headers.origin || '';
    if (origin && !/^chrome-extension:\/\//.test(origin)) { socket.destroy(); return; }
    const key = req.headers['sec-websocket-key'];
    if (!key) { socket.destroy(); return; }
    const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );
    const clientEntry = { ws: null, info: { version: '0.0.0', models: [], since: Date.now() } };
    const wsRef = attachWsSocket(
      socket,
      raw => {
        let m; try { m = JSON.parse(raw); } catch (e) { return; }
        if (m.type === 'hello') {
          clientEntry.info = { version: m.version, models: m.models, since: Date.now() };
          clients.add(clientEntry);
          pickBestClient();
          return;
        }
        if (m.type === 'VP_PROGRESS') { onProgress(m); return; }
        if (m.type === 'auth' && typeof m.token === 'string' && m.token) { onAuth({token:m.token, user:m.user || null, pro:m.pro || null}); return; }
        if (m.type === 'response' && pending.has(m.id)) {
          const p = pending.get(m.id);
          pending.delete(m.id);
          if (p.timer) clearTimeout(p.timer);
          p.resolve(m.result);
        }
      },
      () => {
        clients.delete(clientEntry);
        pickBestClient();
        pending.forEach((p, id) => {
          if (p.ws === wsRef) {
            if (p.timer) clearTimeout(p.timer);
            pending.delete(id);
            p.resolve({ok:false, error:'The browser extension disconnected before finishing.'});
          }
        });
      }
    );
    clientEntry.ws = wsRef;
  });
  server.listen(PORT, '127.0.0.1');
  // keep the extension's worker awake while connected
  pingTimer = setInterval(() => {
    for (const c of clients) {
      try { c.ws.send(JSON.stringify({type:'ping'})); } catch (e) {}
    }
  }, 20000);
}

function stop() {
  if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
  for (const c of clients) {
    try { c.ws.close(); } catch (e) {}
  }
  clients.clear();
  ext = null;
  extInfo = null;
  if (server) { try { server.close(); } catch (e) {} server = null; }
}

const connected = () => Boolean(pickBestClient());
const isConnected = connected;
const info = () => { pickBestClient(); return extInfo; };
const getClients = () => Array.from(clients);
const status = () => {
  pickBestClient();
  return {connected:Boolean(ext), version:extInfo?.version || null, models:extInfo?.models || null, since:extInfo?.since || null, port:PORT, clientCount:clients.size};
};

function findChrome() {
  const c = process.platform === 'win32'
    ? [path.join(process.env['PROGRAMFILES'] || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe'), path.join(process.env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)', 'Google/Chrome/Application/chrome.exe'), path.join(os.homedir(), 'AppData/Local/Google/Chrome/Application/chrome.exe')]
    : process.platform === 'darwin' ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'] : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return c.find(p => fs.existsSync(p)) || null;
}
function isChromeRunning() {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('tasklist', ['/FI', 'IMAGENAME eq chrome.exe', '/NH'], {encoding:'utf8', stdio:['ignore', 'pipe', 'ignore'], windowsHide:true});
      return /chrome\.exe/i.test(out || '');
    }
    const out = execFileSync('pgrep', ['-i', 'chrome'], {encoding:'utf8', stdio:['ignore', 'pipe', 'ignore']});
    return Boolean((out || '').trim());
  } catch (e) {
    return false;
  }
}

// Never spawn a new Chrome window when Chrome is already open; reuse the user's running Chrome instance and profile
async function ensureBrowser(waitMs = 25000, requiredModel = 'flow') {
  const hasRequired = () => {
    const best = pickBestClient();
    if (!best) return false;
    if (requiredModel && Array.isArray(best.info?.models) && !best.info.models.includes(requiredModel)) {
      return false;
    }
    return true;
  };
  if (hasRequired()) return true;
  if (!isChromeRunning()) {
    const chrome = findChrome();
    if (chrome) { try { spawn(chrome, ['--no-startup-window'], {detached:true, stdio:'ignore', windowsHide:true}).unref(); } catch (e) {} }
  }
  const t0 = Date.now();
  while (!hasRequired() && Date.now() - t0 < waitMs) await new Promise(r => setTimeout(r, 250));
  return connected();
}

function sendToClient(client, payload, timeoutMs = 300000) {
  const id = 'd' + Date.now().toString(36) + (nextId++);
  return new Promise(resolve => {
    const timer = timeoutMs > 0 ? setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        resolve({ok:false, error:'Timed out waiting for extension response.'});
      }
    }, timeoutMs) : null;
    pending.set(id, {resolve, reqId:payload.reqId, timer, ws:client.ws});
    try { client.ws.send(JSON.stringify({type:'request', id, payload})); }
    catch (e) { if (timer) clearTimeout(timer); pending.delete(id); resolve({ok:false, error:'Could not reach the browser extension.'}); }
  });
}

async function request(payload, timeoutMs = 300000) {
  if (!(await ensureBrowser(35000, payload?.model || 'flow'))) {
    return {ok:false, error:'Open Google Chrome with the VisionPilot AI Bridge extension. The app connects to it by itself.'};
  }
  const best = pickBestClient();
  if (!best) return {ok:false, error:'No browser extension connected.'};
  return sendToClient(best, payload, timeoutMs);
}

async function openUrlInActiveBrowser(url) {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  if (connected()) {
    const res = await request({action:'open_external_url', url});
    if (res && res.ok) return true;
  }
  return false;
}

module.exports = {start, stop, request, sendToClient, getClients, status, info, connected, isConnected, ensureBrowser, openUrlInActiveBrowser, PORT};
