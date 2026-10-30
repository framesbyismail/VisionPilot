import * as vp from '../lib.js';
await vp.startWebsite({width:1600, height:950});
const S = s => vp.evaluate({script:s});
const r = await S(`const out = {loadMs: VPTest.loadMs, threeAtReady: !!window.__threeAtReady, videoHookNow: !!AC.hooks.enterVideo, ortLoaded: !!window.ort};
  const t0 = performance.now(); while (!AC.hooks.enterVideo && performance.now() - t0 < 15000) await new Promise(r => setTimeout(r, 100));
  out.videoLoadedAfterMs = Math.round(performance.now() - t0); out.three = !!window.THREE;
  AC.setPro(true); document.getElementById('appVideo').click(); await new Promise(r => setTimeout(r, 1500));
  out.inVideo = AC.S.app === 'video' && document.body.classList.contains('video'); out.canvas = !!document.querySelector('#vpWrap canvas');
  return out;`);
console.log(JSON.stringify(r));
// reload while in video mode: Video & 3D must come up by itself
await S(`AC.saveNow?.(); return true`);
const r2 = await S(`location.reload(); return true`).catch(() => null);
await new Promise(r => setTimeout(r, 6000));
console.log(JSON.stringify(await S(`const t0 = performance.now(); while (!(window.VPTest && VPTest.ready) && performance.now() - t0 < 12000) await new Promise(r => setTimeout(r, 100));
  return {app: AC.S.app, ready: VPTest.ready, loadMs: VPTest.loadMs, video: !!AC.hooks.enterVideo, canvas: !!document.querySelector('#vpWrap canvas')}`)));
await vp.shutdown();
