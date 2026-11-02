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

    // Intercept off-DOM <input type="file">.click() and showOpenFilePicker when VisionPilot attaches reference files
    let pendingFiles = null;
    window.addEventListener('vp-main-world-prepare-file-picker', (ev) => {
      try {
        const imgs = ev?.detail?.images || [];
        if (!imgs.length) { pendingFiles = null; return; }
        pendingFiles = imgs.map((img, i) => {
          const parts = String(img.dataUrl || '').split(',');
          const mime = ((parts[0] || '').match(/:(.*?);/) || [])[1] || img.mime || 'image/png';
          const bstr = atob(parts[1] || '');
          let n = bstr.length;
          const u8 = new Uint8Array(n);
          while (n--) u8[n] = bstr.charCodeAt(n);
          return new File([u8], img.name || `reference-${i + 1}.png`, { type: mime, lastModified: Date.now() });
        });
      } catch (e) { pendingFiles = null; }
    });
    const origClick = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function (...args) {
      if (this && this.type === 'file' && pendingFiles && pendingFiles.length > 0) {
        const filesToUse = pendingFiles;
        pendingFiles = null;
        try {
          const dt = new DataTransfer();
          filesToUse.forEach(f => dt.items.add(f));
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files')?.set;
          if (setter) setter.call(this, dt.files);
          else this.files = dt.files;
          this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
          this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
          document.documentElement.dataset.vpFilePickerIntercepted = 'true';
        } catch (e) {}
        return;
      }
      return origClick.apply(this, args);
    };

    // Patch Google Flow's flow-base-prompt-box submit(a) so synthetic clicks & Enter submits work even when an Ingredient reference image is attached
    const installFlowTrustedSubmitPatch = () => {
      try {
        for (const winKey of Object.getOwnPropertyNames(window)) {
          if (!/^default_|AiSandbox/i.test(winKey)) continue;
          const ns = window[winKey];
          if (!ns || typeof ns !== 'object') continue;
          for (const prop of Object.getOwnPropertyNames(ns)) {
            try {
              const cls = ns[prop];
              if (typeof cls !== 'function' || !cls.prototype || typeof cls.prototype.submit !== 'function') continue;
              const fnStr = Function.prototype.toString.call(cls.prototype.submit);
              if (!fnStr.includes('isTrusted') && !fnStr.includes('.prompt.') && !fnStr.includes('.xh.emit')) continue;
              if (!cls.prototype.submit.__vpWrapped) {
                const origSubmit = cls.prototype.submit;
                const wrappedSubmit = function (a) {
                  window.__vpFlowPromptBox = this;
                  const trustedEvent =
                    a && typeof a === 'object' && a.isTrusted === true
                      ? a
                      : {
                          isTrusted: true,
                          type: (a && a.type) || 'click',
                          target: (a && a.target) || null,
                          currentTarget: (a && a.currentTarget) || null,
                          preventDefault() {},
                          stopPropagation() {},
                          stopImmediatePropagation() {}
                        };
                  return origSubmit.call(this, trustedEvent);
                };
                wrappedSubmit.__vpWrapped = true;
                cls.prototype.submit = wrappedSubmit;
              }
              for (const m of ['isDisabled', 'Le', 'Nk', 'clear']) {
                if (typeof cls.prototype[m] === 'function' && !cls.prototype[m].__vpWrapped) {
                  const origM = cls.prototype[m];
                  const wrappedM = function (...args) {
                    window.__vpFlowPromptBox = this;
                    return origM.apply(this, args);
                  };
                  wrappedM.__vpWrapped = true;
                  cls.prototype[m] = wrappedM;
                }
              }
            } catch (e) {}
          }
        }
      } catch (e) {}
    };

    if (!window.__vpFlowMainHooksInstalled) {
      window.__vpFlowMainHooksInstalled = true;

      // MAIN-world ProseMirror / React prompt setter for Google Flow and other editors
      window.addEventListener('vp-main-world-type-prompt', (ev) => {
        try {
          installFlowTrustedSubmitPatch();
          const detail = ev?.detail || {};
          const text = String(detail.text || '');
          const target =
            document.querySelector('[aria-label="What do you want to create?"]') ||
            document.querySelector('div.ProseMirror[contenteditable="true"]') ||
            document.querySelector('div[contenteditable="true"][role="textbox"]') ||
            document.querySelector('textarea');
          if (!target) return;
          target.focus();

          // 1. Direct ProseMirror EditorView transaction (works even in unfocused background tabs!)
          const pmView =
            target.pmViewDesc?.view ||
            target.querySelector?.('*')?.pmViewDesc?.view ||
            target.__pmView;
          if (pmView && pmView.state && typeof pmView.dispatch === 'function') {
            const tr = pmView.state.tr.insertText(text, 0, pmView.state.doc.content.size);
            pmView.dispatch(tr);
            document.documentElement.dataset.vpPromptTypedMethod = 'pmView';
            return;
          }

          // Select existing contents inside ProseMirror first so pasting replaces rather than appends
          try {
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(target);
            sel.removeAllRanges();
            sel.addRange(range);
          } catch (e) {}

          // 2. MAIN-world ClipboardEvent('paste') with real MAIN-world DataTransfer
          const dt = new window.DataTransfer();
          dt.setData('text/plain', text);
          const pasteEv = new window.ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            composed: true,
            clipboardData: dt
          });
          try {
            if (!pasteEv.clipboardData || !pasteEv.clipboardData.getData('text/plain')) {
              Object.defineProperty(pasteEv, 'clipboardData', { value: dt, configurable: true });
            }
          } catch (e) {}
          target.dispatchEvent(pasteEv);
          if ((target.innerText || target.textContent || '').trim().includes(text.slice(0, 12))) {
            document.documentElement.dataset.vpPromptTypedMethod = 'mainPaste';
            return;
          }

          // 3. Selection + execCommand('insertText') in MAIN world
          const sel = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(target);
          sel.removeAllRanges();
          sel.addRange(range);
          document.execCommand('insertText', false, text);
          document.documentElement.dataset.vpPromptTypedMethod = 'mainExecCommand';
        } catch (err) {
          document.documentElement.dataset.vpPromptTypedMethod = 'error:' + (err?.message || String(err));
        }
      });

      // MAIN-world Google Flow submit trigger (bypasses isTrusted check when Ingredient image is attached)
      window.addEventListener('vp-main-world-submit-flow', () => {
        try {
          installFlowTrustedSubmitPatch();
          const boxEl = document.querySelector('flow-base-prompt-box');
          if (boxEl && !window.__vpFlowPromptBox) {
            try { boxEl.click(); } catch (e) {}
          }
          const sb = document.querySelector('button[aria-label="Start generation"]');
          if (sb && !sb.disabled && sb.getAttribute('aria-disabled') !== 'true') {
            sb.click();
          }
          setTimeout(() => {
            try {
              const ed = document.querySelector('[aria-label="What do you want to create?"]') || document.querySelector('div.ProseMirror[contenteditable="true"]');
              const remTxt = ed ? (ed.innerText || ed.textContent || '').trim() : '';
              if (remTxt.length > 0 && window.__vpFlowPromptBox && typeof window.__vpFlowPromptBox.submit === 'function') {
                window.__vpFlowPromptBox.submit({
                  isTrusted: true,
                  type: 'click',
                  preventDefault() {},
                  stopPropagation() {},
                  stopImmediatePropagation() {}
                });
              }
            } catch (e) {}
          }, 150);
        } catch (e) {}
      });
    }

    // MAIN-world download & Blob capture for Google Flow 2K / 4K upscale downloads (runs in MAIN world, bypassing CSP)
    if (!window.__vpFlowDlHooked) {
      window.__vpFlowDlHooked = true;
      const blobMap = new Map();
      const emitCapturedUpscale = (dataUrl, url = '', nativeDownloadTriggered = true) => {
        if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return;
        try {
          window.postMessage({
            __vpFlowUpscaleCaptured: true,
            dataUrl,
            url: url || '',
            nativeDownloadTriggered: Boolean(nativeDownloadTriggered)
          }, '*');
        } catch (_) {}
      };
      const readBlobToDataUrl = (blob, url = '', nativeDownloadTriggered = true) => {
        try {
          if (!blob || !(blob instanceof Blob) || blob.size < 15000) return;
          const reader = new FileReader();
          reader.onloadend = () => {
            if (typeof reader.result === 'string' && reader.result.startsWith('data:')) {
              emitCapturedUpscale(reader.result, url, nativeDownloadTriggered);
            }
          };
          reader.readAsDataURL(blob);
        } catch (_) {}
      };

      const origCreateObjectURL = URL.createObjectURL.bind(URL);
      URL.createObjectURL = function (obj) {
        const objectUrl = origCreateObjectURL(obj);
        try {
          if (obj instanceof Blob && obj.size > 15000) {
            blobMap.set(objectUrl, obj);
            setTimeout(() => blobMap.delete(objectUrl), 120000);
            if (document.documentElement.dataset.vpFlowUpscaleWatching === 'true') {
              readBlobToDataUrl(obj, objectUrl, true);
            }
          }
        } catch (_) {}
        return objectUrl;
      };

      const origA = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function (...args) {
        try {
          const href = this && this.href ? String(this.href) : '';
          const isWatching = document.documentElement.dataset.vpFlowUpscaleWatching === 'true';
          if (href && (this.hasAttribute('download') || isWatching || /blob:|googleusercontent|storage\.googleapis|labs\.google|flow\.google/i.test(href))) {
            document.documentElement.dataset.vpFlowUpscaleUrl = href;
            if (isWatching) {
              if (blobMap.has(href)) {
                readBlobToDataUrl(blobMap.get(href), href, true);
              } else if (href.startsWith('data:image/')) {
                emitCapturedUpscale(href, href, true);
              } else {
                fetch(href)
                  .then(r => (r.ok ? r.blob() : null))
                  .then(b => { if (b) readBlobToDataUrl(b, href, true); })
                  .catch(() => {});
              }
            }
          }
        } catch (_) {}
        return origA.apply(this, args);
      };

      const origFetch = window.fetch.bind(window);
      window.fetch = async function (...args) {
        const res = await origFetch(...args);
        try {
          if (document.documentElement.dataset.vpFlowUpscaleWatching === 'true') {
            const ct = (res.headers?.get('content-type') || '').toLowerCase();
            if (ct.startsWith('image/') || ct.includes('octet-stream')) {
              res.clone().blob().then(b => {
                if (b && b.size > 25000) readBlobToDataUrl(b, res.url || '', true);
              }).catch(() => {});
            }
          }
        } catch (_) {}
        return res;
      };
    }
  } catch (e) {}
})();
