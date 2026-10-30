import * as vp from '../lib.js';
import {launchWithExtension} from '../gptext.mjs';
await vp.startDesktop({width:1440, height:900});
const {browser} = await launchWithExtension({});
// the extension links to the app by itself
const linked = await vp.evaluate({script:`for (let i = 0; i < 60; i++) { const s = await window.visionPilotDesktop.extensionLinkStatus(); if (s.connected) return s; await new Promise(r => setTimeout(r, 500)); } return 'not linked'`});
console.log('link', JSON.stringify(linked));
await new Promise(r => setTimeout(r, 3500));
console.log('label', await vp.evaluate({script:`return document.getElementById('aiExtTopLbl')?.textContent`}));
const t0 = Date.now();
const res = await vp.evaluate({script:`const img = new Image(); img.src = 'add/add_image_2.png'; await img.decode();
  try { return {text: await VPAIBridge.runReferenceImageStep({id:'d1', img}, 'gpt')}; } catch (e) { return {error: e.message}; }`});
console.log('gpt via desktop after', Math.round((Date.now() - t0) / 1000), 's', JSON.stringify(res).slice(0, 400));
await browser.close(); await vp.stopDesktop();
