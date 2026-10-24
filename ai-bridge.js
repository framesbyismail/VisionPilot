// VisionPilot AI Bridge — Real Browser Tab Bridge for Claude, ChatGPT & Gemini (v2.0.0)
// Zero API keys. Zero fake or mock responses. Uses only the logged-in web interfaces via the Chrome Extension.
(function () {
  'use strict';

  const AI_MODELS = {
    visionpilot: {
      id: 'visionpilot',
      name: 'VisionPilot AI',
      shortName: 'VisionPilot AI',
      provider: 'Built-in Local Engine',
      badge: 'DEFAULT',
      color: '#e85d2b',
      requiresExt: false,
      desc: 'Built-in VisionPilot AI detection, Focus Marker & prompt engine'
    },
    claude: {
      id: 'claude',
      name: 'Claude',
      shortName: 'Claude',
      provider: 'Anthropic Claude Web',
      badge: '',
      color: '#d97757',
      requiresExt: true,
      url: 'https://claude.ai/new',
      desc: 'Real browser connection to your logged-in claude.ai tab'
    },
    gpt: {
      id: 'gpt',
      name: 'GPT',
      shortName: 'GPT',
      provider: 'OpenAI ChatGPT Web',
      badge: '',
      color: '#10a37f',
      requiresExt: true,
      url: 'https://chatgpt.com/',
      desc: 'Real browser connection to your logged-in chatgpt.com tab'
    },
    gemini: {
      id: 'gemini',
      name: 'Gemini',
      shortName: 'Gemini',
      provider: 'Google Gemini Web',
      badge: '',
      color: '#4285f4',
      requiresExt: true,
      url: 'https://gemini.google.com/app',
      desc: 'Real browser connection to your logged-in gemini.google.com tab'
    }
  };

  // Exact plain-language instructions required by VisionPilot
  const STEP_1_REFERENCE_INSTRUCTION =
    'Look at this image and describe it in detail. Cover the location or setting, who or what the main subject is, and what else is around the main subject, such as other people, objects and background elements. Put your entire reply inside one code block, so that it appears in a copy box with a copy button. Inside the code block, write one short paragraph of plain text, with no title, no bullet points and no extra words. Write nothing outside the code block, no greeting and no explanation. Keep the description between 30 and 50 words, and never go over 50 words.';

  const STEP_2_SINGLE_FOCUS_INSTRUCTION =
    'The first image is the original. The second image is a screenshot with a marker showing where I am pointing. Identify which person, object or product the marker selects, and which exact part of it, like the hand, face or a corner, and describe that part in detail. Put your entire reply in one code block with a copy button, containing one short paragraph of plain text, and write nothing outside the block. Keep it to 30 words or fewer.';

  const STEP_3_MULTI_FOCUS_INSTRUCTION =
    'The first image is the original. The second image is a screenshot with colored boxes, each labeled like Person 1, Person 2, Product 1 and Product 2. Match each colored box to its label and use the original image for real detail. Give a separate code block for every labeled subject, in the same order as the labels, so each one has its own copy button. Inside each code block, write the label name first, then a colon, then a description of between 20 and 30 words, never over 30. Write nothing outside the code blocks.';

  // Clear any legacy fake localStorage flag from older versions
  try {
    localStorage.removeItem('vp-ai-ext-connected');
  } catch (e) {}

  let extInstalled = false;
  try {
    extInstalled = document.documentElement.getAttribute('data-vp-extension') === 'installed';
  } catch (e) {}

  let syncingReady = false;
  window.addEventListener('vp-ai-extension-ready', () => {
    extInstalled = true;
    try {
      document.documentElement.setAttribute('data-vp-extension', 'installed');
    } catch (e) {}
    if (!syncingReady && typeof window.syncAIModelUI === 'function') {
      syncingReady = true;
      try { window.syncAIModelUI(); } finally { syncingReady = false; }
    }
  });

  window.addEventListener('vp-ai-extension-select-model', (ev) => {
    const model = ev.detail && ev.detail.model;
    extInstalled = true;
    try {
      document.documentElement.setAttribute('data-vp-extension', 'installed');
    } catch (e) {}
    if (model && typeof window.selectAIModel === 'function') {
      window.selectAIModel(model);
    } else if (typeof window.syncAIModelUI === 'function') {
      window.syncAIModelUI();
    }
  });

  function pingExtension() {
    try {
      window.dispatchEvent(new CustomEvent('vp-ai-extension-ping'));
    } catch (e) {}
  }

  pingExtension();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', pingExtension, { once: true });
  }
  window.addEventListener('load', pingExtension, { once: true });

  // Strict check: only true when the real Chrome Extension content script is active on this page
  function isExtensionConnected() {
    try {
      if (document.documentElement.getAttribute('data-vp-extension') === 'installed') {
        extInstalled = true;
        return true;
      }
    } catch (e) {}
    return Boolean(extInstalled);
  }

  // Track active in-flight extension requests so clicking the cross button (CHANGE 2) cancels them immediately
  const pendingRequests = new Map();

  function cancelPendingRequests(refId = null) {
    console.log('[VP AI Bridge] Cancelling pending requests for refId:', refId || 'ALL');
    for (const [reqId, entry] of pendingRequests.entries()) {
      if (!refId || !entry.refId || entry.refId === refId) {
        entry.cancel();
        pendingRequests.delete(reqId);
      }
    }
    if (isExtensionConnected()) {
      try {
        const cancelReqId = 'vp_cancel_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        window.dispatchEvent(new CustomEvent('vp-ai-extension-request', {
          detail: { action: 'cancel_requests', refId: refId || null, reqId: cancelReqId }
        }));
      } catch (e) {}
    }
  }

  // Send a message to the Chrome Extension content.js -> background.js and await the real result
  function sendExtensionRequest(payload, timeoutMs = 150000) {
    return new Promise((resolve) => {
      if (!isExtensionConnected()) {
        resolve({
          ok: false,
          error: 'VisionPilot Chrome Extension is not installed or not active on this page.'
        });
        return;
      }
      const reqId = 'vp_req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const refId = payload.refId || null;
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        pendingRequests.delete(reqId);
        window.removeEventListener('vp-ai-extension-response', onResp);
        resolve({
          ok: false,
          error: 'Timed out waiting for AI reply from browser tab.'
        });
      }, timeoutMs);

      function cancel() {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        window.removeEventListener('vp-ai-extension-response', onResp);
        resolve({
          ok: false,
          cancelled: true,
          error: 'Request cancelled.'
        });
      }

      function onResp(ev) {
        const d = ev.detail || {};
        if (d.reqId !== reqId || settled) return;
        settled = true;
        clearTimeout(timer);
        pendingRequests.delete(reqId);
        window.removeEventListener('vp-ai-extension-response', onResp);
        if (!d.ok) {
          resolve({
            ok: false,
            cancelled: Boolean(d.cancelled || d.data?.cancelled),
            error: d.error || d.data?.error || 'Extension request failed.'
          });
        } else {
          resolve(d.data || { ok: true });
        }
      }

      if (payload.action === 'run_prompt') {
        pendingRequests.set(reqId, { reqId, refId, cancel });
      }

      window.addEventListener('vp-ai-extension-response', onResp);
      try {
        window.dispatchEvent(new CustomEvent('vp-ai-extension-request', {
          detail: { ...payload, reqId }
        }));
      } catch (err) {
        clearTimeout(timer);
        pendingRequests.delete(reqId);
        window.removeEventListener('vp-ai-extension-response', onResp);
        resolve({
          ok: false,
          error: String(err && err.message ? err.message : err)
        });
      }
    });
  }

  // Verify extension installation by round-trip ping to background worker
  async function verifyExtensionInstalled() {
    pingExtension();
    if (!isExtensionConnected()) {
      return { ok: false, error: 'Extension is not installed or not enabled in Chrome.' };
    }
    const resp = await sendExtensionRequest({ action: 'status' }, 4000);
    if (resp && resp.ok && resp.installed) {
      return { ok: true, version: resp.version };
    }
    return { ok: false, error: resp?.error || 'Could not reach VisionPilot extension background worker.' };
  }

  // Render the full uncropped, unzoomed original image to a PNG dataURL
  function renderOriginalImageDataUrl(imgEl) {
    if (!imgEl || !imgEl.naturalWidth || !imgEl.naturalHeight) {
      throw new Error('Reference image is not loaded yet.');
    }
    const maxDim = 1600;
    let w = imgEl.naturalWidth;
    let h = imgEl.naturalHeight;
    if (w > maxDim || h > maxDim) {
      const scale = maxDim / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(imgEl, 0, 0, w, h);
    return c.toDataURL('image/png');
  }

  // Render the full uncropped, unzoomed image with the green Focus Marker drawn at normalized (nx, ny)
  // Never sends a zoomed or cropped version, even when Zoom to Detail is on.
  function renderMarkerScreenshotDataUrl(imgEl, nx, ny) {
    if (!imgEl || !imgEl.naturalWidth || !imgEl.naturalHeight) {
      throw new Error('Reference image is not loaded yet.');
    }
    const maxDim = 1600;
    let w = imgEl.naturalWidth;
    let h = imgEl.naturalHeight;
    if (w > maxDim || h > maxDim) {
      const scale = maxDim / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(imgEl, 0, 0, w, h);

    const cx = Math.max(0, Math.min(w, nx * w));
    const cy = Math.max(0, Math.min(h, ny * h));
    const radius = Math.max(14, Math.round(Math.min(w, h) * 0.028));

    ctx.save();
    // Outer dark halo for contrast on any background
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 3, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.lineWidth = Math.max(4, Math.round(radius * 0.32));
    ctx.stroke();

    // Bright green Focus Marker ring
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(63, 185, 80, 0.22)';
    ctx.fill();
    ctx.strokeStyle = '#3fb950';
    ctx.lineWidth = Math.max(3, Math.round(radius * 0.24));
    ctx.stroke();

    // Crosshair lines
    const arm = Math.round(radius * 1.45);
    ctx.beginPath();
    ctx.moveTo(cx - arm, cy);
    ctx.lineTo(cx + arm, cy);
    ctx.moveTo(cx, cy - arm);
    ctx.lineTo(cx, cy + arm);
    ctx.strokeStyle = '#3fb950';
    ctx.lineWidth = Math.max(2, Math.round(radius * 0.16));
    ctx.stroke();

    // Center dot
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(3, Math.round(radius * 0.22)), 0, Math.PI * 2);
    ctx.fillStyle = '#3fb950';
    ctx.fill();
    ctx.restore();

    return c.toDataURL('image/png');
  }

  // Render the full uncropped, unzoomed image with ONLY the colored labeled subject boxes (no focus marker)
  function renderLabeledBoxesScreenshotDataUrl(imgEl, subjects) {
    if (!imgEl || !imgEl.naturalWidth || !imgEl.naturalHeight) {
      throw new Error('Reference image is not loaded yet.');
    }
    const maxDim = 1600;
    let w = imgEl.naturalWidth;
    let h = imgEl.naturalHeight;
    if (w > maxDim || h > maxDim) {
      const scale = maxDim / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(imgEl, 0, 0, w, h);

    const list = Array.isArray(subjects) ? subjects : [];
    const lineW = Math.max(3, Math.round(Math.min(w, h) * 0.005));
    const fontSize = Math.max(14, Math.round(Math.min(w, h) * 0.024));
    ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.textBaseline = 'top';

    list.forEach((s, idx) => {
      const b = s.box || { x: 0.15, y: 0.1, w: 0.7, h: 0.8 };
      const color = s.color || s.uiColor || '#e85d2b';
      const label = s.label || `Subject ${idx + 1}`;
      const bx = Math.round(Math.max(0, Math.min(w - 10, b.x * w)));
      const by = Math.round(Math.max(0, Math.min(h - 10, b.y * h)));
      const bw = Math.round(Math.max(16, Math.min(w - bx, b.w * w)));
      const bh = Math.round(Math.max(16, Math.min(h - by, b.h * h)));

      ctx.save();
      // Subtle dark outer outline + colored box border
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.lineWidth = lineW + 2;
      ctx.strokeRect(bx, by, bw, bh);

      ctx.strokeStyle = color;
      ctx.lineWidth = lineW;
      ctx.strokeRect(bx, by, bw, bh);

      // Label pill at top-left of box
      const padX = Math.round(fontSize * 0.45);
      const padY = Math.round(fontSize * 0.25);
      const textW = Math.ceil(ctx.measureText(label).width);
      const pillW = textW + padX * 2;
      const pillH = fontSize + padY * 2;
      const pillX = bx;
      const pillY = by >= pillH + 2 ? by - pillH - 2 : by + 2;

      ctx.fillStyle = color;
      ctx.fillRect(pillX, pillY, pillW, pillH);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, pillX + padX, pillY + padY);
      ctx.restore();
    });

    return c.toDataURL('image/png');
  }

  // Open or reset a fresh new chat tab for the selected model (never reuses an old conversation)
  async function connectModel(modelId) {
    const model = AI_MODELS[modelId];
    if (!model || modelId === 'visionpilot') {
      return { ok: true, model: 'visionpilot' };
    }
    if (!isExtensionConnected()) {
      return {
        ok: false,
        error: `Extension is not connected. Install and enable the VisionPilot Chrome Extension to use ${model.name}.`
      };
    }
    const res = await sendExtensionRequest({
      action: 'connect_model',
      model: model.id,
      focusTab: false
    }, 35000);
    return res;
  }

  // STEP 1: Upload reference image and get 30-50 word plain-text description from code block copy button
  async function runReferenceImageStep(ref, modelId) {
    const model = AI_MODELS[modelId];
    if (!model || modelId === 'visionpilot') {
      throw new Error('No external AI model selected.');
    }
    if (!ref || !ref.img) {
      throw new Error('Reference image is missing.');
    }
    const originalDataUrl = renderOriginalImageDataUrl(ref.img);
    const res = await sendExtensionRequest({
      action: 'run_prompt',
      step: 'reference',
      refId: ref.id || null,
      model: model.id,
      images: [
        {
          dataUrl: originalDataUrl,
          name: 'reference-image.png',
          mimeType: 'image/png'
        }
      ],
      instruction: STEP_1_REFERENCE_INSTRUCTION
    }, 150000);

    if (res?.cancelled || ref.cancelled) {
      const err = new Error('Request cancelled.');
      err.cancelled = true;
      throw err;
    }
    if (!res || !res.ok) {
      throw new Error(res?.error || `${model.name} failed to describe the reference image.`);
    }
    const text = (Array.isArray(res.blocks) && res.blocks[0] ? res.blocks[0] : res.fullText || '').trim();
    if (!text) {
      throw new Error(`${model.name} returned an empty reference description.`);
    }
    return text;
  }

  // STEP 2: Focus Mode (Single Mode & Multiple Mode Marker) — send original image + screenshot with green marker
  async function runSingleFocusStep(ref, x, y, pointerHint, modelId) {
    const model = AI_MODELS[modelId];
    if (!model || modelId === 'visionpilot') {
      throw new Error('No external AI model selected.');
    }
    if (!ref || !ref.img) {
      throw new Error('Reference image is missing.');
    }
    const originalDataUrl = renderOriginalImageDataUrl(ref.img);
    const markerDataUrl = renderMarkerScreenshotDataUrl(ref.img, x, y);

    const cleanHint = typeof pointerHint === 'string' && pointerHint.trim()
      ? pointerHint.trim() + '\n'
      : '';
    const instruction = cleanHint + STEP_2_SINGLE_FOCUS_INSTRUCTION;

    const res = await sendExtensionRequest({
      action: 'run_prompt',
      step: 'single_focus',
      refId: ref.id || null,
      model: model.id,
      images: [
        {
          dataUrl: originalDataUrl,
          name: 'original-image.png',
          mimeType: 'image/png'
        },
        {
          dataUrl: markerDataUrl,
          name: 'focus-marker-screenshot.png',
          mimeType: 'image/png'
        }
      ],
      instruction
    }, 150000);

    if (res?.cancelled || ref.cancelled) {
      const err = new Error('Request cancelled.');
      err.cancelled = true;
      throw err;
    }
    if (!res || !res.ok) {
      throw new Error(res?.error || `${model.name} failed to describe the focus point.`);
    }
    const text = (Array.isArray(res.blocks) && res.blocks[0] ? res.blocks[0] : res.fullText || '').trim();
    if (!text) {
      throw new Error(`${model.name} returned an empty focus point description.`);
    }
    return text;
  }

  // BUG 2 helper: Normalize subject labels by ignoring case, extra spaces, bold marks, backticks, and punctuation
  function normalizeSubjectLabel(raw) {
    return String(raw || '')
      .replace(/^(?:copy(?:\s+code)?|copied!?|plaintext|text|markdown)\s+/i, '')
      .replace(/^[`"'*#_~\-–—•\d.)\s[\]()]+/, '')
      .replace(/[`"'*#_~[\]().,:;!?\-–—]+$/g, '')
      .replace(/[*_`#~[\]().,:;!?\-–—]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  // Clean a raw code block string of any code fence or header artifact
  function cleanBlockString(str) {
    return String(str || '')
      .trim()
      .replace(/^```[a-z0-9_-]*\s*\n?/i, '')
      .replace(/\n?```\s*$/i, '')
      .replace(/^(?:plaintext|text|markdown|copy\s*code|copy|copied!?)\s*\n+/i, '')
      .trim();
  }

  // STEP 3: Focus Mode (Multiple Mode) — send original image + screenshot with colored labeled boxes, click every copy button, match labels
  async function runMultiFocusStep(ref, subjects, modelId) {
    const model = AI_MODELS[modelId];
    if (!model || modelId === 'visionpilot') {
      throw new Error('No external AI model selected.');
    }
    if (!ref || !ref.img) {
      throw new Error('Reference image is missing.');
    }
    const subs = Array.isArray(subjects) ? subjects : [];
    if (!subs.length) {
      throw new Error('No detected subjects to label in Multiple Mode.');
    }

    console.log(
      `[VP MultiMode] Step 1: Preparing Multiple Mode request for ${model.name}. Target subjects (${subs.length}):`,
      subs.map((s) => ({ key: s.key, label: s.label, normLabel: normalizeSubjectLabel(s.label), color: s.color || s.uiColor }))
    );

    const originalDataUrl = renderOriginalImageDataUrl(ref.img);
    const boxesDataUrl = renderLabeledBoxesScreenshotDataUrl(ref.img, subs);

    const res = await sendExtensionRequest({
      action: 'run_prompt',
      step: 'multi_focus',
      refId: ref.id || null,
      model: model.id,
      images: [
        {
          dataUrl: originalDataUrl,
          name: 'original-image.png',
          mimeType: 'image/png'
        },
        {
          dataUrl: boxesDataUrl,
          name: 'labeled-boxes-screenshot.png',
          mimeType: 'image/png'
        }
      ],
      instruction: STEP_3_MULTI_FOCUS_INSTRUCTION
    }, 150000);

    if (res?.cancelled || ref.cancelled) {
      const err = new Error('Request cancelled.');
      err.cancelled = true;
      throw err;
    }

    console.log(`[VP MultiMode] Step 2: Received reply from ${model.name}:`, res);

    if (!res || !res.ok) {
      throw new Error(res?.error || `${model.name} failed to describe the multiple subjects.`);
    }

    const rawBlocks = Array.isArray(res.blocks)
      ? res.blocks.map((b) => cleanBlockString(b)).filter(Boolean)
      : [];

    console.log(`[VP MultiMode] Step 3: Extracted ${rawBlocks.length} raw code block(s):`, rawBlocks);

    if (!rawBlocks.length) {
      throw new Error(`${model.name} did not return code blocks for the labeled subjects.`);
    }

    // Expand any single code block that contains multiple labeled entries on separate lines
    const subNormLabels = subs.map((s) => normalizeSubjectLabel(s.label));
    const blocks = [];
    for (const rawBlock of rawBlocks) {
      const lines = rawBlock.split(/\n+/).map((l) => l.trim()).filter(Boolean);
      if (lines.length > 1) {
        // Check if multiple lines start with a label + colon/dash
        const labeledLines = lines.filter((l) => {
          const m = l.match(/^([^:\n–—-]{1,45})\s*[:–—-]\s*\S+/);
          if (!m) return false;
          const nl = normalizeSubjectLabel(m[1]);
          return subNormLabels.includes(nl) || /^(?:person|product|object|animal|car|phone|vehicle|subject)\s*\d+$/i.test(nl);
        });
        if (labeledLines.length >= 2) {
          console.log('[VP MultiMode] Splitting multi-line code block into', labeledLines.length, 'labeled entries.');
          blocks.push(...labeledLines);
          continue;
        }
      }
      blocks.push(rawBlock);
    }

    console.log(`[VP MultiMode] Step 4: Matching ${blocks.length} block(s) against ${subs.length} subject(s)...`);

    const byKey = {};
    const byLabel = {};
    const byNormLabel = {};
    const matchedItems = [];
    const usedSubKeys = new Set();

    blocks.forEach((blockText, idx) => {
      console.log(`[VP MultiMode] Inspecting block #${idx + 1}:`, blockText);

      // Extract label at start (supports colon, dash, or first line)
      let rawLabel = '';
      let descOnly = blockText;

      const colonMatch = blockText.match(/^([^\n:]{1,50}):\s*([\s\S]+)$/);
      const dashMatch = !colonMatch ? blockText.match(/^([^\n–—-]{1,40})\s+[–—-]\s+([\s\S]+)$/) : null;
      const lineMatch = (!colonMatch && !dashMatch) ? blockText.match(/^([^\n]{2,35})\n+([\s\S]+)$/) : null;

      const matchObj = colonMatch || dashMatch || lineMatch;
      if (matchObj) {
        rawLabel = matchObj[1].trim();
        descOnly = matchObj[2].trim();
      }

      const normLabel = normalizeSubjectLabel(rawLabel);
      console.log(`[VP MultiMode] Block #${idx + 1} extracted label: "${rawLabel}" -> normalized: "${normLabel}"`);

      // 1. Exact normalized label match (ignores case, extra spaces, bold marks, punctuation)
      let matchedSub = null;
      if (normLabel) {
        matchedSub = subs.find((s) => normalizeSubjectLabel(s.label) === normLabel);
      }

      // 2. Partial / prefix normalized match (e.g. "Person 1 (left)" matching "Person 1")
      if (!matchedSub && normLabel) {
        matchedSub = subs.find((s) => {
          const sn = normalizeSubjectLabel(s.label);
          return sn && (normLabel.startsWith(sn) || sn.startsWith(normLabel));
        });
      }

      // 3. Check if the full block text starts with any subject's normalized label
      if (!matchedSub) {
        const normFull = normalizeSubjectLabel(blockText.slice(0, 50));
        matchedSub = subs.find((s) => {
          const sn = normalizeSubjectLabel(s.label);
          return sn && normFull.startsWith(sn);
        });
        if (matchedSub && !rawLabel) {
          const stripRe = new RegExp(`^[\\s*_\\\`#[\\]()]*${matchedSub.label.replace(/\s+/g, '\\s+')}[\\s*_\\\`#[\\]():–—.-]*`, 'i');
          descOnly = blockText.replace(stripRe, '').trim() || blockText;
        }
      }

      // 4. Fallback to positional subject index if not yet matched
      if (!matchedSub) {
        if (subs[idx] && !usedSubKeys.has(subs[idx].key)) {
          matchedSub = subs[idx];
          console.log(`[VP MultiMode] Block #${idx + 1} fell back to positional subject #${idx + 1}: ${matchedSub.label}`);
        } else {
          matchedSub = subs.find((s) => !usedSubKeys.has(s.key)) || subs[idx] || null;
        }
      }

      if (matchedSub) {
        usedSubKeys.add(matchedSub.key);
        // Clean any duplicate leading label from descOnly
        const dupLabelRe = new RegExp(`^[\\s*_\\\`#[\\]()]*${matchedSub.label.replace(/\s+/g, '\\s+')}[\\s*_\\\`#[\\]():–—.-]*`, 'i');
        const cleanDesc = descOnly.replace(dupLabelRe, '').trim() || descOnly.trim();
        const formatted = `${matchedSub.label}: ${cleanDesc}`;
        const normKey = normalizeSubjectLabel(matchedSub.label);

        byKey[matchedSub.key] = formatted;
        byLabel[matchedSub.label] = formatted;
        byNormLabel[normKey] = formatted;
        matchedItems.push({
          key: matchedSub.key,
          label: matchedSub.label,
          normLabel: normKey,
          color: matchedSub.color || matchedSub.uiColor || '',
          desc: cleanDesc,
          formatted
        });

        console.log(
          `[VP MultiMode] ✓ Matched block #${idx + 1} -> Subject "${matchedSub.label}" (key=${matchedSub.key}, color=${matchedSub.color || matchedSub.uiColor}):`,
          formatted
        );
      } else {
        console.warn(`[VP MultiMode] ✗ Could not match block #${idx + 1} to any subject:`, blockText);
      }
    });

    console.log('[VP MultiMode] Step 5: Completed matching. Final byKey map:', byKey);

    return {
      blocks,
      byKey,
      byLabel,
      byNormLabel,
      matchedItems
    };
  }

  // Minimal CRC32 + Uncompressed ZIP generator for downloading the real extension files
  function crc32(buf) {
    let c = -1;
    for (let i = 0; i < buf.length; i++) {
      c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
    }
    return (c ^ -1) >>> 0;
  }
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function buildZipBlob(files) {
    const enc = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    files.forEach(f => {
      const nameBytes = enc.encode(f.name);
      const dataBytes = f.bytes instanceof Uint8Array ? f.bytes : enc.encode(f.content || '');
      const crc = crc32(dataBytes);
      const size = dataBytes.length;

      const lh = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(lh.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0, true);
      lv.setUint16(8, 0, true);
      lv.setUint16(10, 0, true);
      lv.setUint16(12, 0, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, size, true);
      lv.setUint32(22, size, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      lh.set(nameBytes, 30);

      localParts.push(lh, dataBytes);

      const ch = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(ch.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true);
      cv.setUint16(14, 0, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, size, true);
      cv.setUint32(24, size, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      ch.set(nameBytes, 46);

      centralParts.push(ch);
      offset += lh.length + dataBytes.length;
    });

    const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);

    return new Blob([...localParts, ...centralParts, eocd], { type: 'application/zip' });
  }

  async function downloadExtensionZip() {
    const fileNames = [
      'manifest.json',
      'background.js',
      'content.js',
      'claude-content.js',
      'chatgpt-content.js',
      'gemini-content.js',
      'popup.html',
      'popup.js',
      'visionpilot-app-icon.svg',
      'visionpilot-icon-dark.svg',
      'icon16.png',
      'icon32.png',
      'icon48.png',
      'icon128.png'
    ];
    const files = [];
    for (const name of fileNames) {
      try {
        const res = await fetch(`extension/${name}`, { cache: 'no-store' });
        if (res.ok) {
          if (name.endsWith('.png')) {
            const buf = await res.arrayBuffer();
            files.push({ name, bytes: new Uint8Array(buf) });
          } else {
            const content = await res.text();
            files.push({ name, content });
          }
        }
      } catch (e) {}
    }
    if (!files.length) {
      throw new Error('Could not load extension files to package ZIP.');
    }
    const blob = buildZipBlob(files);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'visionpilot-ai-bridge-extension.zip';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 500);
  }

  window.VPAIBridge = {
    AI_MODELS,
    STEP_1_REFERENCE_INSTRUCTION,
    STEP_2_SINGLE_FOCUS_INSTRUCTION,
    STEP_3_MULTI_FOCUS_INSTRUCTION,
    getModelInfo: (id) => AI_MODELS[id] || AI_MODELS.visionpilot,
    normalizeSubjectLabel,
    isExtensionConnected,
    verifyExtensionInstalled,
    cancelPendingRequests,
    connectModel,
    runReferenceImageStep,
    runSingleFocusStep,
    runMultiFocusStep,
    renderOriginalImageDataUrl,
    renderMarkerScreenshotDataUrl,
    renderLabeledBoxesScreenshotDataUrl,
    downloadExtensionZip
  };
})();
