// Chrome with the VisionPilot extension loaded through the debugging protocol (Chrome 137+ ignores --load-extension)
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {CONFIG} from './lib.js';
export async function launchWithExtension({profile, headless = false} = {}) {
  const ext = path.join(CONFIG.siteDir, 'extension');
  const dir = profile || fs.mkdtempSync(path.join(os.tmpdir(), 'vp-ext-'));
  const browser = await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', pipe:true, headless,
    defaultViewport:null, userDataDir:dir, ignoreDefaultArgs:['--disable-extensions'],
    args:['--enable-unsafe-extension-debugging', '--no-first-run', '--no-default-browser-check', '--window-size=1400,900']});
  const s = await browser.target().createCDPSession();
  const {id} = await s.send('Extensions.loadUnpacked', {path:ext});
  return {browser, extId:id, dir};
}
if (process.argv[1] && process.argv[1].endsWith('gptext.mjs')) {
  const {browser, extId} = await launchWithExtension({headless:true});
  console.log('extension id', extId);
  await new Promise(r => setTimeout(r, 1500));
  console.log((await browser.targets()).map(t => t.type() + ' ' + t.url()).filter(s => /chrome-extension/.test(s)));
  await browser.close();
}
