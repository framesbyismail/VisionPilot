// Desktop app sign-in sharing: (1) other websites cannot read the app's sign-in, (2) the sign-in callback page signs the app in,
// (3) signing in on the website in Chrome (extension linked to the app) signs the app in.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const vp = await import('../lib.js');
const {launchWithExtension} = await import('../gptext.mjs');
await vp.startDesktop({width:1300, height:850});
const appUrl = await vp.evaluate({script:'return location.origin'});
const port = new URL(appUrl).port;
const get = (origin) => fetch(appUrl + '/api/sync-state', {headers: origin ? {origin} : {}}).then(r => r.status);
console.log('1. sync-state from another website:', await get('https://evil.example'), '| from the VisionPilot site:', await get('https://visionpilot.us.ci'), '| from the app itself:', await get(appUrl));
const tokenInApp = () => vp.evaluate({script:"return localStorage.getItem(Object.keys(localStorage).find(k => /auth|token/i.test(k) && /vp|vision/i.test(k)) || '') || Object.keys(localStorage).filter(k=>/auth|token/i.test(k)).join(',')"});
// 2. the callback page the browser lands on after signing in
const b = await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:true});
const p = await b.newPage();
await p.goto(`${appUrl}/api/auth-callback#vp_token=TEST_CALLBACK_TOKEN`); await new Promise(r => setTimeout(r, 1500));
await b.close();
const sync1 = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA, 'Vision Pilot', 'vp-shared-sync.json'), 'utf8'));
console.log('2. after the callback page: app sync file token =', sync1.token);
// 3. website in Chrome with the extension -> app
const {browser} = await launchWithExtension({});
for (let i = 0; i < 40; i++) { const s = await vp.evaluate({script:'return window.visionPilotDesktop.extensionLinkStatus()'}); if (s.connected) break; await new Promise(r => setTimeout(r, 500)); }
const site = (await browser.pages())[0];
await site.goto('https://visionpilot.us.ci/', {waitUntil:'domcontentloaded'});
await site.waitForFunction('document.documentElement.getAttribute("data-vp-extension") === "installed"', {timeout:20000}).catch(() => {});
await site.evaluate(() => window.dispatchEvent(new CustomEvent('vp-sync-state-push', {detail:{token:'TEST_WEBSITE_TOKEN', user:{email:'test@example.com'}}})));
await new Promise(r => setTimeout(r, 2500));
const sync2 = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA, 'Vision Pilot', 'vp-shared-sync.json'), 'utf8'));
console.log('3. after signing in on the website: app sync file token =', sync2.token);
await browser.close();
await vp.stopDesktop();
