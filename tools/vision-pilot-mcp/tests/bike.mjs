// bike + two riders, screenshots from the side and from 3/4 (node bike.mjs <suffix>)
import * as vp from '../lib.js';
const tag = process.argv[2] || 'x';
await vp.startWebsite({width:1600, height:1000});
const S = s => vp.evaluate({script:s});
await S('localStorage.clear(); AC.setPro && AC.setPro(true); await new Promise(r=>setTimeout(r,400)); document.getElementById("appVideo").click(); await new Promise(r=>setTimeout(r,800)); const b=[...document.querySelectorAll("button")].find(b=>b.offsetParent && /^(Start video|Start)$/i.test(b.textContent.trim())); b && b.click(); await new Promise(r=>setTimeout(r,1500));');
await S(`const add = m => { const s=document.getElementById("objAddModel"); s.value=m; document.getElementById("objAdd").click(); };
  const V = AC.S.video; V.objects.length = 0; add("bike"); await new Promise(r=>setTimeout(r,300)); add("person"); await new Promise(r=>setTimeout(r,300)); add("person"); await new Promise(r=>setTimeout(r,300));
  const bk = V.objects.find(o=>o.model==="bike"); bk.x=0; bk.z=0; bk.ry=0;
  V.objects.filter(o=>o.model==="person").forEach((p,i)=>{ p.x=0; p.z = i ? -0.3 : 0.05; });
  AC.changed(); await new Promise(r=>setTimeout(r,900)); AC.changed(); await new Promise(r=>setTimeout(r,600));`);
console.log(JSON.stringify(await S('return AC.S.video.objects.map(o=>({m:o.model,pose:o.pose,x:o.x,y:o.y,z:o.z,slot:o.seatedBikeSlot}))')));
for (const [name, az, el, dist, pz] of [['side', 90, 5, 3.6, 0], ['three4', 40, 14, 3.4, 0], ['wheel', 70, 10, 1.6, 0], ['front', 90, 8, 1.1, 0.7]]) {
  await S(`AC.setAz(${az}); AC.setEl(${el}); AC.setDist(${dist}); AC.S.video.camPan = ${pz} ? {x:0,y:-0.45,z:${pz}} : null; AC.S.focus.on=false; AC.changed(); await new Promise(r=>setTimeout(r,500));`);
  await S('VPTest.clearSelection(); await new Promise(r=>setTimeout(r,300));');
  await vp.screenshot({selector:'#vpFrame', file:`C:/Users/mdsha/AppData/Local/Temp/bike-${tag}-${name}.png`});
}
console.log('hands', JSON.stringify(await S('return VPTest.bikeHands()')));
console.log(JSON.stringify(vp.consoleLogs({onlyErrors:true}).filter(l=>!/Failed to load resource/.test(l.text))));
await vp.shutdown();
