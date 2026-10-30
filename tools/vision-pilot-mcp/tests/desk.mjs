import * as vp from '../lib.js';
const t0 = Date.now();
console.log(JSON.stringify(await vp.startDesktop({width:1440, height:900})).slice(0, 200));
const r = await vp.evaluate({script:`const t = performance.now(); while (!(window.VPTest && VPTest.ready) && performance.now() - t < 15000) await new Promise(r => setTimeout(r, 100));
  return {url: location.href, ready: VPTest.ready, loadMs: VPTest.loadMs, desktop: !!window.visionPilotDesktop?.isDesktop, attr: document.documentElement.dataset.desktopApp, loader: getComputedStyle(document.getElementById('vpLoadingScreen') || document.body).display,
    ext: await window.visionPilotDesktop.extensionLinkStatus(), site: await window.visionPilotDesktop.siteVersion()}`});
console.log('total', Date.now() - t0, 'ms', JSON.stringify(r));
await vp.screenshot({file:'C:/Users/mdsha/AppData/Local/Temp/desktop.png'});
await vp.stopDesktop();
