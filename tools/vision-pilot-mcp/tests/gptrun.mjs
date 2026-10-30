import {launchWithExtension} from '../gptext.mjs';
const model = process.argv[2] || 'gpt';
const {browser} = await launchWithExtension({});
const page = (await browser.pages())[0];
page.on('console', m => { const t = m.text(); if (/VP|bridge|extension|error/i.test(t)) console.log('[page]', t.slice(0, 200)); });
await page.goto('http://localhost:8775/index.html', {waitUntil:'domcontentloaded'});
await page.waitForFunction('window.VPTest && VPTest.ready', {timeout:30000}).catch(() => console.log('no ready'));
const t0 = Date.now();
const res = await page.evaluate(async model => {
  const ok = await VPAIBridge.verifyExtensionInstalled?.().catch(e => 'err ' + e.message);
  const img = new Image(); img.src = 'add/add_image_1.png'; await img.decode();
  try { const text = await VPAIBridge.runReferenceImageStep({id:'t1', img}, model); return {ok, text}; }
  catch (e) { return {ok, error:e.message}; }
}, model);
console.log('result after', Math.round((Date.now() - t0) / 1000), 's', JSON.stringify(res).slice(0, 800));
for (const p of await browser.pages()) { const u = p.url(); if (/chatgpt|claude|gemini/.test(u)) { console.log(JSON.stringify(await p.evaluate(()=>{const pre=document.querySelector('pre');const chain=[];let e=pre;while(e&&e!==document.body){const a=[...e.attributes].filter(x=>/^data-|^role$|^id$/.test(x.name)).map(x=>x.name+'='+x.value.slice(0,40)).join(' ');chain.push(e.tagName.toLowerCase()+(a?' ['+a+']':'')+' .'+String(e.className).split(' ').slice(0,3).join('.'));e=e.parentElement;}return {chain,roles:[...document.querySelectorAll('[data-message-author-role]')].map(x=>x.getAttribute('data-message-author-role')),turns:[...document.querySelectorAll('[data-turn],article,[data-testid^=conversation-turn]')].map(x=>x.tagName+' '+(x.getAttribute('data-turn')||'')+' '+(x.getAttribute('data-testid')||'')),copy:[...document.querySelectorAll('button')].filter(b=>/copy/i.test((b.getAttribute('aria-label')||'')+(b.dataset.testid||''))).map(b=>(b.getAttribute('aria-label')||'')+'|'+(b.dataset.testid||''))}}),null,1)); await p.screenshot({path:`C:/Users/mdsha/AppData/Local/Temp/ai-${model}.png`}); console.log('ai tab', u); } }
await browser.close();
