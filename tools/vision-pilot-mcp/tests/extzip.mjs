// "Install Extension" download: the zip the site gives must be complete and load in Chrome. node tests/extzip.mjs [site url]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import {execFileSync} from 'node:child_process';
const vp = await import('../lib.js');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-zip-')), dl = path.join(work, 'dl'), out = path.join(work, 'ext');
fs.mkdirSync(dl); fs.mkdirSync(out);
await vp.startWebsite({url:process.argv[2], width:1300, height:850});
const page = await vp.page();
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', {behavior:'allow', downloadPath:dl});
await page.evaluate(() => window.VPAIBridge.downloadExtensionZip());
let zip = null;
for (let i = 0; i < 40 && !zip; i++) { await new Promise(r => setTimeout(r, 250)); zip = fs.readdirSync(dl).find(f => f.endsWith('.zip')); }
await vp.shutdown();
if (!zip) { console.log('no download'); process.exit(1); }
execFileSync(process.platform === 'win32' ? 'C:/Windows/System32/tar.exe' : 'tar', ['-xf', path.join(dl, zip), '-C', out]);
const files = fs.readdirSync(out);
console.log('downloaded', zip, fs.statSync(path.join(dl, zip)).size, 'bytes,', files.length, 'files, page-visible.js:', files.includes('page-visible.js'));
const b = await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', pipe:true, headless:true,
  userDataDir:fs.mkdtempSync(path.join(os.tmpdir(), 'vpx-')), ignoreDefaultArgs:['--disable-extensions'], args:['--enable-unsafe-extension-debugging']});
try { const r = await (await b.target().createCDPSession()).send('Extensions.loadUnpacked', {path:out}); console.log('Chrome loads it: OK', r.id); }
catch (e) { console.log('Chrome load ERROR:', e.message); }
await b.close();
