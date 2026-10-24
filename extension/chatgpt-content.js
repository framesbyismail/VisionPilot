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
    editor.focus();
    if (editor.tagName === 'TEXTAREA') {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) setter.call(editor, instruction);
      else editor.value = instruction;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      let inserted = false;
      try {
        inserted = document.execCommand('insertText', false, instruction);
      } catch (e) {}
      const currentText = (editor.innerText || editor.textContent || '').trim();
      if (!inserted || !currentText) {
        const p = editor.querySelector('p') || document.createElement('p');
        p.textContent = instruction;
        if (!p.parentElement) editor.appendChild(p);
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

  // Select ONLY a specific code block or reply element (the same way as Select All + Copy by hand on that node, NEVER the whole page)
  async function selectAndCopyNodeText(targetNode) {
    if (!targetNode || targetNode === document.body || targetNode === document.documentElement) {
      return '';
    }
    console.log('[VP ChatGPT] Fallback: selecting and copying only target node:', targetNode.tagName, targetNode.className || '');
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

  // Find the Copy button inside or around a <pre> code block on ChatGPT
  function findCodeBlockCopyButton(pre) {
    if (!pre) return null;
    const roots = [
      pre,
      pre.closest('.contain-inline-size, .code-block, [class*="code"]'),
      pre.parentElement
    ].filter(Boolean);

    for (const root of roots) {
      const direct = root.querySelector(
        'button[data-testid="copy-code-button"], ' +
        'button[aria-label="Copy"], ' +
        'button[aria-label="Copy code"], ' +
        'button[aria-label*="Copy" i], ' +
        'button[data-testid*="copy" i], ' +
        'button[title*="Copy" i]'
      );
      if (direct) return direct;

      const btns = Array.from(root.querySelectorAll('button'));
      const byText = btns.find((b) =>
        /copy/i.test(
          (b.textContent || '') +
          ' ' +
          (b.getAttribute('aria-label') || '') +
          ' ' +
          (b.getAttribute('title') || '') +
          ' ' +
          (b.getAttribute('data-testid') || '')
        )
      );
      if (byText) return byText;

      // Sticky header bar button inside <pre>
      const stickyBtn = root.querySelector('.sticky button, [class*="header"] button');
      if (stickyBtn) return stickyBtn;
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
    return (
      turn.querySelector('button[data-testid="copy-turn-action-button"]') ||
      turn.querySelector('button[aria-label="Copy"]') ||
      turn.querySelector('button[aria-label*="Copy" i]') ||
      Array.from(turn.querySelectorAll('button')).find((b) =>
        /^copy$/i.test((b.getAttribute('aria-label') || b.textContent || '').trim())
      )
    );
  }

  // Click a copy button and read the clipboard (with page focused)
  async function clickCopyButtonAndRead(copyBtn) {
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
      return cleanExtractedCodeText(copiedText);
    } catch (e) {
      console.warn('[VP ChatGPT] Copy button click error:', e);
      return '';
    }
  }

  async function extractReplyBlocks(lastMsg, beforePresCount) {
    // Focus the ChatGPT tab/page first so clipboard operations work reliably
    try {
      await chrome.runtime.sendMessage({ type: 'VP_FOCUS_TAB_FOR_COPY' });
    } catch (e) {}
    try {
      window.focus();
    } catch (e) {}

    const turnEl =
      lastMsg.closest('article[data-testid^="conversation-turn-"], article[data-turn="assistant"], article') ||
      lastMsg.parentElement ||
      lastMsg;

    revealHoverOnElement(turnEl);
    revealHoverOnElement(lastMsg);
    await sleep(120);

    // Collect all <pre> blocks in the latest assistant turn AND any new <pre> added since beforePresCount
    const msgPres = Array.from(turnEl.querySelectorAll('pre'));
    const allPresAfter = Array.from(document.querySelectorAll('pre')).slice(beforePresCount);
    const combinedPres = [];
    for (const p of [...msgPres, ...allPresAfter]) {
      if (p && !combinedPres.includes(p)) combinedPres.push(p);
    }

    console.log(`[VP ChatGPT] Extracting reply. Found ${combinedPres.length} <pre> code block(s) in latest reply.`);

    const blocks = [];

    if (combinedPres.length > 0) {
      for (let i = 0; i < combinedPres.length; i++) {
        const pre = combinedPres[i];
        revealHoverOnElement(pre);
        if (pre.parentElement) revealHoverOnElement(pre.parentElement);
        await sleep(80);

        const copyBtn = findCodeBlockCopyButton(pre);
        let copiedText = '';

        if (copyBtn) {
          console.log(`[VP ChatGPT] Clicking copy button for code block #${i + 1}...`);
          copiedText = await clickCopyButtonAndRead(copyBtn);
          if (copiedText) {
            console.log(`[VP ChatGPT] Code block #${i + 1} copied via copy button:`, copiedText);
          }
        } else {
          console.log(`[VP ChatGPT] Copy button not found on code block #${i + 1}, using selection fallback.`);
        }

        // BUG 1 Fallback: select ONLY this code block (never the whole page) and copy/read it
        if (!copiedText) {
          const codeNode = pre.querySelector('code') || pre.querySelector('.overflow-y-auto, .p-4') || pre;
          copiedText = await selectAndCopyNodeText(codeNode);
          console.log(`[VP ChatGPT] Code block #${i + 1} extracted via selection fallback:`, copiedText);
        }

        if (copiedText) {
          blocks.push(copiedText);
        }
      }
    }

    // If ChatGPT replied without a <pre> code block (or if all <pre> blocks were empty),
    // try the turn's copy button first, then fall back to selecting ONLY the last reply's text container.
    if (!blocks.length) {
      console.log('[VP ChatGPT] No <pre> blocks extracted; trying turn-level copy button on last reply...');
      const turnCopyBtn = findTurnCopyButton(lastMsg);
      let replyText = '';
      if (turnCopyBtn) {
        replyText = await clickCopyButtonAndRead(turnCopyBtn);
        if (replyText) {
          console.log('[VP ChatGPT] Turn reply copied via turn copy button:', replyText);
        }
      }
      if (!replyText) {
        const replyBody =
          lastMsg.querySelector('.markdown') ||
          turnEl.querySelector('[data-message-author-role="assistant"] .markdown') ||
          turnEl.querySelector('[data-message-author-role="assistant"]') ||
          lastMsg;
        replyText = await selectAndCopyNodeText(replyBody);
        console.log('[VP ChatGPT] Turn reply extracted via selection fallback on last reply:', replyText);
      }
      if (replyText) {
        blocks.push(replyText);
      }
    }

    if (!blocks.length) {
      throw new Error('Could not extract reply text or code block from ChatGPT.');
    }

    return blocks;
  }

  async function runChatGPTPrompt(payload) {
    abortCurrentPrompt = false;
    const editor = await waitForEditor(15000);
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

    // Verify submission occurred; if attachments are still in composer after 1500ms and sendBtn is enabled, click again
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

    // STEP 3: Wait for the reply to start and completely finish, then bring the reply back to VisionPilot.
    const tStart = Date.now();
    let started = false;
    while (Date.now() - tStart < 30000) {
      if (abortCurrentPrompt) throw new Error('Request cancelled.');
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
      throw new Error('ChatGPT did not start generating a reply.');
    }

    console.log('[VP ChatGPT] Step 3: Reply generation started. Waiting for reply to finish...');

    const tDone = Date.now();
    let stableCount = 0;
    let lastSnap = '';
    while (Date.now() - tDone < 90000) {
      if (abortCurrentPrompt) throw new Error('Request cancelled.');
      const streaming = isChatGPTStreaming();
      const msgs = getAssistantMessages();
      const latest = msgs.length > beforeMsgs ? msgs[msgs.length - 1] : null;
      const allPres = Array.from(document.querySelectorAll('pre')).slice(beforePres);
      const latestText = latest ? (latest.innerText || latest.textContent || '').trim() : '';
      const presText = allPres.map((p) => (p.innerText || p.textContent || '').trim()).join('||');
      const curSnap = latestText + '|' + presText;

      if (!streaming && (latestText.length > 5 || presText.length > 5) && curSnap === lastSnap) {
        stableCount++;
        if (stableCount >= 4) break;
      } else {
        stableCount = 0;
        lastSnap = curSnap;
      }
      await sleep(300);
    }

    const msgs = getAssistantMessages();
    const lastMsg = msgs.length > beforeMsgs ? msgs[msgs.length - 1] : msgs[msgs.length - 1] || null;
    if (!lastMsg) {
      throw new Error('No assistant reply received from ChatGPT.');
    }

    console.log('[VP ChatGPT] Step 4: Reply finished. Extracting code block(s) to bring back to VisionPilot...');
    const blocks = await extractReplyBlocks(lastMsg, beforePres);
    console.log('[VP ChatGPT] Successfully extracted blocks:', blocks);
    return { ok: true, blocks, fullText: blocks.join('\n\n') };
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
    return false;
  });
})();
