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

  async function uploadImagesToChatGPT(images, editor) {
    if (!Array.isArray(images) || !images.length) return;
    console.log(`[VP ChatGPT] Uploading ${images.length} image(s)...`);
    const files = images.map((img, i) => dataUrlToFile(img.dataUrl, img.name || `image-${i + 1}.png`));
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));

    const fileInput =
      document.querySelector('form input[type="file"][multiple]') ||
      document.querySelector('form input[type="file"]') ||
      document.querySelector('input[type="file"]');

    if (fileInput) {
      try {
        fileInput.value = '';
      } catch (e) {}
      fileInput.files = dt.files;
      fileInput.dispatchEvent(new Event('input', { bubbles: true }));
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      editor.focus();
      const pasteEv = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dt
      });
      editor.dispatchEvent(pasteEv);
    }

    await sleep(700);
    // Wait until upload progress bars / spinners inside the composer disappear
    const t0 = Date.now();
    while (Date.now() - t0 < 25000) {
      if (abortCurrentPrompt) throw new Error('Request cancelled.');
      const form = editor.closest('form') || document.body;
      const busy = form.querySelector('[role="progressbar"], svg.animate-spin, [data-testid*="loading"]');
      if (!busy) break;
      await sleep(350);
    }
    await sleep(400);
    console.log('[VP ChatGPT] Image upload complete.');
  }

  async function typeInstructionIntoChatGPT(editor, instruction) {
    console.log('[VP ChatGPT] Typing instruction into editor...');
    editor.focus();
    if (editor.tagName === 'TEXTAREA') {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) setter.call(editor, instruction);
      else editor.value = instruction;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
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
      let inserted = false;
      try {
        inserted = document.execCommand('insertText', false, instruction);
      } catch (e) {}
      if (!inserted || !editor.innerText || !editor.innerText.trim()) {
        editor.innerHTML = '';
        const p = document.createElement('p');
        p.textContent = instruction;
        editor.appendChild(p);
        editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: instruction }));
      }
    }
    await sleep(250);
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

    if (payload.images && payload.images.length) {
      await uploadImagesToChatGPT(payload.images, editor);
    }
    if (abortCurrentPrompt) throw new Error('Request cancelled.');

    await typeInstructionIntoChatGPT(editor, payload.instruction || '');
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
      console.log('[VP ChatGPT] Clicking Send button...');
      sendBtn.click();
    } else {
      console.log('[VP ChatGPT] Send button not clickable, pressing Enter on editor...');
      editor.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true })
      );
    }

    // Wait for new assistant message to appear
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

    console.log('[VP ChatGPT] Reply generation started. Waiting for streaming to finish...');

    // Wait for streaming to finish and DOM to stabilize (does NOT require <pre> to exist to complete!)
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
        if (stableCount >= 3) break;
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

    console.log('[VP ChatGPT] Streaming complete. Extracting code block(s) from reply...');
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
