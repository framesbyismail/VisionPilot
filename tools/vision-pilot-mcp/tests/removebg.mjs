// Remove Background through the extension and ChatGPT with a real photo: the transparent PNG must come back to the app.
// node tests/removebg.mjs <image file>
// Uses a kept test profile (../../vp-test-browser-profile next to the repo): sign in to ChatGPT in that window once.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const vp = await import('../lib.js');
const file = process.argv[2];
if (!file || !fs.existsSync(file)) { console.log('usage: node tests/removebg.mjs <image file>'); process.exit(1); }
const mime = /\.png$/i.test(file) ? 'image/png' : /\.webp$/i.test(file) ? 'image/webp' : 'image/jpeg';
const dataUrl = `data:${mime};base64,` + fs.readFileSync(file).toString('base64');
const profileDir = process.env.VP_PROFILE || path.resolve(vp.CONFIG.siteDir, '..', 'vp-test-browser-profile');
await vp.startWebsite({withExtension:true, profileDir, width:1400, height:900});
const page = vp.page(), browser = page.browser();

// ChatGPT signed in? (Image work needs an account.) Wait up to 10 minutes for a sign-in in this window.
const gpt = await browser.newPage();
await gpt.goto('https://chatgpt.com/', {waitUntil:'domcontentloaded'});
const signedIn = () => gpt.evaluate(() => fetch('/api/auth/session').then(r => r.json()).then(j => !!j.accessToken).catch(() => false));
if (!(await signedIn())) {
  console.log('SIGN_IN_NEEDED: sign in to ChatGPT in the test Chrome window (waiting up to 10 minutes)');
  const t = Date.now();
  while (!(await signedIn().catch(() => false)) && Date.now() - t < 600000) await new Promise(r => setTimeout(r, 4000));
}
console.log('ChatGPT signed in:', await signedIn().catch(() => false));
await gpt.close();
await page.bringToFront();

const t0 = Date.now();
const res = await page.evaluate(async src => {
  const img = new Image(); img.src = src; await img.decode();
  const stages = [];
  try {
    const out = await VPAIBridge.runRemoveBackgroundStep({id:'rbg-' + Date.now(), img}, {onStage:s => stages.push((s && (s.stage || s.label)) || String(s))});
    const url = out?.imageDataUrl || out?.dataUrl || out;
    return {ok:true, stages, kind:typeof out, keys:out && typeof out === 'object' ? Object.keys(out) : null, url:typeof url === 'string' ? url : null};
  } catch (e) { return {ok:false, stages, error:e.message}; }
}, dataUrl);
const secs = Math.round((Date.now() - t0) / 1000);
console.log('remove background', secs + 's', JSON.stringify({...res, url:res.url ? res.url.slice(0, 40) + '…' : null}));
if (res.url && res.url.startsWith('data:')) {
  const out = path.join(os.tmpdir(), 'vp-removebg-result.png');
  fs.writeFileSync(out, Buffer.from(res.url.split(',')[1], 'base64'));
  const check = await page.evaluate(async src => { const i = new Image(); i.src = src; await i.decode(); const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; const x = c.getContext('2d'); x.drawImage(i, 0, 0);
    const a = (px, py) => x.getImageData(px, py, 1, 1).data[3]; return {w:i.naturalWidth, h:i.naturalHeight, cornerAlpha:[a(2, 2), a(i.naturalWidth - 3, 2)], centerAlpha:a(i.naturalWidth >> 1, i.naturalHeight >> 1)}; }, res.url);
  console.log('result saved', out, JSON.stringify(check));
}
for (const p of await browser.pages()) if (/chatgpt\.com/.test(p.url())) { await p.screenshot({path:path.join(os.tmpdir(), 'vp-removebg-chatgpt.png')}); console.log('chatgpt tab', p.url()); }
await vp.shutdown();
