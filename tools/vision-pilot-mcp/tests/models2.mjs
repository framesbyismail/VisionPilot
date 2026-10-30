import * as vp from '../lib.js';
await vp.startWebsite({width:1500, height:950});
const S = s => vp.evaluate({script:s});
await S('localStorage.clear(); AC.setPro && AC.setPro(true); await new Promise(r=>setTimeout(r,400)); document.getElementById("appVideo").click(); await new Promise(r=>setTimeout(r,800)); const b=[...document.querySelectorAll("button")].find(b=>b.offsetParent && /^(Start video|Start)$/i.test(b.textContent.trim())); b && b.click(); await new Promise(r=>setTimeout(r,1500));');
const cases = [['car'], ['cat'], ['animal'], ['chair', 'person'], ['stairs', 'person'], ['table'], ['phone'], ['ramp', 'bike']];
for (const ms of cases) {
  await S(`const V=AC.S.video; V.objects.length=0; const add=m=>{const s=document.getElementById("objAddModel"); s.value=m; document.getElementById("objAdd").click();};
    for (const m of ${JSON.stringify(ms)}) { add(m); await new Promise(r=>setTimeout(r,300)); }
    V.objects.forEach(o=>{ o.x=0; o.z=0; o.ry=0; });
    AC.S.focus.on=false; const big=Math.max(...V.objects.map(o=>Math.max(o.h||1,o.w||1)));
    AC.setAz(35); AC.setEl(14); AC.setDist(Math.max(1.2, big*2.4)); V.camPan=null; AC.changed(); await new Promise(r=>setTimeout(r,900)); AC.changed(); await new Promise(r=>setTimeout(r,500));`);
  await S('VPTest.clearSelection(); await new Promise(r=>setTimeout(r,300));');
  await vp.screenshot({selector:'#vpFrame', file:`C:/Users/mdsha/AppData/Local/Temp/m-${ms.join('-')}.png`});
}
console.log(JSON.stringify(vp.consoleLogs({onlyErrors:true}).filter(l=>!/Failed to load resource/.test(l.text))));
await vp.shutdown();
