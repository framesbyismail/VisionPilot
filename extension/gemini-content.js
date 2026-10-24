// VisionPilot AI Bridge — Google Gemini (gemini.google.com) Dedicated Content Script
// Handles real image file upload, typing instructions, clicking send, waiting for reply completion, and clicking copy buttons on code blocks.
(function () {
  if (window.__vpGeminiContentLoaded) return;
  window.__vpGeminiContentLoaded = true;

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
      // Gemini's Quill editor natively accepts pasted image files one by one or together
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
      const spinner = document.querySelector(
        'mat-progress-spinner, [role="progressbar"], .upload-spinner, .loading-spinner'
      );
      if (!spinner || spinner.offsetParent === null) break;
      await sleep(350);
    }
    await sleep(400);
  }

  async function typeInstructionIntoGemini(editor, instruction) {
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

    if (!inserted || !editor.innerText || !editor.innerText.trim()) {
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
    const list = Array.from(document.querySelectorAll('message-content, .model-response-text'));
    return list;
  }

  function isGeminiStreaming() {
    const stopBtn = document.querySelector(
      'button[aria-label*="Stop" i], button.stop-button, [mattooltip*="Stop" i]'
    );
    if (stopBtn && stopBtn.offsetParent !== null) return true;
    return false;
  }

  async function clickCopyAndReadCodeBlocks(containerEl) {
    const codeEls = Array.from((containerEl || document).querySelectorAll('code-block, pre'));
    // Deduplicate if a <pre> is inside a <code-block>
    const blocksRoot = codeEls.filter((el) => !codeEls.some((other) => other !== el && other.contains(el)));
    if (!blocksRoot.length) {
      throw new Error('Gemini replied without a code block / copy box.');
    }

    const blocks = [];
    for (const block of blocksRoot) {
      const copyBtn =
        block.querySelector(
          'button[aria-label*="Copy" i], button[mattooltip*="Copy" i], button[data-test-id="copy-button"], button[title*="Copy" i]'
        ) ||
        Array.from(block.querySelectorAll('button')).find((b) =>
          /copy/i.test(b.textContent || b.getAttribute('aria-label') || b.getAttribute('mattooltip') || '')
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
        const codeEl = block.querySelector('pre code, code, pre') || block;
        copiedText = (codeEl.textContent || codeEl.innerText || '').trim();
      }

      if (!copiedText && !copyBtn) {
        throw new Error('Could not find copy button or code block text in Gemini reply.');
      }
      if (copiedText) blocks.push(copiedText);
    }

    if (!blocks.length) {
      throw new Error('Gemini code block was empty.');
    }
    return blocks;
  }

  async function runGeminiPrompt(payload) {
    const editor = await waitForEditor(15000);
    const beforeMsgs = getAssistantMessages().length;

    if (payload.images && payload.images.length) {
      await uploadImagesToGemini(payload.images, editor);
    }

    await typeInstructionIntoGemini(editor, payload.instruction || '');

    let sendBtn = null;
    const tSend = Date.now();
    while (Date.now() - tSend < 20000) {
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

    // Wait for new response to start
    const tStart = Date.now();
    let started = false;
    while (Date.now() - tStart < 30000) {
      if (isGeminiStreaming() || getAssistantMessages().length > beforeMsgs) {
        started = true;
        break;
      }
      await sleep(300);
    }
    if (!started) {
      throw new Error('Gemini did not start generating a reply.');
    }

    // Wait for streaming to finish and code blocks to stabilize
    const tDone = Date.now();
    let stableCount = 0;
    let lastSnap = '';
    while (Date.now() - tDone < 90000) {
      const streaming = isGeminiStreaming();
      const msgs = getAssistantMessages();
      const latest = msgs.length > beforeMsgs ? msgs[msgs.length - 1] : null;
      const pres = latest ? Array.from(latest.querySelectorAll('code-block, pre')) : [];
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
      throw new Error('No assistant reply received from Gemini.');
    }

    const blocks = await clickCopyAndReadCodeBlocks(lastMsg);
    return { ok: true, blocks, fullText: blocks[0] };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg) return false;
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
    return false;
  });
})();
