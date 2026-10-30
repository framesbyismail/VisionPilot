import * as vp from '../lib.js';
await vp.startWebsite({width:1600, height:1000});
const S = s => vp.evaluate({script:s});
await S('localStorage.clear(); AC.setPro(true); await new Promise(r=>setTimeout(r,400)); document.getElementById("appVideo").click(); await new Promise(r=>setTimeout(r,2500)); const b=[...document.querySelectorAll("button")].find(b=>b.offsetParent && /^(Start video|Start)$/i.test(b.textContent.trim())); b && b.click(); await new Promise(r=>setTimeout(r,1500));');
await S(`const add = m => { const s=document.getElementById("objAddModel"); s.value=m; document.getElementById("objAdd").click(); };
  const V = AC.S.video; V.objects.length = 0; add("bike"); await new Promise(r=>setTimeout(r,300)); add("person"); await new Promise(r=>setTimeout(r,300));
  const bk = V.objects.find(o=>o.model==="bike"); bk.x=0; bk.z=0; bk.ry=0; const p = V.objects.find(o=>o.model==="person"); p.x=0; p.z=.05;
  AC.changed(); await new Promise(r=>setTimeout(r,900)); AC.changed(); await new Promise(r=>setTimeout(r,500));`);
const ids = await S('return [...document.querySelectorAll("[data-apreset^=bike_]")].map(b=>b.dataset.apreset)');
console.log('presets', ids);
for (const id of ids) {
  await S(`VPTest.clearSelection(); document.querySelector('[data-apreset="${id}"]').click(); await new Promise(r=>setTimeout(r,400));`);
  const rows = [];
  for (const u of [0, .25, .5, .75, 1]) {
    const objs = await S(`return VPTest.seek(${u} * (AC.S.video.duration || 5))`);
    const b = objs.find(o => o.m === 'bike'), r = objs.find(o => o.m === 'person');
    rows.push(`u=${u} bike(${b.x.toFixed(2)},${b.z.toFixed(2)}) y=${(+b.y).toFixed(2)} ry=${(+b.ry).toFixed(0)} rz=${(+b.rz).toFixed(0)} rx=${(+b.rx).toFixed(0)} | rider ${r.pose} d=${Math.hypot(r.x-b.x, r.z-b.z).toFixed(2)} rz=${(+r.rz).toFixed(0)}`);
  }
  console.log(id + '\n  ' + rows.join('\n  '));
  if (id === 'bike_circle') { await S('VPTest.seek(.25 * (AC.S.video.duration || 5)); AC.S.focus.on=false; AC.S.video.camPan=null; AC.setAz(0); AC.setEl(88); AC.setDist(7); AC.changed(); await new Promise(r=>setTimeout(r,500)); VPTest.seek(.25 * (AC.S.video.duration || 5)); VPTest.clearSelection(); await new Promise(r=>setTimeout(r,300));'); await vp.screenshot({selector:'#vpFrame', file:'C:/Users/mdsha/AppData/Local/Temp/bike_circle_top.png'}); }
  if (id === 'bike_wheelie') {
    await S(`AC.setAz(90); AC.setEl(6); AC.setDist(6); AC.changed(); VPTest.seek(${id === 'bike_corner' ? .55 : .5} * (AC.S.video.duration || 5)); VPTest.clearSelection(); await new Promise(r=>setTimeout(r,300));`);
    await vp.screenshot({selector:'#vpFrame', file:`C:/Users/mdsha/AppData/Local/Temp/${id}.png`});
  }
}
console.log(JSON.stringify(vp.consoleLogs({onlyErrors:true}).filter(l=>!/Failed to load resource/.test(l.text)).slice(0,5)));
await vp.shutdown();
