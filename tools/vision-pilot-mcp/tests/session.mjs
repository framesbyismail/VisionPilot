// Sign-in session: Chrome with the Vision Pilot extension and a kept test profile, plus the local site.
// Sign in to ChatGPT, Claude and Gemini in this window once. Tests attach on port 9444. Close the window to end it.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {CONFIG} from '../lib.js';
const MIME = {'.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'text/javascript', '.mjs':'text/javascript', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.wasm':'application/wasm'};
http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]), fp = path.join(CONFIG.siteDir, u === '/' ? 'index.html' : u.slice(1));
  if (!fp.startsWith(CONFIG.siteDir) || !fs.existsSync(fp) || !fs.statSync(fp).isFile()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, {'content-type':MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'cache-control':'no-store'}); fs.createReadStream(fp).pipe(r);
}).listen(CONFIG.port, '127.0.0.1');
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(p => fs.existsSync(p));
const ext = path.join(CONFIG.siteDir, 'extension'), profile = path.resolve(CONFIG.siteDir, '..', 'vp-test-browser-profile');
const c = spawn(chrome, [`--user-data-dir=${profile}`, `--load-extension=${ext}`, `--disable-extensions-except=${ext}`, '--remote-debugging-port=9444',
  '--no-first-run', '--no-default-browser-check', '--new-window', `http://localhost:${CONFIG.port}/`, 'https://chatgpt.com/', 'https://claude.ai/', 'https://gemini.google.com/app'], {stdio:'ignore'});
c.on('exit', () => process.exit(0));
console.log('session ready');
