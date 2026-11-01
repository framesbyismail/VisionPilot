// VisionPilot AI Bridge — Google Flow (labs.google/fx/tools/flow & flow.google.com) Dedicated Content Script
// Automates Nano Banana 2.1 image generation inside the reusable "Visionpilot" folder/project in Google Flow,
// supports 5 aspect ratios (16:9, 4:3, 1:1, 3:4, 9:16), 1-4 image count streaming, and 2K/4K upscale/download with fallback.
(function () {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let abortCurrentPrompt = false;

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 2 && rect.height > 2;
  }

  function radClick(el) {
    if (!el) return;
    try {
      const r = el.getBoundingClientRect();
      const opts = {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        clientX: r.left + r.width / 2,
        clientY: r.top + r.height / 2,
        button: 0,
        buttons: 1,
        pointerId: 1,
        isPrimary: true
      };
      el.dispatchEvent(new PointerEvent('pointerdown', opts));
      el.dispatchEvent(new MouseEvent('mousedown', opts));
      el.dispatchEvent(new PointerEvent('pointerup', { ...opts, buttons: 0 }));
      el.dispatchEvent(new MouseEvent('mouseup', { ...opts, buttons: 0 }));
    } catch (e) {}
    try {
      el.click();
    } catch (e) {}
  }

  // Inject MAIN-world helper using the page's CSP script nonce so it can type into ProseMirror, read images, and intercept Blob downloads for 2K/4K upscales
  function ensureMainWorldHooks() {
    if (document.documentElement.dataset.vpFlowMainHookInstalled === 'true') return;
    try {
      const nonceScript = Array.from(document.querySelectorAll('script')).find(
        (s) => s.nonce || s.getAttribute('nonce')
      );
      const nonce = nonceScript ? nonceScript.nonce || nonceScript.getAttribute('nonce') || '' : '';
      const script = document.createElement('script');
      if (nonce) script.nonce = nonce;
      script.textContent = `
        (function() {
          if (window.__vpFlowMainHookActive) return;
          window.__vpFlowMainHookActive = true;
          document.documentElement.dataset.vpFlowMainHookInstalled = 'true';

          // 1. MAIN-world ProseMirror prompt typing listener
          window.addEventListener('vp-main-world-type-prompt', (ev) => {
            try {
              const detail = ev?.detail || {};
              const text = String(detail.text || '');
              const target =
                document.querySelector('[aria-label="What do you want to create?"]') ||
                document.querySelector('div.ProseMirror[contenteditable="true"]') ||
                document.querySelector('div[contenteditable="true"][role="textbox"]') ||
                document.querySelector('textarea');
              if (!target) return;
              target.focus();

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

              const sel = window.getSelection();
              const range = document.createRange();
              range.selectNodeContents(target);
              sel.removeAllRanges();
              sel.addRange(range);
              document.execCommand('insertText', false, text);
              if ((target.innerText || target.textContent || '').trim().length >= Math.min(8, text.length)) {
                document.documentElement.dataset.vpPromptTypedMethod = 'mainExecCommand';
                return;
              }

              const dt = new window.DataTransfer();
              dt.setData('text/plain', text);
              const pasteEv = new window.ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                composed: true,
                clipboardData: dt
              });
              target.dispatchEvent(pasteEv);
              document.documentElement.dataset.vpPromptTypedMethod = 'mainPaste';
            } catch (err) {
              document.documentElement.dataset.vpPromptTypedMethod = 'error:' + (err?.message || String(err));
            }
          });

          // 2. MAIN-world image reader (fetch with credentials or canvas fallback)
          window.addEventListener('vp-main-world-read-image', async (ev) => {
            try {
              const src = ev?.detail?.src || '';
              if (!src) return;
              document.documentElement.dataset.vpExtractedImageDataUrl = '';
              try {
                const resp = await window.fetch(src, { credentials: 'include' });
                if (resp.ok) {
                  const blob = await resp.blob();
                  const dataUrl = await new Promise((resolve) => {
                    const r = new FileReader();
                    r.onloadend = () => resolve(String(r.result || ''));
                    r.onerror = () => resolve('');
                    r.readAsDataURL(blob);
                  });
                  if (dataUrl && dataUrl.startsWith('data:image/')) {
                    document.documentElement.dataset.vpExtractedImageDataUrl = dataUrl;
                    return;
                  }
                }
              } catch (e) {}
              const matchImg = Array.from(document.querySelectorAll('img')).find(
                (im) => im.currentSrc === src || im.src === src
              );
              if (matchImg && matchImg.naturalWidth > 0 && matchImg.naturalHeight > 0) {
                const c = document.createElement('canvas');
                c.width = matchImg.naturalWidth;
                c.height = matchImg.naturalHeight;
                c.getContext('2d').drawImage(matchImg, 0, 0);
                const dUrl = c.toDataURL('image/png');
                if (dUrl && dUrl.startsWith('data:image/')) {
                  document.documentElement.dataset.vpExtractedImageDataUrl = dUrl;
                }
              }
            } catch (e) {}
          });

          // 3. MAIN-world Blob & <a download> interceptor for 2K/4K upscales
          const blobMap = new Map();
          const origCreateObjectURL = URL.createObjectURL.bind(URL);
          URL.createObjectURL = function(obj) {
            const url = origCreateObjectURL(obj);
            if (obj instanceof Blob) {
              blobMap.set(url, obj);
              if (document.documentElement.dataset.vpFlowCapturingUpscale === 'true' && obj.type && obj.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onloadend = () => {
                  if (typeof reader.result === 'string' && reader.result.startsWith('data:image/')) {
                    document.documentElement.dataset.vpFlowUpscaleDataUrl = reader.result;
                  }
                };
                reader.readAsDataURL(obj);
              }
            }
            return url;
          };

          const origAnchorClick = HTMLAnchorElement.prototype.click;
          HTMLAnchorElement.prototype.click = function() {
            try {
              const href = this.href || '';
              if (document.documentElement.dataset.vpFlowCapturingUpscale === 'true' && href) {
                const blob = blobMap.get(href);
                if (blob) {
                  const reader = new FileReader();
                  reader.onloadend = () => {
                    if (typeof reader.result === 'string' && reader.result.startsWith('data:image/')) {
                      document.documentElement.dataset.vpFlowUpscaleDataUrl = reader.result;
                    }
                  };
                  reader.readAsDataURL(blob);
                } else if (!href.startsWith('javascript:')) {
                  document.documentElement.dataset.vpFlowUpscaleUrl = href;
                }
              }
            } catch (e) {}
            return origAnchorClick.apply(this, arguments);
          };
        })();
      `;
      (document.head || document.documentElement).appendChild(script);
      script.remove();
    } catch (e) {}
  }

  function findFlowEditor() {
    const exact = document.querySelector('[aria-label="What do you want to create?"]');
    if (exact && isVisible(exact)) return exact;

    const candidates = [
      ...Array.from(document.querySelectorAll('div[contenteditable="true"][role="textbox"]')),
      ...Array.from(document.querySelectorAll('div[contenteditable="true"]')),
      ...Array.from(document.querySelectorAll('textarea'))
    ].filter((el) => {
      if (!isVisible(el)) return false;
      const aria = (el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').toLowerCase();
      if (/editable\s*text|search|rename|project\s*name/i.test(aria)) return false;
      const rect = el.getBoundingClientRect();
      return rect.width >= 200;
    });

    candidates.sort((a, b) => {
      const aPh = (a.getAttribute('aria-label') || a.getAttribute('placeholder') || '').toLowerCase();
      const bPh = (b.getAttribute('aria-label') || b.getAttribute('placeholder') || '').toLowerCase();
      const aScore = (/what do you want to create|prompt|describe|generate|create/i.test(aPh) ? 20 : 0) + a.getBoundingClientRect().width / 100;
      const bScore = (/what do you want to create|prompt|describe|generate|create/i.test(bPh) ? 20 : 0) + b.getBoundingClientRect().width / 100;
      return bScore - aScore;
    });
    return candidates[0] || null;
  }

  function isLoggedOutOfFlow() {
    if (findFlowEditor()) return false;
    if (document.querySelector('a[href*="/project/"]') || document.querySelector('button[aria-label="Settings trigger"]')) {
      return false;
    }
    const signInLinks = Array.from(document.querySelectorAll('a[href*="accounts.google.com"], button')).filter((el) => {
      if (!isVisible(el)) return false;
      const txt = (el.innerText || el.textContent || el.getAttribute('aria-label') || '').trim();
      return /^(sign\s*in|sign\s*in\s*with\s*google|log\s*in)$/i.test(txt);
    });
    return signInLinks.length > 0;
  }

  // Click any "Create with Flow" / "Launch Flow" landing CTA only when on the marketing page (never on dashboard/workspace)
  async function dismissLandingOrEnterFlow() {
    if (
      location.hostname === 'flow.google.com' ||
      location.pathname.includes('/project/') ||
      document.querySelector('a[href*="/project/"]') ||
      document.querySelector('button[aria-label="Settings trigger"]') ||
      findFlowEditor()
    ) {
      return;
    }
    const buttons = Array.from(document.querySelectorAll('button, a[role="button"], a')).filter(isVisible);
    const enterBtn = buttons.find((b) => {
      const t = (b.innerText || b.textContent || '').trim();
      return /^(create\s+with\s+flow|launch\s+flow|open\s+flow|enter\s+flow|try\s+flow)$/i.test(t);
    });
    if (enterBtn) {
      try {
        radClick(enterBtn);
        await sleep(1200);
      } catch (e) {}
    }
  }

  // Rename the active project to "Visionpilot" via Google Flow's input[aria-label="Editable text"]
  async function ensureProjectNamedVisionpilot() {
    try {
      const titleInp = document.querySelector('input[aria-label="Editable text"]');
      if (titleInp && isVisible(titleInp)) {
        const val = (titleInp.value || '').trim();
        if (/^visionpilot$/i.test(val)) return;
        radClick(titleInp);
        titleInp.focus();
        try {
          titleInp.select();
          document.execCommand('insertText', false, 'Visionpilot');
        } catch (e) {}
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(titleInp, 'Visionpilot');
        else titleInp.value = 'Visionpilot';
        titleInp.dispatchEvent(new Event('input', { bubbles: true }));
        titleInp.dispatchEvent(new Event('change', { bubbles: true }));
        titleInp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        titleInp.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        titleInp.blur();
        await sleep(250);
      }
    } catch (e) {}
  }

  // Ensure we are inside the single reusable "Visionpilot" project/folder in Google Flow
  async function ensureVisionpilotFlowProject(timeoutMs = 25000) {
    const t0 = Date.now();
    await dismissLandingOrEnterFlow();

    let savedPath = '/project/8472a28b-463a-493c-a126-2dc2375f3599';
    try {
      const st = await chrome.storage.local.get(['vpFlowProjectPath', 'vpFlowProjectUrl']);
      if (st?.vpFlowProjectPath && st.vpFlowProjectPath.startsWith('/project/')) {
        savedPath = st.vpFlowProjectPath;
      } else if (st?.vpFlowProjectUrl) {
        const m = String(st.vpFlowProjectUrl).match(/(\/project\/[a-f0-9-]+)/i);
        if (m) savedPath = m[1];
      }
    } catch (e) {}

    let waitedForDashboardCards = false;

    while (Date.now() - t0 < timeoutMs) {
      if (isLoggedOutOfFlow()) {
        throw new Error('Not logged in to Google Flow. Please sign in to your Google account.');
      }

      // Case 1: Already inside a project workspace with a prompt editor
      const editor = findFlowEditor();
      if (editor) {
        await ensureProjectNamedVisionpilot();
        try {
          if (location.pathname.startsWith('/project/')) {
            chrome.storage?.local?.set({
              vpFlowProjectUrl: location.href,
              vpFlowProjectPath: location.pathname
            });
          }
        } catch (e) {}
        return editor;
      }

      // Case 2: On the Google Flow dashboard — wait up to 5s for project cards to render before deciding
      if (!location.pathname.startsWith('/project/')) {
        if (!waitedForDashboardCards) {
          waitedForDashboardCards = true;
          const tCards = Date.now();
          while (Date.now() - tCards < 5500 && !document.querySelector('a[href*="/project/"]')) {
            await sleep(250);
          }
        }

        const projLinks = Array.from(document.querySelectorAll('a[href*="/project/"]'));
        // 2a. Look for a project card named "Visionpilot"
        let targetLink = projLinks.find((a) => {
          let p = a;
          for (let k = 0; k < 4 && p; k++) {
            if (/\bvisionpilot\b/i.test(p.innerText || p.textContent || '')) return true;
            p = p.parentElement;
          }
          return false;
        });

        // 2b. Otherwise reuse our saved project path (/project/...) so we NEVER create duplicate projects
        if (!targetLink && savedPath) {
          targetLink = projLinks.find((a) => a.getAttribute('href') === savedPath);
        }

        if (targetLink) {
          console.log('[VP Flow] Opening existing Visionpilot project:', targetLink.getAttribute('href'));
          radClick(targetLink);
          const tOpen = Date.now();
          while (Date.now() - tOpen < 10000 && !findFlowEditor()) {
            await sleep(250);
          }
          const edAfter = findFlowEditor();
          if (edAfter) {
            await ensureProjectNamedVisionpilot();
            try {
              chrome.storage?.local?.set({
                vpFlowProjectUrl: location.href,
                vpFlowProjectPath: location.pathname
              });
            } catch (e) {}
            return edAfter;
          }
        }

        // Case 3: Only if neither a "Visionpilot" project nor our saved project exists on the dashboard, click "add New project" once
        const newProjBtn = Array.from(document.querySelectorAll('button, a, [role="button"]'))
          .filter(isVisible)
          .find((el) => {
            const txt = (el.innerText || el.textContent || el.getAttribute('aria-label') || '').trim();
            return /(\bnew\s+project\b|create\s+project|start\s+new\s+project)/i.test(txt);
          });

        if (newProjBtn) {
          console.log('[VP Flow] Creating "Visionpilot" project in Google Flow for the first time...');
          radClick(newProjBtn);
          const tCreate = Date.now();
          while (Date.now() - tCreate < 12000 && !findFlowEditor()) {
            await sleep(250);
          }
          const edNew = findFlowEditor();
          if (edNew) {
            await ensureProjectNamedVisionpilot();
            try {
              chrome.storage?.local?.set({
                vpFlowProjectUrl: location.href,
                vpFlowProjectPath: location.pathname
              });
            } catch (e) {}
            return edNew;
          }
        }
      }

      await sleep(350);
    }

    if (isLoggedOutOfFlow()) {
      throw new Error('Not logged in to Google Flow. Please sign in to your Google account.');
    }
    throw new Error('Google Flow workspace is not ready. Please make sure Google Flow is open and signed in.');
  }

  // Select Aspect Ratio (16:9, 4:3, 1:1, 3:4, 9:16) and Image Count (x1, x2, x3, x4)
  // inside Google Flow's Settings popover (button[aria-label="Settings trigger"]).
  // Never change or click the model family dropdown if Nano Banana 2.1 is already the default.
  async function configureFlowSettings(aspectRatio = '16:9', imageCount = 1) {
    try {
      const countNum = Math.max(1, Math.min(4, Number(imageCount) || 1));
      const ratioStr = ['16:9', '4:3', '1:1', '3:4', '9:16'].includes(aspectRatio) ? aspectRatio : '16:9';
      const ratioIconMap = {
        '16:9': 'crop_16_9',
        '4:3': 'crop_landscape',
        '1:1': 'crop_square',
        '3:4': 'crop_portrait',
        '9:16': 'crop_9_16'
      };
      const expectedIcon = ratioIconMap[ratioStr] || 'crop_16_9';

      const settingsBtn = document.querySelector('button[aria-label="Settings trigger"]');
      if (!settingsBtn || !isVisible(settingsBtn)) return;

      // Fast path: if Settings trigger button summary already shows Nano Banana 2.1 (default) + expected aspect ratio icon + xN, do nothing at all
      const curSummary = (settingsBtn.innerText || settingsBtn.textContent || '').trim().replace(/\s+/g, ' ');
      const alreadyNanoBanana = /nano\s*banana\s*2\.1|nano\s*banana/i.test(curSummary);
      if (
        alreadyNanoBanana &&
        curSummary.includes(expectedIcon) &&
        new RegExp(`\\bx${countNum}\\b`, 'i').test(curSummary)
      ) {
        return;
      }

      // Open Settings popover only when aspect ratio or count needs adjustment
      radClick(settingsBtn);
      await sleep(450);

      const getRadios = () => Array.from(document.querySelectorAll('.cdk-overlay-container button[role="radio"], button[role="radio"], [role="radio"]')).filter(isVisible);
      const isRadioSelected = (r) =>
        r.getAttribute('aria-checked') === 'true' ||
        r.getAttribute('data-state') === 'checked' ||
        r.getAttribute('data-state') === 'true';

      // 1. Ensure "Image" mode radio ("image Image") is selected
      const imgRadio = getRadios().find((r) => /\bimage\b/i.test(r.innerText || r.textContent || ''));
      if (imgRadio && !isRadioSelected(imgRadio)) {
        radClick(imgRadio);
        await sleep(250);
      }

      // 2. Select Aspect Ratio radio only if not already selected
      const ratioRadio = getRadios().find((r) => {
        const t = (r.innerText || r.textContent || '').trim();
        return t.includes(ratioStr) || t.includes(expectedIcon);
      });
      if (ratioRadio && !isRadioSelected(ratioRadio)) {
        radClick(ratioRadio);
        await sleep(220);
      }

      // 3. Select Image Count radio ("x1", "x2", "x3", "x4") only if not already selected
      const countRx = new RegExp(`^x${countNum}$`, 'i');
      const countRadio = getRadios().find((r) => {
        const t = (r.innerText || r.textContent || '').trim();
        return countRx.test(t);
      });
      if (countRadio && !isRadioSelected(countRadio)) {
        radClick(countRadio);
        await sleep(220);
      }

      // 4. If Nano Banana 2.1 is already default, NEVER touch or change the model family button
      if (!alreadyNanoBanana) {
        const modelFamilyBtn = document.querySelector('button[aria-label="Select model family"]');
        if (modelFamilyBtn && isVisible(modelFamilyBtn)) {
          const curModelTxt = (modelFamilyBtn.innerText || modelFamilyBtn.textContent || '').trim();
          if (!/nano\s*banana\s*2\.1|nano\s*banana/i.test(curModelTxt)) {
            radClick(modelFamilyBtn);
            await sleep(300);
            const options = Array.from(
              document.querySelectorAll('.cdk-overlay-container [role="option"], .cdk-overlay-container [role="menuitem"], .cdk-overlay-container button, [role="option"], [role="menuitem"]')
            ).filter(isVisible);
            const nbOpt =
              options.find((o) => /nano\s*banana\s*2\.1/i.test(o.innerText || o.textContent || '')) ||
              options.find((o) => /nano\s*banana/i.test(o.innerText || o.textContent || ''));
            if (nbOpt) {
              radClick(nbOpt);
              await sleep(250);
            }
          }
        }
      }

      // Close Settings popover cleanly via CDK backdrop or single toggle click
      const backdrop = document.querySelector('.cdk-overlay-backdrop.cdk-overlay-backdrop-showing, .cdk-overlay-backdrop');
      if (backdrop) {
        radClick(backdrop);
      } else if (getRadios().length > 0) {
        radClick(settingsBtn);
      }
      await sleep(350);
    } catch (err) {
      console.warn('[VP Flow] Settings configuration warning:', err);
    }
  }

  function dataUrlToFile(dataUrl, filename) {
    const parts = String(dataUrl || '').split(',');
    const mimeMatch = (parts[0] || '').match(/:(.*?);/);
    const mime = (mimeMatch && mimeMatch[1]) || 'image/png';
    const bstr = atob(parts[1] || '');
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new File([u8arr], filename || 'reference.png', { type: mime, lastModified: Date.now() });
  }

  // Compute a 16x16 RGB fingerprint of an image dataUrl so we can guarantee the uploaded main reference image
  // is NEVER mistaken for a newly generated output image in Google Flow's gallery.
  async function computeImageFingerprint(dataUrl) {
    if (!dataUrl || !String(dataUrl).startsWith('data:image/')) return null;
    return new Promise((resolve) => {
      const im = new Image();
      const timer = setTimeout(() => resolve(null), 4000);
      im.onload = () => {
        clearTimeout(timer);
        try {
          const c = document.createElement('canvas');
          c.width = 16;
          c.height = 16;
          const ctx = c.getContext('2d');
          ctx.drawImage(im, 0, 0, 16, 16);
          const data = ctx.getImageData(0, 0, 16, 16).data;
          const rgb = new Uint8Array(16 * 16 * 3);
          for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
            rgb[j] = data[i];
            rgb[j + 1] = data[i + 1];
            rgb[j + 2] = data[i + 2];
          }
          resolve({ rgb, w: im.naturalWidth || 0, h: im.naturalHeight || 0 });
        } catch (e) {
          resolve(null);
        }
      };
      im.onerror = () => {
        clearTimeout(timer);
        resolve(null);
      };
      im.src = dataUrl;
    });
  }

  function isMatchingFingerprint(fpA, fpB) {
    if (!fpA || !fpB || !fpA.rgb || !fpB.rgb || fpA.rgb.length !== fpB.rgb.length) return false;
    let diffSum = 0;
    for (let i = 0; i < fpA.rgb.length; i++) {
      diffSum += Math.abs(fpA.rgb[i] - fpB.rgb[i]);
    }
    const meanAbsDiff = diffSum / fpA.rgb.length;
    return meanAbsDiff < 9.5;
  }

  async function uploadReferenceImageToFlow(images, editor) {
    if (!Array.isArray(images) || !images.length) return false;
    // Skip tiny 1x1 diagnostic dummy images
    const realImages = images.filter((img) => String(img?.dataUrl || '').length > 220);
    if (!realImages.length) return false;

    // 1. Clear any old text/ingredients in the prompt box BEFORE uploading the reference image
    const clearBtn = document.querySelector('button[aria-label="Clear prompt"]');
    if (clearBtn && isVisible(clearBtn) && !clearBtn.disabled) {
      radClick(clearBtn);
      await sleep(250);
    }

    const preUploadImgs = new Set(Array.from(document.querySelectorAll('img')));
    const files = realImages.map((img, i) => dataUrlToFile(img.dataUrl, img.name || `reference-${i + 1}.png`));
    const curEditor = findFlowEditor() || editor;

    // 2. Paste into the Google Flow prompt editor first
    if (curEditor) {
      curEditor.focus();
      await sleep(80);
      try {
        const dt = new DataTransfer();
        files.forEach((f) => dt.items.add(f));
        curEditor.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
      } catch (e) {}
      await sleep(650);
    }

    const hasNewImgOrSpinner = () => {
      const curImgs = Array.from(document.querySelectorAll('img'));
      if (curImgs.some((im) => !preUploadImgs.has(im))) return true;
      const spinners = Array.from(
        document.querySelectorAll('mat-progress-spinner, [role="progressbar"], [class*="upload" i], [class*="spinner" i], [class*="loading" i]')
      ).filter(isVisible);
      return spinners.length > 0;
    };

    // 3. Fallback: Drag-and-drop onto the prompt editor / composer container if paste didn't trigger upload yet
    if (!hasNewImgOrSpinner() && curEditor) {
      try {
        const dropTarget = curEditor.closest('form') || curEditor.parentElement?.parentElement || curEditor;
        const dt = new DataTransfer();
        files.forEach((f) => dt.items.add(f));
        for (const evType of ['dragenter', 'dragover', 'drop']) {
          dropTarget.dispatchEvent(new DragEvent(evType, { bubbles: true, cancelable: true, composed: true, dataTransfer: dt }));
        }
      } catch (e) {}
      await sleep(650);
    }

    // 4. Fallback: <input type="file"> if present in DOM
    if (!hasNewImgOrSpinner()) {
      const fileInput = document.querySelector('input[type="file"][accept*="image" i]') || document.querySelector('input[type="file"]');
      if (fileInput) {
        const dt = new DataTransfer();
        files.forEach((f) => dt.items.add(f));
        try { fileInput.value = ''; } catch (e) {}
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'files')?.set;
        if (setter) setter.call(fileInput, dt.files);
        else fileInput.files = dt.files;
        fileInput.dispatchEvent(new Event('input', { bubbles: true }));
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(650);
      }
    }

    // 5. Wait until the uploaded reference image is 100% uploaded and loaded in Google Flow BEFORE typing the prompt
    const tUploadStart = Date.now();
    while (Date.now() - tUploadStart < 3500 && !hasNewImgOrSpinner()) {
      await sleep(200);
    }

    const tWaitLoad = Date.now();
    let stableReadyTicks = 0;
    while (Date.now() - tWaitLoad < 22000) {
      const spinners = Array.from(
        document.querySelectorAll('mat-progress-spinner, [role="progressbar"], [class*="uploading" i], [class*="spinner" i]')
      ).filter(isVisible);
      const newImgs = Array.from(document.querySelectorAll('img')).filter((im) => !preUploadImgs.has(im) && isVisible(im));
      const allNewImgsComplete =
        newImgs.length > 0 &&
        newImgs.every((im) => im.complete && (im.naturalWidth || 0) > 0 && !/^blob:/i.test(im.currentSrc || im.src || ''));

      if (spinners.length === 0 && (allNewImgsComplete || (newImgs.length > 0 && Date.now() - tWaitLoad > 3500))) {
        stableReadyTicks++;
        if (stableReadyTicks >= 4) break;
      } else {
        stableReadyTicks = 0;
      }
      await sleep(300);
    }

    // Extra settle delay so any gallery tile Google Flow adds for the uploaded reference image finishes mounting
    await sleep(1400);
    return true;
  }

  async function typePromptIntoFlow(editor, promptText, skipClear = false) {
    if (!skipClear) {
      const clearBtn = document.querySelector('button[aria-label="Clear prompt"]');
      if (clearBtn && isVisible(clearBtn) && !clearBtn.disabled) {
        radClick(clearBtn);
        await sleep(200);
      }
    }

    editor.focus();
    await sleep(100);

    if (editor.tagName === 'TEXTAREA' || editor.tagName === 'INPUT') {
      const proto = editor.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(editor, promptText);
      else editor.value = promptText;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      editor.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      try {
        const dt = new DataTransfer();
        dt.setData('text/plain', promptText);
        editor.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
      } catch (e) {}
      await sleep(250);

      const curText = (editor.innerText || editor.textContent || '').trim();
      if (!curText || !curText.includes(promptText.slice(0, Math.min(12, promptText.length)))) {
        try {
          const sel = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(editor);
          sel.removeAllRanges();
          sel.addRange(range);
          document.execCommand('insertText', false, promptText);
        } catch (e) {}
        await sleep(200);
      }
    }

    // Wait up to 2.5s for "Start generation" button to become enabled
    const tWaitBtn = Date.now();
    while (Date.now() - tWaitBtn < 2500) {
      const sb = document.querySelector('button[aria-label="Start generation"]');
      if (sb && !sb.disabled && sb.getAttribute('aria-disabled') !== 'true') break;
      await sleep(100);
    }
    await sleep(150);
  }

  function findFlowGenerateButton(editor) {
    const exact = document.querySelector('button[aria-label="Start generation"]');
    if (exact && isVisible(exact)) {
      return exact;
    }

    const composer = (editor && (editor.closest('form') || editor.parentElement?.parentElement?.parentElement)) || document;
    const buttons = [
      ...Array.from(composer.querySelectorAll('button, [role="button"]')),
      ...Array.from(document.querySelectorAll('button, [role="button"]'))
    ].filter(isVisible);

    return buttons.find((b) => {
      if (b.disabled || b.getAttribute('aria-disabled') === 'true') return false;
      const txt = (b.innerText || b.textContent || b.getAttribute('aria-label') || '').trim();
      return /^(start\s+generation|generate|create|send|run|submit|arrow_upward|arrow_forward)$/i.test(txt);
    });
  }

  function isFlowGenerating() {
    const spinners = Array.from(
      document.querySelectorAll('mat-progress-spinner, [role="progressbar"], [class*="loading" i], [class*="generating" i], [class*="spinner" i], [class*="skeleton" i]')
    ).filter(isVisible);
    if (spinners.length > 0) return true;
    const stopBtn = Array.from(document.querySelectorAll('button')).filter(isVisible).find((b) => {
      const t = (b.innerText || b.textContent || b.getAttribute('aria-label') || '').trim();
      return /^(stop|cancel|abort)$/i.test(t);
    });
    return Boolean(stopBtn);
  }

  async function extractGeneratedImageDataUrl(imgEl) {
    if (!imgEl) return { imageDataUrl: '', imageUrl: '' };
    const src = imgEl.currentSrc || imgEl.src || '';
    if (src.startsWith('data:image/')) {
      return { imageDataUrl: src, imageUrl: src };
    }

    // 1. MAIN-world reader
    try {
      document.documentElement.dataset.vpExtractedImageDataUrl = '';
      window.dispatchEvent(new CustomEvent('vp-main-world-read-image', { detail: { src } }));
      for (let i = 0; i < 20; i++) {
        await sleep(100);
        const res = document.documentElement.dataset.vpExtractedImageDataUrl || '';
        if (res && res.startsWith('data:image/')) {
          return { imageDataUrl: res, imageUrl: src };
        }
      }
    } catch (e) {}

    // 2. Content-script fetch
    if (src) {
      try {
        const resp = await fetch(src, { credentials: 'include' });
        if (resp.ok) {
          const blob = await resp.blob();
          const dataUrl = await new Promise((resolve) => {
            const r = new FileReader();
            r.onloadend = () => resolve(String(r.result || ''));
            r.onerror = () => resolve('');
            r.readAsDataURL(blob);
          });
          if (dataUrl && dataUrl.startsWith('data:image/')) {
            return { imageDataUrl: dataUrl, imageUrl: src };
          }
        }
      } catch (e) {}
    }

    // 3. Background worker fetch
    if (src && /^https?:/i.test(src)) {
      try {
        const bgRes = await chrome.runtime.sendMessage({ type: 'VP_FETCH_IMAGE_AS_DATAURL', url: src });
        if (bgRes && bgRes.ok && bgRes.dataUrl) {
          return { imageDataUrl: bgRes.dataUrl, imageUrl: src };
        }
      } catch (e) {}
    }

    return { imageDataUrl: '', imageUrl: src };
  }

  // Generate 1, 2, 3, or 4 images in Google Flow (Nano Banana 2.1) and stream each finished image back to VisionPilot one by one
  async function runFlowImageGeneration(payload) {
    abortCurrentPrompt = false;
    ensureMainWorldHooks();
    const reqId = payload.reqId || '';
    const targetCount = Math.max(1, Math.min(4, Number(payload.imageCount) || 1));
    const aspectRatio = payload.aspectRatio || '16:9';

    const editor = await ensureVisionpilotFlowProject(25000);
    if (abortCurrentPrompt) throw new Error('Image generation cancelled.');

    // Wait briefly for existing project gallery tiles (<flow-image-tile>) to finish mounting after navigation
    const tGallery = Date.now();
    while (Date.now() - tGallery < 2200 && !document.querySelector('flow-image-tile img')) {
      await sleep(250);
    }
    await sleep(400);

    await configureFlowSettings(aspectRatio, targetCount);
    if (abortCurrentPrompt) throw new Error('Image generation cancelled.');

    const beforeImgs = new Set(Array.from(document.querySelectorAll('img')));
    const beforeSrcs = new Set(
      Array.from(document.querySelectorAll('img'))
        .map((im) => im.currentSrc || im.src)
        .filter(Boolean)
    );
    const beforeMediaIds = new Set(
      Array.from(document.querySelectorAll('img[data-media-id]'))
        .map((im) => im.getAttribute('data-media-id'))
        .filter(Boolean)
    );

    const snapshotExistingImages = () => {
      Array.from(document.querySelectorAll('img')).forEach((im) => {
        beforeImgs.add(im);
        if (im.currentSrc) beforeSrcs.add(im.currentSrc);
        if (im.src) beforeSrcs.add(im.src);
        const mid = im.getAttribute('data-media-id');
        if (mid) beforeMediaIds.add(mid);
      });
    };

    const refFingerprints = [];
    if (Array.isArray(payload.images)) {
      for (const imgObj of payload.images) {
        if (imgObj?.dataUrl && String(imgObj.dataUrl).length > 220) {
          const fp = await computeImageFingerprint(imgObj.dataUrl);
          if (fp) refFingerprints.push(fp);
        }
      }
    }

    let hasUploadedImage = false;
    if (payload.images && payload.images.length) {
      try {
        chrome.runtime.sendMessage({ type: 'VP_STAGE', reqId, stage: 'uploading' });
      } catch (e) {}
      hasUploadedImage = await uploadReferenceImageToFlow(payload.images, editor);
      await sleep(500);
    }
    if (abortCurrentPrompt) throw new Error('Image generation cancelled.');

    // Record any newly added reference thumbnail URLs and uploaded image gallery tiles so they are NEVER mistaken for generated output images
    snapshotExistingImages();

    const collectedResults = [];
    const collectedElements = [];
    const collectedMediaIds = [];
    const seenGeneratedKeys = new Set();

    const triggerAndCollectBatch = async () => {
      const curEditor = findFlowEditor() || editor;
      await typePromptIntoFlow(curEditor, payload.instruction || '', hasUploadedImage && collectedResults.length === 0);
      if (abortCurrentPrompt) throw new Error('Image generation cancelled.');

      // Snapshot again right before clicking Start generation so any late-mounted uploaded reference tile is excluded
      snapshotExistingImages();

      try {
        chrome.runtime.sendMessage({ type: 'VP_STAGE', reqId, stage: 'sending' });
      } catch (e) {}

      const genBtn = findFlowGenerateButton(curEditor);
      if (genBtn) {
        radClick(genBtn);
      } else {
        curEditor.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true })
        );
      }

      try {
        chrome.runtime.sendMessage({ type: 'VP_STAGE', reqId, stage: 'generating' });
      } catch (e) {}

      // Anything that appears within the first 1.2s after clicking Start generation is an uploaded input preview, not a generated result
      await sleep(1200);
      snapshotExistingImages();

      const composerRoot = curEditor
        ? curEditor.closest('form') || curEditor.parentElement?.parentElement?.parentElement
        : null;

      const findNewGeneratedImages = () => {
        const tileImgs = Array.from(
          document.querySelectorAll('flow-image-tile img, img[alt*="Tile displaying" i], img[src*="flow-content.google"]')
        );
        const pool = tileImgs.length ? tileImgs : Array.from(document.querySelectorAll('img'));
        return pool.filter((im) => {
          if (beforeImgs.has(im)) return false;
          if (composerRoot && composerRoot.contains(im)) return false;
          const mid = im.getAttribute('data-media-id') || '';
          if (mid && beforeMediaIds.has(mid)) return false;
          const src = im.currentSrc || im.src || '';
          if (!src || beforeSrcs.has(src)) return false;
          if (/avatar|profile|favicon|icon|logo|sparkle|accounts\.google|gstatic\.com\/gb\/images/i.test(src)) return false;
          const rect = im.getBoundingClientRect();
          const w = Math.max(im.naturalWidth || 0, Math.round(rect.width));
          const h = Math.max(im.naturalHeight || 0, Math.round(rect.height));
          return im.complete && w >= 120 && h >= 120;
        });
      };

      const tBatch = Date.now();
      let idleAfterAtLeastOne = 0;
      let retrySendAttempts = 0;
      const startCount = collectedResults.length;

      while (Date.now() - tBatch < 50000) {
        if (abortCurrentPrompt) throw new Error('Image generation cancelled.');
        if (isLoggedOutOfFlow()) {
          throw new Error('Logged out of Google Flow while generating.');
        }

        // If the prompt is still sitting unsubmitted in the editor and Start generation is enabled, re-trigger submit
        if (collectedResults.length === startCount && retrySendAttempts < 6 && Date.now() - tBatch > 900) {
          const liveEd = findFlowEditor() || curEditor;
          const liveTxt = liveEd ? (liveEd.innerText || liveEd.textContent || '').trim() : '';
          const liveBtn = document.querySelector('button[aria-label="Start generation"]');
          if (liveTxt.length > 8 && liveBtn && !liveBtn.disabled && liveBtn.getAttribute('aria-disabled') !== 'true') {
            retrySendAttempts++;
            radClick(liveBtn);
            if (liveEd) {
              liveEd.focus();
              liveEd.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true })
              );
            }
          }
        }

        const candidates = findNewGeneratedImages();
        for (const imgEl of candidates) {
          const mid = imgEl.getAttribute('data-media-id') || '';
          const src = imgEl.currentSrc || imgEl.src || '';
          const key = mid || src;
          if (!key || seenGeneratedKeys.has(key)) continue;
          await sleep(400);
          const settledMid = imgEl.getAttribute('data-media-id') || mid;
          const settledSrc = imgEl.currentSrc || imgEl.src || src;
          const settledKey = settledMid || settledSrc;
          if (seenGeneratedKeys.has(settledKey)) continue;

          seenGeneratedKeys.add(settledKey);
          if (settledMid) {
            seenGeneratedKeys.add(settledMid);
            beforeMediaIds.add(settledMid);
          }
          seenGeneratedKeys.add(settledSrc);
          beforeImgs.add(imgEl);
          beforeSrcs.add(settledSrc);

          const extracted = await extractGeneratedImageDataUrl(imgEl);
          if (extracted.imageDataUrl && refFingerprints.length > 0) {
            const candFp = await computeImageFingerprint(extracted.imageDataUrl);
            if (candFp && refFingerprints.some((rf) => isMatchingFingerprint(candFp, rf))) {
              console.log('[VP Flow] Skipping tile that matches the uploaded main reference image.');
              continue;
            }
          }

          if (extracted.imageDataUrl || extracted.imageUrl) {
            const idx = collectedResults.length;
            collectedResults.push(extracted);
            collectedElements.push(imgEl);
            collectedMediaIds.push(settledMid || '');

            // Stream this image immediately to VisionPilot so it appears one-by-one in the UI
            try {
              chrome.runtime.sendMessage({
                type: 'VP_FLOW_PROGRESS',
                reqId,
                index: idx,
                totalCount: targetCount,
                imageDataUrl: extracted.imageDataUrl || '',
                imageUrl: extracted.imageUrl || ''
              });
            } catch (e) {}

            if (collectedResults.length >= targetCount) {
              return;
            }
          }
        }

        if (collectedResults.length > startCount) {
          idleAfterAtLeastOne++;
          if (idleAfterAtLeastOne >= 10) return;
        } else {
          idleAfterAtLeastOne = 0;
        }

        await sleep(600);
      }
    };

    let safetyLoops = 0;
    while (collectedResults.length < targetCount && safetyLoops < targetCount) {
      safetyLoops++;
      const prevCount = collectedResults.length;
      await triggerAndCollectBatch();
      if (collectedResults.length === prevCount) break;
    }

    if (!collectedResults.length) {
      const curTiles = Array.from(document.querySelectorAll('flow-image-tile img')).map((im) => ({
        mid: im.getAttribute('data-media-id') || '',
        nw: im.naturalWidth,
        src: (im.currentSrc || im.src || '').slice(0, 80)
      }));
      const edNow = findFlowEditor();
      const edTxt = edNow ? (edNow.innerText || edNow.textContent || '').trim() : 'no-editor';
      const stBtn = document.querySelector('button[aria-label="Start generation"]');
      const stDis = stBtn ? Boolean(stBtn.disabled || stBtn.getAttribute('aria-disabled') === 'true') : 'no-btn';
      throw new Error(
        `Google Flow did not return any new generated images (beforeMids=${Array.from(beforeMediaIds).join(',')}, curTiles=${JSON.stringify(curTiles)}, edTxt=${edTxt.slice(0, 40)}, stDis=${stDis}).`
      );
    }

    window.__vpLastFlowImgElements = collectedElements;
    window.__vpLastFlowMediaIds = collectedMediaIds;
    const primary = collectedResults[0];
    return {
      ok: true,
      provider: 'flow',
      imageDataUrl: primary.imageDataUrl || '',
      imageUrl: primary.imageUrl || '',
      images: collectedResults.map((r) => ({
        imageDataUrl: r.imageDataUrl || '',
        imageUrl: r.imageUrl || ''
      }))
    };
  }

  // Trigger Google Flow's native 2K or 4K download/upscale for a generated image at `imageIndex`
  // via `<flow-image-tile>` -> `button[aria-label="More options"]` -> `Download` -> `2K Upscaled` / `4K Upscaled`.
  // If Google Flow does not have 4K/2K available on the user's account, returns { ok: false, fallbackToLocal: true }
  // so VisionPilot falls back to its built-in 4K upscaler.
  async function runFlowImageUpscale(payload) {
    ensureMainWorldHooks();
    if (payload && payload.resolution === '__DIAG__') {
      const ed = findFlowEditor();
      const sb = document.querySelector('button[aria-label="Start generation"]');
      const box = document.querySelector('flow-base-prompt-box');
      const edText = ed ? (ed.innerText || ed.textContent || '') : '';
      const boxText = box ? (box.innerText || box.textContent || '').replace(/\s+/g, ' ').slice(0, 500) : '';
      const sbFullHtml = sb ? sb.outerHTML : null;
      const sbParentHtml = sb && sb.parentElement ? sb.parentElement.outerHTML : null;
      const sbGrandParentHtml = sb && sb.parentElement && sb.parentElement.parentElement ? sb.parentElement.parentElement.outerHTML.slice(0, 1200) : null;
      const form = (ed && ed.closest('form')) || (sb && sb.closest('form')) || document.querySelector('form');

      // Also check all elements inside flow-base-prompt-box except svg and ProseMirror text
      const boxClone = box ? box.cloneNode(true) : null;
      if (boxClone) {
        boxClone.querySelectorAll('svg, .ProseMirror').forEach(x => x.remove());
      }
      const boxStructure = boxClone ? boxClone.innerHTML.slice(0, 2000) : null;

      return {
        ok: false,
        fallbackToLocal: true,
        error: JSON.stringify({
          edTextLen: edText.length,
          edTextStart: edText.slice(0, 120),
          edTextEnd: edText.slice(-120),
          boxText,
          hasForm: Boolean(form),
          sbDisabled: sb ? sb.disabled : null,
          sbAriaDisabled: sb ? sb.getAttribute('aria-disabled') : null,
          sbClasses: sb ? sb.className : null,
          sbFullHtml,
          sbParentHtml,
          sbGrandParentHtml,
          boxStructure
        })
      };
    }
    const scale = Number(payload.scaleFactor || payload.scale) === 2 ? 2 : 4;
    const resolution = scale === 2 ? '2K' : '4K';
    const imageIndex = Math.max(0, Number(payload.imageIndex) || 0);

    try {
      const savedMediaIds = window.__vpLastFlowMediaIds || [];
      const savedEls = window.__vpLastFlowImgElements || [];
      let targetImg = null;

      if (savedMediaIds[imageIndex]) {
        targetImg = document.querySelector(`flow-image-tile img[data-media-id="${savedMediaIds[imageIndex]}"]`);
      }
      if (!targetImg && savedEls[imageIndex] && document.contains(savedEls[imageIndex])) {
        targetImg = savedEls[imageIndex];
      }
      if (!targetImg) {
        const tileImgs = Array.from(document.querySelectorAll('flow-image-tile img, img[alt*="Tile displaying" i]'));
        targetImg = tileImgs[imageIndex] || tileImgs[0] || null;
      }

      if (!targetImg) {
        return { ok: false, fallbackToLocal: true, error: 'Target generated image tile not found in Google Flow.' };
      }

      const tile =
        targetImg.closest('flow-image-tile') ||
        targetImg.parentElement?.parentElement?.parentElement ||
        targetImg.parentElement;

      if (tile) {
        for (const el of [tile, targetImg, targetImg.parentElement]) {
          if (!el) continue;
          el.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
          el.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
          el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
          el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        }
        await sleep(300);
      }

      const moreBtn =
        (tile && tile.querySelector('button[aria-label="More options"]')) ||
        (tile &&
          Array.from(tile.querySelectorAll('button, [role="button"]')).find((b) =>
            /more_vert|more\s+options/i.test(`${b.innerText || ''} ${b.getAttribute('aria-label') || ''}`)
          ));

      if (!moreBtn) {
        return { ok: false, fallbackToLocal: true, error: `Google Flow tile "More options" button not found.` };
      }

      radClick(moreBtn);
      await sleep(450);

      const overlay = document.querySelector('.cdk-overlay-container') || document.body;
      const dlMenuItem = Array.from(overlay.querySelectorAll('button[role="menuitem"], [role="menuitem"], button')).find(
        (el) => /\bdownload\b/i.test(el.innerText || el.textContent || '')
      );

      if (!dlMenuItem) {
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
        return { ok: false, fallbackToLocal: true, error: `Google Flow Download menu item not found.` };
      }

      // Open the Download submenu ("1K Original size", "2K Upscaled", "4K Upscaled")
      dlMenuItem.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
      dlMenuItem.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      radClick(dlMenuItem);
      await sleep(500);

      const resRx = resolution === '4K' ? /\b4k\b|4096/i : /\b2k\b|2048/i;
      const subItems = Array.from(overlay.querySelectorAll('button[role="menuitem"], [role="menuitem"], button')).filter(
        isVisible
      );
      const resItem = subItems.find((item) => {
        const txt = (item.innerText || item.textContent || item.getAttribute('aria-label') || '').trim();
        return resRx.test(txt) && txt.length < 80;
      });

      if (!resItem) {
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
        return {
          ok: false,
          fallbackToLocal: true,
          error: `Google Flow ${resolution} download option is not available on this account.`
        };
      }

      const itemTxt = (resItem.innerText || resItem.textContent || '').trim();
      const isDisabledOrLocked =
        resItem.disabled ||
        resItem.getAttribute('aria-disabled') === 'true' ||
        /\b(upgrade|locked|subscribe|ultra\s+only|pro\s+only)\b/i.test(itemTxt) ||
        Boolean(resItem.querySelector('[class*="lock" i], mat-icon[data-mat-icon-name*="lock" i]'));

      if (isDisabledOrLocked) {
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
        return {
          ok: false,
          fallbackToLocal: true,
          error: `Google Flow ${resolution} is locked/unavailable on this account.`
        };
      }

      // Arm MAIN-world Blob/Anchor download capture before clicking 2K Upscaled / 4K Upscaled
      document.documentElement.dataset.vpFlowCapturingUpscale = 'true';
      document.documentElement.dataset.vpFlowUpscaleDataUrl = '';
      document.documentElement.dataset.vpFlowUpscaleUrl = '';

      radClick(resItem);

      const tWait = Date.now();
      while (Date.now() - tWait < 28000) {
        await sleep(500);
        const capturedDataUrl = document.documentElement.dataset.vpFlowUpscaleDataUrl || '';
        if (capturedDataUrl && capturedDataUrl.startsWith('data:image/')) {
          document.documentElement.dataset.vpFlowCapturingUpscale = 'false';
          return {
            ok: true,
            provider: 'flow',
            resolution,
            nativeDownloadTriggered: true,
            imageDataUrl: capturedDataUrl,
            imageUrl: ''
          };
        }
        const capturedUrl = document.documentElement.dataset.vpFlowUpscaleUrl || '';
        if (capturedUrl) {
          document.documentElement.dataset.vpFlowCapturingUpscale = 'false';
          const extracted = await extractGeneratedImageDataUrl({ currentSrc: capturedUrl, src: capturedUrl });
          if (extracted.imageDataUrl || extracted.imageUrl) {
            return {
              ok: true,
              provider: 'flow',
              resolution,
              nativeDownloadTriggered: true,
              imageDataUrl: extracted.imageDataUrl,
              imageUrl: extracted.imageUrl
            };
          }
        }
      }

      document.documentElement.dataset.vpFlowCapturingUpscale = 'false';
      return {
        ok: false,
        fallbackToLocal: true,
        error: `Google Flow ${resolution} upscale timed out; falling back to VisionPilot upscale.`
      };
    } catch (err) {
      document.documentElement.dataset.vpFlowCapturingUpscale = 'false';
      return {
        ok: false,
        fallbackToLocal: true,
        error: err?.message || String(err)
      };
    }
  }

  window.__vpFlowMessageHandler = (msg, sender, sendResponse) => {
    if (!msg) return false;

    if (msg.type === 'VP_SITE_ABORT_PROMPT') {
      abortCurrentPrompt = true;
      const stopBtn = Array.from(document.querySelectorAll('button')).filter(isVisible).find((b) => {
        const t = (b.innerText || b.textContent || b.getAttribute('aria-label') || '').trim();
        return /^(stop|cancel|abort)$/i.test(t);
      });
      if (stopBtn) {
        try { radClick(stopBtn); } catch (e) {}
      }
      sendResponse({ ok: true, aborted: true });
      return true;
    }

    if (msg.type === 'VP_SITE_CHECK_READY') {
      (async () => {
        try {
          await dismissLandingOrEnterFlow();
          if (isLoggedOutOfFlow()) {
            sendResponse({
              ok: false,
              error: 'Not logged in to Google Flow. Please sign in to your Google account.'
            });
            return;
          }
          sendResponse({ ok: true, provider: 'flow', url: location.href });
        } catch (err) {
          sendResponse({ ok: false, error: err?.message || String(err) });
        }
      })();
      return true;
    }

    if (msg.type === 'VP_SITE_GENERATE_IMAGE') {
      runFlowImageGeneration(msg.payload || msg || {})
        .then((res) => sendResponse(res))
        .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
      return true;
    }

    if (msg.type === 'VP_SITE_UPSCALE_FLOW_IMAGE') {
      runFlowImageUpscale(msg.payload || msg || {})
        .then((res) => sendResponse(res))
        .catch((err) => sendResponse({ ok: false, fallbackToLocal: true, error: err?.message || String(err) }));
      return true;
    }

    return false;
  };

  if (!window.__vpFlowListenerRegistered) {
    window.__vpFlowListenerRegistered = true;
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (typeof window.__vpFlowMessageHandler === 'function') {
        return window.__vpFlowMessageHandler(msg, sender, sendResponse);
      }
      return false;
    });
  }
})();
