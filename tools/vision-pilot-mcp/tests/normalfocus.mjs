import * as vp from '../lib.js';
await vp.startWebsite({width:1600, height:950});
const S = s => vp.evaluate({script:s});
const r = await S(`
  const w = ms => new Promise(r => setTimeout(r, ms));
  const out = {gated: AC.GATED};
  localStorage.setItem('vp-pro','0'); AC.setPro(false); document.getElementById('modeNormal')?.click(); await w(300);
  out.start = {pro: AC.isPro(), mode: AC.S.mode, focus: AC.S.focus.on};
  document.getElementById('focusOn').click(); await w(300);
  out.afterSwitch = {focus: AC.S.focus.on, advPanel: !document.getElementById('advPop')?.hidden && getComputedStyle(document.getElementById('advPop')||document.body).display !== 'none'};
  AC.hideAdv?.();
  document.getElementById('focusMarkOn')?.click(); await w(300);
  out.afterMarker = AC.S.focus.on; AC.hideAdv?.();
  AC.S.focus.on = true; AC.changed(); await w(200);
  out.forcedOn = AC.S.focus.on;
  const b = document.querySelector('.aimodel-opt[data-aimodel="gpt"]');
  out.gptBtn = !!b;
  if (b) { b.click(); await w(500); }
  out.afterGpt = {pro: AC.isPro(), mode: AC.S.mode, focus: AC.S.focus.on};
  AC.setPro(true); AC.ensureAdvMode('x'); await w(200);
  document.getElementById('focusOn').click(); await w(300);
  out.advanced = {mode: AC.S.mode, focus: AC.S.focus.on};
  return out;`);
console.log(JSON.stringify(r, null, 1));
await vp.shutdown();
