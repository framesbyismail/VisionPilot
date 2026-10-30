// The extension on the live site: loads from a folder (default: the repo's extension), finds the page on each address,
// shows "Extension Connected", and one ChatGPT job comes back. node tests/extlive.mjs [extension folder]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import {CONFIG} from '../lib.js';
const ext = path.resolve(process.argv[2] || path.join(CONFIG.siteDir, 'extension'));
const b = await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', pipe:true, headless:false, defaultViewport:null,
  userDataDir:fs.mkdtempSync(path.join(os.tmpdir(), 'vp-ext-')), ignoreDefaultArgs:['--disable-extensions'], args:['--enable-unsafe-extension-debugging', '--window-size=1400,900', '--no-first-run']});
const cdp = await b.target().createCDPSession();
const {id} = await cdp.send('Extensions.loadUnpacked', {path:ext});
const manifest = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
console.log('loaded', manifest.version, 'id', id, 'files', fs.readdirSync(ext).length);
const page = (await b.pages())[0];
// the popup opens without errors
const pop = await b.newPage(); const popErr = []; pop.on('pageerror', e => popErr.push(e.message));
await pop.goto(`chrome-extension://${id}/popup.html`); await new Promise(r => setTimeout(r, 1500));
console.log('popup', JSON.stringify({title: await pop.title(), errors: popErr, text: (await pop.evaluate(() => document.body.innerText)).slice(0, 120).replace(/\s+/g, ' ')}));
await pop.close();
for (const url of ['https://visionpilot.us.ci/', 'https://framesbyismail.github.io/VisionPilot/']) {
  await page.goto(url, {waitUntil:'domcontentloaded'});
  await page.waitForFunction('window.VPTest && VPTest.ready', {timeout:30000}).catch(() => {});
  await new Promise(r => setTimeout(r, 2500));
  const st = await page.evaluate(async () => ({attr: document.documentElement.getAttribute('data-vp-extension'), label: document.getElementById('aiExtTopLbl')?.textContent,
    verify: await window.VPAIBridge?.verifyExtensionInstalled?.().catch(e => e.message)}));
  console.log(url, JSON.stringify(st));
}
const t0 = Date.now();
const res = await page.evaluate(async () => { const img = new Image(); img.src = 'add/add_image_3.png'; await img.decode();
  try { return {text: await VPAIBridge.runReferenceImageStep({id:'live-' + Date.now(), img}, 'gpt')}; } catch (e) { return {error: e.message}; } });
console.log('gpt job from', page.url(), Math.round((Date.now() - t0) / 1000) + 's', JSON.stringify(res).slice(0, 220));
await b.close();
