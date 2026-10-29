// VisionPilot resizable panels (After Effects style).
// Drag the gap between columns to change their width, drag the bottom edge of any panel to change its height.
// Controls keep their own size: a smaller panel scrolls its content inside, nothing is squeezed or stretched.
// Double-click a handle to reset that size; "Reset layout" resets all. Sizes are kept per mode (image / video).
(() => {
  const KEY = 'vp-panel-sizes-v1';
  const MIN_PANEL = 90, MIN_CENTER = 520;
  // a column never gets narrower than what its widest row of controls needs
  const MIN_COL = 310, MIN_COL_R = 360;
  const mode = () => document.body.classList.contains('video') ? 'video' : 'image';
  let sizes = {};
  try { sizes = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { sizes = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(sizes)); } catch (e) {} };
  const bucket = () => (sizes[mode()] = sizes[mode()] || {cols:{}, panels:{}, center:{}});
  const wide = () => innerWidth >= 1251;

  // ---------- drag helper ----------
  function drag(handle, onStart, onMove, onEnd) {
    handle.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const start = onStart(e);
      if (start === false) return;
      handle.setPointerCapture(e.pointerId);
      document.body.classList.add('vp-resizing');
      handle.classList.add('active');
      const move = ev => onMove(ev.clientX - e.clientX, ev.clientY - e.clientY, start);
      const up = () => {
        handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up);
        document.body.classList.remove('vp-resizing'); handle.classList.remove('active');
        onEnd?.(start); save(); nudge();
      };
      handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', up);
    });
  }
  // canvases and the 3D view redraw from their own resize observers; this also covers window-level listeners
  let nudgeT;
  const nudge = () => { cancelAnimationFrame(nudgeT); nudgeT = requestAnimationFrame(() => window.dispatchEvent(new Event('resize'))); };

  // ---------- columns ----------
  const grids = () => [document.querySelector('main.grid'), document.querySelector('main.vgrid')].filter(Boolean);
  function colDefaults(g) {
    // what the stylesheet gives, read once per grid with our own sizes removed
    if (g.__vpDef) return g.__vpDef;
    const prev = g.style.gridTemplateColumns; g.style.gridTemplateColumns = '';
    const cs = getComputedStyle(g).gridTemplateColumns.split(' ').map(parseFloat);
    g.style.gridTemplateColumns = prev;
    return (g.__vpDef = cs.length === 3 ? {L:cs[0], R:cs[2]} : null);
  }
  function applyCols() {
    grids().forEach(g => {
      const m = g.classList.contains('vgrid') ? 'video' : 'image';
      const c = (sizes[m] || {}).cols || {};
      const d = wide() ? colDefaults(g) : null;
      // panel contents keep the designed column width (controls never stretch); a column only grows from there
      if (d) { g.style.setProperty('--vp-baseL', d.L + 'px'); g.style.setProperty('--vp-baseR', d.R + 'px'); }
      if (!d || (!c.L && !c.R)) { g.style.gridTemplateColumns = ''; return; }
      g.style.gridTemplateColumns = `${Math.round(Math.max(d.L, c.L || d.L))}px minmax(${MIN_CENTER}px,1fr) ${Math.round(Math.max(d.R, c.R || d.R))}px`;
    });
    placeColHandles();
  }
  function placeColHandles() {
    grids().forEach(g => {
      g.querySelectorAll(':scope > .vp-rs-col').forEach(h => {
        const kids = [...g.children].filter(k => !k.classList.contains('vp-rs'));
        const show = wide() && kids.length === 3 && g.offsetParent !== null;
        h.hidden = !show; if (!show) return;
        const a = kids[h.dataset.side === 'L' ? 0 : 1], gr = g.getBoundingClientRect(), ar = a.getBoundingClientRect();
        h.style.left = (ar.right - gr.left + (parseFloat(getComputedStyle(g).columnGap) || 10) / 2 - 5) + 'px';
      });
    });
  }
  function initCols() {
    grids().forEach(g => {
      if (g.querySelector(':scope > .vp-rs-col')) return;
      if (getComputedStyle(g).position === 'static') g.style.position = 'relative';
      ['L', 'R'].forEach(side => {
        const h = document.createElement('div');
        h.className = 'vp-rs vp-rs-col'; h.dataset.side = side; h.title = 'Drag to resize · double-click to reset';
        h.setAttribute('role', 'separator'); h.setAttribute('aria-orientation', 'vertical');
        g.appendChild(h);
        drag(h, () => {
          const kids = [...g.children].filter(k => !k.classList.contains('vp-rs'));
          if (kids.length !== 3 || !wide()) return false;
          return {L:kids[0].offsetWidth, R:kids[2].offsetWidth, total:g.clientWidth};
        }, (dx, dy, s) => {
          const m = g.classList.contains('vgrid') ? 'video' : 'image', b = (sizes[m] = sizes[m] || {cols:{}, panels:{}, center:{}});
          const gap = parseFloat(getComputedStyle(g).columnGap) || 10, room = s.total - MIN_CENTER - 2 * gap;
          if (side === 'L') b.cols.L = Math.max(MIN_COL, Math.min(room - s.R, s.L + dx));
          else b.cols.R = Math.max(MIN_COL_R, Math.min(room - s.L, s.R - dx));
          applyCols();
        });
        h.addEventListener('dblclick', () => { const m = g.classList.contains('vgrid') ? 'video' : 'image'; if (sizes[m]) delete sizes[m].cols[side]; save(); applyCols(); nudge(); });
      });
    });
    applyCols();
  }

  // ---------- panel heights (every .card in the docks, and the views in the middle column) ----------
  // only the side panels change height; the middle column (views, 3D viewport, timeline) stays fixed inside the screen
  const panels = () => [...document.querySelectorAll('.dock .card[id]')];
  // remove handles and sizes left on the middle column by an older version
  const unlockCenter = () => document.querySelectorAll('#iCenter > *, #vCenter > *').forEach(p => { p.querySelector(':scope > .vp-rs-row')?.remove(); p.classList.remove('vp-sized'); ['height', 'min-height', 'max-height', 'flex'].forEach(k => p.style.removeProperty(k)); });
  function applyPanels() {
    const b = sizes[mode()] || {panels:{}};
    panels().forEach(p => {
      const h = wide() ? (b.panels || {})[p.id] : 0;
      p.classList.toggle('vp-sized', !!h);
      if (h) { p.style.setProperty('height', h + 'px', 'important'); p.style.setProperty('min-height', h + 'px', 'important'); p.style.setProperty('max-height', h + 'px', 'important'); p.style.setProperty('flex', '0 0 auto', 'important'); }
      else ['height', 'min-height', 'max-height', 'flex'].forEach(k => p.style.removeProperty(k));
      addPanelHandle(p);
    });
  }
  function addPanelHandle(p) {
    let h = p.querySelector(':scope > .vp-rs-row');
    if (!h) {
      h = document.createElement('div');
      h.className = 'vp-rs vp-rs-row'; h.title = 'Drag to resize · double-click to reset';
      h.setAttribute('role', 'separator'); h.setAttribute('aria-orientation', 'horizontal');
      p.appendChild(h);
      drag(h, () => (wide() && !p.closest('.tgroup.collapsed') && !p.classList.contains('min')) ? {h:p.offsetHeight} : false,
        (dx, dy, s) => { bucket().panels[p.id] = Math.max(MIN_PANEL, Math.round(s.h + dy)); applyPanels(); });
      h.addEventListener('dblclick', () => { delete bucket().panels[p.id]; save(); applyPanels(); nudge(); });
    }
    h.hidden = !wide();
  }

  // ---------- test hooks (used by the Vision Pilot MCP) ----------
  const VPT = window.VPTest = window.VPTest || {};
  VPT.resizeAll = ({scale = 1} = {}) => {
    const b = bucket();
    panels().forEach(p => { if (p.offsetParent !== null && !p.closest('.tgroup.collapsed')) b.panels[p.id] = Math.max(MIN_PANEL, Math.round(p.offsetHeight * scale)); });
    grids().forEach(g => { const kids = [...g.children].filter(k => !k.classList.contains('vp-rs')); if (kids.length === 3 && g.offsetParent !== null) { b.cols.L = Math.max(MIN_COL, kids[0].offsetWidth * scale); b.cols.R = Math.max(MIN_COL_R, kids[2].offsetWidth * scale); } });
    applyCols(); applyPanels(); nudge();
  };
  VPT.resetSizes = () => { delete sizes[mode()]; save(); applyCols(); applyPanels(); nudge(); };
  VPT.panelSizes = () => JSON.parse(JSON.stringify(sizes));

  // ---------- wiring ----------
  const refresh = () => { initCols(); unlockCenter(); applyPanels(); };
  document.getElementById('resetLayout')?.addEventListener('click', () => { sizes = {}; save(); setTimeout(refresh, 0); nudge(); });
  addEventListener('resize', () => { applyCols(); placeColHandles(); });
  // panels move between docks (tabs, video mode): re-attach after every layout change
  const mo = new MutationObserver(() => { clearTimeout(mo.t); mo.t = setTimeout(refresh, 60); });
  const start = () => {
    refresh();
    document.querySelectorAll('main.grid, main.vgrid, .dock, #iCenter, #vCenter').forEach(el => mo.observe(el, {childList:true}));
    new MutationObserver(() => setTimeout(refresh, 30)).observe(document.body, {attributes:true, attributeFilter:['class']});
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
