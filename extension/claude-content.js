// VisionPilot AI Bridge — Claude (claude.ai) Dedicated Content Script
// Handles real image file upload, typing instructions, clicking send, waiting for reply completion, and clicking copy buttons on code blocks.
(function () {
  if (window.__vpClaudeContentLoaded) return;
  window.__vpClaudeContentLoaded = true;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
      document.querySelector('div[contenteditable="true"][ role="textbox" ]') ||
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
    // Wait for upload spinners to finish and attachment preview to settle
    const t0 = Date.now();
    while (Date.now() - t0 < 20000) {
      const uploading = document.querySelector(
        'fieldset [aria-busy="true"], fieldset [role="progressbar"], fieldset .animate-spin'
      );
      if (!uploading) break;
      await sleep(300);
    }
    await sleep(400);
  }

  async function typeInstructionIntoClaude(editor, instruction) {
    editor.focus();
    // Clear any existing draft text in this fresh chat
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
      '.font-claude-message',
      '.font-claude-response',
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

  async function clickCopyAndReadCodeBlocks(containerEl) {
    const preList = Array.from((containerEl || document).querySelectorAll('pre'));
    if (!preList.length) {
      throw new Error('Claude replied without a code block / copy box.');
    }

    const blocks = [];
    for (const pre of preList) {
      const wrapper = pre.closest('.code-block, .relative, .group, div') || pre.parentElement || pre;
      const copyBtn =
        wrapper.querySelector('button[aria-label*="Copy" i], button[data-testid*="copy" i], button[title*="Copy" i]') ||
        Array.from(wrapper.querySelectorAll('button')).find((b) => /copy/i.test(b.textContent || b.getAttribute('aria-label') || ''));

      let copiedText = '';
      if (copyBtn) {
        try {
          document.documentElement.dataset.vpLastCopied = '';
          copyBtn.click();
          copiedText = (document.documentElement.dataset.vpLastCopied || '').trim();
          if (!copiedText) {
            await sleep(50);
            copiedText = (document.documentElement.dataset.vpLastCopied || '').trim();
          }
        } catch (e) {}
      }

      // Requirement 6 fallback: If the click fails, fall back to reading the code block text directly from the page
      if (!copiedText) {
        const codeEl = pre.querySelector('code') || pre;
        copiedText = (codeEl.textContent || codeEl.innerText || '').trim();
      }

      if (!copiedText && !copyBtn) {
        throw new Error('Could not find copy button or code block text in Claude reply.');
      }
      if (copiedText) blocks.push(copiedText);
    }

    if (!blocks.length) {
      throw new Error('Claude code block was empty.');
    }
    return blocks;
  }

  async function runClaudePrompt(payload) {
    const editor = await waitForEditor(15000);
    const beforeMsgs = getAssistantMessages().length;
    const beforePres = document.querySelectorAll('pre').length;

    if (payload.images && payload.images.length) {
      await uploadImagesToClaude(payload.images, editor);
    }

    await typeInstructionIntoClaude(editor, payload.instruction || '');

    // Wait for send button to become enabled and click it
    let sendBtn = null;
    const tSend = Date.now();
    while (Date.now() - tSend < 15000) {
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

    // Wait for reply to start
    const tStart = Date.now();
    let started = false;
    while (Date.now() - tStart < 30000) {
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

    // Wait for reply to finish streaming and stabilize
    const tDone = Date.now();
    let stableCount = 0;
    let lastSnap = '';
    while (Date.now() - tDone < 90000) {
      const streaming = isClaudeStreaming();
      const msgs = getAssistantMessages();
      const allPres = Array.from(document.querySelectorAll('pre'));
      const curSnap =
        (msgs.length ? (msgs[msgs.length - 1].textContent || '') : '') +
        '|' +
        allPres.map((p) => p.textContent || '').join('||');

      if (!streaming && allPres.length > beforePres && curSnap === lastSnap && curSnap.length > 5) {
        stableCount++;
        if (stableCount >= 2) break;
      } else {
        stableCount = 0;
        lastSnap = curSnap;
      }
      await sleep(250);
    }

    const msgs = getAssistantMessages();
    const lastMsg = msgs.length > beforeMsgs ? msgs[msgs.length - 1] : null;
    if (!lastMsg) {
      const allPres = Array.from(document.querySelectorAll('pre')).slice(beforePres);
      if (!allPres.length) throw new Error('No reply code block received from Claude.');
      const tempWrap = { querySelectorAll: () => allPres };
      const blocks = await clickCopyAndReadCodeBlocks(tempWrap);
      return { ok: true, blocks, fullText: blocks[0] };
    }

    const blocks = await clickCopyAndReadCodeBlocks(lastMsg);
    return { ok: true, blocks, fullText: blocks[0] };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg) return false;
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
