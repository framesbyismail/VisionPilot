// three-dot menu Downloads: section shows, each item works (desktop = latest .exe, extension = full zip, MCP = zip link)
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const vp = await import('../lib.js');
await vp.startWebsite({width:1440, height:900});
const page = vp.page();
const dl = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-dl-'));
await (await page.createCDPSession()).send('Browser.setDownloadBehavior', {behavior:'allow', downloadPath:dl});
const info = await page.evaluate(async () => {
  document.getElementById('vpMoreBtn').click();
  await new Promise(r => setTimeout(r, 600));
  const sec = document.getElementById('vpDrawerDlSec'), r = sec.getBoundingClientRect();
  return {visible: r.width > 0 && r.height > 0, items: [...sec.querySelectorAll('.vpd-dl-item')].map(a => a.querySelector('b').textContent + ' -> ' + (a.href || 'button')), drawerOpen: document.getElementById('vpHistoryDrawer').getAttribute('aria-hidden')};
});
console.log(JSON.stringify(info, null, 1));
await new Promise(r => setTimeout(r, 800)); await vp.screenshot({file:path.join(os.tmpdir(), 'drawer-dl.png')});
await page.evaluate(() => document.getElementById('vpDlExtension').click());
await new Promise(r => setTimeout(r, 2500));
console.log('extension download:', fs.readdirSync(dl));
const api = await page.evaluate(async () => { const r = await fetch('https://api.github.com/repos/framesbyismail/VisionPilot/releases/latest').then(r => r.json()); return (r.assets || []).map(a => a.name + ' ' + a.browser_download_url); });
console.log('latest release assets seen by the page:', api);
await vp.shutdown();
