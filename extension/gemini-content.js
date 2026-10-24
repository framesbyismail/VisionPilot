// VisionPilot AI Bridge — Google Gemini (gemini.google.com) Dedicated Content Script
// Handles real image file upload, typing instructions, clicking send, waiting for reply completion,
// clicking copy buttons on every code block, and falling back to selecting only the code block or last reply text.
(function () {
  if (window.__vpGeminiContentLoaded) return;
  window.__vpGeminiContentLoaded = true;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let abortCurrentPrompt = false;

  function dataUrlToFile(dataUrl, filename) {
    const parts = String(dataUrl || '').split(',');
    const mimeMatch = (parts[0] || '').match(/:(.*?);/);
    const mime = (mimeMatch && mimeMatch[1]) || 'image/png';
    const bstr = atob(parts[1] || '');
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new File([u8arr], filename || 'image.png', { type: mime, lastModified: Date.now() });
  }

  function findEditor() {
    return (
      document.querySelector('rich-textarea div.ql-editor[contenteditable="true"]') ||
      document.querySelector('div.ql-editor[contenteditable="true"]') ||
      document.querySelector('div[contenteditable="true"][role="textbox"]')
    );
  }

  function isLoggedOut() {
    const signInLink = document.querySelector('a[href*="accounts.google.com/ServiceLogin"]');
    if (signInLink && signInLink.offsetParent !== null && !findEditor()) return true;
    return false;
  }

  async function waitForEditor(timeoutMs = 15000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (isLoggedOut()) {
        throw new Error('Not logged in to Google Gemini (gemini.google.com). Please sign in to your Google account.');
      }
      const ed = findEditor();
      if (ed) return ed;
      await sleep(250);
    }
    if (isLoggedOut()) {
      throw new Error('Not logged in to Google Gemini (gemini.google.com). Please sign in to your Google account.');
    }
    throw new Error('Gemini chat input box was not found. Make sure gemini.google.com/app is open and logged in.');
  }

  async function uploadImagesToGemini(images, editor) {
    if (!Array.isArray(images) || !images.length) return;
    console.log(`[VP Gemini] Uploading ${images.length} image(s)...`);
    const files = images.map((img, i) => dataUrlToFile(img.dataUrl, img.name || `image-${i + 1}.png`));

    const fileInput = document.querySelector('input[type="file"]');
    if (fileInput) {
      const dt = new DataTransfer();
      files.forEach((f) => dt.items.add(f));
      try {
        fileInput.value = '';
      } catch (e) {}
      fileInput.files = dt.files;
      fileInput.dispatchEvent(new Event('input', { bubbles: true }));
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      editor.focus();
      for (const file of files) {
        const dt = new DataTransfer();
        dt.items.add(file);
        const pasteEv = new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: dt
        });
        editor.dispatchEvent(pasteEv);
        await sleep(350);
      }
    }

    await sleep(700);
    const t0 = Date.now();
    while (Date.now() - t0 < 25000) {
      if (abortCurrentPrompt) throw new Error('Request cancelled.');
      const spinner = document.querySelector(
        'mat-progress-spinner, [role="progressbar"], .upload-spinner, .loading-spinner'
      );
      if (!spinner || spinner.offsetParent === null) break;
      await sleep(350);
    }
    await sleep(400);
    console.log('[VP Gemini] Image upload complete.');
  }

  async function typeInstructionIntoGemini(editor, instruction) {
    console.log('[VP Gemini] Typing instruction into editor...');
    const targetLen = Math.floor(String(instruction || '').trim().length * 0.85);
    editor.focus();
    try {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editor);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('delete', false, null);
    } catch (e) {
      editor.innerHTML = '<p><br></p>';
    }
    await sleep(80);

    // 1. Try ClipboardEvent('paste') with text/plain so Quill parses multi-line JSON cleanly
    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', instruction);
      const pasteEv = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        composed: true,
        clipboardData: dt
      });
      editor.dispatchEvent(pasteEv);
    } catch (e) {}
    await sleep(80);

    // 2. If full text wasn't inserted via paste, use execCommand('insertText')
    let currentText = (editor.innerText || editor.textContent || '').trim();
    if (currentText.length < targetLen) {
      try {
        if (currentText.length > 0) {
          editor.innerHTML = '<p><br></p>';
          editor.focus();
        }
        document.execCommand('insertText', false, instruction);
      } catch (e) {}
      await sleep(80);
    }

    // 3. Final fallback: populate <p> inside editor and fire InputEvent('input')
    currentText = (editor.innerText || editor.textContent || '').trim();
    if (currentText.length < targetLen) {
      editor.innerHTML = '';
      const p = document.createElement('p');
      p.textContent = instruction;
      editor.appendChild(p);
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: instruction }));
    }
    await sleep(250);
  }

  function findSendButton() {
    return (
      document.querySelector('button.send-button') ||
      document.querySelector('button[aria-label="Send message"]') ||
      document.querySelector('button[aria-label*="Send" i]') ||
      document.querySelector('button[mattooltip*="Send" i]')
    );
  }

  function getAssistantMessages() {
    return Array.from(document.querySelectorAll('message-content, .model-response-text'));
  }

  function getAllRootCodeBlocks(rootEl) {
    const codeEls = Array.from((rootEl || document).querySelectorAll('code-block, pre'));
    return codeEls.filter((el) => !codeEls.some((other) => other !== el && other.contains(el)));
  }

  function isGeminiStreaming() {
    const stopBtn = document.querySelector(
      'button[aria-label*="Stop" i], button.stop-button, [mattooltip*="Stop" i]'
    );
    if (stopBtn && stopBtn.offsetParent !== null) return true;
    return false;
  }

  function revealHoverOnElement(el) {
    if (!el) return;
    try {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } catch (e) {}
    const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : { left: 20, top: 20, width: 100, height: 40 };
    const evInit = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: Math.round(rect.left + Math.min(40, Math.max(5, rect.width / 2))),
      clientY: Math.round(rect.top + Math.min(20, Math.max(5, rect.height / 2)))
    };
    try {
      el.dispatchEvent(new PointerEvent('pointerover', evInit));
      el.dispatchEvent(new PointerEvent('pointerenter', evInit));
      el.dispatchEvent(new MouseEvent('mouseover', evInit));
      el.dispatchEvent(new MouseEvent('mouseenter', evInit));
      el.dispatchEvent(new MouseEvent('mousemove', evInit));
    } catch (e) {}
  }

  function cleanExtractedCodeText(raw) {
    let text = String(raw || '').trim();
    if (!text) return '';
    text = text
      .replace(/^```[a-z0-9_-]*\s*\n?/i, '')
      .replace(/\n?```\s*$/i, '')
      .trim();
    text = text
      .replace(/^(?:plaintext|text|markdown|copy\s*code|copy|copied!?|bash|json)\s*\n+/i, '')
      .replace(/^(?:copy\s*code|copy|copied!?)\s*\n+/i, '')
      .trim();
    return text;
  }

  async function selectAndCopyNodeText(targetNode) {
    if (!targetNode || targetNode === document.body || targetNode === document.documentElement) {
      return '';
    }
    const sel = window.getSelection();
    let resultText = '';
    try {
      window.focus();
      document.documentElement.dataset.vpLastCopied = '';
      if (sel) {
        const range = document.createRange();
        range.selectNodeContents(targetNode);
        sel.removeAllRanges();
        sel.addRange(range);
        try {
          document.execCommand('copy');
        } catch (e) {}
        const fromHook = (document.documentElement.dataset.vpLastCopied || '').trim();
        const fromSel = (sel.toString() || '').trim();
        sel.removeAllRanges();
        resultText = fromHook || fromSel;
      }
      if (!resultText) {
        resultText = (targetNode.innerText || targetNode.textContent || '').trim();
      }
    } catch (e) {
      try {
        if (sel) sel.removeAllRanges();
      } catch (_) {}
      resultText = (targetNode.innerText || targetNode.textContent || '').trim();
    }
    return cleanExtractedCodeText(resultText);
  }

  async function extractGeminiCodeBlocks(newMsgs, beforeBlocksCount) {
    try {
      await chrome.runtime.sendMessage({ type: 'VP_FOCUS_TAB_FOR_COPY' });
    } catch (e) {}
    try {
      window.focus();
    } catch (e) {}

    const allBlocksAfter = getAllRootCodeBlocks(document).slice(beforeBlocksCount);
    const msgBlocks = [];
    for (const m of newMsgs) {
      if (!m) continue;
      revealHoverOnElement(m);
      for (const b of getAllRootCodeBlocks(m)) {
        if (!msgBlocks.includes(b)) msgBlocks.push(b);
      }
    }
    const blocksRoot = [];
    for (const b of [...msgBlocks, ...allBlocksAfter]) {
      if (b && !blocksRoot.includes(b)) blocksRoot.push(b);
    }

    console.log(`[VP Gemini] Found ${blocksRoot.length} code block(s) in reply.`);

    const blocks = [];
    for (let i = 0; i < blocksRoot.length; i++) {
      const block = blocksRoot[i];
      revealHoverOnElement(block);
      await sleep(60);

      const copyBtn =
        block.querySelector(
          'button[aria-label*="Copy" i], button[mattooltip*="Copy" i], button[data-test-id="copy-button"], button[title*="Copy" i]'
        ) ||
        Array.from(block.querySelectorAll('button')).find((b) =>
          /copy/i.test(
            (b.textContent || '') +
            ' ' +
            (b.getAttribute('aria-label') || '') +
            ' ' +
            (b.getAttribute('mattooltip') || '')
          )
        );

      let copiedText = '';
      if (copyBtn) {
        try {
          console.log(`[VP Gemini] Clicking copy button on code block #${i + 1}...`);
          document.documentElement.dataset.vpLastCopied = '';
          copyBtn.click();
          await sleep(70);
          copiedText = cleanExtractedCodeText(document.documentElement.dataset.vpLastCopied || '');
          if (!copiedText && navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
            try {
              const clip = await Promise.race([navigator.clipboard.readText(), sleep(250).then(() => '')]);
              if (clip && clip.trim()) copiedText = cleanExtractedCodeText(clip);
            } catch (e) {}
          }
        } catch (e) {}
      }

      if (!copiedText) {
        const codeEl = block.querySelector('pre code, code, pre') || block;
        copiedText = await selectAndCopyNodeText(codeEl);
        console.log(`[VP Gemini] Code block #${i + 1} extracted via fallback selection:`, copiedText);
      } else {
        console.log(`[VP Gemini] Code block #${i + 1} copied via copy button:`, copiedText);
      }

      if (copiedText) blocks.push(copiedText);
    }

    if (!blocks.length && newMsgs.length) {
      const lastMsg = newMsgs[newMsgs.length - 1];
      const fallbackText = await selectAndCopyNodeText(lastMsg);
      if (fallbackText) {
        console.log('[VP Gemini] Extracted reply via last message selection fallback:', fallbackText);
        blocks.push(fallbackText);
      }
    }

    if (!blocks.length) {
      throw new Error('Gemini replied without a copyable code block or text.');
    }
    return blocks;
  }

  async function runGeminiPrompt(payload) {
    abortCurrentPrompt = false;
    const editor = await waitForEditor(15000);
    const beforeMsgs = getAssistantMessages().length;
    const beforeBlocks = getAllRootCodeBlocks(document).length;

    if (payload.images && payload.images.length) {
      await uploadImagesToGemini(payload.images, editor);
    }
    if (abortCurrentPrompt) throw new Error('Request cancelled.');

    await typeInstructionIntoGemini(editor, payload.instruction || '');
    if (abortCurrentPrompt) throw new Error('Request cancelled.');

    let sendBtn = null;
    const tSend = Date.now();
    while (Date.now() - tSend < 20000) {
      if (abortCurrentPrompt) throw new Error('Request cancelled.');
      sendBtn = findSendButton();
      if (sendBtn && !sendBtn.disabled && sendBtn.getAttribute('aria-disabled') !== 'true') break;
      await sleep(250);
    }

    if (sendBtn && !sendBtn.disabled) {
      console.log('[VP Gemini] Clicking Send button...');
      sendBtn.click();
    } else {
      editor.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true })
      );
    }

    const tStart = Date.now();
    let started = false;
    while (Date.now() - tStart < 30000) {
      if (abortCurrentPrompt) throw new Error('Request cancelled.');
      if (
        isGeminiStreaming() ||
        getAssistantMessages().length > beforeMsgs ||
        getAllRootCodeBlocks(document).length > beforeBlocks
      ) {
        started = true;
        break;
      }
      await sleep(300);
    }
    if (!started) {
      throw new Error('Gemini did not start generating a reply.');
    }

    console.log('[VP Gemini] Reply started. Waiting for completion...');

    const tDone = Date.now();
    let stableCount = 0;
    let lastSnap = '';
    while (Date.now() - tDone < 90000) {
      if (abortCurrentPrompt) throw new Error('Request cancelled.');
      const streaming = isGeminiStreaming();
      const msgs = getAssistantMessages();
      const allBlocks = getAllRootCodeBlocks(document).slice(beforeBlocks);
      const msgsText = msgs.slice(beforeMsgs).map((m) => (m.innerText || m.textContent || '').trim()).join('||');
      const blocksText = allBlocks.map((p) => (p.innerText || p.textContent || '').trim()).join('||');
      const curSnap = msgsText + '|' + blocksText;

      if (!streaming && (msgsText.length > 5 || blocksText.length > 5) && curSnap === lastSnap) {
        stableCount++;
        if (stableCount >= 3) break;
      } else {
        stableCount = 0;
        lastSnap = curSnap;
      }
      await sleep(300);
    }

    const allMsgs = getAssistantMessages();
    const newMsgs = allMsgs.length > beforeMsgs ? allMsgs.slice(beforeMsgs) : allMsgs.slice(-1);
    const blocks = await extractGeminiCodeBlocks(newMsgs, beforeBlocks);
    console.log('[VP Gemini] Returning extracted blocks:', blocks);
    return { ok: true, blocks, fullText: blocks.join('\n\n') };
  }

  // Extract a generated <img> element into a base64 dataUrl (via MAIN world, content script fetch, or background service worker)
  async function extractGeneratedImageDataUrl(imgEl) {
    if (!imgEl) return { imageDataUrl: '', imageUrl: '' };
    const src = imgEl.currentSrc || imgEl.src || '';
    if (src.startsWith('data:image/')) {
      return { imageDataUrl: src, imageUrl: src };
    }

    // 1. Try MAIN-world reader (handles page-owned blob: URLs and same-origin/CORS images)
    try {
      document.documentElement.dataset.vpExtractedImageDataUrl = '';
      window.dispatchEvent(new CustomEvent('vp-main-world-read-image', { detail: { src } }));
      for (let i = 0; i < 12; i++) {
        await sleep(120);
        const dUrl = document.documentElement.dataset.vpExtractedImageDataUrl || '';
        if (dUrl.startsWith('data:image/')) {
          return { imageDataUrl: dUrl, imageUrl: src };
        }
      }
    } catch (e) {}

    // 2. Try content-script fetch + FileReader
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

    // 3. Try background service worker fetch (bypasses CORS via <all_urls>)
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

  // PART 4: Generate an image inside Google Gemini (Nano Banana 2) and bring the generated image back to VisionPilot
  async function runGeminiImageGeneration(payload) {
    abortCurrentPrompt = false;
    const editor = await waitForEditor(15000);
    const beforeMsgs = getAssistantMessages().length;
    const beforeImgs = new Set(Array.from(document.querySelectorAll('img')));
    const beforeSrcs = new Set(
      Array.from(document.querySelectorAll('img'))
        .map((im) => im.currentSrc || im.src)
        .filter(Boolean)
    );

    if (payload.images && payload.images.length) {
      await uploadImagesToGemini(payload.images, editor);
      await sleep(1000);
    }
    if (abortCurrentPrompt) throw new Error('Image generation cancelled.');

    // Record uploaded user attachment image srcs so we never mistake the uploaded source image for the generated output image
    Array.from(document.querySelectorAll('img')).forEach((im) => {
      beforeImgs.add(im);
      if (im.currentSrc) beforeSrcs.add(im.currentSrc);
      if (im.src) beforeSrcs.add(im.src);
    });

    await typeInstructionIntoGemini(editor, payload.instruction || '');
    if (abortCurrentPrompt) throw new Error('Image generation cancelled.');

    let sendBtn = null;
    const tSend = Date.now();
    while (Date.now() - tSend < 20000) {
      if (abortCurrentPrompt) throw new Error('Image generation cancelled.');
      sendBtn = findSendButton();
      if (sendBtn && !sendBtn.disabled && sendBtn.getAttribute('aria-disabled') !== 'true') break;
      await sleep(250);
    }

    if (sendBtn && !sendBtn.disabled) {
      sendBtn.click();
    } else {
      editor.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true })
      );
    }

    const tStart = Date.now();
    let started = false;
    while (Date.now() - tStart < 35000) {
      if (abortCurrentPrompt) throw new Error('Image generation cancelled.');
      if (isGeminiStreaming() || getAssistantMessages().length > beforeMsgs) {
        started = true;
        break;
      }
      await sleep(300);
    }
    if (!started) {
      throw new Error('Gemini (Nano Banana 2) did not start generating the image.');
    }

    const findGeneratedImage = () => {
      const candidates = Array.from(document.querySelectorAll('img')).filter((im) => {
        if (beforeImgs.has(im)) return false;
        if (im.closest('user-query, .user-query-container, rich-textarea')) return false;
        const src = im.currentSrc || im.src || '';
        if (!src || beforeSrcs.has(src)) return false;
        if (/avatar|profile|favicon|icon|logo|sparkle/i.test(src)) return false;
        const w = im.naturalWidth || im.clientWidth || 0;
        const h = im.naturalHeight || im.clientHeight || 0;
        return im.complete && w >= 180 && h >= 180;
      });
      return candidates.length ? candidates[candidates.length - 1] : null;
    };

    const tGen = Date.now();
    let genImg = null;
    let lastSrc = '';
    let stableImgStreak = 0;
    let doneWithoutImgStreak = 0;

    while (Date.now() - tGen < 180000) {
      if (abortCurrentPrompt) throw new Error('Image generation cancelled.');
      const streaming = isGeminiStreaming();
      const candidate = findGeneratedImage();

      if (candidate) {
        const curSrc = candidate.currentSrc || candidate.src || '';
        if (!streaming && curSrc && curSrc === lastSrc) {
          stableImgStreak++;
          if (stableImgStreak >= 4) {
            genImg = candidate;
            break;
          }
        } else {
          lastSrc = curSrc;
          stableImgStreak = 0;
        }
        doneWithoutImgStreak = 0;
      } else if (!streaming && Date.now() - tGen > 8000) {
        const loadingImg = document.querySelector(
          'generated-image mat-progress-spinner, .image-loading, [role="progressbar"]'
        );
        if (!loadingImg) {
          doneWithoutImgStreak++;
          if (doneWithoutImgStreak >= 12) break;
        } else {
          doneWithoutImgStreak = 0;
        }
      }
      await sleep(450);
    }

    if (!genImg) {
      genImg = findGeneratedImage();
    }

    if (!genImg) {
      const msgs = getAssistantMessages();
      const lastMsg = msgs.length > beforeMsgs ? msgs[msgs.length - 1] : null;
      const errTxt = lastMsg ? (lastMsg.innerText || lastMsg.textContent || '').trim().slice(0, 180) : '';
      throw new Error(
        errTxt
          ? `Gemini (Nano Banana 2) did not return a generated image: ${errTxt}`
          : 'Gemini (Nano Banana 2) finished without returning a generated image.'
      );
    }

    const extracted = await extractGeneratedImageDataUrl(genImg);
    if (!extracted.imageDataUrl && !extracted.imageUrl) {
      throw new Error('Could not extract or download the generated image from Gemini.');
    }

    return {
      ok: true,
      imageDataUrl: extracted.imageDataUrl,
      imageUrl: extracted.imageUrl
    };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg) return false;
    if (msg.type === 'VP_SITE_ABORT_PROMPT') {
      abortCurrentPrompt = true;
      const stopBtn = document.querySelector(
        'button[aria-label*="Stop" i], button.stop-button, [mattooltip*="Stop" i]'
      );
      if (stopBtn) {
        try { stopBtn.click(); } catch (e) {}
      }
      sendResponse({ ok: true, aborted: true });
      return true;
    }
    if (msg.type === 'VP_SITE_CHECK_READY') {
      waitForEditor(1200)
        .then(() => sendResponse({ ok: true, provider: 'gemini', url: location.href }))
        .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
      return true;
    }
    if (msg.type === 'VP_SITE_RUN_PROMPT') {
      runGeminiPrompt(msg.payload || msg || {})
        .then((res) => sendResponse(res))
        .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
      return true;
    }
    if (msg.type === 'VP_SITE_GENERATE_IMAGE') {
      runGeminiImageGeneration(msg.payload || msg || {})
        .then((res) => sendResponse(res))
        .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
      return true;
    }
    return false;
  });
})();
