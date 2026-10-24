// VisionPilot AI Bridge — Claude (claude.ai) Dedicated Content Script
// Handles real image file upload, typing instructions, clicking send, waiting for reply completion,
// clicking copy buttons on every code block, and falling back to selecting only the code block or last reply text.
(function () {
  if (window.__vpClaudeContentLoaded) return;
  window.__vpClaudeContentLoaded = true;

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
      document.querySelector('div.ProseMirror[contenteditable="true"]') ||
      document.querySelector('fieldset div[contenteditable="true"]') ||
      document.querySelector('[data-testid="chat-input"][contenteditable="true"]') ||
      document.querySelector('div[contenteditable="true"][role="textbox"]') ||
      document.querySelector('div[contenteditable="true"]')
    );
  }

  function isLoginPage() {
    const path = location.pathname.toLowerCase();
    if (path.startsWith('/login') || path.startsWith('/onboarding')) return true;
    if (document.querySelector('input[type="email"], button[data-testid="login-button"]')) {
      if (!findEditor()) return true;
    }
    return false;
  }

  async function waitForEditor(timeoutMs = 15000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (isLoginPage()) {
        throw new Error('Not logged in to Claude (claude.ai). Please log in to your Claude account.');
      }
      const ed = findEditor();
      if (ed) return ed;
      await sleep(250);
    }
    if (isLoginPage()) {
      throw new Error('Not logged in to Claude (claude.ai). Please log in to your Claude account.');
    }
    throw new Error('Claude chat input box was not found. Make sure claude.ai is open and logged in.');
  }

  async function uploadImagesToClaude(images, editor) {
    if (!Array.isArray(images) || !images.length) return;
    console.log(`[VP Claude] Uploading ${images.length} image(s)...`);
    const files = images.map((img, i) => dataUrlToFile(img.dataUrl, img.name || `image-${i + 1}.png`));
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));

    const fileInput =
      document.querySelector('input[type="file"][data-testid="file-upload"]') ||
      document.querySelector('input[type="file"][accept*="image"]') ||
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

    await sleep(600);
    const t0 = Date.now();
    while (Date.now() - t0 < 20000) {
      if (abortCurrentPrompt) throw new Error('Request cancelled.');
      const uploading = document.querySelector(
        'fieldset [aria-busy="true"], fieldset [role="progressbar"], fieldset .animate-spin'
      );
      if (!uploading) break;
      await sleep(300);
    }
    await sleep(400);
    console.log('[VP Claude] Image upload complete.');
  }

  async function typeInstructionIntoClaude(editor, instruction) {
    console.log('[VP Claude] Typing instruction into editor...');
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

    let inserted = false;
    try {
      inserted = document.execCommand('insertText', false, instruction);
    } catch (e) {}

    if (!inserted || !(editor.textContent || editor.innerText || '').trim()) {
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
      document.querySelector('button[aria-label="Send Message"]') ||
      document.querySelector('button[aria-label="Send message"]') ||
      document.querySelector('button[data-testid="send-button"]') ||
      document.querySelector('fieldset button[aria-label*="Send" i]') ||
      Array.from(document.querySelectorAll('fieldset button, form button')).find((b) =>
        /send/i.test(b.getAttribute('aria-label') || b.title || b.textContent || '')
      )
    );
  }

  function getAssistantMessages() {
    const selectors = [
      '[data-testid="chat-message-content"]',
      '.font-claude-response',
      '.font-claude-message',
      '[data-is-streaming]'
    ];
    for (const sel of selectors) {
      const list = Array.from(document.querySelectorAll(sel));
      if (list.length) return list;
    }
    return [];
  }

  function isClaudeStreaming() {
    if (document.querySelector('[data-is-streaming="true"]')) return true;
    const stopBtn = document.querySelector(
      'button[aria-label*="Stop" i], button[data-testid="stop-button"]'
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

  async function extractClaudeCodeBlocks(newMsgs, beforePresCount) {
    try {
      await chrome.runtime.sendMessage({ type: 'VP_FOCUS_TAB_FOR_COPY' });
    } catch (e) {}
    try {
      window.focus();
    } catch (e) {}

    // Collect every <pre> created since beforePresCount AND any <pre> inside the new assistant message containers
    const allPresAfter = Array.from(document.querySelectorAll('pre')).slice(beforePresCount);
    const msgPres = [];
    for (const m of newMsgs) {
      if (!m) continue;
      revealHoverOnElement(m);
      for (const p of Array.from(m.querySelectorAll('pre'))) {
        if (!msgPres.includes(p)) msgPres.push(p);
      }
    }
    const preList = [];
    for (const p of [...allPresAfter, ...msgPres]) {
      if (p && !preList.includes(p)) preList.push(p);
    }

    console.log(`[VP Claude] Found ${preList.length} code block(s) in reply.`);

    const blocks = [];
    for (let i = 0; i < preList.length; i++) {
      const pre = preList[i];
      const wrapper = pre.closest('.code-block, .relative, .group, div') || pre.parentElement || pre;
      revealHoverOnElement(wrapper);
      revealHoverOnElement(pre);
      await sleep(60);

      const copyBtn =
        wrapper.querySelector('button[aria-label*="Copy" i], button[data-testid*="copy" i], button[title*="Copy" i]') ||
        Array.from(wrapper.querySelectorAll('button')).find((b) =>
          /copy/i.test((b.textContent || '') + ' ' + (b.getAttribute('aria-label') || ''))
        );

      let copiedText = '';
      if (copyBtn) {
        try {
          console.log(`[VP Claude] Clicking copy button on code block #${i + 1}...`);
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
        const codeEl = pre.querySelector('code') || pre;
        copiedText = await selectAndCopyNodeText(codeEl);
        console.log(`[VP Claude] Code block #${i + 1} extracted via fallback selection:`, copiedText);
      } else {
        console.log(`[VP Claude] Code block #${i + 1} copied via copy button:`, copiedText);
      }

      if (copiedText) blocks.push(copiedText);
    }

    // Fallback if Claude replied in plain text without a <pre> block
    if (!blocks.length && newMsgs.length) {
      const lastMsg = newMsgs[newMsgs.length - 1];
      const fallbackText = await selectAndCopyNodeText(lastMsg);
      if (fallbackText) {
        console.log('[VP Claude] Extracted reply via last message selection fallback:', fallbackText);
        blocks.push(fallbackText);
      }
    }

    if (!blocks.length) {
      throw new Error('Claude replied without a copyable code block or text.');
    }
    return blocks;
  }

  async function runClaudePrompt(payload) {
    abortCurrentPrompt = false;
    const editor = await waitForEditor(15000);
    const beforeMsgs = getAssistantMessages().length;
    const beforePres = document.querySelectorAll('pre').length;

    if (payload.images && payload.images.length) {
      await uploadImagesToClaude(payload.images, editor);
    }
    if (abortCurrentPrompt) throw new Error('Request cancelled.');

    await typeInstructionIntoClaude(editor, payload.instruction || '');
    if (abortCurrentPrompt) throw new Error('Request cancelled.');

    let sendBtn = null;
    const tSend = Date.now();
    while (Date.now() - tSend < 15000) {
      if (abortCurrentPrompt) throw new Error('Request cancelled.');
      sendBtn = findSendButton();
      if (sendBtn && !sendBtn.disabled && sendBtn.getAttribute('aria-disabled') !== 'true') break;
      await sleep(250);
    }

    if (sendBtn && !sendBtn.disabled) {
      console.log('[VP Claude] Clicking Send button...');
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
        isClaudeStreaming() ||
        getAssistantMessages().length > beforeMsgs ||
        document.querySelectorAll('pre').length > beforePres
      ) {
        started = true;
        break;
      }
      await sleep(300);
    }
    if (!started) {
      throw new Error('Claude did not start generating a reply. Check if claude.ai requires login or verification.');
    }

    console.log('[VP Claude] Reply started. Waiting for completion...');

    const tDone = Date.now();
    let stableCount = 0;
    let lastSnap = '';
    while (Date.now() - tDone < 90000) {
      if (abortCurrentPrompt) throw new Error('Request cancelled.');
      const streaming = isClaudeStreaming();
      const msgs = getAssistantMessages();
      const allPres = Array.from(document.querySelectorAll('pre')).slice(beforePres);
      const msgsText = msgs.slice(beforeMsgs).map((m) => (m.innerText || m.textContent || '').trim()).join('||');
      const presText = allPres.map((p) => (p.innerText || p.textContent || '').trim()).join('||');
      const curSnap = msgsText + '|' + presText;

      if (!streaming && (msgsText.length > 5 || presText.length > 5) && curSnap === lastSnap) {
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
    const blocks = await extractClaudeCodeBlocks(newMsgs, beforePres);
    console.log('[VP Claude] Returning extracted blocks:', blocks);
    return { ok: true, blocks, fullText: blocks.join('\n\n') };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg) return false;
    if (msg.type === 'VP_SITE_ABORT_PROMPT') {
      abortCurrentPrompt = true;
      const stopBtn = document.querySelector(
        'button[aria-label*="Stop" i], button[data-testid="stop-button"]'
      );
      if (stopBtn) {
        try { stopBtn.click(); } catch (e) {}
      }
      sendResponse({ ok: true, aborted: true });
      return true;
    }
    if (msg.type === 'VP_SITE_CHECK_READY') {
      waitForEditor(1200)
        .then(() => sendResponse({ ok: true, provider: 'claude', url: location.href }))
        .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
      return true;
    }
    if (msg.type === 'VP_SITE_RUN_PROMPT') {
      runClaudePrompt(msg.payload || msg || {})
        .then((res) => sendResponse(res))
        .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
      return true;
    }
    return false;
  });
})();
