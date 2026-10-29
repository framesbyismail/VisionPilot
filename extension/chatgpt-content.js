// VisionPilot AI Bridge — ChatGPT (chatgpt.com) Dedicated Content Script
// Handles real image file upload, typing instructions, clicking send, waiting for reply completion,
// hovering to reveal copy buttons, focusing page to read clipboard, and falling back to selecting only the code block or last reply text.
(function () {
  if (window.__vpChatGPTContentLoaded) return;
  window.__vpChatGPTContentLoaded = true;

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
      document.querySelector('#prompt-textarea') ||
      document.querySelector('div[contenteditable="true"][id="prompt-textarea"]') ||
      document.querySelector('form div[contenteditable="true"]') ||
      document.querySelector('form textarea')
    );
  }

  function isLoggedOut() {
    if (location.pathname.startsWith('/auth')) return true;
    const loginBtn = document.querySelector(
      'button[data-testid="login-button"], a[data-testid="login-button"], a[href*="/auth/login"]'
    );
    if (loginBtn && loginBtn.offsetParent !== null && !findEditor()) return true;
    return false;
  }

  async function waitForEditor(timeoutMs = 15000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (isLoggedOut()) {
        throw new Error('Not logged in to ChatGPT (chatgpt.com). Please log in to your ChatGPT account.');
      }
      const ed = findEditor();
      if (ed) return ed;
      await sleep(250);
    }
    if (isLoggedOut()) {
      throw new Error('Not logged in to ChatGPT (chatgpt.com). Please log in to your ChatGPT account.');
    }
    throw new Error('ChatGPT input box was not found. Make sure chatgpt.com is open and logged in.');
  }

  function getComposerRoot(editor) {
    return (
      (editor &&
        (editor.closest('form') ||
          editor.closest('[data-testid*="composer" i]') ||
          editor.closest('[class*="composer" i]'))) ||
      document.querySelector('form') ||
      (editor && editor.parentElement?.parentElement?.parentElement?.parentElement) ||
      document.body
    );
  }

  // Snapshot existing DOM elements inside the composer BEFORE uploading images
  function snapshotComposerBaseline(editor) {
    const root = getComposerRoot(editor);
    return {
      imgs: new Set(Array.from(root.querySelectorAll('img'))),
      bgDivs: new Set(Array.from(root.querySelectorAll('div[style*="background-image"]'))),
      removeBtns: new Set(
        Array.from(
          root.querySelectorAll(
            'button[aria-label*="Remove" i], button[aria-label*="Delete" i], button[data-testid*="remove" i]'
          )
        )
      ),
      containers: new Set(
        Array.from(
          root.querySelectorAll(
            '[data-testid*="attachment" i], [data-testid*="file-thumbnail" i], [data-testid*="image-tile" i]'
          )
        )
      )
    };
  }

  // Inspect the composer to see how many NEW image attachments have appeared since baseline
  function getNewAttachments(editor, baseline) {
    const root = getComposerRoot(editor);
    const baseImgs = baseline?.imgs || new Set();
    const baseBgDivs = baseline?.bgDivs || new Set();
    const baseRemoveBtns = baseline?.removeBtns || new Set();
    const baseContainers = baseline?.containers || new Set();

    const newImgs = Array.from(root.querySelectorAll('img')).filter(
      (img) =>
        !baseImgs.has(img) ||
        /^(blob:|data:)/i.test(img.getAttribute('src') || '') ||
        /oaiusercontent|backend-api|files/i.test(img.getAttribute('src') || '') ||
        /uploaded/i.test(img.getAttribute('alt') || '')
    );
    const newBgDivs = Array.from(root.querySelectorAll('div[style*="background-image"]')).filter(
      (d) => !baseBgDivs.has(d)
    );
    const newRemoveBtns = Array.from(
      root.querySelectorAll(
        'button[aria-label*="Remove" i], button[aria-label*="Delete" i], button[data-testid*="remove" i]'
      )
    ).filter((b) => !baseRemoveBtns.has(b));
    const newContainers = Array.from(
      root.querySelectorAll(
        '[data-testid*="attachment" i], [data-testid*="file-thumbnail" i], [data-testid*="image-tile" i]'
      )
    ).filter((c) => !baseContainers.has(c));

    const count = Math.max(
      newImgs.length,
      newBgDivs.length,
      newRemoveBtns.length,
      newContainers.length
    );

    return {
      count,
      newImgs,
      newBgDivs,
      newRemoveBtns,
      newContainers
    };
  }

  // Check if any attached image in the composer is still uploading/processing
  // (NOTE: never match static toolbar SVG icons like circle[stroke-dasharray])
  function isAttachmentStillUploading(editor, baseline) {
    const root = getComposerRoot(editor);
    const spinners = Array.from(
      root.querySelectorAll(
        '[role="progressbar"], svg.animate-spin, .animate-spin, [data-testid*="loading" i], [data-testid*="progress" i], [data-testid*="spinner" i], [data-testid*="uploading" i], [aria-busy="true"]'
      )
    ).filter((el) => el.offsetParent !== null);
    if (spinners.length > 0) return true;

    const att = getNewAttachments(editor, baseline);
    for (const img of att.newImgs) {
      if (!img.complete || img.naturalWidth === 0) {
        return true;
      }
    }
    return false;
  }

  // CHANGE 1: Dedicated ChatGPT Image Upload + Strict Confirmation Logic
  // 1) Attach image(s) first (while prompt box is still empty)
  // 2) Verify new attachment preview elements exist in the composer
  // 3) Wait until all upload spinners finish and image thumbnails are completely loaded & stable
  async function uploadAndConfirmImagesChatGPT(images, editor) {
    if (!Array.isArray(images) || !images.length) return null;
    console.log(`[VP ChatGPT] Step 1: Uploading ${images.length} image(s) before typing prompt...`);

    const baseline = snapshotComposerBaseline(editor);
    const files = images.map((img, i) => dataUrlToFile(img.dataUrl, img.name || `image-${i + 1}.png`));
    const allDt = new DataTransfer();
    files.forEach((f) => allDt.items.add(f));

    const waitForCountAtLeast = async (targetCount, timeoutMs = 1400) => {
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) {
        if (abortCurrentPrompt) throw new Error('Request cancelled.');
        const cur = getNewAttachments(editor, baseline).count;
        if (cur >= targetCount) return cur;
        await sleep(140);
      }
      return getNewAttachments(editor, baseline).count;
    };

    // Strategy 1A: MAIN-world <input type="file"> with all files at once
    const root = getComposerRoot(editor);
    const totalInputs = Math.max(
      1,
      root.querySelectorAll('input[type="file"]').length ||
        document.querySelectorAll('input[type="file"]').length
    );

    for (let idx = 0; idx < totalInputs; idx++) {
      try {
        window.dispatchEvent(
          new CustomEvent('vp-main-world-attach-files', {
            detail: { images, strategy: 'input', inputIndex: idx }
          })
        );
      } catch (e) {}
      const c = await waitForCountAtLeast(images.length, 1000);
      if (c >= images.length) break;
      if (c > 0 && images.length > 1) {
        // Input attached the first file; attach the remaining file(s) one by one
        for (let m = c; m < images.length; m++) {
          try {
            window.dispatchEvent(
              new CustomEvent('vp-main-world-attach-files', {
                detail: { images: [images[m]], strategy: 'input', inputIndex: idx }
              })
            );
          } catch (e) {}
          await waitForCountAtLeast(m + 1, 900);
        }
        if (getNewAttachments(editor, baseline).count >= images.length) break;
      }
    }

    // Strategy 1B: ISOLATED-world <input type="file"> fallback
    if (getNewAttachments(editor, baseline).count < images.length) {
      let inputs = Array.from(root.querySelectorAll('input[type="file"]'));
      if (!inputs.length) inputs = Array.from(document.querySelectorAll('input[type="file"]'));
      inputs.sort((a, b) => {
        const aScore = (a.multiple ? 2 : 0) + (/image/i.test(a.accept || '') ? 3 : 0);
        const bScore = (b.multiple ? 2 : 0) + (/image/i.test(b.accept || '') ? 3 : 0);
        return bScore - aScore;
      });

      for (const fileInput of inputs) {
        const curCount = getNewAttachments(editor, baseline).count;
        if (curCount >= images.length) break;
        const remainingFiles = files.slice(curCount);
        const remDt = new DataTransfer();
        remainingFiles.forEach((f) => remDt.items.add(f));
        try {
          fileInput.value = '';
          fileInput.multiple = true;
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'files')?.set;
          if (nativeSetter) nativeSetter.call(fileInput, remDt.files);
          else fileInput.files = remDt.files;
          fileInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
          fileInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        } catch (e) {}
        if ((await waitForCountAtLeast(images.length, 1000)) >= images.length) break;
      }
    }

    // Strategy 2: ClipboardEvent('paste') on #prompt-textarea for any remaining unattached images
    if (getNewAttachments(editor, baseline).count < images.length) {
      console.log('[VP ChatGPT] Trying ClipboardEvent("paste") for remaining image(s)...');
      for (let i = getNewAttachments(editor, baseline).count; i < images.length; i++) {
        try {
          window.dispatchEvent(
            new CustomEvent('vp-main-world-attach-files', {
              detail: { images: [images[i]], strategy: 'paste' }
            })
          );
        } catch (e) {}
        if ((await waitForCountAtLeast(i + 1, 900)) < i + 1) {
          editor.focus();
          const singleDt = new DataTransfer();
          singleDt.items.add(files[i]);
          const pasteEv = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            composed: true,
            clipboardData: singleDt
          });
          editor.dispatchEvent(pasteEv);
          await waitForCountAtLeast(i + 1, 900);
        }
      }
    }

    // Strategy 3: DragEvent('drop') on #prompt-textarea / composer for any remaining unattached images
    if (getNewAttachments(editor, baseline).count < images.length) {
      console.log('[VP ChatGPT] Trying DragEvent("drop") for remaining image(s)...');
      const curCount = getNewAttachments(editor, baseline).count;
      const remImages = images.slice(curCount);
      try {
        window.dispatchEvent(
          new CustomEvent('vp-main-world-attach-files', {
            detail: { images: remImages, strategy: 'drop' }
          })
        );
      } catch (e) {}
      await waitForCountAtLeast(images.length, 1200);
    }

    // Wait up to 4 seconds in case the attachment thumbnail tile is still mounting in React
    let attachedInfo = getNewAttachments(editor, baseline);
    if (attachedInfo.count === 0) {
      await waitForCountAtLeast(1, 3500);
      attachedInfo = getNewAttachments(editor, baseline);
    }

    // STRICT CHECK 1: Was the image actually attached to the composer?
    if (attachedInfo.count === 0) {
      throw new Error('ChatGPT image upload failed: the image was not attached to ChatGPT. Prompt was not sent.');
    }

    console.log(
      `[VP ChatGPT] Step 1B: Detected ${attachedInfo.count}/${images.length} attachment tile(s) in composer. Waiting for upload to finish...`
    );

    // STRICT CHECK 2: Wait until ChatGPT finishes uploading/processing the image(s)
    await sleep(1000);
    const tUpload = Date.now();
    let confirmedReadyStreak = 0;
    while (Date.now() - tUpload < 45000) {
      if (abortCurrentPrompt) throw new Error('Request cancelled.');
      const curAtt = getNewAttachments(editor, baseline);
      const stillUploading = isAttachmentStillUploading(editor, baseline);

      if (curAtt.count >= 1 && !stillUploading) {
        confirmedReadyStreak++;
        if (confirmedReadyStreak >= 4) {
          break;
        }
      } else {
        confirmedReadyStreak = 0;
      }
      await sleep(350);
    }

    const finalAtt = getNewAttachments(editor, baseline);
    if (finalAtt.count === 0) {
      throw new Error('ChatGPT image upload failed: image attachment disappeared before upload completed.');
    }

    console.log(
      `[VP ChatGPT] Step 1 Confirmed: ${finalAtt.count}/${images.length} image(s) uploaded properly and ready.`
    );
    return baseline;
  }

  async function typeInstructionIntoChatGPT(editor, instruction) {
    console.log('[VP ChatGPT] Step 2: Typing instruction into editor AFTER image upload confirmed...');
    const targetLen = Math.floor(String(instruction || '').trim().length * 0.85);
    editor.focus();
    if (editor.tagName === 'TEXTAREA') {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) setter.call(editor, instruction);
      else editor.value = instruction;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      // 1. Try ClipboardEvent('paste') with text/plain so ProseMirror parses multi-line JSON cleanly
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
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(editor);
            sel.removeAllRanges();
            sel.addRange(range);
            document.execCommand('delete', false, null);
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
    }
    await sleep(350);
  }

  function findSendButton() {
    return (
      document.querySelector('button[data-testid="send-button"]') ||
      document.querySelector('button[aria-label="Send prompt"]') ||
      document.querySelector('button[aria-label*="Send" i]') ||
      document.querySelector('form button[type="submit"]')
    );
  }

  function getAssistantMessages() {
    const byRole = Array.from(document.querySelectorAll('[data-message-author-role="assistant"]'));
    if (byRole.length) return byRole;
    const byTurn = Array.from(
      document.querySelectorAll('article[data-turn="assistant"], [data-turn="assistant"], .agent-turn')
    );
    if (byTurn.length) return byTurn;
    const articles = Array.from(document.querySelectorAll('article[data-testid^="conversation-turn-"]'));
    return articles.filter((a, idx) => idx % 2 === 1);
  }

  function isChatGPTStreaming() {
    const stopBtn = document.querySelector(
      'button[data-testid="stop-button"], button[aria-label="Stop streaming"], button[aria-label*="Stop" i]'
    );
    if (stopBtn && stopBtn.offsetParent !== null) return true;
    if (document.querySelector('.result-streaming, .streaming-animation')) return true;
    return false;
  }

  // Reveal hover-only buttons on ChatGPT reply turns and code blocks
  function revealHoverOnElement(el) {
    if (!el) return;
    try {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } catch (e) {}
    const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : { left: 20, top: 20, width: 100, height: 40 };
    const clientX = Math.round(rect.left + Math.min(40, Math.max(5, rect.width / 2)));
    const clientY = Math.round(rect.top + Math.min(20, Math.max(5, rect.height / 2)));
    const evInit = { bubbles: true, cancelable: true, view: window, clientX, clientY };
    try {
      el.dispatchEvent(new PointerEvent('pointerover', evInit));
      el.dispatchEvent(new PointerEvent('pointerenter', evInit));
      el.dispatchEvent(new MouseEvent('mouseover', evInit));
      el.dispatchEvent(new MouseEvent('mouseenter', evInit));
      el.dispatchEvent(new PointerEvent('pointermove', evInit));
      el.dispatchEvent(new MouseEvent('mousemove', evInit));
    } catch (e) {}
  }

  // Strip code block UI header text (like "Copy code", "Copied", language tag) or markdown fences
  function cleanExtractedCodeText(raw) {
    let text = String(raw || '').trim();
    if (!text) return '';
    text = text
      .replace(/^```[a-z0-9_-]*\s*\n?/i, '')
      .replace(/\n?```\s*$/i, '')
      .trim();
    // If <pre> text started with a sticky header line like "plaintext\nCopy code\n..."
    text = text
      .replace(/^(?:plaintext|text|markdown|copy\s*code|copied!?|bash|json|yaml|sql|html|css|js|javascript|python)\s*\n+/i, '')
      .replace(/^(?:copy\s*code|copied!?)\s*\n+/i, '')
      .trim();
    return text;
  }

  // Fallback Copy Method: Click inside the answer text box, press Ctrl+A / Cmd+A to select all text
  // inside that box, and press Ctrl+C / Cmd+C to copy it (never selecting the whole page).
  async function selectAllAndCopyFromBox(targetNode) {
    if (!targetNode || targetNode === document.body || targetNode === document.documentElement) {
      return '';
    }
    const isMac = /Mac|iPod|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');
    console.log('[VP ChatGPT] Fallback: clicking box + Ctrl+A/Cmd+A + Ctrl+C/Cmd+C on target node:', targetNode.tagName, targetNode.className || '');
    const sel = window.getSelection();
    let resultText = '';
    try {
      window.focus();
      document.documentElement.dataset.vpLastCopied = '';

      // 1. Click inside the target text box to focus it
      const rect = targetNode.getBoundingClientRect
        ? targetNode.getBoundingClientRect()
        : { left: 16, top: 16, width: 80, height: 30 };
      const clickInit = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: Math.round(rect.left + Math.min(24, Math.max(4, rect.width / 2))),
        clientY: Math.round(rect.top + Math.min(16, Math.max(4, rect.height / 2)))
      };
      try {
        targetNode.dispatchEvent(new MouseEvent('mousedown', clickInit));
        targetNode.dispatchEvent(new MouseEvent('mouseup', clickInit));
        targetNode.dispatchEvent(new MouseEvent('click', clickInit));
        if (typeof targetNode.focus === 'function') targetNode.focus({ preventScroll: true });
      } catch (e) {}

      // 2. Dispatch Ctrl+A (or Command+A on Mac) inside the target box and select all its contents
      const selectAllKeyInit = {
        key: 'a',
        code: 'KeyA',
        keyCode: 65,
        which: 65,
        ctrlKey: !isMac,
        metaKey: isMac,
        bubbles: true,
        cancelable: true
      };
      try {
        targetNode.dispatchEvent(new KeyboardEvent('keydown', selectAllKeyInit));
      } catch (e) {}

      if (sel) {
        const range = document.createRange();
        range.selectNodeContents(targetNode);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      try {
        targetNode.dispatchEvent(new KeyboardEvent('keyup', selectAllKeyInit));
      } catch (e) {}

      // 3. Dispatch Ctrl+C (or Command+C on Mac) and execute copy on the selected text box
      const copyKeyInit = {
        key: 'c',
        code: 'KeyC',
        keyCode: 67,
        which: 67,
        ctrlKey: !isMac,
        metaKey: isMac,
        bubbles: true,
        cancelable: true
      };
      try {
        targetNode.dispatchEvent(new KeyboardEvent('keydown', copyKeyInit));
        document.execCommand('copy');
        targetNode.dispatchEvent(new KeyboardEvent('keyup', copyKeyInit));
      } catch (e) {}

      await sleep(40);
      const fromHook = (document.documentElement.dataset.vpLastCopied || '').trim();
      const fromSel = sel ? (sel.toString() || '').trim() : '';
      if (sel) sel.removeAllRanges();
      resultText = fromHook || fromSel;

      if (!resultText && navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
        try {
          const clip = await Promise.race([
            navigator.clipboard.readText(),
            sleep(300).then(() => '')
          ]);
          if (clip && clip.trim()) resultText = clip.trim();
        } catch (e) {}
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

  async function selectAndCopyNodeText(targetNode) {
    return selectAllAndCopyFromBox(targetNode);
  }

  // Find the Copy button inside or around a <pre> code block on ChatGPT by walking up single-<pre> wrappers
  function findCodeBlockCopyButton(pre) {
    if (!pre) return null;
    const isCopyBtn = (b) => {
      if (!b || b.disabled) return false;
      const label = (
        (b.textContent || '') +
        ' ' +
        (b.getAttribute('aria-label') || '') +
        ' ' +
        (b.getAttribute('title') || '') +
        ' ' +
        (b.getAttribute('data-testid') || '')
      ).trim();
      return /\bcopy\b/i.test(label);
    };

    let cur = pre;
    for (let depth = 0; depth < 6 && cur && cur !== document.body; depth++) {
      if (depth > 0) {
        const presInside = cur.querySelectorAll('pre');
        if (presInside.length > 1) break;
      }
      revealHoverOnElement(cur);
      const direct = cur.querySelector(
        'button[data-testid="copy-code-button"], ' +
        'button[aria-label="Copy"], ' +
        'button[aria-label="Copy code"], ' +
        'button[aria-label*="Copy" i], ' +
        'button[data-testid*="copy" i], ' +
        'button[title*="Copy" i]'
      );
      if (direct && isCopyBtn(direct)) return direct;

      const btns = Array.from(cur.querySelectorAll('button'));
      const byText = btns.find(isCopyBtn);
      if (byText) return byText;

      const stickyBtn = cur.querySelector('.sticky button, [class*="header"] button');
      if (stickyBtn) return stickyBtn;

      cur = cur.parentElement;
    }
    return null;
  }

  // Find the turn-level Copy button on an assistant reply article
  function findTurnCopyButton(msgEl) {
    if (!msgEl) return null;
    const turn =
      msgEl.closest('article[data-testid^="conversation-turn-"], article[data-turn="assistant"], article') ||
      msgEl.parentElement ||
      msgEl;
    revealHoverOnElement(turn);
    const directTurnBtn = turn.querySelector('button[data-testid="copy-turn-action-button"]');
    if (directTurnBtn) return directTurnBtn;
    const candidates = Array.from(
      turn.querySelectorAll('button[aria-label="Copy"], button[aria-label*="Copy" i], button[data-testid*="copy" i], button')
    );
    return (
      candidates.find((b) => {
        if (b.closest('pre')) return false;
        const label = ((b.getAttribute('aria-label') || b.textContent || b.getAttribute('data-testid') || '')).trim();
        return /^copy$/i.test(label) || /copy-turn/i.test(label);
      }) || null
    );
  }

  // Click a copy button and read the clipboard (with page focused + completeness verification)
  async function clickCopyButtonAndRead(copyBtn, expectedRawNode) {
    if (!copyBtn) return '';
    try {
      revealHoverOnElement(copyBtn);
      window.focus();
      try {
        copyBtn.focus({ preventScroll: true });
      } catch (e) {}
      document.documentElement.dataset.vpLastCopied = '';

      const rect = copyBtn.getBoundingClientRect();
      const evInit = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: Math.round(rect.left + rect.width / 2),
        clientY: Math.round(rect.top + rect.height / 2)
      };
      copyBtn.dispatchEvent(new PointerEvent('pointerdown', evInit));
      copyBtn.dispatchEvent(new MouseEvent('mousedown', evInit));
      copyBtn.dispatchEvent(new PointerEvent('pointerup', evInit));
      copyBtn.dispatchEvent(new MouseEvent('mouseup', evInit));
      copyBtn.click();

      await sleep(90);
      let copiedText = (document.documentElement.dataset.vpLastCopied || '').trim();
      if (!copiedText) {
        await sleep(90);
        copiedText = (document.documentElement.dataset.vpLastCopied || '').trim();
      }
      if (!copiedText && navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
        try {
          const clipText = await Promise.race([
            navigator.clipboard.readText(),
            sleep(350).then(() => '')
          ]);
          if (clipText && clipText.trim()) {
            copiedText = clipText.trim();
          }
        } catch (e) {}
      }
      const cleaned = cleanExtractedCodeText(copiedText);
      if (cleaned && expectedRawNode) {
        const rawRef = cleanExtractedCodeText(expectedRawNode.innerText || expectedRawNode.textContent || '');
        if (rawRef && cleaned.length < Math.floor(rawRef.length * 0.7)) {
          console.warn('[VP ChatGPT] Copy button returned partial text; falling back to Select All + Copy.');
          return '';
        }
      }
      return cleaned;
    } catch (e) {
      console.warn('[VP ChatGPT] Copy button click error:', e);
      return '';
    }
  }

  // Split a copied block or full reply into individual subject answers in strict original order,
  // preserving every line and detail of each subject without mixing answers.
  function splitTextIntoSubjectEntries(text, expectedSubjects) {
    const cleaned = cleanExtractedCodeText(text);
    if (!cleaned) return [];

    // 1. Check if raw text contains multiple fenced ``` blocks
    const fencedBlocks = [];
    const fenceRe = /```(?:[a-z0-9_-]*)\s*\n([\s\S]*?)```/gi;
    let fm;
    while ((fm = fenceRe.exec(String(text || ''))) !== null) {
      const inner = cleanExtractedCodeText(fm[1]);
      if (inner) fencedBlocks.push(inner);
    }
    if (fencedBlocks.length > 1) {
      const out = [];
      for (const fb of fencedBlocks) {
        const subParts = splitTextIntoSubjectEntries(fb, expectedSubjects);
        if (subParts.length) out.push(...subParts);
        else out.push(fb);
      }
      return out;
    }

    const lines = cleaned
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length <= 1) return [cleaned];

    const customHeaders = [];
    if (Array.isArray(expectedSubjects)) {
      for (const s of expectedSubjects) {
        const lbl = String((s && (s.label || s.name)) || '').trim();
        if (lbl) {
          customHeaders.push(lbl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        }
      }
    }
    const basePattern =
      '(?:person|people|man|woman|boy|girl|child|human|face|head|car|vehicle|truck|bus|bike|bicycle|motorcycle|dog|cat|animal|bird|horse|product|bottle|cup|phone|cell\\s*phone|laptop|chair|couch|table|bag|backpack|shoe|watch|clock|book|box|item|object|subject|background|scene)(?:\\s*#?\\s*\\d+)?';
    const combinedHead = customHeaders.length ? `(?:${customHeaders.join('|')}|${basePattern})` : basePattern;
    const headerStartRe = new RegExp(
      `^(?:[-*•]|\\d+[.)])?\\s*[*_\\[\\(\`~"']*\\s*${combinedHead}(?:\\s*\\([^)]*\\)|\\s+\\w+\\s+box(?:\\s+subject)?)?\\s*[*_\\]\\)\`~"']*\\s*(?::|-|–|—)\\s*\\S+`,
      'i'
    );

    const entries = [];
    let currentLines = [];
    for (const line of lines) {
      if (headerStartRe.test(line)) {
        if (currentLines.length) {
          entries.push(currentLines.join(' ').trim());
        }
        currentLines = [line];
      } else if (currentLines.length) {
        currentLines.push(line);
      } else {
        currentLines = [line];
      }
    }
    if (currentLines.length) {
      entries.push(currentLines.join(' ').trim());
    }
    return entries.length > 1 ? entries : [cleaned];
  }

  // PART 1.1 & 1.2: Ensure ChatGPT's fastest available model is selected and Thinking/Reason mode is OFF before every prompt
  async function ensureChatGPTFastestModelAndThinkingOff(isImageGen = false) {
    try {
      // 1. Turn OFF Reason / Extended Thinking toggle button in composer if active
      const composerBtns = Array.from(
        document.querySelectorAll(
          'form button, [data-testid*="composer" i] button, button[aria-label*="Reason" i], button[aria-label*="Think" i], button[data-testid*="reason" i], button[data-testid*="think" i]'
        )
      );
      for (const btn of composerBtns) {
        const label = (
          (btn.getAttribute('aria-label') || '') +
          ' ' +
          (btn.getAttribute('data-testid') || '') +
          ' ' +
          (btn.textContent || '')
        ).toLowerCase();
        if (!/\b(?:reason|thinking|think|extended\s+thinking|deep\s+research)\b/i.test(label)) continue;
        const isOn =
          btn.getAttribute('aria-pressed') === 'true' ||
          btn.getAttribute('aria-checked') === 'true' ||
          btn.getAttribute('data-state') === 'on' ||
          btn.getAttribute('data-state') === 'checked' ||
          /\b(?:bg-token-main-surface|selected|active)\b/i.test(btn.className || '');
        if (isOn) {
          console.log('[VP ChatGPT] Turning OFF Reason / Thinking button in composer...');
          btn.click();
          await sleep(220);
        }
      }

      // 2. Check model switcher in header/top-left
      const modelSwitcherBtn =
        document.querySelector('button[data-testid="model-switcher-dropdown-button"]') ||
        document.querySelector('button[aria-label*="Model selector" i]') ||
        Array.from(document.querySelectorAll('header button, main button[aria-haspopup="menu"]')).find((b) => {
          const txt = ((b.textContent || '') + ' ' + (b.getAttribute('aria-label') || '')).toLowerCase();
          return /\b(?:chatgpt|gpt|o1|o3|o4|model)\b/i.test(txt) && !/share|new\s*chat|sidebar/i.test(txt);
        });

      if (modelSwitcherBtn) {
        const curModelTxt = (
          (modelSwitcherBtn.textContent || '') +
          ' ' +
          (modelSwitcherBtn.getAttribute('aria-label') || '')
        ).toLowerCase();
        const isCurrentThinkingModel = /\b(?:thinking|reason|o1|o3|o4|pro)\b/i.test(curModelTxt);
        const shouldOpenMenu = !isImageGen || isCurrentThinkingModel;

        if (shouldOpenMenu) {
          modelSwitcherBtn.click();
          await sleep(280);

          const menuRoot =
            document.querySelector('[role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]') ||
            document.body;
          const menuItems = Array.from(
            menuRoot.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="option"], [data-testid*="model-switcher-" i]')
          ).filter((el) => {
            if (!el || el.offsetParent === null) return false;
            if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
            const txt = (el.textContent || '').trim();
            if (!txt || /\b(?:temporary\s+chat|upgrade|try\s+plus|legacy\s+models)\b/i.test(txt) && !/gpt|mini|fast|instant/i.test(txt)) {
              return false;
            }
            return true;
          });

          const scoreChatGPTOption = (el) => {
            const t = (
              (el.textContent || '') +
              ' ' +
              (el.getAttribute('aria-label') || '') +
              ' ' +
              (el.getAttribute('data-testid') || '')
            ).toLowerCase();
            if (/\b(?:thinking|reasoning|deep\s*research|o1\b|o1-pro|o3-pro|pro\b)\b/i.test(t) && !/\b(?:instant|fast|mini)\b/i.test(t)) {
              return -100;
            }
            let score = 0;
            if (/\b(?:instant|fast|mini|4o-mini|quick|everyday\s+tasks|great\s+for\s+most)\b/i.test(t)) score += 100;
            else if (/\b(?:4o|gpt-4o|auto|standard|default)\b/i.test(t)) score += 70;
            else if (/\b(?:chatgpt|gpt)\b/i.test(t)) score += 35;
            return score;
          };

          let bestOpt = null;
          let bestScore = -999;
          for (const item of menuItems) {
            const sc = scoreChatGPTOption(item);
            if (sc > bestScore) {
              bestScore = sc;
              bestOpt = item;
            }
          }

          if (bestOpt && bestScore > 0) {
            console.log('[VP ChatGPT] Selecting fastest non-thinking model option:', (bestOpt.textContent || '').trim());
            bestOpt.click();
            await sleep(220);
          } else {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
            await sleep(120);
          }
        }
      }
    } catch (err) {
      console.warn('[VP ChatGPT] Model/thinking setup warning:', err);
    }
  }

  async function extractReplyBlocksOnce(lastMsg, beforePresCount, payload) {
    try {
      await chrome.runtime.sendMessage({ type: 'VP_FOCUS_TAB_FOR_COPY' });
    } catch (e) {}
    try {
      window.focus();
    } catch (e) {}

    const isMulti = payload && payload.step === 'multi_focus';
    const expectedSubjects = (payload && Array.isArray(payload.subjects) && payload.subjects) || [];
    const expectedCount = expectedSubjects.length || (payload && Number(payload.expectedCount)) || 1;

    const turnEl =
      (lastMsg &&
        (lastMsg.closest('article[data-testid^="conversation-turn-"], article[data-turn="assistant"], article') ||
          lastMsg.parentElement)) ||
      lastMsg ||
      document.body;

    revealHoverOnElement(turnEl);
    if (lastMsg) revealHoverOnElement(lastMsg);
    await sleep(100);

    // Collect <pre> / <code> blocks in the latest assistant turn AND any new <pre> added since beforePresCount
    const msgPres = Array.from(turnEl.querySelectorAll('pre'));
    const allPresAfter = Array.from(document.querySelectorAll('pre')).slice(beforePresCount);
    const combinedPres = [];
    for (const p of [...msgPres, ...allPresAfter]) {
      if (p && !combinedPres.includes(p)) combinedPres.push(p);
    }

    const targetPres = !isMulti && combinedPres.length > 1 ? [combinedPres[combinedPres.length - 1]] : combinedPres;
    console.log(`[VP ChatGPT] Extracting reply. Found ${targetPres.length} <pre> code block(s) in latest reply (isMulti=${!!isMulti}, expected=${expectedCount}).`);

    const rawBlocks = [];
    for (let i = 0; i < targetPres.length; i++) {
      const pre = targetPres[i];
      const codeNode = pre.querySelector('code') || pre.querySelector('.overflow-y-auto, .p-4') || pre;
      revealHoverOnElement(pre);
      if (pre.parentElement) revealHoverOnElement(pre.parentElement);
      await sleep(80);

      // Step 1: Always try the code block's own Copy Button first and read the clipboard
      const copyBtn = findCodeBlockCopyButton(pre);
      let copiedText = '';

      if (copyBtn) {
        console.log(`[VP ChatGPT] Copy Button detected on code block #${i + 1}. Clicking Copy Button...`);
        copiedText = await clickCopyButtonAndRead(copyBtn, codeNode);
        if (copiedText) {
          console.log(`[VP ChatGPT] Code block #${i + 1} copied via Copy Button:`, copiedText);
        }
      }

      // Step 2: If that fails or is empty, select and copy ONLY the last reply's code block, never the whole page
      if (!copiedText) {
        copiedText = await selectAllAndCopyFromBox(codeNode);
        console.log(`[VP ChatGPT] Code block #${i + 1} extracted via code-block Select All + Copy fallback:`, copiedText);
      }

      if (copiedText) {
        rawBlocks.push(copiedText);
      }
    }

    let splitBlocks = [];
    for (const rb of rawBlocks) {
      if (isMulti) {
        const parts = splitTextIntoSubjectEntries(rb, expectedSubjects);
        splitBlocks.push(...parts);
      } else {
        splitBlocks.push(rb);
      }
    }

    return splitBlocks.map((b) => cleanExtractedCodeText(b)).filter(Boolean);
  }

  // PART 1.3: Try code block copy button first, fallback to selecting only the last reply's code block, retry once after short delay
  async function extractReplyBlocks(lastMsg, beforePresCount, payload) {
    let blocks = await extractReplyBlocksOnce(lastMsg, beforePresCount, payload);
    if (!blocks.length) {
      console.warn('[VP ChatGPT] First code-block copy attempt returned empty. Retrying once after short delay...');
      await sleep(650);
      const msgs = getAssistantMessages();
      const retryMsg = msgs.length ? msgs[msgs.length - 1] : lastMsg;
      blocks = await extractReplyBlocksOnce(retryMsg, beforePresCount, payload);
    }
    if (!blocks.length) {
      throw new Error('Failed to copy the code block from ChatGPT\'s reply after retrying.');
    }
    return blocks;
  }

  function detectChatGPTRefusalOrFatalError(msgs, beforeMsgsCount) {
    if (isLoggedOut()) {
      return 'Logged out of ChatGPT (chatgpt.com). Please log in and try again.';
    }
    const errToast = document.querySelector('[role="alert"], .text-red-500, [data-testid*="error" i]');
    if (errToast) {
      const errTxt = (errToast.innerText || errToast.textContent || '').trim();
      if (/rate\s*limit|reached\s*your\s*limit|something\s*went\s*wrong|session\s*expired|log\s*in/i.test(errTxt)) {
        return `ChatGPT error: ${errTxt.slice(0, 180)}`;
      }
    }
    const newMsgs = msgs.slice(beforeMsgsCount);
    if (newMsgs.length) {
      const lastMsg = newMsgs[newMsgs.length - 1];
      const lastTxt = (lastMsg.innerText || lastMsg.textContent || '').trim();
      if (
        lastTxt.length > 10 &&
        lastTxt.length < 320 &&
        !lastMsg.querySelector('pre, code') &&
        /\b(?:i\s+cannot|i\s+can't|i'm\s+sorry,\s+i\s+can't|i\s+am\s+unable|i'm\s+unable|violates\s+our\s+content\s+policy|against\s+our\s+policies)\b/i.test(lastTxt)
      ) {
        return `ChatGPT refused the request: ${lastTxt.slice(0, 180)}`;
      }
    }
    return '';
  }

  async function runChatGPTPrompt(payload) {
    abortCurrentPrompt = false;
    const editor = await waitForEditor(15000);
    await ensureChatGPTFastestModelAndThinkingOff(false);
    if (abortCurrentPrompt) throw new Error('Request cancelled.');

    const beforeMsgs = getAssistantMessages().length;
    const beforePres = document.querySelectorAll('pre').length;

    // STEP 1: First upload the image(s) and strictly check/confirm that the image was uploaded properly.
    let baseline = null;
    if (payload.images && payload.images.length) {
      baseline = await uploadAndConfirmImagesChatGPT(payload.images, editor);
      if (abortCurrentPrompt) throw new Error('Request cancelled.');
    }

    // STEP 2: Only AFTER the image is confirmed uploaded, type the prompt and send it.
    await typeInstructionIntoChatGPT(editor, payload.instruction || '');
    if (abortCurrentPrompt) throw new Error('Request cancelled.');

    if (baseline && payload.images && payload.images.length) {
      const attCheck = getNewAttachments(editor, baseline);
      if (attCheck.count === 0) {
        throw new Error('ChatGPT image attachment was lost before sending the prompt.');
      }
    }

    let sendBtn = null;
    let readyStreak = 0;
    const tSend = Date.now();
    while (Date.now() - tSend < 25000) {
      if (abortCurrentPrompt) throw new Error('Request cancelled.');
      sendBtn = findSendButton();
      const uploading = baseline ? isAttachmentStillUploading(editor, baseline) : false;
      if (sendBtn && !sendBtn.disabled && sendBtn.getAttribute('aria-disabled') !== 'true' && !uploading) {
        readyStreak++;
        if (readyStreak >= 3) break;
      } else {
        readyStreak = 0;
      }
      await sleep(250);
    }

    if (sendBtn && !sendBtn.disabled) {
      console.log('[VP ChatGPT] Step 2B: Image confirmed & prompt ready — clicking Send button...');
      sendBtn.click();
    } else {
      console.log('[VP ChatGPT] Send button not clickable, pressing Enter on editor...');
      editor.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true })
      );
    }

    await sleep(1200);
    if (
      baseline &&
      getNewAttachments(editor, baseline).count > 0 &&
      !isChatGPTStreaming() &&
      getAssistantMessages().length <= beforeMsgs
    ) {
      const retrySendBtn = findSendButton();
      if (retrySendBtn && !retrySendBtn.disabled && retrySendBtn.getAttribute('aria-disabled') !== 'true') {
        console.log('[VP ChatGPT] Retrying Send button click to submit attached image + prompt...');
        retrySendBtn.click();
      }
    }

    // STEP 3: Wait for the reply to start and completely finish (no timeout while generating)
    const tStart = Date.now();
    let started = false;
    while (Date.now() - tStart < 35000) {
      if (abortCurrentPrompt) throw new Error('Request cancelled.');
      if (isLoggedOut()) throw new Error('Not logged in to ChatGPT (chatgpt.com).');
      if (
        isChatGPTStreaming() ||
        getAssistantMessages().length > beforeMsgs ||
        document.querySelectorAll('pre').length > beforePres
      ) {
        started = true;
        break;
      }
      await sleep(300);
    }
    if (!started) {
      const fatalErr = detectChatGPTRefusalOrFatalError(getAssistantMessages(), beforeMsgs);
      throw new Error(fatalErr || 'ChatGPT did not start generating a reply.');
    }

    console.log('[VP ChatGPT] Step 3: Reply generation started. Waiting for reply to finish (no timeout while generating)...');

    let stableCount = 0;
    let lastSnap = '';
    const isMultiStep = payload && payload.step === 'multi_focus';
    const expectedCount =
      (payload && Array.isArray(payload.subjects) && payload.subjects.length) ||
      (payload && Number(payload.expectedCount)) ||
      1;
    while (true) {
      if (abortCurrentPrompt) throw new Error('Request cancelled.');
      if (isLoggedOut()) {
        throw new Error('Logged out of ChatGPT (chatgpt.com) while waiting for reply.');
      }
      const streaming = isChatGPTStreaming();
      const msgs = getAssistantMessages();
      const latest = msgs.length > beforeMsgs ? msgs[msgs.length - 1] : null;
      const allPres = Array.from(document.querySelectorAll('pre')).slice(beforePres);
      const latestText = latest ? (latest.innerText || latest.textContent || '').trim() : '';
      const presText = allPres.map((p) => (p.innerText || p.textContent || '').trim()).join('||');
      const curSnap = latestText + '|' + presText;

      if (!streaming && (latestText.length > 5 || presText.length > 5) && curSnap === lastSnap) {
        stableCount++;
        const reqStable = isMultiStep && expectedCount > 1 && allPres.length < expectedCount ? 5 : 4;
        if (stableCount >= reqStable) break;
      } else if (!streaming && latestText.length === 0 && presText.length === 0) {
        const fatalErr = detectChatGPTRefusalOrFatalError(msgs, beforeMsgs);
        if (fatalErr) throw new Error(fatalErr);
      } else {
        stableCount = 0;
        lastSnap = curSnap;
      }
      await sleep(300);
    }

    const msgs = getAssistantMessages();
    const fatalAfter = detectChatGPTRefusalOrFatalError(msgs, beforeMsgs);
    if (fatalAfter) throw new Error(fatalAfter);

    const lastMsg = msgs.length > beforeMsgs ? msgs[msgs.length - 1] : msgs[msgs.length - 1] || null;
    if (!lastMsg) {
      throw new Error('No assistant reply received from ChatGPT.');
    }

    console.log('[VP ChatGPT] Step 4: Reply finished. Extracting code block(s) to bring back to VisionPilot...');
    const blocks = await extractReplyBlocks(lastMsg, beforePres, payload);
    console.log('[VP ChatGPT] Successfully extracted blocks:', blocks);
    return { ok: true, blocks, fullText: blocks.join('\n\n') };
  }

  // Extract a generated <img> element into a base64 dataUrl (via MAIN world, content script fetch, canvas, or background service worker)
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

  // PART 4: Generate an image in ChatGPT (ChatGPT Image 2 / GPT Image 1.5) and bring the generated image back to VisionPilot
  async function runChatGPTImageGeneration(payload) {
    abortCurrentPrompt = false;
    const editor = await waitForEditor(15000);
    await ensureChatGPTFastestModelAndThinkingOff(true);
    if (abortCurrentPrompt) throw new Error('Image generation cancelled.');

    const beforeMsgs = getAssistantMessages().length;
    const beforeImgs = new Set(Array.from(document.querySelectorAll('img')));
    const beforeSrcs = new Set(
      Array.from(document.querySelectorAll('img'))
        .map((im) => im.currentSrc || im.src)
        .filter(Boolean)
    );

    // 1. Upload the main source image FIRST and strictly confirm upload
    let baseline = null;
    if (payload.images && payload.images.length) {
      baseline = await uploadAndConfirmImagesChatGPT(payload.images, editor);
      if (abortCurrentPrompt) throw new Error('Image generation cancelled.');
    }

    // Also record the uploaded user attachment srcs so we never mistake the uploaded source image for the generated output image
    const composerRoot = getComposerRoot(editor);
    Array.from(composerRoot.querySelectorAll('img')).forEach((im) => {
      beforeImgs.add(im);
      if (im.currentSrc) beforeSrcs.add(im.currentSrc);
      if (im.src) beforeSrcs.add(im.src);
    });

    // 2. Type the image generation prompt & click Send
    await typeInstructionIntoChatGPT(editor, payload.instruction || '');
    if (abortCurrentPrompt) throw new Error('Image generation cancelled.');

    let sendBtn = null;
    let readyStreak = 0;
    const tSend = Date.now();
    while (Date.now() - tSend < 25000) {
      if (abortCurrentPrompt) throw new Error('Image generation cancelled.');
      sendBtn = findSendButton();
      const uploading = baseline ? isAttachmentStillUploading(editor, baseline) : false;
      if (sendBtn && !sendBtn.disabled && sendBtn.getAttribute('aria-disabled') !== 'true' && !uploading) {
        readyStreak++;
        if (readyStreak >= 3) break;
      } else {
        readyStreak = 0;
      }
      await sleep(250);
    }

    if (sendBtn && !sendBtn.disabled) {
      sendBtn.click();
    } else {
      editor.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true })
      );
    }

    // Wait for response generation to start
    const tStart = Date.now();
    let started = false;
    while (Date.now() - tStart < 35000) {
      if (abortCurrentPrompt) throw new Error('Image generation cancelled.');
      if (isLoggedOut()) throw new Error('Not logged in to ChatGPT (chatgpt.com).');
      if (isChatGPTStreaming() || getAssistantMessages().length > beforeMsgs) {
        started = true;
        break;
      }
      await sleep(300);
    }
    if (!started) {
      throw new Error('ChatGPT did not start generating the image.');
    }

    // Helper to find the newly generated image inside assistant messages
    const findGeneratedImage = () => {
      const candidates = Array.from(document.querySelectorAll('img')).filter((im) => {
        if (beforeImgs.has(im)) return false;
        if (composerRoot.contains(im)) return false;
        if (im.closest('[data-message-author-role="user"], [data-turn="user"]')) return false;
        const src = im.currentSrc || im.src || '';
        if (!src || beforeSrcs.has(src)) return false;
        if (/avatar|profile|favicon|icon/i.test(src) || /avatar|profile/i.test(im.alt || '')) return false;
        const w = im.naturalWidth || im.clientWidth || 0;
        const h = im.naturalHeight || im.clientHeight || 0;
        return im.complete && w >= 200 && h >= 200;
      });
      return candidates.length ? candidates[candidates.length - 1] : null;
    };

    const tGen = Date.now();
    let genImg = null;
    let lastSrc = '';
    let stableImgStreak = 0;
    let doneWithoutImgStreak = 0;

    while (true) {
      if (abortCurrentPrompt) throw new Error('Image generation cancelled.');
      if (isLoggedOut()) throw new Error('Logged out of ChatGPT (chatgpt.com) while generating image.');
      const streaming = isChatGPTStreaming();
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
        // Check if ChatGPT is still showing an image generation progress card ("Creating image")
        const creatingIndicator = document.querySelector(
          '[aria-label*="Creating image" i], [data-testid*="image" i] [role="progressbar"], .animate-pulse'
        );
        if (!creatingIndicator) {
          doneWithoutImgStreak++;
          if (doneWithoutImgStreak >= 12) {
            break;
          }
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
          ? `ChatGPT did not return a generated image: ${errTxt}`
          : 'ChatGPT finished without returning a generated image.'
      );
    }

    const extracted = await extractGeneratedImageDataUrl(genImg);
    if (!extracted.imageDataUrl && !extracted.imageUrl) {
      throw new Error('Could not extract or download the generated image from ChatGPT.');
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
        'button[data-testid="stop-button"], button[aria-label="Stop streaming"], button[aria-label*="Stop" i]'
      );
      if (stopBtn) {
        try { stopBtn.click(); } catch (e) {}
      }
      sendResponse({ ok: true, aborted: true });
      return true;
    }
    if (msg.type === 'VP_SITE_CHECK_READY') {
      waitForEditor(1200)
        .then(() => sendResponse({ ok: true, provider: 'gpt', url: location.href }))
        .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
      return true;
    }
    if (msg.type === 'VP_SITE_RUN_PROMPT') {
      runChatGPTPrompt(msg.payload || msg || {})
        .then((res) => sendResponse(res))
        .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
      return true;
    }
    if (msg.type === 'VP_SITE_GENERATE_IMAGE') {
      runChatGPTImageGeneration(msg.payload || msg || {})
        .then((res) => sendResponse(res))
        .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
      return true;
    }
    return false;
  });
})();
