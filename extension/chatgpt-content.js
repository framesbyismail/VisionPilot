// VisionPilot AI Bridge — ChatGPT (chatgpt.com) Dedicated Content Script
// Handles real image file upload, typing instructions, clicking send, waiting for reply completion, and clicking copy buttons on code blocks.
(function () {
  if (window.__vpChatGPTContentLoaded) return;
  window.__vpChatGPTContentLoaded = true;

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
    if (loginBtn && loginBtn.offsetParent !== null) return true;
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
    const files = images.map((img, i) => dataUrlToFile(img.dataUrl, img.name || `image-${i + 1}.png`));
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));

    const fileInput =
      document.querySelector('form input[type="file"][ multiple ]') ||
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
      const form = editor.closest('form') || document.body;
      const busy = form.querySelector('[role="progressbar"], svg.animate-spin, [data-testid*="loading"]');
      if (!busy) break;
      await sleep(350);
    }
    await sleep(400);
  }

  async function typeInstructionIntoChatGPT(editor, instruction) {
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
      document.querySelector('form button[type="submit"]')
    );
  }

  function getAssistantMessages() {
    return Array.from(document.querySelectorAll('[data-message-author-role="assistant"]'));
  }

  function isChatGPTStreaming() {
    const stopBtn = document.querySelector(
      'button[data-testid="stop-button"], button[aria-label="Stop streaming"], button[aria-label*="Stop" i]'
    );
    if (stopBtn && stopBtn.offsetParent !== null) return true;
    if (document.querySelector('.result-streaming')) return true;
    return false;
  }

  async function clickCopyAndReadCodeBlocks(containerEl) {
    const preList = Array.from((containerEl || document).querySelectorAll('pre'));
    if (!preList.length) {
      throw new Error('ChatGPT replied without a code block / copy box.');
    }

    const blocks = [];
    for (const pre of preList) {
      const copyBtn =
        pre.querySelector('button[aria-label*="Copy" i], button[data-testid*="copy" i]') ||
        Array.from(pre.querySelectorAll('button')).find((b) =>
          /copy/i.test(b.textContent || b.getAttribute('aria-label') || '')
        );

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

      // Requirement 6 fallback: read code block text directly from page if copy click fails
      if (!copiedText) {
        const codeEl = pre.querySelector('code') || pre;
        copiedText = (codeEl.textContent || codeEl.innerText || '').trim();
      }

      if (!copiedText && !copyBtn) {
        throw new Error('Could not find copy button or code block text in ChatGPT reply.');
      }
      if (copiedText) blocks.push(copiedText);
    }

    if (!blocks.length) {
      throw new Error('ChatGPT code block was empty.');
    }
    return blocks;
  }

  async function runChatGPTPrompt(payload) {
    const editor = await waitForEditor(15000);
    const beforeMsgs = getAssistantMessages().length;

    if (payload.images && payload.images.length) {
      await uploadImagesToChatGPT(payload.images, editor);
    }

    await typeInstructionIntoChatGPT(editor, payload.instruction || '');

    let sendBtn = null;
    const tSend = Date.now();
    while (Date.now() - tSend < 20000) {
      sendBtn = findSendButton();
      if (sendBtn && !sendBtn.disabled && sendBtn.getAttribute('aria-disabled') !== 'true') break;
      await sleep(250);
    }

    if (!sendBtn || sendBtn.disabled) {
      throw new Error('ChatGPT Send button stayed disabled (image upload may have failed or account is not logged in).');
    }
    sendBtn.click();

    // Wait for new assistant message to appear
    const tStart = Date.now();
    let started = false;
    while (Date.now() - tStart < 30000) {
      if (isChatGPTStreaming() || getAssistantMessages().length > beforeMsgs) {
        started = true;
        break;
      }
      await sleep(300);
    }
    if (!started) {
      throw new Error('ChatGPT did not start generating a reply.');
    }

    // Wait for streaming to finish and DOM to stabilize
    const tDone = Date.now();
    let stableCount = 0;
    let lastSnap = '';
    while (Date.now() - tDone < 90000) {
      const streaming = isChatGPTStreaming();
      const msgs = getAssistantMessages();
      const latest = msgs.length > beforeMsgs ? msgs[msgs.length - 1] : null;
      const pres = latest ? Array.from(latest.querySelectorAll('pre')) : [];
      const curSnap = (latest ? (latest.textContent || '') : '') + '|' + pres.map((p) => p.textContent || '').join('||');

      if (!streaming && latest && pres.length > 0 && curSnap === lastSnap && curSnap.length > 5) {
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
      throw new Error('No assistant reply received from ChatGPT.');
    }

    const blocks = await clickCopyAndReadCodeBlocks(lastMsg);
    return { ok: true, blocks, fullText: blocks[0] };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg) return false;
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
