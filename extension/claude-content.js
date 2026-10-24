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
    let text = String(raw || '').replace(/\r\n/g, '\n').trim();
    if (!text) return '';
    text = text
      .replace(/^```[a-z0-9_-]*\s*\n?/i, '')
      .replace(/\n?```\s*$/i, '')
      .trim();
    text = text
      .replace(/^(?:plaintext|text|markdown|copy\s*code|copy|copied!?|bash|json|yaml|sql|html|css|js|javascript|python)\s*\n+/i, '')
      .replace(/^(?:copy\s*code|copy|copied!?)\s*\n+/i, '')
      .trim();
    return text;
  }

  function isMacPlatform() {
    return /Mac|iPod|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');
  }

  // Find the Copy Button belonging to a specific <pre> code block (walking up ancestors that contain ONLY this <pre>)
  function findCodeBlockCopyButton(pre) {
    if (!pre) return null;
    const candidates = [];
    let cur = pre;
    for (let depth = 0; depth < 5 && cur && cur !== document.body; depth++) {
      if (depth > 0 && cur.querySelectorAll && cur.querySelectorAll('pre').length > 1) {
        break;
      }
      candidates.push(cur);
      cur = cur.parentElement;
    }

    for (const root of candidates) {
      revealHoverOnElement(root);
      const direct = root.querySelector(
        'button[data-testid*="copy" i], ' +
        'button[aria-label*="Copy" i], ' +
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
    }
    return null;
  }

  // Find the message/turn-level Copy Button at the bottom action bar of a Claude reply
  function findTurnCopyButton(msgEl) {
    if (!msgEl) return null;
    let cur = msgEl;
    for (let depth = 0; depth < 5 && cur && cur !== document.body; depth++) {
      revealHoverOnElement(cur);
      const btns = Array.from(
        cur.querySelectorAll(
          'button[data-testid="action-bar-copy"], ' +
          'button[data-testid*="copy" i], ' +
          'button[aria-label="Copy"], ' +
          'button[aria-label*="Copy" i], ' +
          'button[title*="Copy" i]'
        )
      ).filter((b) => !b.closest('pre'));
      if (btns.length) return btns[btns.length - 1];
      cur = cur.parentElement;
    }
    return null;
  }

  // Priority 1: Click Copy Button and verify complete text was copied
  async function clickCopyButtonAndRead(copyBtn, expectedRawNode = null) {
    if (!copyBtn) return '';
    try {
      revealHoverOnElement(copyBtn);
      if (copyBtn.parentElement) revealHoverOnElement(copyBtn.parentElement);
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
        clientX: Math.round(rect.left + Math.max(2, rect.width / 2)),
        clientY: Math.round(rect.top + Math.max(2, rect.height / 2))
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
          const clip = await Promise.race([
            navigator.clipboard.readText(),
            sleep(300).then(() => '')
          ]);
          if (clip && clip.trim()) copiedText = clip.trim();
        } catch (e) {}
      }

      const cleaned = cleanExtractedCodeText(copiedText);
      if (cleaned && expectedRawNode) {
        const expectedClean = cleanExtractedCodeText(expectedRawNode.innerText || expectedRawNode.textContent || '');
        if (expectedClean.length > 20 && cleaned.length < expectedClean.length * 0.7) {
          console.warn('[VP Claude] Copy button returned incomplete text; falling back to Select All + Copy.');
          return '';
        }
      }
      return cleaned;
    } catch (e) {
      console.warn('[VP Claude] Copy button click error:', e);
      return '';
    }
  }

  // Priority 2 Fallback: Click inside the reply/code text box, Select All (Ctrl+A on Windows/Linux, Command+A on Mac), and Copy (Ctrl+C / Command+C)
  async function selectAllAndCopyFromBox(targetNode) {
    if (!targetNode || targetNode === document.body || targetNode === document.documentElement) {
      return '';
    }
    const isMac = isMacPlatform();
    console.log(`[VP Claude] Fallback Select All (${isMac ? 'Cmd+A / Cmd+C' : 'Ctrl+A / Ctrl+C'}) on target box:`, targetNode.tagName);
    const sel = window.getSelection();
    let resultText = '';
    try {
      window.focus();
      document.documentElement.dataset.vpLastCopied = '';
      revealHoverOnElement(targetNode);

      // 1. Click inside the target text box to focus it
      const rect = targetNode.getBoundingClientRect ? targetNode.getBoundingClientRect() : { left: 20, top: 20, width: 100, height: 40 };
      const clickInit = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: Math.round(rect.left + Math.min(24, Math.max(4, rect.width / 2))),
        clientY: Math.round(rect.top + Math.min(18, Math.max(4, rect.height / 2)))
      };
      targetNode.dispatchEvent(new PointerEvent('pointerdown', clickInit));
      targetNode.dispatchEvent(new MouseEvent('mousedown', clickInit));
      targetNode.dispatchEvent(new PointerEvent('pointerup', clickInit));
      targetNode.dispatchEvent(new MouseEvent('mouseup', clickInit));
      targetNode.dispatchEvent(new MouseEvent('click', clickInit));
      try {
        targetNode.focus({ preventScroll: true });
      } catch (e) {}

      // 2. Dispatch Select All shortcut (Ctrl+A on Windows/Linux, Command+A on Mac) & select all contents of targetNode
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
      targetNode.dispatchEvent(new KeyboardEvent('keydown', selectAllKeyInit));
      if (sel) {
        const range = document.createRange();
        range.selectNodeContents(targetNode);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      targetNode.dispatchEvent(new KeyboardEvent('keyup', selectAllKeyInit));
      await sleep(40);

      // 3. Dispatch Copy shortcut (Ctrl+C on Windows/Linux, Command+C on Mac) & execute copy
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
      targetNode.dispatchEvent(new KeyboardEvent('keydown', copyKeyInit));
      try {
        document.execCommand('copy');
      } catch (e) {}
      targetNode.dispatchEvent(new KeyboardEvent('keyup', copyKeyInit));
      await sleep(50);

      const fromHook = (document.documentElement.dataset.vpLastCopied || '').trim();
      const fromSel = sel ? (sel.toString() || '').trim() : '';
      if (sel) sel.removeAllRanges();
      resultText = fromHook || fromSel;

      if (!resultText && navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
        try {
          const clip = await Promise.race([
            navigator.clipboard.readText(),
            sleep(250).then(() => '')
          ]);
          if (clip && clip.trim()) resultText = clip.trim();
        } catch (e) {}
      }

      const rawNodeText = (targetNode.innerText || targetNode.textContent || '').trim();
      if (!resultText || (rawNodeText.length > resultText.length)) {
        resultText = rawNodeText;
      }
    } catch (e) {
      try {
        if (sel) sel.removeAllRanges();
      } catch (_) {}
      resultText = (targetNode.innerText || targetNode.textContent || '').trim();
    }
    return cleanExtractedCodeText(resultText);
  }

  function normalizeSubjLabel(raw) {
    return String(raw || '')
      .replace(/^(?:copy(?:\s+code)?|copied!?|plaintext|text|markdown)\s+/i, '')
      .replace(/\b(?:red|blue|green|yellow|purple|orange|teal|pink|cyan|magenta|colored)\s+box(?:\s+subject)?\b/gi, '')
      .replace(/\bbox\s+subject\b/gi, '')
      .replace(/^[`"'*#_~\-–—•\d.)\s[\]()]+/, '')
      .replace(/[`"'*#_~[\]().,:;!?\-–—]+$/g, '')
      .replace(/[*_`#~[\]().,:;!?\-–—]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  // Split any combined multi-subject text or fenced markdown into separate, ordered blocks without losing any lines or mixing subjects
  function splitTextIntoSubjectEntries(text, expectedSubjects = []) {
    const raw = String(text || '').replace(/\r\n/g, '\n').trim();
    if (!raw) return [];

    // 1. Check if text contains fenced markdown code blocks ``` ... ```
    const fenceMatches = Array.from(raw.matchAll(/```(?:[a-z0-9_-]*)\s*\n?([\s\S]*?)```/gi));
    if (fenceMatches.length >= 2) {
      const fencedBlocks = fenceMatches
        .map((m) => cleanExtractedCodeText(m[1]))
        .filter(Boolean);
      if (fencedBlocks.length >= 2) {
        const expanded = [];
        for (const fb of fencedBlocks) {
          const subSplit = splitTextIntoSubjectEntries(fb, expectedSubjects);
          if (subSplit.length > 1) expanded.push(...subSplit);
          else expanded.push(fb);
        }
        return expanded;
      }
    }

    const cleaned = cleanExtractedCodeText(raw);
    const lines = cleaned.split('\n');
    const knownNorms = (Array.isArray(expectedSubjects) ? expectedSubjects : [])
      .map((s) => normalizeSubjLabel(s.label || s))
      .filter(Boolean);

    const matchLineHeader = (line) => {
      const trimmed = line.trim();
      if (!trimmed) return null;

      // Pattern A: "Person 1 (red box): description..." or "**Product 1**: description..."
      const mColon = trimmed.match(/^(?:[#>*•\-–—]|\d+[.)])?\s*[*_`~[\]()]*([^:\n–—]{2,55}?)[*_`~[\]()]*\s*(?:[:–—-]\s*)(.*)$/);
      if (mColon) {
        const candNorm = normalizeSubjLabel(mColon[1]);
        const isKnown =
          knownNorms.includes(candNorm) ||
          knownNorms.some((kn) => kn && (candNorm.startsWith(kn) || kn.startsWith(candNorm))) ||
          /^(?:person|product|object|animal|car|phone|vehicle|subject)\s*\d+$/i.test(candNorm);
        if (isKnown) {
          return {
            normLabel: candNorm,
            rawLabel: mColon[1].trim(),
            restOfLine: (mColon[2] || '').trim()
          };
        }
      }

      // Pattern B: Standalone header line like "Person 1" or "**Person 1 (red box)**" with description on the next line
      const candStandalone = normalizeSubjLabel(trimmed);
      if (
        candStandalone &&
        trimmed.length <= 48 &&
        (knownNorms.includes(candStandalone) ||
          /^(?:person|product|object|animal|car|phone|vehicle|subject)\s*\d+$/i.test(candStandalone))
      ) {
        return {
          normLabel: candStandalone,
          rawLabel: trimmed.replace(/[*_`~#[\]():–—-]+$/g, '').trim(),
          restOfLine: ''
        };
      }
      return null;
    };

    const segments = [];
    let currentSeg = null;

    for (const line of lines) {
      const hdr = matchLineHeader(line);
      if (hdr) {
        if (currentSeg) segments.push(currentSeg);
        currentSeg = {
          normLabel: hdr.normLabel,
          rawLabel: hdr.rawLabel,
          lines: hdr.restOfLine ? [hdr.restOfLine] : []
        };
      } else if (currentSeg) {
        if (line.trim()) currentSeg.lines.push(line.trim());
      }
    }
    if (currentSeg) segments.push(currentSeg);

    if (segments.length >= 2) {
      return segments
        .map((seg) => {
          const body = seg.lines.join(' ').replace(/\s+/g, ' ').trim();
          return body ? `${seg.rawLabel}: ${body}` : seg.rawLabel;
        })
        .filter(Boolean);
    }

    return cleaned ? [cleaned] : [];
  }

  async function extractClaudeCodeBlocks(newMsgs, beforePresCount, payload = {}) {
    const isMulti = payload.step === 'multi_focus';
    const expectedSubjects = Array.isArray(payload.subjects) ? payload.subjects : [];
    const expectedCount = expectedSubjects.length || (isMulti ? 2 : 1);

    try {
      await chrome.runtime.sendMessage({ type: 'VP_FOCUS_TAB_FOR_COPY' });
    } catch (e) {}
    try {
      window.focus();
    } catch (e) {}

    // Collect every <pre> inside the new assistant message containers AND any <pre> created since beforePresCount in exact DOM order
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
    for (const p of [...msgPres, ...allPresAfter]) {
      if (p && !preList.includes(p)) preList.push(p);
    }

    console.log(`[VP Claude] Found ${preList.length} <pre> code block(s) in reply (isMulti=${isMulti}, expectedCount=${expectedCount}).`);

    const rawCopiedBlocks = [];
    for (let i = 0; i < preList.length; i++) {
      const pre = preList[i];
      const codeEl = pre.querySelector('code') || pre;
      const copyBtn = findCodeBlockCopyButton(pre);

      let copiedText = '';
      if (copyBtn) {
        console.log(`[VP Claude] Clicking Copy Button on code block #${i + 1}...`);
        copiedText = await clickCopyButtonAndRead(copyBtn, codeEl);
        if (copiedText) {
          console.log(`[VP Claude] Code block #${i + 1} copied via Copy Button:`, copiedText);
        }
      }

      if (!copiedText) {
        copiedText = await selectAllAndCopyFromBox(codeEl);
        console.log(`[VP Claude] Code block #${i + 1} copied via Select All fallback:`, copiedText);
      }

      if (copiedText) {
        rawCopiedBlocks.push(copiedText);
      }
    }

    // Expand any single block that contains multiple subjects
    let blocks = [];
    for (const b of rawCopiedBlocks) {
      if (isMulti) {
        const split = splitTextIntoSubjectEntries(b, expectedSubjects);
        blocks.push(...split);
      } else {
        blocks.push(b);
      }
    }

    // If no blocks or fewer blocks than expected in Multiple Mode, also check the full reply (via Turn Copy Button first, then Select All on the reply container)
    if ((!blocks.length || (isMulti && blocks.length < expectedCount)) && newMsgs.length) {
      const lastMsg = newMsgs[newMsgs.length - 1];
      console.log(`[VP Claude] Attempting full-reply copy (current blocks=${blocks.length}, expected=${expectedCount})...`);
      const turnCopyBtn = findTurnCopyButton(lastMsg);
      let fullReplyText = '';
      if (turnCopyBtn) {
        console.log('[VP Claude] Clicking Turn Copy Button on Claude reply...');
        fullReplyText = await clickCopyButtonAndRead(turnCopyBtn, lastMsg);
      }
      if (!fullReplyText) {
        fullReplyText = await selectAllAndCopyFromBox(lastMsg);
      }
      if (fullReplyText) {
        if (isMulti) {
          const fromFull = splitTextIntoSubjectEntries(fullReplyText, expectedSubjects);
          if (fromFull.length > blocks.length) {
            console.log(`[VP Claude] Full-reply split yielded ${fromFull.length} subject blocks.`);
            blocks = fromFull;
          } else if (!blocks.length) {
            blocks = [fullReplyText];
          }
        } else if (!blocks.length) {
          blocks = [fullReplyText];
        }
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
    const isMultiStep = payload && payload.step === 'multi_focus';
    const expectedCount =
      (payload && Array.isArray(payload.subjects) && payload.subjects.length) ||
      (payload && Number(payload.expectedCount)) ||
      1;
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
        const reqStable = isMultiStep && expectedCount > 1 && allPres.length < expectedCount ? 5 : 3;
        if (stableCount >= reqStable) break;
      } else {
        stableCount = 0;
        lastSnap = curSnap;
      }
      await sleep(300);
    }

    const allMsgs = getAssistantMessages();
    const newMsgs = allMsgs.length > beforeMsgs ? allMsgs.slice(beforeMsgs) : allMsgs.slice(-1);
    const blocks = await extractClaudeCodeBlocks(newMsgs, beforePres, payload);
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
