// VisionPilot AI Bridge — runs in the AI chat page itself (ChatGPT / Claude / Gemini) before the page's own code.
// The chat tab works in the background while you stay in VisionPilot. Hidden tabs pause animation frames and the page
// holds back work, so a finished image could sit there un-rendered. Here the page always sees itself as visible.
(() => {
  if (window.__vpPageVisible) return;
  window.__vpPageVisible = true;
  try {
    const proto = Document.prototype;
    const realHidden = Object.getOwnPropertyDescriptor(proto, 'hidden')?.get;
    const isReallyHidden = () => { try { return realHidden ? realHidden.call(document) : false; } catch (e) { return false; } };
    Object.defineProperty(proto, 'hidden', {configurable:true, get:() => false});
    Object.defineProperty(proto, 'visibilityState', {configurable:true, get:() => 'visible'});
    Object.defineProperty(proto, 'webkitHidden', {configurable:true, get:() => false});
    Object.defineProperty(proto, 'webkitVisibilityState', {configurable:true, get:() => 'visible'});
    proto.hasFocus = () => true;
    const swallow = e => { e.stopImmediatePropagation(); };
    document.addEventListener('visibilitychange', swallow, true);
    document.addEventListener('webkitvisibilitychange', swallow, true);
    window.addEventListener('blur', swallow, true);
    window.addEventListener('pagehide', swallow, true);

    // animation frames do not fire in a hidden tab: in that case run the callback from a timer instead
    const raf = window.requestAnimationFrame.bind(window), caf = window.cancelAnimationFrame.bind(window);
    let nextId = 1; const live = new Map();
    window.requestAnimationFrame = cb => {
      const id = nextId++;
      const run = ts => { if (!live.has(id)) return; const e = live.get(id); live.delete(id); caf(e.r); clearTimeout(e.t); try { cb(ts); } catch (err) { setTimeout(() => { throw err; }); } };
      live.set(id, {r:raf(run), t:isReallyHidden() ? setTimeout(() => run(performance.now()), 16) : 0});
      return id;
    };
    window.cancelAnimationFrame = id => { const e = live.get(id); if (!e) return; live.delete(id); caf(e.r); clearTimeout(e.t); };
  } catch (e) {}
})();
