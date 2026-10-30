// time VPDetect.analyze on test renders and list what it found (node detbench.mjs)
import * as vp from '../lib.js';
import fs from 'node:fs';
const T = 'C:/Users/mdsha/AppData/Local/Temp/';
const files = ['bike-legs-wheel.png', 'm-car.png', 'm-animal.png', 'm-chair-person.png'];
const imgs = files.map(f => 'data:image/png;base64,' + fs.readFileSync(T + f).toString('base64'));
await vp.startWebsite({});
const r = await vp.evaluate({script:`
  const imgs = ${JSON.stringify(imgs)}, names = ${JSON.stringify(files)};
  const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const t0 = performance.now(); await VPDetect.init(); const first = Math.round(performance.now() - t0);
  const out = [];
  for (let n = 0; n < imgs.length; n++) {
    const img = await load(imgs[n]);
    window.__vpDetDebug = true; const a = performance.now(); const det = await VPDetect.analyze(img); const ms = Math.round(performance.now() - a); const dbg = window.__vpDetDebug;
    out.push({img:names[n], ms, path:dbg && dbg.path, passes:dbg && dbg.passes, subjects:(det.subjects || []).map(s => [s.type, s.cls, s.subtype, s.src || s.source || '', Math.round((s.score || 0) * 100) + '%', s.box && Math.round(s.box.w*100)+'x'+Math.round(s.box.h*100)].join(' ')), keys:Object.keys((det.subjects || [])[0] || {}).join(',')});
  }
  const again = performance.now(); await VPDetect.analyze(await load(imgs[1])); const cached = Math.round(performance.now() - again);
  return {firstIncludingModelLoad:first, runs:out, sameImageAgainMs:cached};`});
console.log(JSON.stringify(r, null, 1));
await vp.shutdown();
