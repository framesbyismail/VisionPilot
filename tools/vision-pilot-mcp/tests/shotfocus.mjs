import * as vp from '../lib.js';
const [w, h] = (process.argv[2] || '1366x768').split('x').map(Number);
await vp.startWebsite({width:w, height:h});
await vp.evaluate({script:'localStorage.removeItem("vp-panel-sizes-v1"); AC.setPro && AC.setPro(true); AC.S.focus.on=true; AC.changed(); await new Promise(r=>setTimeout(r,700));'});
const r = await vp.evaluate({script:'const b=document.getElementById("pFocus").getBoundingClientRect(); return {x:b.x,y:b.y,w:b.width,h:b.height, right:Math.round(document.querySelector(".focus-right").getBoundingClientRect().width), bar:Math.round(document.getElementById("focusModeBar").getBoundingClientRect().width)}'});
console.log(JSON.stringify(r));
await vp.screenshot({file:`C:/Users/mdsha/AppData/Local/Temp/focus-${w}.png`});
await vp.shutdown();
